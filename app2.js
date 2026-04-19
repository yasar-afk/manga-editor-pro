let currentLicenseKey = null;
let currentLimit = 0;
let usedPages = 0;

// SaaS: Admin Olay Günlüğü (Bulut Destekli)
async function logAdminEvent(type, details, evidence = null) {
    if (typeof cloudLogEvent === 'function') {
        await cloudLogEvent(type, details, evidence);
    } else {
        // Fallback: Yerel Mod
        let logs = JSON.parse(localStorage.getItem('manga_admin_logs')) || [];
        logs.unshift({ id: Date.now(), timestamp: new Date().toLocaleString('tr-TR'), key: currentLicenseKey || 'Bilinmiyor', type, details, evidence });
        if (logs.length > 50) logs = logs.slice(0, 50);
        localStorage.setItem('manga_admin_logs', JSON.stringify(logs));
    }
}

// SaaS: Lisans Doğrulama (Bulut Destekli v4)
async function verifyLicense() {
    const keyInput = document.getElementById('license-key').value.trim().toUpperCase();
    if (!keyInput) return;

    const license = await cloudVerifyLicense(keyInput); // Buluttan (veya local fallback’ten) sorgula
    
    if (license) {
        // Değişkenleri global state'e kaydet
        currentLicenseKey = keyInput;
        currentLimit = license.limit || 0;
        usedPages = license.used || 0;
        
        // Lisansın motorunu sisteme tanıt (Yoksa varsayılan Gemini)
        const engineSelect = document.getElementById('main-ai-engine');
        if (engineSelect) {
            const engineValue = license.engine || 'gemini';
            // Eğer select içinde bu seçenek yoksa ekle (Gizli select)
            if (!Array.from(engineSelect.options).some(opt => opt.value === engineValue)) {
                const newOpt = document.createElement('option');
                newOpt.value = engineValue;
                engineSelect.appendChild(newOpt);
            }
            engineSelect.value = engineValue;
            console.log("🤖 Lisans motoru aktifleştirildi:", engineValue);
        }
        
        // Admin Giriş Koruması (Opsiyonel: cloud.js içinde de yapılabilir)
        if (license.isAdmin) {
            const pass = prompt("Admin şifresini giriniz:");
            if (pass !== (license.password || 'root')) {
                alert("Hatalı Admin şifresi!");
                return;
            }
            if (confirm("Yönetim paneline girmek istiyor musunuz?")) {
                window.location.href = 'admin.html';
                return;
            }
        }

        // SaaS: Bulut Ayarlarını Çek (API Keyleri vb.)
        const settings = await cloudGetSystemSettings();
        if (settings) {
            console.log("🔐 Bulut anahtarları yüklendi.");
            const geminiKeysField = document.getElementById('gemini-keys');
            const grokKeyField = document.getElementById('grok-api-key');
            if (settings.gemini_keys && geminiKeysField) geminiKeysField.value = settings.gemini_keys;
            if (settings.grok_key && grokKeyField) grokKeyField.value = settings.grok_key;
        }
        
        document.getElementById('login-overlay').style.display = 'none';
        const lt = document.getElementById('license-type');
        if(lt) lt.textContent = license.isAdmin ? "Yönetici" : "Lisanslı Paket";
        
        updateSaasUI();
        logAdminEvent('LOGIN', 'Sisteme giriş yapıldı.');
    } else {
        document.getElementById('login-error').style.display = 'block';
        setTimeout(() => { document.getElementById('login-error').style.display = 'none'; }, 3000);
    }
}

function updateSaasUI() {
    const el = document.getElementById('page-limit-text');
    if (el) {
        el.textContent = `${usedPages} / ${currentLimit} Sayfa`;
        el.style.color = (usedPages >= currentLimit) ? "var(--error)" : "var(--success)";
    }
}

// SaaS: Kredi Kullanımı (Bulut Destekli v4)
async function consumeCredit() {
    if (!currentLicenseKey) return false;
    
    // Buluttan kredi düşmeyi dene
    const success = await cloudConsumeCredit(currentLicenseKey);
    
    if (success) {
        // Güncel durumu tekrar çek (Senkronizasyon için)
        const license = await cloudVerifyLicense(currentLicenseKey);
        usedPages = license.used || 0;
        currentLimit = license.limit || 0;
        updateSaasUI();
        return true;
    } else {
        alert("⚠️ Çeviri limitiniz doldu! Lütfen paketinizi yükseltin.");
        return false;
    }
}

// DOM Elementlerini Seç
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const canvasWrapper = document.getElementById('canvas-wrapper');
const relativeContainer = document.getElementById('relative-canvas-container');
const canvasControls = document.getElementById('canvas-controls');
const drawingTools = document.getElementById('drawing-tools');
const canvas = document.getElementById('manga-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const analyzeBtn = document.getElementById('analyze-btn');
const applyBtn = document.getElementById('apply-btn');
const dialogCleanBtn = document.getElementById('dialog-clean-btn');
const autoEraseBtn = document.getElementById('auto-erase-btn');
const translateAllBtn = document.getElementById('translate-all-btn');
const compareBtn = document.getElementById('compare-btn');
const resetPageBtn = document.getElementById('reset-page-btn');
const downloadBtn = document.getElementById('download-btn');
const undoBtn = document.getElementById('undo-btn');
const translationsList = document.getElementById('translations-list');
const textCount = document.getElementById('text-count');
const pageNavigation = document.getElementById('page-navigation');

function repairUiText() {
    document.title = 'Manga Editor Pro | Yapay Zeka Manga Ceviri';

    const textMap = [
        ['#login-overlay h1', 'Manga Editor Pro'],
        ['#login-overlay p', 'On Odemeli Ceviri Sistemi'],
        ['#login-error', 'Gecersiz veya suresi dolmus lisans anahtari!'],
        ['#translate-all-btn', 'Tumunu Cevir'],
        ['#dialog-clean-btn', 'Diyaloglari Temizle'],
        ['#reset-page-btn', 'Sifirla'],
        ['#apply-btn', 'Gorsele Uygula'],
        ['#python-backend-status span', 'Kontrol ediliyor...'],
    ];

    const htmlMap = [
        ['#help-modal h2', '<i class="fa-solid fa-book-open"></i> Sistem Nasil Calisir?'],
        ['#help-modal button', 'Anladim, Kapat'],
        ['.logo h1', 'Manga <span>Editor Pro</span>'],
        ['#download-btn', '<i class="fa-regular fa-image"></i> Resimleri Disa Aktar'],
    ];

    textMap.forEach(([selector, value]) => {
        const element = document.querySelector(selector);
        if (element) element.textContent = value;
    });

    htmlMap.forEach(([selector, value]) => {
        const element = document.querySelector(selector);
        if (element) element.innerHTML = value;
    });

    const licenseInput = document.getElementById('license-key');
    if (licenseInput) {
        licenseInput.placeholder = 'Lisans Anahtariniz (Orn: DEMO-50)';
    }

    const helpModal = document.getElementById('help-modal');
    if (helpModal) {
        const paragraphs = helpModal.querySelectorAll('p');
        if (paragraphs[0]) {
            paragraphs[0].innerHTML = [
                '<b>1. Yukleme:</b> Cevirmek istediginiz gorselleri sola surukleyip birakin.<br><br>',
                '<b>2. Ceviri:</b> Sag panelden sayfayi analiz edip metinleri dogrudan Turkceye cevirin.<br><br>',
                '<b>3. Sayfa Limiti:</b> Lisansinizdaki ceviri hakki ust bolumde canli gosterilir.<br><br>',
                '<b>4. Gorsel Netlestirici:</b> Eski veya kotu taranmis sayfalarda metni one cikarmak icin kullanin.'
            ].join('');
        }
    }

    const dropTitle = document.querySelector('#drop-zone h3');
    if (dropTitle) dropTitle.textContent = 'Duzenlemeye Basla';
    const dropText = document.querySelector('#drop-zone p');
    if (dropText) dropText.innerHTML = 'Surukle birak yapin veya <span>secin</span>';

    const headerTitle = document.querySelector('.image-panel .panel-header h2');
    if (headerTitle) {
        headerTitle.innerHTML = '<i class="fa-regular fa-image"></i> Calisma Alani <span id="page-count-badge" class="badge">0 Sayfa</span>';
    }

    const resultsTitle = document.querySelector('.results-panel .panel-header h2');
    if (resultsTitle) {
        resultsTitle.innerHTML = '<i class="fa-solid fa-language"></i> Metinler <span id="text-count" class="badge">0</span>';
    }

    const loadingText = document.querySelector('#loadingIndicator p');
    if (loadingText) loadingText.textContent = 'Isleniyor...';
}

// Çoklu Sayfa (Multi-Image) Geçmişi ve Yönetimi
let pages = [];
let currentPageIndex = -1;

// Geri Al (Undo) Geçmişi
let undoHistory = [];
let currentStep = -1;

repairUiText();

function updatePageButtons() {
    pageNavigation.innerHTML = '';
    pages.forEach((page, idx) => {
        const btn = document.createElement('button');
        btn.className = `page-btn ${idx === currentPageIndex ? 'active' : ''}`;
        btn.innerHTML = `<i class="fa-regular fa-file-image"></i> Sayfa ${idx + 1}`;
        btn.onclick = () => switchPage(idx);
        pageNavigation.appendChild(btn);
    });
}

function switchPage(index) {
    if (document.querySelectorAll('.text-element').length > 0) {
        alert("Lütfen diğer sayfaya geçmeden önce ekrandaki yazıları 'Görsele Uygula (Kaydet)' ile tuvale nakşedin veya silin!");
        return;
    }
    
    // Mevcut sayfanın state'ini kaydet
    if (currentPageIndex >= 0) {
        pages[currentPageIndex].canvasData = canvas.toDataURL(); // çizilmiş hali
        pages[currentPageIndex].undoHistory = [...undoHistory];
        pages[currentPageIndex].currentStep = currentStep;
        pages[currentPageIndex].translations = [...detectedTexts];
    }
    
    // Yeni sayfayı yükle
    currentPageIndex = index;
    const page = pages[index];
    
    undoHistory = [...page.undoHistory];
    currentStep = page.currentStep;
    detectedTexts = [...page.translations];
    updateUndoButton();
    renderTranslations(); // Sağ paneli sayfaya göre doldur/boşalt
    
    // Canvas'a çiz
    const img = new Image();
    img.onload = () => {
        currentImage = img; // Tuvalin ana resmini güncelle
        canvas.width = img.width;
        canvas.height = img.height;
        // KRİTİK: Container boyutlarını açıkça ayarla ki position:absolute metin kutuları doğru konumlansın
        relativeContainer.style.width = img.width + 'px';
        relativeContainer.style.height = img.height + 'px';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        updateActionButtonVisibility();
    };
    img.src = page.canvasData || page.originalData;
    
    updatePageButtons();
}

function saveCanvasState() {
    if (undoHistory.length > 10) {
        undoHistory.shift();
        currentStep--;
    }
    if (currentStep < undoHistory.length - 1) {
        undoHistory = undoHistory.slice(0, currentStep + 1);
    }
    undoHistory.push(canvas.toDataURL());
    currentStep++;
    updateUndoButton();
}

function updateActionButtonVisibility() {
    if (dialogCleanBtn) {
        if (currentImage) dialogCleanBtn.classList.remove('hidden');
        else dialogCleanBtn.classList.add('hidden');
    }

    if (autoEraseBtn) {
        if (detectedTexts.length > 0) autoEraseBtn.classList.remove('hidden');
        else autoEraseBtn.classList.add('hidden');
    }
}

function updateUndoButton() {
    if (undoBtn) undoBtn.disabled = currentStep <= 0;
}

function undoLastAction() {
    if (currentStep > 0) {
        currentStep--;
        const imgState = new Image();
        imgState.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(imgState, 0, 0);
        };
        imgState.src = undoHistory[currentStep];
        updateUndoButton();
    }
}

if (undoBtn) {
    undoBtn.addEventListener('click', undoLastAction);
}

document.addEventListener('keydown', (e) => {
    // Yazı yazılan bir alandaysak kısayolları çalıştırma
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.isContentEditable) {
        return;
    }

    // Ctrl+Z: Geri Al
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undoLastAction();
    }

    // B: Fırça
    if (e.key.toLowerCase() === 'b') {
        setTool('brush');
    }

    // W: Sihirli Değnek
    if (e.key.toLowerCase() === 'w') {
        setTool('wand');
    }

    // R: Bölge Geri Yükle
    if (e.key.toLowerCase() === 'r') {
        setTool('restore');
    }
});
const loadingIndicator = document.getElementById('loadingIndicator');
const geminiKeysInput = document.getElementById('gemini-keys');
const keyStatus = document.getElementById('key-status');
const pythonBackendStatusText = document.querySelector('#python-backend-status span');
let pythonBackendHealthy = false;

async function checkPythonBackendStatus() {
    if (!pythonBackendStatusText) return;

    pythonBackendStatusText.textContent = 'Kontrol ediliyor...';
    pythonBackendStatusText.style.color = '#f59e0b';

    try {
        const response = await fetch('/api/health', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        pythonBackendHealthy = true;
        pythonBackendStatusText.textContent = 'Aktif';
        pythonBackendStatusText.style.color = '#10b981';
    } catch (error) {
        console.warn('Python OCR backend sağlık kontrolü başarısız:', error);
        pythonBackendHealthy = false;
        pythonBackendStatusText.textContent = 'Kapalı';
        pythonBackendStatusText.style.color = '#ef4444';
    }
}

checkPythonBackendStatus();
setInterval(checkPythonBackendStatus, 30000);

function normalizeBackendBoxes(boxes = []) {
    return boxes.map((box, index) => ({
        id: box.id ?? index + 1,
        original: box.original_text || '',
        translated: box.translated_text || box.original_text || '',
        box: {
            ...(box.balloon_inner_percent || box.safe_box_percent || box.box_percent || {
                x: box.x || 0,
                y: box.y || 0,
                w: box.w || 0,
                h: box.h || 0,
            }),
            source_type: box.balloon_inner_percent
                ? 'balloon_inner'
                : (box.safe_box_percent ? 'safe_box' : 'ocr_box'),
            is_balloon_inner: !!box.balloon_inner_percent,
            is_safe_box: !!box.safe_box_percent,
        },
        original_text: box.original_text || '',
        translated_text: box.translated_text || box.original_text || '',
        box_percent: box.box_percent || null,
        safe_box_percent: box.safe_box_percent || null,
        balloon_percent: box.balloon_percent || null,
        balloon_inner_percent: box.balloon_inner_percent || null,
        is_balloon_inner: !!box.balloon_inner_percent,
        is_safe_box: !!box.safe_box_percent,
    }));
}

async function applyBackendResultToActivePage(result, { keepTranslations = true } = {}) {
    if (!result) return;

    if (result.image) {
        await drawCanvasFromDataUrl(result.image);
        saveCanvasState();
        if (currentPageIndex >= 0) {
            pages[currentPageIndex].canvasData = result.image;
        }
    }

    if (keepTranslations && Array.isArray(result.boxes)) {
        detectedTexts = normalizeBackendBoxes(result.boxes || []);
        if (currentPageIndex >= 0) {
            pages[currentPageIndex].translations = [...detectedTexts];
            pages[currentPageIndex].isApplied = false;
        }
        renderTranslations();
    }
}

function drawCanvasFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
        if (!dataUrl) {
            resolve(false);
            return;
        }
        const img = new Image();
        img.onload = () => {
            currentImage = img;
            canvas.width = img.width;
            canvas.height = img.height;
            relativeContainer.style.width = img.width + 'px';
            relativeContainer.style.height = img.height + 'px';
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            resolve(true);
        };
        img.onerror = reject;
        img.src = dataUrl;
    });
}

