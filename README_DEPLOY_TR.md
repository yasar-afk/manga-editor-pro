# Manga Editor Pro Kurulum ve Yayin Alma

Bu proje `FastAPI` backend'i ile ayni uygulama icinden `index.html` arayuzunu servis eder.
Yani tek servis ayaga kalktiginda hem site hem API calisir.

## 1. Gerekli dosya

Kok dizinde bir `.env.local` dosyasi olmali.

Ornek:

```env
GEMINI_API_KEY=senin_gemini_api_keyin
OPENROUTER_API_KEY=senin_openrouter_api_keyin
```

## 2. Docker ile yerelde calistirma

Kok dizinde su komutlari calistir:

```powershell
docker compose up --build
```

Site acildiginda adres:

```text
http://localhost:8000
```

## 3. Sunucuya kurma

Sunucuda `docker` ve `docker compose` varsa ayni proje klasorunu kopyalayip su komutu calistirman yeterli:

```powershell
docker compose up --build -d
```

Ardindan domain'ini bu sunucuya baglayabilirsin.

## 4. Degisiklikler otomatik siteye yansir mi

Bu sorunun cevabi kurulum sekline bagli:

- Eger sadece kendi bilgisayarindaki dosyalari degistiriyorsan, internetteki site otomatik guncellenmez.
- Eger sunucudaki dosyalari degistiriyorsan, statik dosyalar bazen sayfa yenilenince gorunur ama Python backend degisikliklerinde genelde servis yeniden baslatilmalidir.
- Eger GitHub + otomatik deploy sistemi kurarsan, koda `push` attiginda site otomatik guncellenebilir.

## 5. En saglikli canli kullanim modeli

En temiz yapi su sekildedir:

1. Projeyi GitHub'a koy.
2. Sunucuyu GitHub repo'suna bagla.
3. Her guncellemeden sonra otomatik build/deploy calistir.

Bu duzende:

- sen bilgisayarinda kodu degistirirsin
- GitHub'a gonderirsin
- sunucu otomatik yeni surumu yayina alir

## 6. Manuel yeniden yayin komutu

Sunucuda yeni kod geldikten sonra:

```powershell
docker compose up --build -d
```

## 7. Notlar

- `cloud.js` icindeki Firebase ayarlari su an ornek/degerlendirme modunda gorunuyor; gercek SaaS lisans sistemi icin bunlarin gercek bilgilerle doldurulmasi gerekir.
- `reports/` klasoru `.dockerignore` icinde haric tutuldu. Boylece image sismez. Raporlari canli ortamda kalici tutmak istersen ayri volume veya depolama kullanmak daha dogru olur.
