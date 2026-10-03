# CV Studio — Erasmus Internship Project

Açıklanabilir CV analizi: dosyadan metin çıkarma, beceri kaynakları, iş ilanıyla karşılaştırma, özel hesap geçmişi, sürüm karşılaştırması ve indirilebilir PDF raporu.

## Kullanım

1. PDF veya görsel ekleyin; isterseniz metin yapıştırın veya örnek CV’yi açın.
2. Her teknik becerinin kaynak cümlelerini inceleyin. Yanlış tespiti hariç tutun; çıkarılan metni düzeltip yeniden analiz edin.
3. Bir iş ilanı yapıştırın. Teknik sözlükteki gereksinimler, CV ve ilan kanıtlarıyla karşılaştırılır.
4. Eski CV metnini veya hesap geçmişinden önceki analizi seçin; eklenen/çıkarılan becerileri ve satır farklarını inceleyin.
5. PDF raporu veya JSON çıktısı indirin.

Kural tabanlı analiz kullanılır; LLM veya işe alım puanı yoktur. Sözlük dışındaki beceriler, kıdem, zorunlu/tercih edilen gereksinim ayrımı ve tüm ilan gereksinimleri değerlendirilmez. Metinde bulunmak beceri seviyesi kanıtı değildir.

## Dosya analizi ve gizlilik

Dosyalar tarayıcıda PDF.js ve Tesseract.js ile okunur. Dijital PDF sayfalarında metin çıkarımı, taranmış sayfalarda Türkçe/İngilizce OCR kullanılır. Dosya sınırı 16 MB ve 20 sayfadır. Görsel desteği PNG, JPG/JPEG, GIF ve BMP’dir. Şifreli/geçersiz PDF’ler hata verir. İlk OCR çalıştırması dil modellerini indirdiğinden daha uzun sürebilir; düşük bellekli cihazlarda büyük taramalar başarısız olabilir.

Asıl dosya sunucuya gönderilmez. Çıkarılan CV metni ve girilen ilan metni analiz için aynı uygulamanın sunucusuna gönderilir. Bileşenler sabit sürümlerle jsDelivr üzerinden indirilir; OCR, tarayıcı WebAssembly worker’ında çalışır. Misafir analizleri veritabanına yazılmaz. Eski ortak geçmiş uçları kapatılmıştır; eski `documents.db` kayıtları yeni hesaplara aktarılmaz veya gösterilmez.

Backend `/api/ocr` alternatifi dijital PDF için pypdf, yerel OCR için Tesseract/OpenCV/Poppler kullanır. Yüklenen dosya işlem sonunda silinir.

## Hesaplar ve kalıcı saklama

E-posta/parola kaydı ve giriş gerçek sunucu doğrulaması kullanır. Parolalar PBKDF2 ile hash’lenir; tarayıcıda parola saklanmaz. Oturum çerezleri HttpOnly/SameSite=Lax, Vercel’de Secure’dur. Yazma işlemlerinde CSRF kontrolü ve giriş denemelerinde veritabanı tabanlı sınır vardır. Kullanıcı yalnızca kendi analizlerini okuyabilir/silebilir. E-posta doğrulaması ve parola sıfırlama henüz yoktur.

Saklama süresi 7, 30 veya 90 gün seçilebilir. Süresi dolan kayıtlar erişilemez ve sonraki veritabanı işlemi sırasında temizlenir; bağımsız zamanlanmış temizleme görevi yoktur. Süreyi kısaltmak mevcut kayıtların kalan süresini sınırlar; uzatmak silinmiş kayıtları geri getirmez. Sil düğmesi kalıcı siler. Geçmiş en yeni 100 analizi gösterir. Düzeltilmiş becerileri ve ilan karşılaştırmasını geçmişe kaydetmek için yeniden analiz edin.

Yerelde SQLite (`accounts.db`), Vercel’de PostgreSQL kullanılır. **Vercel’de hesapların etkinleşmesi için `DATABASE_URL` ve uzun, rastgele bir `SECRET_KEY` gerekir.** Yapılandırma yoksa misafir analizleri çalışır; kalıcı hesaplar kapalı kalır. PostgreSQL bağlantısında `sslmode=require` kullanın. Ortam değişkenleri `.env.example` içinde açıklanır; `.env` dosyası Flask tarafından otomatik yüklenmez, terminalde export edin veya Docker Compose/Vercel ayarlarına ekleyin. Uygulama kendi tablolarını oluşturur; mevcut ortak belge tablosunu değiştirmez.

## Yerel çalıştırma

Python 3.11 önerilir:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

[localhost:5001](http://127.0.0.1:5001) adresinden açılır. Yerel oturum anahtarı `.session-key` dosyasında oluşturulur ve Git’e gönderilmez. Çok worker’lı kurulumlarda aynı `SECRET_KEY` kullanılmalıdır.

Docker için `.env` içine rastgele `SECRET_KEY` koyup:

```sh
docker compose up --build
```

[localhost:5000](http://127.0.0.1:5000) üzerinden açılır. Hesap veritabanı Docker volume’unda saklanır. Backend OCR için `requirements-full.txt`, Tesseract tur/eng paketleri ve Poppler gerekir. Debug varsayılan kapalıdır.

## n8n

`Proje/n8n-ocr-workflow.json` iş akışını içe aktarın ve etkinleştirin. Sunucuda `N8N_WEBHOOK_URL` ayarlayın; arayüz keyfi hedef URL kabul etmez. Kullanıcı düğmeye bastığında açık analizi bu hedefe gönderir.

## Doğrulama

```sh
python -m unittest discover -s tests -v
node --check Proje/static/main.js
```

Testler beceri/kanıt çıkarımı, ilan karşılaştırması, sürüm farkları, CSRF, kayıt/giriş, kullanıcılar arası erişim, silme, süre dolumu, misafir gizliliği, dijital PDF okuma ve PDF rapor çıktısını doğrular. PostgreSQL bağlantısı canlı ortam değişkenleri sağlandıktan sonra ayrıca doğrulanmalıdır.

Teknolojiler: Flask, SQLite/PostgreSQL, PDF.js, Tesseract.js, pypdf, ReportLab; opsiyonel backend Tesseract/OpenCV ve n8n.

Referanslar: [PDF.js örnekleri](https://mozilla.github.io/pdf.js/examples/), [Tesseract.js](https://github.com/naptha/tesseract.js), [Psycopg](https://www.psycopg.org/psycopg3/docs/).

MIT — [LICENSE](LICENSE).