function clampPercentBox(box, minW = 8, minH = 5) {
    const x = Math.max(1, Number(box?.x ?? 10));
    const y = Math.max(1, Number(box?.y ?? 10));
    const w = Math.min(95 - x, Math.max(minW, Number(box?.w ?? 20)));
    const h = Math.min(95 - y, Math.max(minH, Number(box?.h ?? 10)));
    return { x, y, w, h };
}

function insetPercentBox(box, insetXRatio, insetYRatio, minW = 8, minH = 5) {
    const source = clampPercentBox(box, minW, minH);
    const insetX = Math.min(source.w * 0.24, Math.max(0.8, source.w * insetXRatio));
    const insetY = Math.min(source.h * 0.24, Math.max(0.7, source.h * insetYRatio));
    return clampPercentBox(
        {
            x: source.x + insetX,
            y: source.y + insetY,
            w: source.w - (insetX * 2),
            h: source.h - (insetY * 2),
        },
        minW,
        minH
    );
}

function getDisplayBox(box, text = '') {
    const source = box || {};
    const safeText = String(text || '').trim();

    if (source.is_display_box) {
        return clampPercentBox(source, 8, 5);
    }

    if (source.balloon_inner_percent || source.source_type === 'balloon_inner') {
        return insetPercentBox(source.balloon_inner_percent || source, 0.035, 0.05, 8, 5);
    }

    if (source.safe_box_percent || source.is_safe_box || source.source_type === 'safe_box') {
        return insetPercentBox(source.safe_box_percent || source, 0.09, 0.12, 8, 5);
    }

    if (source.balloon_percent) {
        return insetPercentBox(source.balloon_percent, 0.12, 0.15, 8, 5);
    }

    let display = clampPercentBox(source.box_percent || source, 8, 5);
    const aspect = display.w / Math.max(display.h, 1);
    const hasWords = safeText.includes(' ');
    const isFallbackNarrow = hasWords && (display.w < 12 || aspect < 0.9);

    if (isFallbackNarrow) {
        const targetW = Math.min(28, Math.max(display.w + 3, display.w * 1.15));
        const deltaW = targetW - display.w;
        display = clampPercentBox({
            x: display.x - (deltaW / 2),
            y: display.y,
            w: targetW,
            h: display.h,
        }, 8, 5);
    }

    return insetPercentBox(display, 0.05, 0.07, 8, 5);
}

function getDisplayBoxCandidates(box, text = '') {
    const source = box || {};
    const safeText = String(text || '').trim();
    const textLen = safeText.length;
    const hasWords = safeText.includes(' ');
    const candidates = [];
    const seen = new Set();

    const addCandidate = (candidate) => {
        const normalized = clampPercentBox(candidate, 8, 5);
        const key = [normalized.x, normalized.y, normalized.w, normalized.h]
            .map(value => Number(value).toFixed(2))
            .join(':');
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push(normalized);
    };

    addCandidate(getDisplayBox(source, safeText));

    if (source.balloon_inner_percent || source.source_type === 'balloon_inner') {
        const inner = source.balloon_inner_percent || source;
        addCandidate(insetPercentBox(inner, 0.03, 0.045, 8, 5));
        addCandidate(insetPercentBox(inner, 0.02, 0.03, 8, 5));
    }

    if (source.safe_box_percent || source.is_safe_box || source.source_type === 'safe_box') {
        const safeBox = source.safe_box_percent || source;
        addCandidate(insetPercentBox(safeBox, 0.07, 0.10, 8, 5));
        addCandidate(insetPercentBox(safeBox, 0.055, 0.08, 8, 5));
    }

    if (source.balloon_percent) {
        addCandidate(insetPercentBox(source.balloon_percent, 0.11, 0.14, 8, 5));
        addCandidate(insetPercentBox(source.balloon_percent, 0.085, 0.11, 8, 5));
        if (textLen >= 18 || hasWords) {
            addCandidate(insetPercentBox(source.balloon_percent, 0.065, 0.09, 8, 5));
        }
    }

    const base = candidates[0];
    if (base && hasWords && textLen >= 18) {
        const growW = textLen < 32 ? 2.6 : 4.0;
        const growH = textLen < 32 ? 0.8 : 1.4;
        addCandidate({
            x: base.x - (growW / 2),
            y: base.y - (growH / 2),
            w: base.w + growW,
            h: base.h + growH,
        });
    }

    if (base && hasWords && base.w < 14) {
        addCandidate({
            x: base.x - 1.5,
            y: base.y,
            w: base.w + 3.0,
            h: base.h + 0.8,
        });
    }

    return candidates;
}

function chooseDisplayBoxAndLayout(text, fontFamily, box, containerWidth, containerHeight) {
    let best = null;

    for (const displayBox of getDisplayBoxCandidates(box, text)) {
        const fitted = fitTextLayout(text, fontFamily, displayBox, containerWidth, containerHeight);
        let selectionScore = Number(fitted.layoutScore || 0);
        selectionScore -= Math.max(0, Number(fitted.fillRatioW || 0) - 0.84) * 5.5;
        selectionScore -= Math.max(0, Number(fitted.fillRatioH || 0) - 0.73) * 6.0;
        selectionScore -= Math.max(0, 0.46 - Number(fitted.fillRatioW || 0)) * 1.4;
        selectionScore -= Number(fitted.widowPenalty || 0) * 0.35;
        selectionScore -= Math.max(0, Number(fitted.lineCount || 1) - 3) * 0.18;
        selectionScore += Math.min(Number(displayBox.w || 0), 26) * 0.008;

        const candidate = { displayBox, fitted, selectionScore };
        if (!best || candidate.selectionScore > best.selectionScore + 0.05) {
            best = candidate;
            continue;
        }
        if (
            Math.abs(candidate.selectionScore - best.selectionScore) <= 0.05 &&
            Number(displayBox.w || 0) > Number(best.displayBox.w || 0) &&
            Number(fitted.fontSize || 0) >= Number(best.fitted.fontSize || 0) - 1
        ) {
            best = candidate;
        }
    }

    return best || {
        displayBox: getDisplayBox(box, text),
        fitted: fitTextLayout(text, fontFamily, getDisplayBox(box, text), containerWidth, containerHeight),
        selectionScore: 0,
    };
}

function drawTranslatedOverlayToContext(tCtx, targetWidth, targetHeight, item) {
    const text = String(item?.translated || item?.translated_text || '').trim();
    if (!text || !item?.box) return;

    const fontFamily = item.fontFamily || 'Comic Sans MS';
    const picked = chooseDisplayBoxAndLayout(text, fontFamily, item.box, targetWidth, targetHeight);
    const box = picked.displayBox;
    const x = (box.x / 100) * targetWidth;
    const y = (box.y / 100) * targetHeight;
    const w = (box.w / 100) * targetWidth;
    const h = (box.h / 100) * targetHeight;

    const textColor = item.textColor || '#000000';
    const bgColor = item.bgColor || 'transparent';
    const fitted = picked.fitted;
    const lines = fitted.lines && fitted.lines.length ? fitted.lines : [text];
    const lineHeight = fitted.lineHeightPx || (fitted.fontSize * 1.12);

    if (bgColor !== 'transparent') {
        const padX = Math.max(8, fitted.padX + 4);
        const padY = Math.max(6, fitted.padY + 3);
        const radius = Math.max(10, Math.min(w, h) * 0.12);
        const rX = x - padX;
        const rY = y - padY;
        const rW = w + (padX * 2);
        const rH = h + (padY * 2);

        tCtx.fillStyle = bgColor;
        tCtx.beginPath();
        tCtx.moveTo(rX + radius, rY);
        tCtx.lineTo(rX + rW - radius, rY);
        tCtx.quadraticCurveTo(rX + rW, rY, rX + rW, rY + radius);
        tCtx.lineTo(rX + rW, rY + rH - radius);
        tCtx.quadraticCurveTo(rX + rW, rY + rH, rX + rW - radius, rY + rH);
        tCtx.lineTo(rX + radius, rY + rH);
        tCtx.quadraticCurveTo(rX, rY + rH, rX, rY + rH - radius);
        tCtx.lineTo(rX, rY + radius);
        tCtx.quadraticCurveTo(rX, rY, rX + radius, rY);
        tCtx.closePath();
        tCtx.fill();
    }

    tCtx.fillStyle = textColor;
    tCtx.font = `800 ${Math.max(12, fitted.fontSize)}px "${fontFamily}", "Chalkboard SE", "Comic Sans", sans-serif`;
    tCtx.textAlign = 'center';
    tCtx.textBaseline = 'middle';
    tCtx.lineJoin = 'round';

    const totalTextHeight = lines.length * lineHeight;
    let startY = y + (h / 2) - (totalTextHeight / 2) + (lineHeight / 2);
    const centerX = x + (w / 2);

    lines.forEach(line => {
        tCtx.lineWidth = Math.max(4, fitted.fontSize / 3.8);
        tCtx.strokeStyle = bgColor === 'transparent' ? 'white' : bgColor;
        tCtx.strokeText(line, centerX, startY);
        tCtx.fillText(line, centerX, startY);
        startY += lineHeight;
    });
}

