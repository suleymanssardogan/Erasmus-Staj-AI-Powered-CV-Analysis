# CV Studio — Erasmus Internship Project

Türkçe bir CV analiz çalışma alanı: PDF/görsellerden metin çıkarır, teknik becerileri ayrı ayrı tespit eder, eğitim/deneyim ve iletişim bilgilerini gösterir. Python, Flask, SQLite, Tesseract ve OpenCV ile geliştirilmiştir.

## Özellikler

- Sürükle-bırak dosya yükleme ve Türkçe/İngilizce OCR; dijital PDF metni öncelikli okunur.
- OCR kurulumu olmadan metin yapıştırma ve örnek CV ile çalışabilen analiz.
- C++, C#, JavaScript, Python gibi ayrı teknoloji eşleşmeleri; kelime sınırlarıyla yanlış eşleşmeleri azaltma.
- Rol sözlüğü karşılaştırması, somut belge kontrol önerileri, JSON dışa aktarım ve metin kopyalama.
- Mobil uyumlu arayüz, koyu tema, klavye odağı ve erişilebilir durum bildirimleri.
- Son 15 analiz için SQLite geçmişi; yüklenen asıl dosya işlem sonunda silinir.
- Sunucuda yapılandırılan n8n webhook’una isteğe bağlı aktarım.

Analiz **kural tabanlıdır**; bir LLM kullanmaz. Beceri seviyesi, işe alım uygunluğu veya gerçek ATS puanı ölçmez. Çıkarılan bilgileri orijinal belgeyle karşılaştırın.

## Yerel çalıştırma

Python 3.11 önerilir:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

[localhost:5001](http://127.0.0.1:5001) üzerinden açılır. Minimal kurulumda metin analizi çalışır. Tam OCR için `requirements-full.txt` bağımlılıkları, Tesseract (eng/tur dil paketleri) ve PDF görüntü dönüşümü için Poppler gerekir. Alternatif olarak:

```sh
docker compose up --build
```

Docker uygulaması [localhost:5000](http://127.0.0.1:5000) üzerinde çalışır. Debug modu varsayılan olarak kapalıdır; geliştirme için `FLASK_DEBUG=1` ayarlanabilir.

## n8n

`Proje/n8n-ocr-workflow.json` iş akışını n8n’e aktarın ve etkinleştirin. Web sunucusunda `N8N_WEBHOOK_URL` ortam değişkenini gerçek webhook adresine ayarlayın. Arayüzden URL kabul edilmez; istemcilerin sunucuyu keyfi adreslere istek göndermek için kullanması engellenir. Docker ağında adres örneği: `http://n8n:5678/webhook/ocr-data`.

## Veri ve dağıtım sınırları

Bu uygulama tek kullanıcılı yerel/portföy demosudur. Kimlik doğrulama yoktur ve geçmiş sunucu kullanıcıları arasında ortaktır; hassas CV’leri internete açık bir kurulumda yüklemeyin. Çok kullanıcılı üretim için kimlik doğrulama, kullanıcı bazlı veri erişimi ve işlem sınırları eklenmelidir. Son 15 kaydın dışındaki analizler yeni kayıt sırasında silinir. Vercel’de `/tmp` geçmişi geçicidir ve OCR sistem bağımlılıkları kullanılamaz; metin analizi çalışır. Eski demo giriş sayfaları ana sayfaya yönlendirilir.

## Kontroller

```sh
python -m unittest discover -s tests -v
node --check Proje/static/main.js
```

Testler izole geçici veritabanıyla beceri sınırlarını, isim/deneyim ayrımını, metin doğrulamasını, geçmişi, saklama sınırını, yükleme temizliğini ve webhook hedef yapılandırmasını kontrol eder. OCR motorunun doğruluğu belge kalitesine bağlıdır.

## Lisans

MIT — [LICENSE](LICENSE).
