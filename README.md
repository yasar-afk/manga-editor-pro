<div align="center">

# 🎨 Manga Editor Pro

### AI Destekli Çeviri ve Düzenleme Aracı

![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

Manga çeviri sürecini hızlandıran, AI destekli web tabanlı düzenleme aracı.

[![Stars](https://img.shields.io/github/stars/yasar-afk/manga-editor-pro?style=social)](https://github.com/yasar-afk/manga-editor-pro/stargazers)

</div>

---

## ✨ Özellikler

| Özellik | Açıklama |
|---------|----------|
| 🤖 **AI Çeviri** | Gemini & OpenRouter API entegrasyonu |
| 📝 **Sayfa Sayfa Çeviri** | Manga sayfalarını tek tek çevirme |
| 🔧 **Kalite Onarımı** | Otomatik çeviri kalite iyileştirme |
| 📊 **Raporlama** | Çeviri raporları ve fark analizi |
| 🐳 **Docker Desteği** | Kolay kurulum ve deploy |
| 👮 **Admin Panel** | Yönetim ve yapılandırma arayüzü |

---

## 🚀 Hızlı Başlangıç

### Ön Koşullar

- Python 3.8+
- Docker & Docker Compose (opsiyonel)

### Kurulum

```bash
# 1. Depoyu klonla
git clone https://github.com/yasar-afk/manga-editor-pro.git
cd manga-editor-pro

# 2. Ortam değişkenlerini yapılandır
cp .env.example .env.local
# .env.local dosyasını düzenle

# 3. Bağımlılıkları yükle
pip install -r requirements.txt

# 4. Uygulamayı başlat
python app2.js
```

### Docker ile Kurulum

```bash
docker compose up --build
```

Tarayıcıda açın: `http://localhost:8000`

---

## 🔧 Konfigürasyon

`.env.local` dosyasında aşağıdaki API anahtarlarını yapılandırın:

```env
# Google Gemini API Key
GEMINI_API_KEY=your_gemini_api_key

# OpenRouter API Key
OPENROUTER_API_KEY=your_openrouter_api_key
```

---

## 📁 Proje Yapısı

```
manga-editor-pro/
├── app2.js                 ← Ana uygulama
├── backend/                ← FastAPI backend
├── admin.html              ← Admin paneli
├── admin.js                ← Admin JavaScript
├── admin.css               ← Admin stilleri
├── index.html              ← Ana sayfa
├── cloud.js                ← Firebase entegrasyonu
├── batch_manga_test.py     ← Toplu test
├── page_by_page_delivery.py← Sayfa teslimatı
├── quality_repair_pass.py  ← Kalite onarımı
├── Dockerfile              ← Docker yapılandırması
├── docker-compose.yml      ← Docker Compose
└── reports/                ← Çeviri raporları
```

---

## 🛠️ Teknolojiler

| Katman | Teknoloji |
|--------|-----------|
| Backend | FastAPI, Python |
| Frontend | HTML, CSS, JavaScript |
| AI | Google Gemini, OpenRouter |
| Deploy | Docker, Docker Compose |
| Veritabanı | Firebase (opsiyonel) |

---

## 📜 Lisans

Bu proje MIT Lisansı altında lisanslanmıştır.

---

<div align="center">

**Manga Editor Pro** — Çeviri sürecinizi hızlandırın

</div>