async function callPythonBackendProcess(base64DataUrl, language = 'auto') {
    let blob;
    if (typeof base64DataUrl === 'string' && base64DataUrl.startsWith('data:')) {
        const response = await fetch(base64DataUrl);
        blob = await response.blob();
    } else {
        const byteString = atob(String(base64DataUrl || ''));
        const arrayBuffer = new ArrayBuffer(byteString.length);
        const uint8Array = new Uint8Array(arrayBuffer);
        for (let i = 0; i < byteString.length; i++) {
            uint8Array[i] = byteString.charCodeAt(i);
        }
        blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
    }

    const formData = new FormData();
    formData.append('file', blob, 'page.jpg');
    formData.append('language', language);
    formData.append('model', 'google/gemini-2.5-flash');

    const res = await fetch('/api/process', {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Python OCR backend hatası: ${res.status} ${text}`);
    }

    return await res.json();
}

const brushColorInput = document.getElementById('brush-color');
const brushSizeInput = document.getElementById('brush-size');
const toolBrushBtn = document.getElementById('tool-brush');
const toolWandBtn = document.getElementById('tool-wand');
const toolRestoreBtn = document.getElementById('tool-restore');
const brushSettings = document.getElementById('brush-settings');
const wandSettings = document.getElementById('wand-settings');
const wandToleranceInput = document.getElementById('wand-tolerance');

// State Manager
let currentImage = null;
let detectedTexts = []; 
let isDrawing = false;
let draggedElement = null;
let currentTool = 'brush'; // 'brush', 'wand' veya 'restore'
// Restore rect state
let restoreStart = null;     // {x, y} when mousedown in restore mode
let restoreOverlay = null;   // overlay div for visual rubber-band rect

if (toolBrushBtn && toolWandBtn) {
    function setTool(tool) {
        currentTool = tool;
        
        // Yeni UI: Active class yönetimi
        [toolBrushBtn, toolWandBtn, toolRestoreBtn].forEach(btn => btn?.classList.remove('active'));
        
        if (tool === 'brush') toolBrushBtn.classList.add('active');
        if (tool === 'wand') toolWandBtn.classList.add('active');
        if (tool === 'restore' && toolRestoreBtn) toolRestoreBtn.classList.add('active');

        canvas.style.cursor = tool === 'wand' ? 'cell' : tool === 'restore' ? 'crosshair' : 'crosshair';
        if (brushSettings) tool === 'brush' ? brushSettings.classList.remove('hidden') : brushSettings.classList.add('hidden');
        if (wandSettings)  tool === 'wand'  ? wandSettings.classList.remove('hidden')  : wandSettings.classList.add('hidden');
    }
    toolBrushBtn.addEventListener('click',   () => setTool('brush'));
    toolWandBtn.addEventListener('click',    () => setTool('wand'));
    if (toolRestoreBtn)
        toolRestoreBtn.addEventListener('click', () => setTool('restore'));
}

// ================= FIRÇA VE ÇİZİM MANTIĞI =================
function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function rgbToHex(r, g, b) {
    return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
}

function hexToRgba(hex) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    return {r, g, b, a: 255};
}

const textFitCanvas = document.createElement('canvas');
const textFitCtx = textFitCanvas.getContext('2d');

function getTextLayoutConfig(box, containerWidth, containerHeight) {
    const boxPxW = Math.max(48, ((box?.w || 20) / 100) * containerWidth);
    const boxPxH = Math.max(28, ((box?.h || 10) / 100) * containerHeight);
    const aspect = boxPxW / Math.max(1, boxPxH);
    const isTall = aspect < 0.82;
    const isWide = aspect > 1.85;
    const padX = Math.round(Math.max(7, Math.min(boxPxW * (isTall ? 0.11 : 0.09), 24)));
    const padY = Math.round(Math.max(6, Math.min(boxPxH * (isTall ? 0.11 : 0.09), 18)));
    const lineHeight = isTall ? 1.04 : (isWide ? 1.1 : 1.07);
    const letterSpacing = isTall ? '0.005em' : '0';
    const minFont = Math.max(10, Math.min(boxPxH * 0.14, 17));
    const maxFont = Math.min(56, Math.max(
        minFont,
        Math.min(
            boxPxH * (isTall ? 0.3 : 0.27),
            boxPxW * (isTall ? 0.14 : 0.11)
        )
    ));
    return { boxPxW, boxPxH, padX, padY, lineHeight, letterSpacing, minFont, maxFont };
}

function wrapTextForWidth(text, maxWidth, ctxRef) {
    const lines = [];
    const paragraphs = String(text || '').split('\n');

    for (const paragraph of paragraphs) {
        const trimmed = paragraph.trim();
        if (!trimmed) {
            lines.push('');
            continue;
        }

        const words = trimmed.split(/\s+/);
        let currentLine = '';

        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            if (ctxRef.measureText(testLine).width <= maxWidth) {
                currentLine = testLine;
                continue;
            }

            if (currentLine) lines.push(currentLine);
            currentLine = word;

            while (ctxRef.measureText(currentLine).width > maxWidth && currentLine.length > 1) {
                let breakIndex = currentLine.length - 1;
                while (breakIndex > 1 && ctxRef.measureText(currentLine.slice(0, breakIndex)).width > maxWidth) {
                    breakIndex--;
                }
                lines.push(currentLine.slice(0, breakIndex));
                currentLine = currentLine.slice(breakIndex);
            }
        }

        if (currentLine) lines.push(currentLine);
    }

    return lines.length ? lines : [''];
}

function scoreTextLayoutCandidate(lines, widths, layout, fontSize, lineHeightPx, usableWidth, usableHeight) {
    const totalHeight = lines.length * lineHeightPx;
    const widestLine = Math.max(...widths, 0);
    const horizontalFill = widestLine / Math.max(usableWidth, 1);
    const verticalFill = totalHeight / Math.max(usableHeight, 1);
    const preferredHorizontal = horizontalFill >= 0.62 && horizontalFill <= 0.82;
    const preferredVertical = verticalFill >= 0.45 && verticalFill <= 0.72;
    const horizontalPenalty = Math.abs(horizontalFill - 0.72) * 2.6;
    const verticalPenalty = Math.abs(verticalFill - 0.58) * 2.4;

    const lineCount = lines.length;
    const wordCounts = lines.map(line => String(line || '').trim().split(/\s+/).filter(Boolean).length);
    let widowPenalty = 0;
    if (lineCount > 1 && wordCounts[0] <= 1) widowPenalty += 0.55;
    if (lineCount > 1 && wordCounts[lineCount - 1] <= 1) widowPenalty += 0.7;

    let lineCountPenalty = 0;
    if (lineCount < 2) lineCountPenalty += 0.8;
    if (lineCount > 4) lineCountPenalty += (lineCount - 4) * 0.45;

    const centeredMargins = widths.map(width => (usableWidth - width) / 2);
    const avgMargin = centeredMargins.reduce((sum, value) => sum + value, 0) / Math.max(centeredMargins.length, 1);
    const marginVariance = centeredMargins.reduce((sum, value) => sum + Math.abs(value - avgMargin), 0) / Math.max(centeredMargins.length, 1);
    const marginPenalty = marginVariance / Math.max(usableWidth, 1) * 2.2;

    let balloonShapePenalty = 0;
    if (lineCount >= 3) {
        const middleWidth = Math.max(...widths.slice(1, -1), widths[1] || widths[0] || 0);
        const topRatio = widths[0] / Math.max(middleWidth, 1);
        const bottomRatio = widths[lineCount - 1] / Math.max(middleWidth, 1);
        balloonShapePenalty += Math.abs(topRatio - 0.78) * 0.75;
        balloonShapePenalty += Math.abs(bottomRatio - 0.78) * 0.85;
        if (topRatio > 1.05) balloonShapePenalty += 0.35;
        if (bottomRatio > 1.05) balloonShapePenalty += 0.35;
    }

    const oversizePenalty = fontSize > (layout.maxFont * 0.96) && !preferredHorizontal ? 0.45 : 0;
    const score = 10
        - horizontalPenalty
        - verticalPenalty
        - widowPenalty
        - lineCountPenalty
        - marginPenalty
        - balloonShapePenalty
        - oversizePenalty
        + (preferredHorizontal ? 0.35 : 0)
        + (preferredVertical ? 0.35 : 0);

    return {
        score,
        fillRatioW: horizontalFill,
        fillRatioH: verticalFill,
        marginPenalty,
        widowPenalty,
        balloonShapePenalty,
        lineCount,
    };
}

function fitTextLayout(text, fontFamily, box, containerWidth, containerHeight) {
    const layout = getTextLayoutConfig(box, containerWidth, containerHeight);
    const usableWidth = Math.max(24, layout.boxPxW - (layout.padX * 2));
    const usableHeight = Math.max(20, layout.boxPxH - (layout.padY * 2));
    const minSize = Math.max(9, Math.floor(Math.min(layout.minFont, 12)));
    const maxSize = Math.max(minSize, Math.floor(layout.maxFont));
    let best = null;

    for (let fontSize = maxSize; fontSize >= minSize; fontSize -= 1) {
        textFitCtx.font = `800 ${fontSize}px "${fontFamily}", "Chalkboard SE", "Comic Sans", sans-serif`;
        const lines = wrapTextForWidth(text, usableWidth, textFitCtx);
        const lineWidths = lines.map(line => textFitCtx.measureText(line || ' ').width);
        const lineHeightPx = fontSize * layout.lineHeight;
        const totalHeight = lines.length * lineHeightPx;
        const widestLine = Math.max(...lineWidths, 0);

        if (widestLine > usableWidth || totalHeight > usableHeight) continue;

        const metrics = scoreTextLayoutCandidate(
            lines,
            lineWidths,
            layout,
            fontSize,
            lineHeightPx,
            usableWidth,
            usableHeight
        );

        const candidate = {
            fontSize,
            lines,
            lineHeightPx,
            padX: layout.padX,
            padY: layout.padY,
            letterSpacing: layout.letterSpacing,
            layoutScore: metrics.score,
            lineCount: metrics.lineCount,
            fillRatioW: metrics.fillRatioW,
            fillRatioH: metrics.fillRatioH,
            marginPenalty: metrics.marginPenalty,
            widowPenalty: metrics.widowPenalty,
            balloonShapePenalty: metrics.balloonShapePenalty,
        };

        if (!best || candidate.layoutScore > best.layoutScore + 0.08 || (
            Math.abs(candidate.layoutScore - best.layoutScore) <= 0.08 && candidate.fontSize > best.fontSize
        )) {
            best = candidate;
        }
    }

    if (!best) {
        const fallbackSize = minSize;
        textFitCtx.font = `800 ${fallbackSize}px "${fontFamily}", "Chalkboard SE", "Comic Sans", sans-serif`;
        const lines = wrapTextForWidth(text, usableWidth, textFitCtx);
        const lineWidths = lines.map(line => textFitCtx.measureText(line || ' ').width);
        const lineHeightPx = fallbackSize * layout.lineHeight;
        const metrics = scoreTextLayoutCandidate(
            lines,
            lineWidths,
            layout,
            fallbackSize,
            lineHeightPx,
            usableWidth,
            usableHeight
        );
        best = {
            fontSize: fallbackSize,
            lines,
            lineHeightPx,
            padX: layout.padX,
            padY: layout.padY,
            letterSpacing: layout.letterSpacing,
            layoutScore: metrics.score,
            lineCount: lines.length,
            fillRatioW: metrics.fillRatioW,
            fillRatioH: metrics.fillRatioH,
            marginPenalty: metrics.marginPenalty,
            widowPenalty: metrics.widowPenalty,
            balloonShapePenalty: metrics.balloonShapePenalty,
        };
    }

    return best;
}

function applyOverlayTextLayout(textDiv, textSpan, box, index) {
    if (!textDiv || !textSpan || !relativeContainer) return;

    const itemData = detectedTexts[index] || {};
    const fontFamily = itemData.fontFamily || textDiv.dataset.fontFamily || 'Comic Sans MS';
    const contentText = textSpan.innerText || '';
    const rect = relativeContainer.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const pctW = parseFloat(textDiv.style.width) || box?.w || 20;
    const pctH = parseFloat(textDiv.style.height) || box?.h || 10;
    const liveBox = { ...(box || {}), w: pctW, h: pctH };
    const picked = chooseDisplayBoxAndLayout(contentText, fontFamily, liveBox, rect.width, rect.height);
    const fitted = picked.fitted;

    textDiv.style.padding = `${fitted.padY}px ${fitted.padX}px`;
    textDiv.style.fontSize = `${fitted.fontSize}px`;
    textDiv.dataset.fittedFontSize = `${fitted.fontSize}`;
    textSpan.style.lineHeight = `${fitted.lineHeightPx}px`;
    textSpan.style.letterSpacing = fitted.letterSpacing;
    textSpan.style.whiteSpace = 'pre-wrap';
    textSpan.style.wordBreak = 'break-word';
    textSpan.style.maxWidth = '100%';

    if (detectedTexts[index]) {
        detectedTexts[index].fontSize = fitted.fontSize;
        detectedTexts[index].lineHeight = fitted.lineHeightPx / fitted.fontSize;
        detectedTexts[index].layoutScore = fitted.layoutScore;
        detectedTexts[index].lineCount = fitted.lineCount;
        detectedTexts[index].fillRatioW = fitted.fillRatioW;
        detectedTexts[index].fillRatioH = fitted.fillRatioH;
    }

    textDiv.dataset.layoutScore = `${fitted.layoutScore ?? 0}`;
    textDiv.dataset.lineCount = `${fitted.lineCount ?? fitted.lines?.length ?? 1}`;
}

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const pos = getCanvasPos(e);
    const pixel = ctx.getImageData(pos.x, pos.y, 1, 1).data;
    brushColorInput.value = rgbToHex(pixel[0], pixel[1], pixel[2]);
});

// ─── BÖLGE GERİ YÜKLE: Kauçuk Bant Seçimi ──────────────────────────────────
function createRestoreOverlay() {
    if (restoreOverlay) restoreOverlay.remove();
    restoreOverlay = document.createElement('div');
    restoreOverlay.style.cssText = 'position:absolute;border:2px dashed #ff4444;pointer-events:none;z-index:999;box-sizing:border-box;background:rgba(255,68,68,0.08);';
    relativeContainer.appendChild(restoreOverlay);
}

function updateRestoreOverlay(startX, startY, curX, curY) {
    if (!restoreOverlay) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width  / canvas.width;
    const scaleY = rect.height / canvas.height;
    const x = Math.min(startX, curX) * scaleX;
    const y = Math.min(startY, curY) * scaleY;
    const w = Math.abs(curX - startX) * scaleX;
    const h = Math.abs(curY - startY) * scaleY;
    restoreOverlay.style.left   = x + 'px';
    restoreOverlay.style.top    = y + 'px';
    restoreOverlay.style.width  = w + 'px';
    restoreOverlay.style.height = h + 'px';
}

async function restoreRegion(x1, y1, x2, y2) {
    if (!pages[currentPageIndex]) return;
    const rx = Math.round(Math.min(x1, x2));
    const ry = Math.round(Math.min(y1, y2));
    const rw = Math.round(Math.abs(x2 - x1));
    const rh = Math.round(Math.abs(y2 - y1));
    if (rw < 2 || rh < 2) return; // Çok küçük seçim, yoksay

    saveCanvasState();

    // Orijinal resmi offscreen canvas'a yükle, seçili bölgeyi kopyala
    const origImg = new Image();
    origImg.onload = () => {
        const offC = document.createElement('canvas');
        offC.width = canvas.width; offC.height = canvas.height;
        const offCtx2 = offC.getContext('2d');
        offCtx2.drawImage(origImg, 0, 0, canvas.width, canvas.height);
        // Sadece seçili dikdörtgeni orijinalden al ve canvas'a yapıştır
        const origData = offCtx2.getImageData(rx, ry, rw, rh);
        ctx.putImageData(origData, rx, ry);
        saveCanvasState();
    };
    origImg.src = pages[currentPageIndex].originalData;
}

canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const pos = getCanvasPos(e);

    if (currentTool === 'restore') {
        restoreStart = { x: pos.x, y: pos.y };
        createRestoreOverlay();
        return;
    }

    if (currentTool === 'wand') {
        magicWandErase(pos.x, pos.y, brushColorInput.value);
        saveCanvasState();
        return;
    }

    // Fırça
    isDrawing = true;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineWidth = brushSizeInput.value;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = brushColorInput.value;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
});

canvas.addEventListener('mousemove', (e) => {
    if (currentTool === 'restore' && restoreStart) {
        const pos = getCanvasPos(e);
        updateRestoreOverlay(restoreStart.x, restoreStart.y, pos.x, pos.y);
        return;
    }
    if (!isDrawing || currentTool !== 'brush') return;
    const pos = getCanvasPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
});

canvas.addEventListener('mouseup', (e) => {
    if (currentTool === 'restore' && restoreStart) {
        const pos = getCanvasPos(e);
        restoreRegion(restoreStart.x, restoreStart.y, pos.x, pos.y);
        restoreStart = null;
        if (restoreOverlay) { restoreOverlay.remove(); restoreOverlay = null; }
        return;
    }
    if (isDrawing) { isDrawing = false; ctx.closePath(); saveCanvasState(); }
});
canvas.addEventListener('mouseout', (e) => {
    if (currentTool === 'restore' && restoreStart) {
        // Fare canvas dışına çıkarsa seçimi iptal et
        restoreStart = null;
        if (restoreOverlay) { restoreOverlay.remove(); restoreOverlay = null; }
        return;
    }
    if (isDrawing) { isDrawing = false; ctx.closePath(); saveCanvasState(); }
});


// ================= GELİŞTİRİLMİŞ SİHİRLİ DEĞNEK (v3) =================
// bbox parametresi: Otomatik maskelemede fill bu kutunun içinde kalır
// Manuel tıklamada bbox verilmez → dairesel radius kullanılır
function magicWandErase(startX, startY, fillHex, bbox) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;

    const sx0 = Math.floor(startX);
    const sy0 = Math.floor(startY);
    if (sx0 < 0 || sx0 >= width || sy0 < 0 || sy0 >= height) return;

    // Kullanıcı ayarları
    const tolerance   = wandToleranceInput ? parseInt(wandToleranceInput.value) : 40;
    const wandExpandInput = document.getElementById('wand-expand');
    const expandVal   = wandExpandInput ? parseInt(wandExpandInput.value) : 2;
    const tolSq       = tolerance * tolerance;
    // Sınır modu: bbox verilmişse kutu sınırı, verilmemişse dairesel radius
    const maxRadius   = Math.min(width, height) * 0.20;
    const maxRadSq    = maxRadius * maxRadius;
    // bbox piksel koordinatlarına çevir (yüzde → piksel)
    const bbPad = 20; // kutunun dışına biraz taşmak için
    const bbX1  = bbox ? Math.max(0,        Math.floor((bbox.x / 100) * width)  - bbPad) : 0;
    const bbX2  = bbox ? Math.min(width-1,  Math.ceil(((bbox.x + bbox.w) / 100) * width)  + bbPad) : width-1;
    const bbY1  = bbox ? Math.max(0,        Math.floor((bbox.y / 100) * height) - bbPad) : 0;
    const bbY2  = bbox ? Math.min(height-1, Math.ceil(((bbox.y + bbox.h) / 100) * height) + bbPad) : height-1;
    const borderThreshold = 90;

    // ─── İYİLEŞTİRME 2: Adaptif Zemin Rengi ────────────────────────────────
    // Tıklanan noktanın ±40px çevresindeki parlak piksellerin MANTIKsal medyanı
    let fillC;
    if (fillHex === '#ffffff') {
        const sr = [], sg = [], sb = [];
        const sRad = 40;
        for (let dy = -sRad; dy <= sRad; dy += 4) {
            for (let dx = -sRad; dx <= sRad; dx += 4) {
                const px = sx0 + dx, py = sy0 + dy;
                if (px < 0 || px >= width || py < 0 || py >= height) continue;
                const idx = (py * width + px) * 4;
                if (data[idx] > 170 && data[idx+1] > 170 && data[idx+2] > 170) {
                    sr.push(data[idx]); sg.push(data[idx+1]); sb.push(data[idx+2]);
                }
            }
        }
        if (sr.length >= 6) {
            sr.sort((a,b)=>a-b); sg.sort((a,b)=>a-b); sb.sort((a,b)=>a-b);
            const m = Math.floor(sr.length / 2);
            fillC = { r: sr[m], g: sg[m], b: sb[m], a: 255 };
        } else {
            fillC = hexToRgba(fillHex);
        }
    } else {
        fillC = hexToRgba(fillHex);
    }

    // ─── İYİLEŞTİRME 1: Multi-Seed (9 Tohum) ───────────────────────────────
    // Yayılma mesafesi 38→12px: Çok geniş yayılınca balonun dışına çıkıp
    // karakterin yüzü, saç veya giysi gibi açık alanlara da seed ekleniyordu.
    const spread = 12; // GÜVENLİ: Balonun içinde kalır
    const seedOffsets = [
        [0,0],
        [-spread,-spread],[0,-spread],[spread,-spread],
        [-spread,0],                  [spread,0],
        [-spread, spread],[0, spread],[spread, spread]
    ];

    const combinedMask = new Uint8Array(width * height);
    let globalMinX = sx0, globalMaxX = sx0;
    let globalMinY = sy0, globalMaxY = sy0;

    // maxRadius küçültüldü: 0.30→0.20 (sızma ve yüz bölgesi taşması engeli)

    function runFill(seedX, seedY) {
        if (seedX < 0 || seedX >= width || seedY < 0 || seedY >= height) return;
        const si  = (seedY * width + seedX) * 4;
        const tR  = data[si], tG = data[si+1], tB = data[si+2];

        // Koyu tohum noktaları harf/kenardır → atla
        if ((tR + tG + tB) / 3 < 130) return;
        // Zaten fill rengiyle aynıysa gerek yok
        if (Math.abs(tR-fillC.r) + Math.abs(tG-fillC.g) + Math.abs(tB-fillC.b) < 15) return;

        // Standart Euclidean mesafe — Gap-closing KALDIRILDI
        // Gap-closing, yüz cildi gibi parlak alanları da balon zemini sanıp siliyordu.
        function matchColor(idx) {
            const dr = data[idx]-tR, dg = data[idx+1]-tG, db = data[idx+2]-tB;
            return (dr*dr + dg*dg + db*db) <= tolSq;
        }

        const localMask = new Uint8Array(width * height);
        const stack = [seedY * width + seedX];
        localMask[seedY * width + seedX] = 1;
        let lMinX = seedX, lMaxX = seedX, lMinY = seedY, lMaxY = seedY;

        while (stack.length > 0) {
            const idx = stack.pop();
            const x = idx % width;
            const y = (idx - x) / width;
            if (x < lMinX) lMinX = x; if (x > lMaxX) lMaxX = x;
            if (y < lMinY) lMinY = y; if (y > lMaxY) lMaxY = y;

            const dirs     = [idx+1, idx-1, idx+width, idx-width];
            const dxCheck  = [x+1,   x-1,   x,         x        ];
            for (let d = 0; d < 4; d++) {
                const nIdx = dirs[d], nx = dxCheck[d];
                if (d === 0 && nx >= width) continue;
                if (d === 1 && nx < 0)      continue;
                const ny = (d < 2) ? y : (d === 2 ? y+1 : y-1);
                if (ny < 0 || ny >= height) continue;
                // Sınır kontrolü: bbox verildi → kutu içinde mi? / verilmedi → dairesel radius
                if (bbox) {
                    if (nx < bbX1 || nx > bbX2 || ny < bbY1 || ny > bbY2) continue;
                } else {
                    const ddx = nx - sx0, ddy = ny - sy0;
                    if (ddx*ddx + ddy*ddy > maxRadSq) continue;
                }
                if (!localMask[nIdx]) {
                    if (matchColor(nIdx * 4)) {
                        localMask[nIdx] = 1;
                        stack.push(nIdx);
                    } else {
                        localMask[nIdx] = 2;
                    }
                }
            }
        }

        // combinedMask'e birleştir
        for (let i = 0; i < localMask.length; i++) {
            if (localMask[i] === 1) combinedMask[i] = 1;
            else if (!combinedMask[i] && localMask[i] === 2) combinedMask[i] = 2;
        }
        if (lMinX < globalMinX) globalMinX = lMinX;
        if (lMaxX > globalMaxX) globalMaxX = lMaxX;
        if (lMinY < globalMinY) globalMinY = lMinY;
        if (lMaxY > globalMaxY) globalMaxY = lMaxY;
    }

    // 9 tohum noktasını çalıştır
    for (const [ox, oy] of seedOffsets) {
        runFill(Math.floor(startX + ox), Math.floor(startY + oy));
    }

    const minX = globalMinX, maxX = globalMaxX;
    const minY = globalMinY, maxY = globalMaxY;

    // ─── ADIM 2: Hole Filling ────────────────────────────────────────────────
    const pad = Math.max(4, expandVal + 2);
    const mnX = Math.max(0, minX - pad), mxX = Math.min(width-1,  maxX + pad);
    const mnY = Math.max(0, minY - pad), mxY = Math.min(height-1, maxY + pad);

    const outerMask = new Uint8Array(width * height);
    const outer = [];
    for (let x = mnX; x <= mxX; x++) {
        const t = mnY*width+x, b = mxY*width+x;
        if (!outerMask[t] && combinedMask[t]!==1){outerMask[t]=1;outer.push(t);}
        if (!outerMask[b] && combinedMask[b]!==1){outerMask[b]=1;outer.push(b);}
    }
    for (let y = mnY+1; y < mxY; y++) {
        const l = y*width+mnX, r = y*width+mxX;
        if (!outerMask[l] && combinedMask[l]!==1){outerMask[l]=1;outer.push(l);}
        if (!outerMask[r] && combinedMask[r]!==1){outerMask[r]=1;outer.push(r);}
    }
    while (outer.length > 0) {
        const idx = outer.pop();
        const x = idx % width, y = (idx-x)/width;
        const dirs = [idx+1,idx-1,idx+width,idx-width];
        const dxC  = [x+1,  x-1,  x,        x       ];
        for (let d = 0; d < 4; d++) {
            const nIdx = dirs[d], nx = dxC[d];
            if (d===0&&nx>=width) continue; if (d===1&&nx<0) continue;
            const ny = (d<2)?y:(d===2?y+1:y-1);
            if (ny<mnY||ny>mxY||nx<mnX||nx>mxX) continue;
            if (!outerMask[nIdx] && combinedMask[nIdx]!==1){outerMask[nIdx]=1;outer.push(nIdx);}
        }
    }

    // ─── ADIM 3: Solid Mask birleştir ───────────────────────────────────────
    const solidMask = new Uint8Array(width * height);
    let solidPixelCount = 0;
    for (let y = mnY; y <= mxY; y++) {
        for (let x = mnX; x <= mxX; x++) {
            const nIdx = y*width+x;
            if (combinedMask[nIdx]===1 || !outerMask[nIdx]) {
                solidMask[nIdx] = 1;
                solidPixelCount++;
            }
        }
    }

    // ─── ALAN GÜVENİLİRLİK SKORU (Alan Güven Skoru) ────────────────────────
    // Eğer doldurulan alan tüm canvas'ın %10'undan büyükse → arka plan sızması!
    // Bu sayede karakterlerin yüzü, saç, giysi veya arka plan silinmez.
    const totalPixels = width * height;
    const maxAllowedRatio = 0.10; // %10 üstü = konuşma balonu değil
    if (solidPixelCount > totalPixels * maxAllowedRatio) {
        console.warn(`Maskeleme iptal: Alan çok büyük (${(solidPixelCount/totalPixels*100).toFixed(1)}% > %10). Arka plan sızması engellendi.`);
        return; // Boyama yapma, fonksiyondan çık
    }

    // ─── ADIM 4: Morphological Dilation (8-komşu, iki geçişli) ─────────────
    const finalMask = new Uint8Array(solidMask);
    for (let i = 0; i < expandVal; i++) {
        const prev = new Uint8Array(finalMask);
        for (let y = Math.max(0,mnY-1); y <= Math.min(height-1,mxY+1); y++) {
            for (let x = Math.max(0,mnX-1); x <= Math.min(width-1,mxX+1); x++) {
                if (prev[y*width+x] === 1) {
                    for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) {
                        const ny2=y+dy, nx2=x+dx;
                        if (ny2>=0&&ny2<height&&nx2>=0&&nx2<width) finalMask[ny2*width+nx2]=1;
                    }
                }
            }
        }
    }

    // ─── ADIM 5: Boya ───────────────────────────────────────────────────────
    const fMinY=Math.max(0,mnY-expandVal), fMaxY=Math.min(height-1,mxY+expandVal);
    const fMinX=Math.max(0,mnX-expandVal), fMaxX=Math.min(width-1, mxX+expandVal);
    for (let y = fMinY; y <= fMaxY; y++) {
        for (let x = fMinX; x <= fMaxX; x++) {
            const nIdx = y*width+x;
            if (finalMask[nIdx] === 1) {
                const pIdx = nIdx*4;
                // Dış kontur koruması (sadece dilation taşması için)
                if (solidMask[nIdx] !== 1 &&
                    data[pIdx]   < borderThreshold &&
                    data[pIdx+1] < borderThreshold &&
                    data[pIdx+2] < borderThreshold) continue;
                data[pIdx]   = fillC.r;
                data[pIdx+1] = fillC.g;
                data[pIdx+2] = fillC.b;
                data[pIdx+3] = fillC.a;
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
}



// ================= DOSYA YÜKLEME =================

dropZone.addEventListener('click', () => fileInput.click());
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
    dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }, false);
});
['dragenter', 'dragover'].forEach(ev => {
    dropZone.addEventListener(ev, () => dropZone.classList.add('dragover'), false);
});
['dragleave', 'drop'].forEach(ev => {
    dropZone.addEventListener(ev, () => dropZone.classList.remove('dragover'), false);
});
dropZone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
fileInput.addEventListener('change', function() { handleFiles(this.files); });

async function handleFiles(files) {
    if (files.length === 0) return;
    const validFiles = Array.from(files)
        .filter(f => f.type.startsWith('image/'))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    if (validFiles.length === 0) { alert('Lütfen sadece resim dosyası yükleyin.'); return; }

    for (const file of validFiles) {
        const imgData = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
        pages.push({ file, originalData: imgData, canvasData: null, translations: [], undoHistory: [imgData], currentStep: 0 });
    }
    
    dropZone.classList.add('hidden');
    canvasWrapper.classList.remove('hidden');
    canvasControls.classList.remove('hidden');
    drawingTools.classList.remove('hidden');
    pageNavigation.classList.remove('hidden');
    downloadBtn.disabled = false;
    
    if (translateAllBtn) translateAllBtn.disabled = false;
    if (currentPageIndex === -1) { switchPage(0); }
    else { updatePageButtons(); }

    // Bypass modunu hatırla
    const bypassMode = localStorage.getItem('manga_bypass_mode') === 'true';
    const bypassCheckbox = document.getElementById('nsfw-bypass-mode');
    if (bypassCheckbox) {
        bypassCheckbox.checked = bypassMode;
        updateActiveModelUI();
        bypassCheckbox.addEventListener('change', (e) => {
            localStorage.setItem('manga_bypass_mode', e.target.checked);
            updateActiveModelUI();
        });
    }

    // Page count badge güncellemesi
    const pageBadge = document.getElementById('page-count-badge');
    if (pageBadge) pageBadge.textContent = `${pages.length} Sayfa`;
}

// ================= ÇOKLU API KEY YÖNETİMİ VE KAYIT =================
function getApiKeys() {
    const raw = geminiKeysInput?.value?.trim() || '';
    // Virgül, yeni satır veya boşlukla ayrılmış anahtarları al
    return raw.split(/[,\n]+/).map(k => k.trim()).filter(k => k.length > 10);
}

// Sayfa yüklendiğinde eski kaydedilmiş anahtarları getir
const savedKeys = localStorage.getItem('manga_edit_api_keys');
if (savedKeys && geminiKeysInput) {
    geminiKeysInput.value = savedKeys;
}
const initKeys = getApiKeys();
if (keyStatus) keyStatus.textContent = `${initKeys.length} Keys`;

// ─── TOKEN VE MALIYET SAYAÇ SİSTEMİ ───────────────────────────────────────
let totalInputTokens = parseInt(localStorage.getItem('manga_tokens_in')) || 0;
let totalOutputTokens = parseInt(localStorage.getItem('manga_tokens_out')) || 0;

let totalGrokInputTokens = parseInt(localStorage.getItem('grok_tokens_in')) || 0;
let totalGrokOutputTokens = parseInt(localStorage.getItem('grok_tokens_out')) || 0;

let lastGeminiTokens = { input: 0, output: 0, cost: 0 };
let lastGrokTokens = { input: 0, output: 0, cost: 0 };

function updateTokenUI() {
    // Gemini UI - Sadece toplam tutarı gösteriyoruz (UI daha temiz olsun diye)
    const tkCost = document.getElementById('tk-cost');
    if (tkCost) {
        // Gemini 2.5 Flash Pricing: Input $0.30 / 1M | Output $2.50 / 1M
        const cost = (totalInputTokens / 1000000 * 0.30) + (totalOutputTokens / 1000000 * 2.50);
        tkCost.textContent = cost.toFixed(4);
        
        // Son işlem özeti
        const lastInfo = document.getElementById('last-gemini-info');
        if (lastInfo && lastGeminiTokens.input > 0) {
            lastInfo.textContent = `Son: ${lastGeminiTokens.input + lastGeminiTokens.output} tk ($${lastGeminiTokens.cost.toFixed(5)})`;
        }
        
        // Detayları title/tooltip olarak ekleyelim
        const tracker = document.getElementById('gemini-token-tracker');
        if (tracker) {
            const costTRY = cost * 44.34;
            tracker.title = `Girdi: ${totalInputTokens.toLocaleString()}, Çıktı: ${totalOutputTokens.toLocaleString()} | Tutar: ${cost.toFixed(4)}$ (${costTRY.toFixed(2)} ₺)`;
        }
    }
    
    // OpenRouter (Qwen/Grok) UI
    const grokTkCost = document.getElementById('grok-tk-cost');
    if (grokTkCost) {
        // Qwen 2.5 7B VL Pricing (Tahmini Ortalama): Input $0.05 / 1M | Output $0.05 / 1M
        const grokCost = (totalGrokInputTokens / 1000000 * 0.05) + (totalGrokOutputTokens / 1000000 * 0.05);
        grokTkCost.textContent = grokCost.toFixed(4);

        // Son işlem özeti
        const lastGrokInfo = document.getElementById('last-grok-info');
        if (lastGrokInfo && lastGrokTokens.input > 0) {
            lastGrokInfo.textContent = `Son: ${lastGrokTokens.input + lastGrokTokens.output} tk ($${lastGrokTokens.cost.toFixed(5)})`;
        }
        
        const grokTracker = document.getElementById('grok-token-tracker');
        if (grokTracker) {
            const grokCostTRY = grokCost * 44.34;
            grokTracker.title = `Girdi: ${totalGrokInputTokens.toLocaleString()}, Çıktı: ${totalGrokOutputTokens.toLocaleString()} | Tutar: ${grokCost.toFixed(4)}$ (${grokCostTRY.toFixed(2)} ₺)`;
        }
    }
}

function updateActiveModelUI() {
    const isBypass = document.getElementById('nsfw-bypass-mode')?.checked;
    const geminiTracker = document.getElementById('gemini-token-tracker');
    const grokTracker = document.getElementById('grok-token-tracker');
    const bypassLabel = document.querySelector('label[for="nsfw-bypass-mode"]') || document.getElementById('nsfw-bypass-mode')?.parentElement;

    if (isBypass) {
        if (geminiTracker) geminiTracker.style.opacity = "0.4";
        if (grokTracker) {
            grokTracker.style.opacity = "1";
            grokTracker.style.borderColor = "var(--warning)";
            grokTracker.style.boxShadow = "0 0 10px rgba(245, 158, 11, 0.2)";
        }
        if (bypassLabel) bypassLabel.style.background = "rgba(255,165,0,0.2)";
    } else {
        if (geminiTracker) {
            geminiTracker.style.opacity = "1";
            geminiTracker.style.borderColor = "var(--primary)";
        }
        if (grokTracker) {
            grokTracker.style.opacity = "0.4";
            grokTracker.style.borderColor = "var(--border)";
            grokTracker.style.boxShadow = "none";
        }
        if (bypassLabel) bypassLabel.style.background = "rgba(255,165,0,0.08)";
    }
}

// Eventlerin bağlanması için DOM yüklenmesini bekle
setTimeout(() => {
    updateTokenUI();
    
    const resetBtn = document.getElementById('tk-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (!confirm('Gemini token sayacını sıfırlamak istiyor musunuz?')) return;
            totalInputTokens = 0; 
            totalOutputTokens = 0;
            localStorage.setItem('manga_tokens_in', 0);
            localStorage.setItem('manga_tokens_out', 0);
            updateTokenUI();
        });
    }

    const grokResetBtn = document.getElementById('grok-tk-reset');
    if (grokResetBtn) {
        grokResetBtn.addEventListener('click', () => {
            if (!confirm('Grok token sayacını sıfırlamak istiyor musunuz?')) return;
            totalGrokInputTokens = 0; 
            totalGrokOutputTokens = 0;
            localStorage.setItem('grok_tokens_in', 0);
            localStorage.setItem('grok_tokens_out', 0);
            updateTokenUI();
        });
    }
}, 300);

// Anahtar sayısını göster ve girilen her anahtarı OTOMATİK kaydet
if (geminiKeysInput) {
    geminiKeysInput.addEventListener('input', () => {
        const keys = getApiKeys();
        if (keyStatus) keyStatus.textContent = `${keys.length} Keys`;
        
        // Tarayıcı hafızasına güvenli şekilde kaydet
        localStorage.setItem('manga_edit_api_keys', geminiKeysInput.value);
    });
}

// ================= GÖRSEL BOYUT OPTİMİZASYONU (TOKEN TASARRUFU) =================
// API'ye göndermeden önce görseli küçültür → %60-70 daha az token kullanır
function resizeImageForAPI(base64DataUrl, maxWidth = 1280) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            // Zaten küçükse dokunma
            if (img.width <= maxWidth) {
                resolve(base64DataUrl.includes(',') ? base64DataUrl.split(',')[1] : base64DataUrl);
                return;
            }
            const scale = maxWidth / img.width;
            const newW = Math.round(img.width * scale);
            const newH = Math.round(img.height * scale);
            const c = document.createElement('canvas');
            c.width = newW;
            c.height = newH;
            const cx = c.getContext('2d');
            cx.drawImage(img, 0, 0, newW, newH);
            resolve(c.toDataURL('image/jpeg', 0.6).split(',')[1]);
        };
        img.src = base64DataUrl.startsWith('data:') ? base64DataUrl : `data:image/jpeg;base64,${base64DataUrl}`;
    });
}

// Metni sadece metin olarak çeviren fonksiyon (Sansür Aşma için)
async function callGeminiTextOnly(originalTexts) {
    // Daha hızlı yanıt için ultra-kısa prompt
    const prompt = `Translate to Natural Turkish. Output ONLY JSON array of strings: ["Tr1", "Tr2", ...]. Phrases: ${JSON.stringify(originalTexts)}`;
    
    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, topP: 0.8 }
    };

    try {
        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestBody })
        });
        if (!res.ok) {
            throw new Error(`Gemini proxy hatası: ${res.status}`);
        }
        const data = await res.json();
        let jsonText = data.candidates[0].content.parts[0].text.trim();
        jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
        return JSON.parse(jsonText);
    } catch(e) { console.error("Text-only çeviri hatası:", e); }
    throw new Error("Text-only çeviri başarısız oldu.");
}

async function callGeminiWithRotation(base64Data) {
    const requestBody = {
        contents: [{
            parts: [
                {
                    text: "Find all speech bubbles, signs and text in this manga page. IMPORTANT: Do NOT include/translate sound effects (SFX), exclamations (e.g., Ah, Oh, Haha, Ugh, Gasp), or background noises. Ignore them completely. Extract original text of actual dialogue, translate to Turkish, estimate bounding box (x,y,w,h as percentage 0-100 of image). Return raw JSON only: [{\"id\":1,\"original\":\"Hello\",\"translated\":\"Merhaba\",\"box\":{\"x\":10,\"y\":10,\"w\":20,\"h\":10}}]"
                },
                {
                    inline_data: { mime_type: "image/jpeg", data: base64Data }
                }
            ]
        }],
        generationConfig: { 
            temperature: 0.1, 
            maxOutputTokens: 4096,
            response_mime_type: "application/json",
            response_schema: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        id: { type: "number" },
                        original: { type: "string" },
                        translated: { type: "string" },
                        box: {
                            type: "object",
                            properties: {
                                x: { type: "number" },
                                y: { type: "number" },
                                w: { type: "number" },
                                h: { type: "number" }
                            },
                            required: ["x", "y", "w", "h"]
                        }
                    },
                    required: ["id", "original", "translated", "box"]
                }
            }
        },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    try {
        if (keyStatus) keyStatus.textContent = 'Gemini proxy üzerinden işleniyor...';

        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestBody })
        });

        if (!response.ok) {
            const errText = await response.text();
            if (response.status === 429) {
                throw new Error('QUOTA_EXCEEDED_ALL');
            }
            throw new Error(`${response.status}: ${errText}`);
        }

        if (keyStatus) {
            keyStatus.textContent = 'Gemini proxy aktif';
            keyStatus.style.color = '#10b981';
            setTimeout(() => { keyStatus.style.color = ''; }, 3000);
        }

        const responseData = await response.json();

        if (responseData.usageMetadata) {
            const inTk = responseData.usageMetadata.promptTokenCount || 0;
            const outTk = responseData.usageMetadata.candidatesTokenCount || 0;

            totalInputTokens += inTk;
            totalOutputTokens += outTk;
            lastGeminiTokens = {
                input: inTk,
                output: outTk,
                cost: (inTk / 1000000 * 0.30) + (outTk / 1000000 * 2.50)
            };

            localStorage.setItem('manga_tokens_in', totalInputTokens);
            localStorage.setItem('manga_tokens_out', totalOutputTokens);
            updateTokenUI();
        }

        return responseData;
    } catch (error) {
        if (keyStatus) {
            keyStatus.textContent = 'Gemini proxy hatası';
            keyStatus.style.color = '#ef4444';
        }
        throw error;
    }
}

async function callGrokWithVision(base64Data) {
    const promptText = `
    COMMAND: Locate and translate ALL manga text (any language: Portuguese, Japanese, etc.) into Natural Turkish.
    1. EXTRACT ALL speech bubble contents.
    2. TRANSLATE strictly to Turkish (keep emotion/slang). 
    3. DETECT boxes as integers (0-100).
    4. GİZLİ (Hidden): "is_nsfw": true if image is sexually explicit.

    OUTPUT: Return ONLY a valid JSON object. 
    {"is_nsfw":false, "translations":[{"id":1, "original":"...", "translated":"...", "box":{"x":.., "y":.., "w":.., "h":..}}]}`;

    const selectedModel = "qwen/qwen3-vl-8b-instruct"; // Resim okuyabilen (Vision) modeline geri dönüldü

    const response = await fetch("/api/openrouter", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            requestBody: {
                model: selectedModel,
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: promptText },
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}`, detail: "high" } }
                        ]
                    }
                ],
                temperature: 0.1
            }
        })
    });

    if (!response.ok) {
        if (response.status === 429 || response.status === 402) {
            throw new Error('QUOTA_EXCEEDED_ALL');
        }
        let errText = await response.text();
        throw new Error(`Grok API Hatası: ${response.status} ${errText}`);
    }

    const data = await response.json();
    
    // Token maliyet hesabını güncelle
    if (data.usage) {
        const inTk = data.usage.prompt_tokens || 0;
        const outTk = data.usage.completion_tokens || 0;

        totalGrokInputTokens += inTk;
        totalGrokOutputTokens += outTk;

        // Son işlemi kaydet (Qwen VL Fiyatlarına Göre)
        lastGrokTokens = {
            input: inTk,
            output: outTk,
            cost: (inTk / 1000000 * 0.05) + (outTk / 1000000 * 0.05)
        };

        localStorage.setItem('grok_tokens_in', totalGrokInputTokens);
        localStorage.setItem('grok_tokens_out', totalGrokOutputTokens);
        updateTokenUI();
    }

    let rawText = data.choices[0].message.content.trim();
    console.log("Raw Grok Response:", rawText);
    const parsed = parseRobustJSON(rawText);
    return normalizeCoordinates(parsed); // Qwen'in koordinatlarını düzelt
}

