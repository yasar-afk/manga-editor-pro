/**
 * MANGA EDITOR PRO - SaaS Cloud Infrastructure (v4)
 * Bu dosya tüm lisans ve log sistemini buluta (Firebase) taşır.
 */

const FIREBASE_CONFIG = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "manga-saas.firebaseapp.com",
    databaseURL: "https://manga-saas-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "manga-saas",
    storageBucket: "manga-saas.firebasestorage.app",
    messagingSenderId: "74507743831",
    appId: "1:74507743831:web:fa432ecd9447560b32a912"
};

window.db = null;
window.useCloud = false;

// 1. Firebase Başlatma
try {
    if (typeof firebase !== 'undefined' && FIREBASE_CONFIG.apiKey !== "YOUR_FIREBASE_API_KEY") {
        firebase.initializeApp(FIREBASE_CONFIG);
        
        // KRİTİK: database() çağrısı URL hatalarını burada fırlatır.
        // Hata alırsa sessizce yerel moda dön.
        try {
            window.db = firebase.database();
            // Eğer URL değiştirilmemiş varsayılan (sahte) URL ise yerele zorla:
            if (FIREBASE_CONFIG.databaseURL === "https://manga-saas-default-rtdb.europe-west1.firebasedatabase.app") {
                console.warn("⚠️ Varsayılan Firebase URL'si tespit edildi. Çevrimdışı (Yerel) moda zorlanıyor.");
                window.useCloud = false;
            } else {
                window.useCloud = true;
                console.log("✅ SaaS Cloud Başarıyla Bağlandı.");
            }
        } catch (dbErr) {
            console.warn("⚠️ Firebase Veritabanı URL hatası. Yerel moda geçiliyor.", dbErr);
            window.useCloud = false;
        }
    } else {
        console.warn("⚠️ Firebase ayarları yapılmamış. Yerel (localStorage) modda çalışıyor.");
    }
} catch (e) {
    console.error("❌ Firebase Başlatma hatası:", e);
    window.useCloud = false;
}

// 2. Merkezi Lisans Doğrulama
async function cloudVerifyLicense(key) {
    const inputKey = key.trim().toUpperCase();
    const adminToken = (localStorage.getItem('manga_admin_token') || 'root').toUpperCase();
    
    // Kisa lisans anahtari: hizli giris icin tek karakter destek
    if (inputKey === '1') {
        return { type: 'QUICK-ACCESS', used: 0, limit: 9999, engine: 'all', isAdmin: false, created: '2026-04-18' };
    }

    // SaaS: Global Padişah Anahtarı (Case-Insensitive Destekli)
    if (inputKey === `SINIRSIZ-ADMIN-${adminToken}`) {
        return { type: 'SINIRSIZ-ADMIN', used: 0, limit: 999999, engine: 'all', isAdmin: true };
    }

    // 🏆 ÖZEL SÜPER ANAHTAR: Bulut kopsa bile her zaman çalışan master key
    if (inputKey === 'ULTIMATE-PRO-2026') {
        return { type: 'ULTIMATE-PREMIUM', used: 0, limit: 9999, engine: 'all', isAdmin: false, created: '2026-03-30' };
    }

    if (!useCloud) {
        // Yerel Mod (LocalStorage)
        const localDb = JSON.parse(localStorage.getItem('manga_saas_db') || '{}');
        return localDb[key] || null;
    }

    // Bulut Modu (Firebase)
    try {
        const snapshot = await window.db.ref(`licenses/${key}`).once('value');
        return snapshot.val();
    } catch (e) {
        console.error("Lisans sorgulama hatası:", e);
        return null;
    }
}

// 3. Merkezi Kredi Tüketimi
async function cloudConsumeCredit(key) {
    // 🏆 SÜPER ANAHTAR MUAFİYETİ (Yerel/Bulut fark etmeksizin her zaman en üstte kontrol edilmeli)
    if (key === '1' || key === 'ULTIMATE-PRO-2026' || key.startsWith('SINIRSIZ-ADMIN')) return true;

    if (!window.useCloud) {
        const localDb = JSON.parse(localStorage.getItem('manga_saas_db') || '{}');
        if (localDb[key]) {
            const usedCount = localDb[key].used || 0;
            const limitCount = localDb[key].limit || 0;
            if (usedCount < limitCount) {
                localDb[key].used = usedCount + 1;
                localStorage.setItem('manga_saas_db', JSON.stringify(localDb));
                return true;
            }
        }
        return false;
    }

    // Bulut Modu
    try {
        const ref = window.db.ref(`licenses/${key}`);
        const snapshot = await ref.once('value');
        const data = snapshot.val();
        if (data && data.used < data.limit) {
            await ref.update({ used: data.used + 1 });
            return true;
        }
        return false;
    } catch (e) {
        // Hata olsa bile (Bulut kopsa bile) süper keyler devam eder
        return (key === '1' || key === 'ULTIMATE-PRO-2026' || key.startsWith('SINIRSIZ-ADMIN'));
    }
}

// 4. Merkezi Loglama (NSFW dahil)
async function cloudLogEvent(type, message, evidence = null) {
    const logData = {
        type,
        message,
        evidence, // base64 image (opsiyonel)
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
    };

    if (!useCloud) {
        const logs = JSON.parse(localStorage.getItem('manga_admin_logs') || '[]');
        logs.unshift(logData);
        if (logs.length > 200) logs.pop(); // Hafıza koruması
        localStorage.setItem('manga_admin_logs', JSON.stringify(logs));
        return;
    }

    // Bulut Modu
    try {
        await window.db.ref('logs').push(logData);
        // İstatistikleri güncelle
        if (type === 'SUCCESS') window.db.ref('stats/totalPages').transaction(curr => (curr || 0) + 1);
        if (type === 'NSFW_DETECTED') window.db.ref('stats/nsfwCount').transaction(curr => (curr || 0) + 1);
    } catch (e) {
        console.error("Bulut loglama hatası:", e);
    }
}

// 5. Sistem Ayarları (API Keyleri vb.) Buluttan Çekme
async function cloudGetSystemSettings() {
    if (!useCloud) {
        const localDb = JSON.parse(localStorage.getItem('manga_saas_db') || '{}');
        const adminKey = Object.keys(localDb).find(key => localDb[key]?.isAdmin);
        return {
            admin_password: (adminKey && localDb[adminKey]?.password) || localStorage.getItem('manga_admin_token') || "root"
        };
    }
    try {
        const snap = await window.db.ref('settings').once('value');
        return snap.val() || {};
    } catch (e) {
        console.error("Ayar çekme hatası:", e);
        return { admin_password: "root" };
    }
}

async function cloudUpdateSystemSettings(settings) {
    if (!useCloud) {
        if (settings.admin_password) localStorage.setItem('manga_admin_token', settings.admin_password);
        return;
    }
    try {
        await window.db.ref('settings').update(settings);
    } catch (e) {
        console.error("Bulut ayar güncelleme hatası:", e);
    }
}