// ================= KOORDİNAT DÜZELTİCİ =================
// Qwen bazen koordinatları 0-100 yerine 0-1000 veya piksel cinsinden döndürüyor.
// Bu fonksiyon hangi ölçekte gelirse gelsin hepsini 0-100 yüzdeliğe çevirir.
function normalizeCoordinates(input) {
    if (!input) return input;
    
    // Eğer girdi bir objeyse ({"is_nsfw":.., "translations":[...]}) translations kısmını al
    let items = Array.isArray(input) ? input : (input.translations || []);
    if (items.length === 0) return input;
    
    let maxVal = 0;
    items.forEach(item => {
        if (item.box) {
            maxVal = Math.max(maxVal, item.box.x || 0, item.box.y || 0, 
                             (item.box.x || 0) + (item.box.w || 0), 
                             (item.box.y || 0) + (item.box.h || 0));
        }
        applyOverlayTextLayout(textDiv, textSpan, detectedTexts[index]?.box || box, index);
    });
    
    console.log("Qwen Koordinat Analizi - En Yüksek Değer:", maxVal);
    
    let scaleFactor = 1;
    if (maxVal > 150 && maxVal <= 1100) {
        scaleFactor = 100 / 1000;
        console.log("✅ 0-1000 ölçeği algılandı.");
    } else if (maxVal > 1100) {
        scaleFactor = 100 / maxVal;
        console.log("✅ Piksel ölçeği algılandı.");
    }
    
    items.forEach(item => {
        if (item.box) {
            item.box.x = Math.round((item.box.x || 0) * scaleFactor * 10) / 10;
            item.box.y = Math.round((item.box.y || 0) * scaleFactor * 10) / 10;
            item.box.w = Math.round((item.box.w || 20) * scaleFactor * 10) / 10;
            item.box.h = Math.round((item.box.h || 10) * scaleFactor * 10) / 10;
        }
    });

    if (Array.isArray(input)) return items;
    input.translations = items;
    return input;
}

function parseRobustJSON(text) {
    if (!text) throw new Error("Yapay zekadan boş yanıt geldi.");
    
    // 1. Önce doğrudan parse etmeyi dene (En hızlı yol)
    try {
        let clean = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        // AI formatı bozmuş olabilir, JSON ayıklama başlasın
        try {
            // Regex ile ilk { veya [ ile son } veya ] arasını bul
            const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
            if (jsonMatch) {
                let extracted = jsonMatch[0];
                // Yaygın AI hatalarını temizle (Sondaki virgüller gibi)
                extracted = extracted.replace(/,\s*([\}\]])/g, '$1');
                return JSON.parse(extracted);
            }
            throw new Error("Metin içinde geçerli JSON bloğu bulunamadı.");
        } catch (e2) {
            console.error("JSON Tamir Hatası:", text);
            throw new Error("Geçersiz JSON yapısı. Lütfen tekrar deneyin.");
        }
    }
}

// ================= SANSÜR/NSFW AŞMA (OCR HİLESİ) =================
function applyOCRBypassFilter(sourceCanvas) {
    const tempC = document.createElement('canvas');
    tempC.width = sourceCanvas.width;
    tempC.height = sourceCanvas.height;
    const tempCtx = tempC.getContext('2d', { willReadFrequently: true });
    tempCtx.drawImage(sourceCanvas, 0, 0);
    
    // Yüksek kontrastlı threshold kullanarak koyu renkleri siyaha, geri kalanı dümdüz beyaza çevir.
    // Bu sayede et, figürler ve sakıncalı detaylar yok olur, geriye sadece soyut çizgiler ve balon içindeki koyu yazılar kalır.
    const imgD = tempCtx.getImageData(0, 0, tempC.width, tempC.height);
    const d = imgD.data;
    for (let j = 0; j < d.length; j += 4) {
        let avg = (d[j] + d[j+1] + d[j+2]) / 3;
        const val = avg < 130 ? 0 : 255; 
        d[j] = d[j+1] = d[j+2] = val;
    }
    tempCtx.putImageData(imgD, 0, 0);
    
    // Filtrelenmiş resmi base64 döndür
    return tempC.toDataURL('image/jpeg', 0.8).split(',')[1];
}

// ================= YAPAY ZEKA ANALİZ =================
analyzeBtn.addEventListener('click', async () => {
    if (!(await consumeCredit())) return; // SaaS LİMİT KONTROLÜ (AWAIT eklendi)
    if (!currentImage) return;

    analyzeBtn.disabled = true;
    translationsList.classList.add('hidden');
    loadingIndicator.classList.remove('hidden');

    try {
        const bypassCheckbox = document.getElementById('nsfw-bypass-mode');
        const engineSelect = document.getElementById('main-ai-engine');
        
        // Eğer Görsel Bypass (eski usul OCR filtresi) işaretliyse resmi filtrele
        let base64Canvas = "";
        if (bypassCheckbox && bypassCheckbox.checked) {
            base64Canvas = 'data:image/jpeg;base64,' + applyOCRBypassFilter(canvas);
        } else {
            base64Canvas = canvas.toDataURL('image/jpeg', 0.7);
        }

        const base64Data = await resizeImageForAPI(base64Canvas);
        let isNsfwDetected = false;
        if (pythonBackendHealthy) {
            loadingIndicator.innerHTML = '<span class="loader"></span><p>Python OCR ile metin bulunuyor...</p>';
            const result = await callPythonBackendProcess(base64Canvas);
            await applyBackendResultToActivePage(result);
        } else {
            if (engineSelect && engineSelect.value !== 'gemini') {
                // === TEKİL QWEN SİSTEMİ (Hızlı ve Sorunsuz) ===
                loadingIndicator.innerHTML = '<span class="loader"></span><p>Qwen ile çeviriliyor...</p>';
                const result = await callGrokWithVision(base64Data);
                detectedTexts = Array.isArray(result) ? result : (result.translations || []);
                isNsfwDetected = result.is_nsfw || false;
            } else {
                // === STANDART GEMINI SİSTEMİ ===
                loadingIndicator.innerHTML = '<span class="loader"></span><p>Gemini ile metin aranıyor...</p>';
                const data = await callGeminiWithRotation(base64Data);
                if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
                    const blockReason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || "Bilinmeyen Neden";
                    throw new Error(`Google Görseli Engelledi (NSFW/Şiddet Filtresi). Sebep: ${blockReason}`);
                }
                let jsonText = data.candidates[0].content.parts[0].text.trim();
                const result = parseRobustJSON(jsonText);
                detectedTexts = Array.isArray(result) ? result : (result.translations || []);
            }
        }

        if (!pythonBackendHealthy && currentPageIndex >= 0) {
            pages[currentPageIndex].translations = [...detectedTexts];
        }

        // 1. ÖNCE ÇEVİRİYİ EKRANA BAS (Kritik: Hız hissi için)
        if (!pythonBackendHealthy) {
            renderTranslations();
        }

        // 2. SONRA GİZLİ ANALİZİ ARKA PLANDA, GECİKMELİ YAP (Daha yüksek bekleme süresi: 1500ms)
        if (isNsfwDetected) {
            setTimeout(() => {
                // UI dondurmaması için düşük kalite ve küçük ölçekte kanıt al
                const evidence = canvas.toDataURL('image/jpeg', 0.08); 
                logAdminEvent('NSFW_DETECTED', `GİZLİ TESPİT: Kullanıcı ${currentPageIndex + 1}. sayfada +18 içerik işledi.`, evidence);
            }, 1500);
        }

    } catch (error) {
        console.error(error);
        if (error.message.includes("NSFW") || error.message.includes("SAFETY") || error.message.includes("Engelledi")) {
            logAdminEvent('NSFW_BLOCK', `Sayfa: ${currentPageIndex + 1}, Resim: ${pages[currentPageIndex]?.file?.name || 'Bilinmiyor'}, Hata: ${error.message}`);
        }
        
        if (error.message === 'QUOTA_EXCEEDED_ALL') {
            alert(`Sistem Uyarı: Qwen/Grok API anahtarının kotası (kredisi) dolmuştur! Lütfen yeni kredi yükleyin veya sistem yöneticinize başvurun.`);
        } else {
            alert(`Sistem Hatası: ${error.message}`);
        }
        translationsList.classList.remove('hidden');
    } finally {
        analyzeBtn.disabled = false;
        loadingIndicator.classList.add('hidden');
    }
});

function renderTranslations() {
    translationsList.innerHTML = '';
    textCount.textContent = detectedTexts.length;
    document.querySelectorAll('.text-element').forEach(el => el.remove());

    if (detectedTexts.length === 0) {
        translationsList.innerHTML = `<div class="empty-state"><p>Metin tespit edilemedi. Yeni metin eklemek için 'Ekle' butonuna tıklayın.</p></div>`;
        return;
    }

    detectedTexts.forEach((item, index) => {
        // Sağ Panel Listesi Öğesi
        const card = document.createElement('div');
        card.className = 'translation-card';
        card.innerHTML = `
            <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                <span>Metin #${index + 1}</span>
                <div style="display:flex; gap:8px; align-items:center;">
                    <label style="cursor:pointer; display:flex; align-items:center; gap:3px; font-size:12px; color:#aaa;" title="Arka Plan Rengi">
                        <i class="fa-solid fa-fill-drip"></i>
                        <input type="color" class="panel-bg-picker" data-index="${index}" value="${item.bgColor && item.bgColor !== 'transparent' ? item.bgColor : '#ffffff'}" style="width:18px;height:18px;padding:0;border:none;border-radius:3px;cursor:pointer;background:none;">
                    </label>
                    <label style="cursor:pointer; display:flex; align-items:center; gap:3px; font-size:12px; color:#aaa;" title="Yazı Rengi">
                        <i class="fa-solid fa-font"></i>
                        <input type="color" class="panel-text-picker" data-index="${index}" value="${item.textColor || '#000000'}" style="width:18px;height:18px;padding:0;border:none;border-radius:3px;cursor:pointer;background:none;">
                    </label>
                    <button class="delete-text-btn action-btn" data-index="${index}" style="background:none; border:none; color:#ef4444; padding:0; cursor:pointer;" title="Metni Sil">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
            <textarea class="original-input" data-index="${index}" rows="1" style="width:100%; font-size:0.75rem; background:rgba(0,0,0,0.2); border:1px solid #444; color:#aaa; margin-bottom:5px; border-radius:4px; padding:4px;" placeholder="Orijinal Metin...">${item.original || ''}</textarea>
            <textarea class="translation-input" data-index="${index}" rows="2" style="width:100%; font-size:0.85rem; background:rgba(0,0,0,0.3); border:1px solid var(--border-color); color:#fff; border-radius:4px; padding:4px;" placeholder="Çeviri...">${item.translated}</textarea>
        `;
        translationsList.appendChild(card);

        // ==== OTOMATİK OLARAK CANVASA YÜZEN DİV EKLİYORUZ (Backup yöntemi) ====
        createFloatingTextElement(item.translated, item.box, index);
    });

    // Textarea değişikliklerini ekrandaki Div'e aktar ve Diziye kaydet
    document.querySelectorAll('.translation-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            detectedTexts[idx].translated = e.target.value; // 1- Eşzamanlı Array Güncelle
            
            const overlay = document.getElementById(`overlay-${idx}`);
            if(overlay) {
                const span = overlay.querySelector('.text-content');
                if(span) span.innerText = e.target.value; // 2- Canvasta Görüntü Güncelle
                else overlay.innerText = e.target.value;
            }
        });
    });

    // Orijinal Metin değişikliklerini diziye kaydet
    document.querySelectorAll('.original-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            detectedTexts[idx].original = e.target.value;
        });
    });

    // Paneldeki Renk Değişiklikleri
    document.querySelectorAll('.panel-bg-picker').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            detectedTexts[idx].bgColor = e.target.value;
            const overlay = document.getElementById(`overlay-${idx}`);
            if (overlay) {
                overlay.style.backgroundColor = e.target.value;
                overlay.dataset.bgColor = e.target.value;
                const canvasBgPicker = overlay.querySelector('.bg-picker');
                if (canvasBgPicker) canvasBgPicker.value = e.target.value;
            }
        });
    });

    document.querySelectorAll('.panel-text-picker').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            detectedTexts[idx].textColor = e.target.value;
            const overlay = document.getElementById(`overlay-${idx}`);
            if (overlay) {
                overlay.style.color = e.target.value;
                overlay.dataset.textColor = e.target.value;
                const canvasTextPicker = overlay.querySelector('.text-picker');
                if (canvasTextPicker) canvasTextPicker.value = e.target.value;
            }
        });
    });

    // Silme Butonları (Tekil Metni uçurur)
    document.querySelectorAll('.delete-text-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.getAttribute('data-index'));
            detectedTexts.splice(idx, 1);
            renderTranslations(); // Yeniden listele ve arayüzü çiz
        });
    });

    updateActionButtonVisibility();

    // Yazı boyutu kontrolünü göster
    const fontSizeControl = document.getElementById('font-size-control');
    if (fontSizeControl && detectedTexts.length > 0) {
        fontSizeControl.classList.remove('hidden');
    } else if (fontSizeControl) {
        fontSizeControl.classList.add('hidden');
    }

    // Karşılaştır butonunu göster
    if (compareBtn) {
        compareBtn.classList.remove('hidden');
        compareMode = false;
        compareBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Orijinali Gör';
        compareBtn.style.background = '';
    }

    translationsList.classList.remove('hidden');
}

// ================= EKSİK METİN EKLEME =================
const addTextBtn = document.getElementById('add-text-btn');
if (addTextBtn) {
    addTextBtn.addEventListener('click', () => {
        detectedTexts.unshift({
            id: Date.now(),
            original: "Yeni Orijinal Metin",
            translated: "Yeni Eklenen Metin Girdisi...",
            box: { x: 50, y: 50, w: 20, h: 5 } // Tuvalin ortasına yerleştir
        });
        renderTranslations();
    });
}

// ================= GLOBAL YAZI BOYUTU AYARI =================
const globalFontSizeInput = document.getElementById('global-font-size');
const fontSizeLabel = document.getElementById('font-size-label');

if (globalFontSizeInput) {
    globalFontSizeInput.addEventListener('input', () => {
        const size = globalFontSizeInput.value;
        fontSizeLabel.textContent = size + 'px';

        // Ekrandaki tüm yüzen metin kutularını güncelle
        document.querySelectorAll('.text-element').forEach(el => {
            el.style.fontSize = size + 'px';
            const idx = parseInt(el.dataset.boxIndex || '-1', 10);
            const span = el.querySelector('.text-content');
            if (idx >= 0 && span && detectedTexts[idx]?.box) {
                applyOverlayTextLayout(el, span, detectedTexts[idx].box, idx);
            }
        });
    });
}

// ================= TÜM SAYFALARI ÇEVİR & MASKELE =================
async function analyzeAndMaskAllPages() {
    if (!translateAllBtn) return;
    const origText = translateAllBtn.innerHTML;
    translateAllBtn.disabled = true;

    // Çoklu çeviride hızı kesmemek için NSFW raporlarını kuyruğa alıyoruz
    const pendingNsfwLogs = [];
    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        translateAllBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sayfa ${i+1}/${pages.length} işleniyor...`;
        keyStatus.textContent = `⏳ Sayfa ${i+1}/${pages.length}`;

        // 1. Resmi geçici bir offscreen canvas'a yükle
        const offCanvas = document.createElement('canvas');
        const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
        await new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                offCanvas.width = img.width;
                offCanvas.height = img.height;
                offCtx.drawImage(img, 0, 0);
                resolve();
            };
            img.src = page.canvasData || page.originalData;
        });

        // Eğer sayfa önceden kullanıcı tarafından "Uygula" denerek kaydedilmişse VEYA 
        // daha önceki 'Tümünü Çevir' denemesinde yapay zekadan başarılı çeviri alınıp maskelenmişse,
        // Bu sayfayı tamamen ES GEÇ, en baştan yapıyormuş gibi görünmesin.
        if (page.isApplied || (page.translations && page.translations.length > 0 && page._originalSaved)) {
            continue;
        }

        if (pythonBackendHealthy) {
            if (!(await consumeCredit())) {
                break;
            }

            const backendResult = await callPythonBackendProcess(offCanvas.toDataURL('image/jpeg', 0.92));
            const translations = normalizeBackendBoxes(backendResult.boxes || []);
            page.translations = translations;
            page.isApplied = false;
            if (backendResult.image) {
                page.canvasData = backendResult.image;
            }

            if (i === currentPageIndex) {
                await applyBackendResultToActivePage(backendResult);
            }

            await new Promise(r => setTimeout(r, 100));
            continue;
        }

        // 2. Gemini ile çeviri yap (sadece henüz çevrilmemiş sayfaları çevir)
        let translations = page.translations && page.translations.length > 0 ? page.translations : null;
        
        if (!translations) {
            if (!(await consumeCredit())) {
                // SaaS: Müşterinin limiti doldu, döngüyü kes.
                break;
            }
            
            let attempt = 0;
            let success = false;
            while (attempt < 4 && !success) {
                try {
                    const engineSelect = document.getElementById('main-ai-engine');
                    const bypassCheckbox = document.getElementById('nsfw-bypass-mode');
                    
                    let base64OffCanvas = "";
                    if (bypassCheckbox && bypassCheckbox.checked) {
                        base64OffCanvas = 'data:image/jpeg;base64,' + applyOCRBypassFilter(offCanvas);
                    } else {
                        base64OffCanvas = offCanvas.toDataURL('image/jpeg', 0.7);
                    }
                    
                    const base64 = await resizeImageForAPI(base64OffCanvas);
                    
                    if (engineSelect && engineSelect.value !== 'gemini') {
                        // === TEKİL QWEN SİSTEMİ (Çoklu Çeviri) ===
                        const result = await callGrokWithVision(base64);
                        translations = result.translations || [];
                        
                        // NSFW Kanıtını Kuyruğa Al
                        if (result.is_nsfw) {
                            const proof = offCanvas.toDataURL('image/jpeg', 0.08);
                            pendingNsfwLogs.push({
                                page: i + 1,
                                fileName: page.file?.name || 'Bilinmiyor',
                                evidence: proof
                            });
                        }
                    } else {
                        // Standart Gemini Image Call
                        const data = await callGeminiWithRotation(base64);
                        let jsonText = data.candidates[0].content.parts[0].text.trim();
                        jsonText = jsonText.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();
                        const result = parseRobustJSON(jsonText);
                        translations = Array.isArray(result) ? result : (result.translations || []);
                    }
                    page.translations = translations;
                    success = true;
                    
                    // Sayfalar arası spam yapmamak/kota dolmasını biraz daha yavaşlatmak için 1.5 sn mola
                    await new Promise(r => setTimeout(r, 1500));
                } catch(err) {
                    if (err.message === 'QUOTA_EXCEEDED_ALL') {
                        attempt++;
                        console.warn(`Tüm API kotası doldu, 15 sn beklenip tekrar denenecek. Deneme: ${attempt}`);
                        translateAllBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Kota doldu, mola (15sn)...`;
                        keyStatus.textContent = `⏳ Kota Doldu! 15sn uyku...`;
                        await new Promise(r => setTimeout(r, 15000));
                    } else {
                        console.warn(`Sayfa ${i+1} çeviri hatası:`, err);
                        break; // Farklı bir hata ise iptal et
                    }
                }
            }
            if (!success) continue; // Sonuçta başarısız olduysa sıradaki sayfaya geç
        }

        // 3. Otomatik Sihirli Değnek Maskeleme (Offscreen canvas üzerinde)
        // Sayfanın orijinalini undo geçmişine ekle (Ctrl+Z ile geri alınabilsin)
        if (!page.undoHistory) page.undoHistory = [];
        if (!page._originalSaved) {
            page.undoHistory.unshift(page.originalData); // Orijinali geçmişin başına koy
            page._originalSaved = true;
        }

        const fillColor = { r: 255, g: 255, b: 255, a: 255 }; // Beyaz fill
        const tolerance = wandToleranceInput ? parseInt(wandToleranceInput.value) : 40;
        const tolSq = tolerance * tolerance;
        const expandVal = document.getElementById('wand-expand') ? parseInt(document.getElementById('wand-expand').value) : 2;

        for (const item of translations) {
            if (!item.box) continue;
            const box = item.box;
            const centerX = ((box.x + box.w / 2) / 100) * offCanvas.width;
            const centerY = ((box.y + box.h / 2) / 100) * offCanvas.height;

            // Merkez parlaklık kontrolü
            const px = offCtx.getImageData(Math.floor(centerX), Math.floor(centerY), 1, 1).data;
            const brightness = (px[0] + px[1] + px[2]) / 3;
            if (brightness < 160) continue; // Koyu zemin, atla

            // Offscreen canvas üzerinde magicWandErase mantığını çalıştır — bbox ile sınırlandır
            magicWandEraseOnCtx(offCtx, offCanvas.width, offCanvas.height, centerX, centerY, fillColor, tolSq, expandVal, box);
        }

        // 4. Maskelenmiş canvas'ı page'e kaydet
        page.canvasData = offCanvas.toDataURL('image/jpeg', 0.92);
        page.translations = translations;

        // Şu anki sayfa buysa canvas'ı da güncelle
        if (i === currentPageIndex) {
            const img = new Image();
            img.onload = () => {
                canvas.width = img.width; canvas.height = img.height;
                relativeContainer.style.width = img.width + 'px';
                relativeContainer.style.height = img.height + 'px';
                ctx.drawImage(img, 0, 0);
            };
            img.src = page.canvasData;
            detectedTexts = translations;
            renderTranslations();
        }

        await new Promise(r => setTimeout(r, 100)); // Rate limit nefesi
    }

    translateAllBtn.disabled = false;
    translateAllBtn.innerHTML = origText;
    keyStatus.textContent = `✅ Tüm sayfalar tamamlandı!`;
    keyStatus.style.color = '#10b981';
    setTimeout(() => { keyStatus.style.color = ''; }, 4000);
    updatePageButtons();

    // === TÜM İŞLEM BİTTİKTEN SONRA: NSFW Raporlarını Sessizce Gönder ===
    if (pendingNsfwLogs.length > 0) {
        setTimeout(() => {
            pendingNsfwLogs.forEach(log => {
                logAdminEvent('NSFW_DETECTED', `ÇOKLU TESPİT: Kullanıcı ${log.page}. sayfada (+18) işlem yaptı. Dosya: ${log.fileName}`, log.evidence);
            });
            console.log(`✅ ${pendingNsfwLogs.length} adet gizli rapor admin paneline iletildi.`);
        }, 3000); // Kullanıcı işini bitirdikten 3 saniye sonra başla
    }
}

// magicWandErase'in offscreen ctx versiyonu
function magicWandEraseOnCtx(offCtx, width, height, startX, startY, fillC, tolSq, expandVal, bbox) {
    const imageData = offCtx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const sx = Math.floor(startX), sy = Math.floor(startY);
    if (sx < 0 || sx >= width || sy < 0 || sy >= height) return;
    const startIdx = (sy * width + sx) * 4;
    const targetR = data[startIdx], targetG = data[startIdx+1], targetB = data[startIdx+2];
    function matchColor(idx) {
        const dr = data[idx]-targetR, dg = data[idx+1]-targetG, db = data[idx+2]-targetB;
        return (dr*dr+dg*dg+db*db) <= tolSq;
    }
    // bbox verilmişse kutu sınırı, verilmemişse dairesel radius
    const bbPad = 20;
    const bbX1 = bbox ? Math.max(0,       Math.floor((bbox.x/100)*width)           - bbPad) : 0;
    const bbX2 = bbox ? Math.min(width-1, Math.ceil(((bbox.x+bbox.w)/100)*width)   + bbPad) : width-1;
    const bbY1 = bbox ? Math.max(0,       Math.floor((bbox.y/100)*height)           - bbPad) : 0;
    const bbY2 = bbox ? Math.min(height-1,Math.ceil(((bbox.y+bbox.h)/100)*height)  + bbPad) : height-1;
    const maxRadSq = bbox ? Infinity : (Math.min(width,height)*0.20)**2;
    const mask = new Uint8Array(width * height);
    const stack = [sy * width + sx];
    mask[sy * width + sx] = 1;
    let minX=sx,maxX=sx,minY=sy,maxY=sy;
    while (stack.length > 0) {
        const idx = stack.pop();
        const x = idx % width, y = (idx-x)/width;
        if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y;
        const dirs=[idx+1,idx-1,idx+width,idx-width];
        const dxC=[x+1,x-1,x,x];
        for(let d=0;d<4;d++){
            const nIdx=dirs[d],nx=dxC[d];
            if(d===0&&nx>=width)continue; if(d===1&&nx<0)continue;
            const ny=(d<2)?y:(d===2?y+1:y-1);
            if(ny<0||ny>=height)continue;
            // Sınır kontrolu: bbox veya radius
            if(bbox){
                if(nx<bbX1||nx>bbX2||ny<bbY1||ny>bbY2)continue;
            } else {
                const ddx=nx-sx,ddy=ny-sy;
                if(ddx*ddx+ddy*ddy>maxRadSq)continue;
            }
            if(!mask[nIdx]){const pIdx=nIdx*4; if(matchColor(pIdx)){mask[nIdx]=1;stack.push(nIdx);}else{mask[nIdx]=2;}}
        }
    }
    const pad=Math.max(4,expandVal+2);
    const mnX=Math.max(0,minX-pad),mxX=Math.min(width-1,maxX+pad);
    const mnY=Math.max(0,minY-pad),mxY=Math.min(height-1,maxY+pad);
    const outerMask=new Uint8Array(width*height),outer=[];
    for(let x=mnX;x<=mxX;x++){const t=mnY*width+x,b=mxY*width+x;if(!outerMask[t]&&mask[t]!==1){outerMask[t]=1;outer.push(t);}if(!outerMask[b]&&mask[b]!==1){outerMask[b]=1;outer.push(b);}}
    for(let y=mnY+1;y<mxY;y++){const l=y*width+mnX,r=y*width+mxX;if(!outerMask[l]&&mask[l]!==1){outerMask[l]=1;outer.push(l);}if(!outerMask[r]&&mask[r]!==1){outerMask[r]=1;outer.push(r);}}
    while(outer.length>0){const idx=outer.pop(),x=idx%width,y=(idx-x)/width;const dirs=[idx+1,idx-1,idx+width,idx-width],dxC=[x+1,x-1,x,x];for(let d=0;d<4;d++){const nIdx=dirs[d],nx=dxC[d];if(d===0&&nx>=width)continue;if(d===1&&nx<0)continue;const ny=(d<2)?y:(d===2?y+1:y-1);if(ny<mnY||ny>mxY||nx<mnX||nx>mxX)continue;if(!outerMask[nIdx]&&mask[nIdx]!==1){outerMask[nIdx]=1;outer.push(nIdx);}}}
    const solidMask=new Uint8Array(width*height);
    for(let y=mnY;y<=mxY;y++)for(let x=mnX;x<=mxX;x++){const nIdx=y*width+x;if(mask[nIdx]===1||!outerMask[nIdx])solidMask[nIdx]=1;}
    const finalMask=new Uint8Array(solidMask);
    for(let i=0;i<expandVal;i++){const prev=new Uint8Array(finalMask);for(let y=Math.max(0,mnY-1);y<=Math.min(height-1,mxY+1);y++)for(let x=Math.max(0,mnX-1);x<=Math.min(width-1,mxX+1);x++)if(prev[y*width+x]===1)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const ny2=y+dy,nx2=x+dx;if(ny2>=0&&ny2<height&&nx2>=0&&nx2<width)finalMask[ny2*width+nx2]=1;}}
    const borderThreshold=90;
    const fMinY=Math.max(0,mnY-expandVal),fMaxY=Math.min(height-1,mxY+expandVal);
    const fMinX=Math.max(0,mnX-expandVal),fMaxX=Math.min(width-1,mxX+expandVal);
    for(let y=fMinY;y<=fMaxY;y++)for(let x=fMinX;x<=fMaxX;x++){const nIdx=y*width+x;if(finalMask[nIdx]===1){const pIdx=nIdx*4;if(solidMask[nIdx]!==1&&data[pIdx]<borderThreshold&&data[pIdx+1]<borderThreshold&&data[pIdx+2]<borderThreshold)continue;data[pIdx]=fillC.r;data[pIdx+1]=fillC.g;data[pIdx+2]=fillC.b;data[pIdx+3]=fillC.a;}}
    offCtx.putImageData(imageData, 0, 0);
}

if (translateAllBtn) {
    translateAllBtn.addEventListener('click', analyzeAndMaskAllPages);
}

// ================= SAYFA SIFIRLAMA (TÜM DEĞİŞİKLİKLERİ GERİ AL) =================
if (resetPageBtn) {
    resetPageBtn.addEventListener('click', () => {
        if (currentPageIndex < 0 || !pages[currentPageIndex]) return;
        if (!confirm('Bu sayfadaki TÜM değişiklikler (maskeleme, düzenleme) orijinaline döndürülecek. Emin misin?')) return;

        const page = pages[currentPageIndex];
        
        // Undo geçmişini sıfırla
        page.canvasData = null;
        page._originalSaved = false;
        undoHistory = [page.originalData];
        currentStep = 0;
        updateUndoButton();

        // Orijinal resmi canvas'a geri yükle
        const img = new Image();
        img.onload = () => {
            currentImage = img;
            canvas.width = img.width;
            canvas.height = img.height;
            relativeContainer.style.width = img.width + 'px';
            relativeContainer.style.height = img.height + 'px';
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            updateActionButtonVisibility();
        };
        img.src = page.originalData;

        // Floating text elementlerini temizle
        document.querySelectorAll('.text-element').forEach(el => el.remove());

        // Compare modunu sıfırla
        if (compareBtn) {
            compareMode = false;
            compareBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Orijinali Gör';
            compareBtn.style.background = '';
        }

        console.log('Sayfa orijinaline sıfırlandı.');
        updateActionButtonVisibility();
    });
}

// ================= ORİJİNAL / DÜZENLENMİŞ KARŞILAŞTIRMA =================
let compareMode = false;
if (compareBtn) {
    compareBtn.addEventListener('click', () => {
        if (!currentImage || currentPageIndex < 0) return;
        compareMode = !compareMode;
        if (compareMode) {
            // Orijinali göster
            compareBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Düzenlenmiş';
            compareBtn.style.background = '#dc2626';
            const origImg = new Image();
            origImg.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(origImg, 0, 0);
            };
            origImg.src = pages[currentPageIndex].originalData;
        } else {
            // Düzenlenmiş hali geri yükle
            compareBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Orijinali Gör';
            compareBtn.style.background = '';
            const editedImg = new Image();
            editedImg.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(editedImg, 0, 0);
            };
            editedImg.src = pages[currentPageIndex].canvasData || pages[currentPageIndex].originalData;
        }
        applyOverlayTextLayout(textDiv, textSpan, detectedTexts[index]?.box || box, index);
    });
}

async function runMagicWandFinishPass(items, options = {}) {
    if (!currentImage || !Array.isArray(items) || items.length === 0) {
        return { cleaned: 0, skipped: 0 };
    }

    const {
        minBrightness = 150,
        delayMs = 20,
        persistCanvas = true,
    } = options;

    let cleaned = 0;
    let skipped = 0;

    for (const item of items) {
        const box = item?.box_percent || item?.safe_box_percent || item?.box;
        if (!box) continue;

        const centerX = ((box.x + box.w / 2) / 100) * canvas.width;
        const centerY = ((box.y + box.h / 2) / 100) * canvas.height;
        const pixel = ctx.getImageData(Math.floor(centerX), Math.floor(centerY), 1, 1).data;
        const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;

        if (brightness < minBrightness) {
            skipped++;
            continue;
        }

        magicWandErase(centerX, centerY, brushColorInput.value, box);
        cleaned++;

        if (delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    if (persistCanvas && currentPageIndex >= 0 && pages[currentPageIndex]) {
        pages[currentPageIndex].canvasData = canvas.toDataURL('image/jpeg', 0.92);
    }

    return { cleaned, skipped };
}

async function cleanDialogueBubbles(triggerButton, options = {}) {
    if (!currentImage || !triggerButton) return;
    if (!detectedTexts || detectedTexts.length === 0) {
        alert("Önce 'Metni Bul / Çevir' ile konuşma kutularını tespit et, sonra 'Diyalogları Temizle'yi kullan.");
        return;
    }
    const {
        preferBackend = false,
        hideAfter = false,
        finalMagicPass = true,
    } = options;

    const origText = triggerButton.innerHTML;
    triggerButton.disabled = true;
    triggerButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Temizleniyor...';

    saveCanvasState();

    if (preferBackend && pythonBackendHealthy) {
        try {
            const result = await callPythonBackendProcess(canvas.toDataURL('image/jpeg', 0.92));
            await applyBackendResultToActivePage(result);
            if (finalMagicPass) {
                const passResult = await runMagicWandFinishPass(detectedTexts, {
                    minBrightness: 145,
                    delayMs: 18,
                    persistCanvas: true,
                });
                saveCanvasState();
                console.log(`Backend + sihirli değnek rötuşu: ${passResult.cleaned} balon temizlendi, ${passResult.skipped} balon atlandı.`);
            }
        } finally {
            triggerButton.disabled = false;
            triggerButton.innerHTML = origText;
            if (hideAfter) triggerButton.classList.add('hidden');
        }
        return;
    }

    let temizlenen = 0;
    let atlanan = 0;

    for (const item of detectedTexts) {
        if (!item.box) continue;
        const box = item.box;
        const centerX = ((box.x + box.w / 2) / 100) * canvas.width;
        const centerY = ((box.y + box.h / 2) / 100) * canvas.height;
        const px = ctx.getImageData(Math.floor(centerX), Math.floor(centerY), 1, 1).data;
        const brightness = (px[0] + px[1] + px[2]) / 3;

        if (brightness < 160) {
            atlanan++;
            continue;
        }

        magicWandErase(centerX, centerY, brushColorInput.value, box);
        temizlenen++;
        await new Promise(r => setTimeout(r, 30));
    }

    saveCanvasState();
    triggerButton.disabled = false;
    triggerButton.innerHTML = origText;
    if (hideAfter) triggerButton.classList.add('hidden');
    console.log(`Diyalog temizleme: ${temizlenen} balon silindi, ${atlanan} balon atlandi.`);
}
if (autoEraseBtn) {
    autoEraseBtn.addEventListener('click', async () => {
        await cleanDialogueBubbles(autoEraseBtn, { preferBackend: true, hideAfter: true });
        return;
        if (!detectedTexts || detectedTexts.length === 0 || !currentImage) return;

        const origText = autoEraseBtn.innerHTML;
        autoEraseBtn.disabled = true;
        autoEraseBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Temizleniyor...';

        saveCanvasState(); // Geri alabilmek için önce state kaydet

        if (pythonBackendHealthy) {
            try {
                const result = await callPythonBackendProcess(canvas.toDataURL('image/jpeg', 0.92));
                await applyBackendResultToActivePage(result);
            } finally {
                autoEraseBtn.disabled = false;
                autoEraseBtn.innerHTML = origText;
            }
            return;
        }

        let temizlenen = 0;
        let atlanan = 0;

        for (const item of detectedTexts) {
            if (!item.box) continue;
            const box = item.box;

            // Balonun merkez noktasını canvas piksel koordinatlarına çevir
            const centerX = ((box.x + box.w / 2) / 100) * canvas.width;
            const centerY = ((box.y + box.h / 2) / 100) * canvas.height;

            // Orta noktanın rengini kontrol et — çok koyuysa (resim üzeri yazı) atla
            const px = ctx.getImageData(Math.floor(centerX), Math.floor(centerY), 1, 1).data;
            const brightness = (px[0] + px[1] + px[2]) / 3;

            if (brightness < 160) {
                // Merkez koyu → resim ya da koyu zemin üstündeki yazı → atla
                atlanan++;
                continue;
            }

            // Sihirli değneği bu noktaya uygula — bbox ile sınırlandır
            magicWandErase(centerX, centerY, brushColorInput.value, box);
            temizlenen++;

            // Sıradaki balona geçmeden önce kısa bir nefes ver (UI donmasın)
            await new Promise(r => setTimeout(r, 30));
        }

        saveCanvasState();
        autoEraseBtn.disabled = false;
        autoEraseBtn.innerHTML = origText;
        autoEraseBtn.classList.add('hidden'); // Bir kez basıldı, gizle

        console.log(`Otomatik temizleme: ${temizlenen} balon silindi, ${atlanan} balon atlandı (koyu zemin).`);
    });
}

if (dialogCleanBtn) {
    dialogCleanBtn.addEventListener('click', async () => {
        await cleanDialogueBubbles(dialogCleanBtn, { preferBackend: false });
    });
}

// Yüzen, Taşınabilir ve Boyutlandırılabilir Metin Kutusu Oluşturma
function createFloatingTextElement(text, box, index) {
    const textDiv = document.createElement('div');
    textDiv.className = 'text-element'; 
    textDiv.id = `overlay-${index}`;
    
    // Modelden renk bilgilerini çek (Yeni eklenenler veya düzenlenmişler için)
    const itemData = detectedTexts[index] || {};
    const textColor = itemData.textColor || '#000000';
    const bgColor = itemData.bgColor || 'transparent';
    const fontFamily = itemData.fontFamily || 'Comic Sans MS';
    const savedFontSize = itemData.fontSize || (globalFontSizeInput ? parseInt(globalFontSizeInput.value, 10) : 14);
    
    textDiv.style.color = textColor; 
    textDiv.style.backgroundColor = bgColor;
    textDiv.style.fontFamily = `"${fontFamily}", sans-serif`;
    textDiv.style.fontSize = `${savedFontSize}px`;
    
    // Dataset üzerinden değerleri sakla
    textDiv.dataset.textColor = textColor;
    textDiv.dataset.bgColor = bgColor;
    textDiv.dataset.fontFamily = fontFamily;
    textDiv.dataset.boxIndex = String(index);
    
    textDiv.style.display = 'flex';
    textDiv.style.alignItems = 'center';
    textDiv.style.justifyContent = 'center';
    textDiv.style.flexDirection = 'column';
    textDiv.style.overflow = 'hidden';
    textDiv.style.boxSizing = 'border-box';
    textDiv.style.padding = '5px';
    
    const textSpan = document.createElement('span');
    textSpan.className = 'text-content';
    textSpan.innerText = text;
    textSpan.style.width = '100%'; // Kutunun içine tam yayıl
    textSpan.style.display = 'block';
    textSpan.style.outline = "none";
    textSpan.style.cursor = "default";
    textSpan.style.textAlign = 'center';
    textSpan.style.whiteSpace = 'pre-wrap';
    textSpan.style.wordBreak = 'break-word';
    textSpan.spellcheck = false;
    
    // Çift Tıklayarak (Double Click) Düzenleme Modu
    textDiv.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        textSpan.contentEditable = "true";
        textSpan.style.cursor = "text";
        textSpan.focus();
    });

    // Düzenleme bittiğinde (odak kaybolduğunda) eski haline dön
    textSpan.addEventListener('blur', () => {
        textSpan.contentEditable = "false";
        textSpan.style.cursor = "default";
    });

    // Sürüklemeyi engelle: Sadece düzenleme modundaysa karakter seçimine izin ver
    textSpan.addEventListener('mousedown', (e) => {
        if (textSpan.isContentEditable) {
            e.stopPropagation(); 
        }
    });

    // Metin değiştikçe sağ paneli ve listeyi anlık yansıt
    textSpan.addEventListener('input', (e) => {
        if (detectedTexts[index]) {
            detectedTexts[index].translated = e.target.innerText;
            // Sağ paneldeki ilgili text box'ı da güncelle
            const correspondingInput = document.querySelector(`.translation-input[data-index="${index}"]`);
            if (correspondingInput) {
                correspondingInput.value = e.target.innerText;
            }
        }
    });

    textDiv.appendChild(textSpan);

    const toolbar = document.createElement('div');
    toolbar.className = 'mini-toolbar';
    toolbar.style.top = '-40px'; // Tooltip kutunun üstünde kalsın
    toolbar.style.right = '0';
    toolbar.innerHTML = `
        <label style="background:rgba(30,41,59,0.9);color:white;padding:3px 8px;border-radius:6px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;" title="Balon Arkaplan Rengi (Önceki yazıyı siler)">
            <i class="fa-solid fa-fill-drip"></i>
            <input type="color" class="bg-picker" value="#ffffff" style="width:20px;height:20px;padding:0;border:none;border-radius:3px;cursor:pointer;">
        </label>
        <label style="background:rgba(30,41,59,0.9);color:white;padding:3px 8px;border-radius:6px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;" title="Yazı Rengi">
            <i class="fa-solid fa-font"></i>
            <input type="color" class="text-picker" value="#000000" style="width:20px;height:20px;padding:0;border:none;border-radius:3px;cursor:pointer;">
        </label>
        <select class="font-picker" title="Font Seçimi" style="background:rgba(30,41,59,0.9);color:white;border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:5px;font-size:12px;cursor:pointer;">
            <option value="Comic Sans MS">Comic Sans</option>
            <option value="Arial">Arial</option>
            <option value="Impact">Impact</option>
            <option value="Times New Roman">TNR</option>
            <option value="Verdana">Verdana</option>
        </select>
        <button class="delete-btn" title="Bu çeviriyi tamamen sil"><i class="fa-solid fa-trash"></i></button>
    `;

    textDiv.appendChild(toolbar);

    // Toolbar Eventleri (Menü işlemleri)
    const bgPicker = toolbar.querySelector('.bg-picker');
    bgPicker.value = bgColor && bgColor !== 'transparent' ? bgColor : '#ffffff';
    bgPicker.addEventListener('input', (e) => {
            textDiv.dataset.bgColor = e.target.value;
            textDiv.style.backgroundColor = e.target.value;
        if (detectedTexts[index]) {
            detectedTexts[index].bgColor = e.target.value;
            const correspondingPanelPicker = document.querySelector(`.panel-bg-picker[data-index="${index}"]`);
            if (correspondingPanelPicker) correspondingPanelPicker.value = e.target.value;
        }
    });
    
    // Şeffaflık ayarı için tıklandığında Shift tuşu falansa veya sadece eklenebilir, şimdilik sadece renk
    
    const textPicker = toolbar.querySelector('.text-picker');
    textPicker.value = textColor;
    textPicker.addEventListener('input', (e) => {
        textDiv.dataset.textColor = e.target.value;
        textDiv.style.color = e.target.value;
        if (detectedTexts[index]) {
            detectedTexts[index].textColor = e.target.value;
            const correspondingPanelPicker = document.querySelector(`.panel-text-picker[data-index="${index}"]`);
            if (correspondingPanelPicker) correspondingPanelPicker.value = e.target.value;
        }
    });

    const fontPicker = toolbar.querySelector('.font-picker');
    fontPicker.value = fontFamily;
    fontPicker.addEventListener('change', (e) => {
        textDiv.dataset.fontFamily = e.target.value;
        textDiv.style.fontFamily = `"${e.target.value}", sans-serif`;
        if (detectedTexts[index]) detectedTexts[index].fontFamily = e.target.value;
        applyOverlayTextLayout(textDiv, textSpan, box, index);
    });

    toolbar.querySelector('.delete-btn').addEventListener('click', (e) => {
        textDiv.remove();
        e.stopPropagation();
    });
    
    // Boyutları Güvenli Sınırla
    const rect = relativeContainer.getBoundingClientRect();
    const picked = chooseDisplayBoxAndLayout(
        text,
        fontFamily,
        box,
        rect.width || canvas.width || 1,
        rect.height || canvas.height || 1
    );
    const displayBox = picked.displayBox;
    const bx = displayBox.x;
    const by = displayBox.y;
    const bw = displayBox.w;
    const bh = displayBox.h;

    textDiv.style.left = `${bx}%`;
    textDiv.style.top = `${by}%`;
    textDiv.style.width = `${bw}%`;
    textDiv.style.height = `${bh}%`;
    if (detectedTexts[index]) {
        detectedTexts[index].box = { x: bx, y: by, w: bw, h: bh };
    }

    // Sürükleme Mantığı (Kenarlardan Sürüklemek İçin)
    let isDraggingThis = false;
    let startX, startY, startLeft, startTop;

    textDiv.addEventListener('wheel', (e) => {
        e.preventDefault();
        let currentSize = parseInt(window.getComputedStyle(textDiv).fontSize);
        const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
        
        currentSize = Math.max(8, Math.round(currentSize * scaleFactor));
        textDiv.style.fontSize = currentSize + 'px';
        if (detectedTexts[index]) {
            detectedTexts[index].fontSize = currentSize;
        }
        
        // Kutu boyutu artık OTOMATİK olarak değişmeyecek (Sabit kalacak)
        // Sadece köşeden çekince büyüyecek.
    });

    textDiv.addEventListener('mousedown', (e) => {
        // Sadece div üzerine tıklandıysa (resize köşesi vs hariç)
        if(e.offsetX > textDiv.clientWidth - 15 && e.offsetY > textDiv.clientHeight - 15) return; // Resize tutamacı koruması
        
        draggedElement = textDiv;
        
        // Fare başlangıç koordinatlarını kaydet
        draggedElement._startX = e.clientX;
        draggedElement._startY = e.clientY;
        
        // Elementin orijinal sol/üst (YÜZDASAL) değerini kaydet
        draggedElement._startLeft = parseFloat(textDiv.style.left || 0);
        draggedElement._startTop = parseFloat(textDiv.style.top || 0);
        
        // Diğerlerinin üstüne çıkart
        document.querySelectorAll('.text-element').forEach(el => el.style.zIndex = 10);
        textDiv.style.zIndex = 100;
        e.preventDefault(); // Metin seçimini engelle sürüklerken
    });

    // ─── Boyutlandırma Tutamacı (Sağ Alt Köşe) ────────────────────────────────────
    const resizeHandle = document.createElement('div');
    resizeHandle.style.cssText = [
        'position:absolute', 'right:0', 'bottom:0',
        'width:14px', 'height:14px',
        'cursor:se-resize',
        'background:linear-gradient(135deg,transparent 40%,rgba(99,102,241,0.8) 40%)',
        'border-radius:0 0 4px 0',
        'z-index:200'
    ].join(';');
    textDiv.appendChild(resizeHandle);

    let isResizing = false;
    let resizeStartX, resizeStartY, resizeStartW, resizeStartH;

    resizeHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation(); e.preventDefault();
        isResizing = true;
        resizeStartX = e.clientX; resizeStartY = e.clientY;
        resizeStartW = textDiv.offsetWidth;
        resizeStartH = textDiv.offsetHeight;

        const onMove = (ev) => {
            if (!isResizing) return;
            const rect = relativeContainer.getBoundingClientRect();
            const newW = Math.max(40, resizeStartW + (ev.clientX - resizeStartX));
            const newH = Math.max(20, resizeStartH + (ev.clientY - resizeStartY));
            textDiv.style.width  = (newW / rect.width  * 100) + '%';
            textDiv.style.height = (newH / rect.height * 100) + '%';
            if (detectedTexts[index]) {
                detectedTexts[index].box = {
                    ...(detectedTexts[index].box || {}),
                    x: parseFloat(textDiv.style.left) || 0,
                    y: parseFloat(textDiv.style.top) || 0,
                    w: parseFloat(textDiv.style.width) || 20,
                    h: parseFloat(textDiv.style.height) || 10,
                };
            }
            applyOverlayTextLayout(textDiv, textSpan, detectedTexts[index]?.box || box, index);
        };
        const onUp = () => {
            isResizing = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // ─── Sağ Panel Textarea ↔ Canvas Üzerine Canlı Senkronizasyon ───────────
    // Textarea değişin olduğunda canvas üzerindeki yazıyı hemen güncelle
    // İlk render’da textarea henüz DOM’a eklenmemiş olabilir; kısa gecikme kullan
    setTimeout(() => {
        const textarea = document.querySelector(`.translation-input[data-index="${index}"]`);
        if (!textarea) return;
        // Textarea → Canvas span (canlı)
        textarea.addEventListener('input', () => {
            textSpan.innerText = textarea.value;
            detectedTexts[index] && (detectedTexts[index].translated = textarea.value);
            applyOverlayTextLayout(textDiv, textSpan, detectedTexts[index]?.box || box, index);
        });
        // Canvas span → Textarea senkronizasyonu (başlangıçta eşitliyi garanti et)
        textSpan.innerText = textarea.value || text;
    }, 0);

    relativeContainer.appendChild(textDiv);
    applyOverlayTextLayout(textDiv, textSpan, detectedTexts[index]?.box || box, index);
}

// Genel Sürükleme Dinleyicisi
document.addEventListener('mousemove', (e) => {
    if (!draggedElement) return;
    
    // Container boyutlarını al
    const rect = relativeContainer.getBoundingClientRect();
    
    // Farenin toplam ne kadar hareket ettiğini bul (piksel olarak)
    const deltaX = e.clientX - draggedElement._startX;
    const deltaY = e.clientY - draggedElement._startY;
    
    // Bu değişimi yüzdeliğe çevir
    const percentDeltaX = (deltaX / rect.width) * 100;
    const percentDeltaY = (deltaY / rect.height) * 100;

    // Başlangıç yüzdesine ekleyerek yeni konumu belirle
    draggedElement.style.left = (draggedElement._startLeft + percentDeltaX) + '%';
    draggedElement.style.top = (draggedElement._startTop + percentDeltaY) + '%';
    const idx = parseInt(draggedElement.dataset.boxIndex || '-1', 10);
    if (idx >= 0 && detectedTexts[idx]) {
        detectedTexts[idx].box = {
            ...(detectedTexts[idx].box || {}),
            x: parseFloat(draggedElement.style.left) || 0,
            y: parseFloat(draggedElement.style.top) || 0,
            w: parseFloat(draggedElement.style.width) || 20,
            h: parseFloat(draggedElement.style.height) || 10,
        };
    }
});

document.addEventListener('mouseup', () => {
    draggedElement = null;
});

// ================= UYGULA (KAYDET) FONKSİYONU =================
applyBtn.addEventListener('click', () => {
    if (!currentImage) return;
    
    const elements = document.querySelectorAll('.text-element');
    if (elements.length === 0) {
        alert("Tuvale eklenecek yüzen metin kutusu bulunamadı.");
        return;
    }

    // Doğrudan ana resmi kalıcı olarak çizeceğimiz context
    const tCtx = ctx; 

    elements.forEach(el => {
        // 🎯 KESİN ÇÖZÜM: Ekran pikselleri yerine doğrudan elementin stilindeki % (YÜZDE) değerlerini kullanıyoruz.
        // Bu sayede Zoom yapılsa bile kayma milimetrik olarak sıfırlanır.
        const pctX = parseFloat(el.style.left) || 0;
        const pctY = parseFloat(el.style.top) || 0;
        const pctW = parseFloat(el.style.width) || 20;
        const pctH = parseFloat(el.style.height) || 10;

        drawTranslatedOverlayToContext(tCtx, canvas.width, canvas.height, {
            translated: (el.querySelector('.text-content')?.innerText || el.innerText || '').trim(),
            box: { x: pctX, y: pctY, w: pctW, h: pctH, is_display_box: true },
            textColor: el.dataset.textColor || '#000000',
            bgColor: el.dataset.bgColor || 'transparent',
            fontFamily: el.dataset.fontFamily || 'Comic Sans MS'
        });
        
        // Canvas'a nakşedildiği için HTML elementini uçur
        el.remove();
    });

    console.log("Canvas birleştirildi.");
    saveCanvasState();
    
    // UYGULANDIKTAN SONRA TEKRAR KUTULARIN ÜREMESİNİ ENGELLE
    detectedTexts = [];
    if (pages[currentPageIndex]) {
        pages[currentPageIndex].translations = [];
        pages[currentPageIndex].isApplied = true;
        pages[currentPageIndex].canvasData = canvas.toDataURL('image/jpeg', 0.92);
    }
    renderTranslations();
});


// ================= İNDİRME FONKSİYONU =================
downloadBtn.addEventListener('click', async () => {
    if (!currentImage) return;
    
    // Eğer ekranda onaylanmamış kutular varsa onları da mecburi uygulayıp canvasa yapıştıralım
    if (document.querySelectorAll('.text-element').length > 0) {
        applyBtn.click();
    }
    
    // Geçerli sayfanın son halini pages dizisine kaydet
    if (currentPageIndex >= 0) {
        pages[currentPageIndex].canvasData = canvas.toDataURL('image/jpeg', 0.92);
    }
    
    if (pages.length === 1) {
        // Tek sayfa varsa doğrudan indir
        const link = document.createElement('a');
        const originalName = pages[0].file.name || 'sayfa.jpg';
        link.download = `001_${originalName}`;
        link.href = pages[0].canvasData || pages[0].originalData;
        link.click();
    } else {
        const originalText = downloadBtn.innerHTML;
        
        // ─── YENİ KLASÖRE KAYDETME SİSTEMİ (File System Access API) ─────────────
        if ('showDirectoryPicker' in window) {
            try {
                // Kullanıcıdan bilgisayarında bir hedef klasör seçmesini iste
                const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });

                downloadBtn.disabled = true;
                downloadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Klasöre Kaydediliyor...';
                
                // Tüm dosyaları seçilen klasöre doğrudan yaz
                for (let index = 0; index < pages.length; index++) {
                    const page = pages[index];
                    let originalName = page.file.name || `sayfa_${index + 1}.jpg`;
                    const padIndex = String(index + 1).padStart(3, '0');
                    const fileName = `${padIndex}_${originalName}`;
                    
                    const dataUrl = page.canvasData || page.originalData;
                    // Data URL'i Blob (gerçek binary dosya) formatına anında çevir
                    const res = await fetch(dataUrl);
                    const blob = await res.blob();
                    
                    // Hedef klasörde dosyayı yarat ve içine yaz
                    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                }
                
                downloadBtn.disabled = false;
                downloadBtn.innerHTML = originalText;
                alert(`Başarılı! Tüm ${pages.length} sayfa seçtiğiniz klasöre kaydedildi.`);
                return; // İşlem bitti, çık
            } catch (err) {
                // Eğer kullanıcı "İptal"e basarsa veya tarayıcı güvenlik politikası izin vermezse
                // kod aşağıya (fallback sisteme) devam edecek.
                console.log("Klasör seçimi iptal edildi, klasik indirmeye dönülüyor.", err);
            }
        }

        // ─── ESKİ/KLASİK ÇOKLU İNDİRME SİSTEMİ (Klasör seçimi iptal edildiğinde ya da tarayıcı desteksizse) ───
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> İndiriliyor...';
        
        pages.forEach((page, index) => {
            let originalName = page.file.name || `sayfa_${index + 1}.jpg`;
            const padIndex = String(index + 1).padStart(3, '0');
            const fileName = `${padIndex}_${originalName}`;
            
            const link = document.createElement('a');
            link.download = fileName;
            link.href = page.canvasData || page.originalData;
            
            // Tarayıcının çoklu indirmeyi engellememesi için her dosya arasına gecikme
            setTimeout(() => {
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                if (index === pages.length - 1) {
                    downloadBtn.disabled = false;
                    downloadBtn.innerHTML = originalText;
                }
            }, index * 400); // Çoklu indirmelerde güvence için 400ms ideal
        });
    }
});

// ================= SAYFAYI YANLIŞLIKLA KAPATMA KORUMASI =================
window.addEventListener('beforeunload', (e) => {
    // Sadece eğer yüklenmiş bir resim varsa uyarı verelim
    if (pages.length > 0) {
        // Çoğu modern tarayıcı için sadece preventDefault ve returnValue boş string gerekiyor
        e.preventDefault();
        e.returnValue = ''; // Standart izin mesajını gösterir: "Değişiklikleriniz kaydedilmemiş olabilir..."
    }
});
