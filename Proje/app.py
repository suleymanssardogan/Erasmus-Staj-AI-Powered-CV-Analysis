from flask import Flask, request, jsonify, render_template
import os
import time
import re
import uuid
import shutil
from flask import redirect
import secrets
from werkzeug.security import generate_password_hash
from Proje.features import features, enrich, save_private, csrf
from werkzeug.utils import secure_filename


# OCR bağımlılıkları (Tesseract/OpenCV/Poppler) yalnızca sistem kütüphaneleriyle birlikte
# kurulu ortamlarda (Docker imajı, yerel kurulum) mevcuttur. Bu paketler olmadan da uygulamanın
# geri kalanının (arayüz ve metin analizi) çökmeden ayağa kalkabilmesi için
# import'lar burada opsiyonel tutulur; OCR_AVAILABLE bayrağı /api/ocr içinde kontrol edilir.
try:
    import cv2
    import numpy as np
    import pytesseract
    from PIL import Image
    from pdf2image import convert_from_path
    OCR_AVAILABLE = bool(shutil.which("tesseract"))
except ImportError:
    OCR_AVAILABLE = False

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

# Vercel'in serverless çalışma zamanında dosya sistemi salt-okunurdur; /tmp dışına yazılamaz.
IS_SERVERLESS = bool(os.environ.get("VERCEL"))

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY')
if not app.secret_key and not IS_SERVERLESS:
    key_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.session-key')
    if not os.path.exists(key_path):
        with open(key_path, 'w') as key_file:
            key_file.write(secrets.token_urlsafe(48))
        os.chmod(key_path, 0o600)
    with open(key_path) as key_file:
        app.secret_key = key_file.read().strip()
# Guest analysis remains usable when account infrastructure isn't configured.
# A process-local key cannot enable persistent serverless accounts.
if not app.secret_key:
    app.secret_key = secrets.token_urlsafe(48)
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE='Lax',
                  SESSION_COOKIE_SECURE=IS_SERVERLESS,
                  DUMMY_PASSWORD_HASH=generate_password_hash('invalid-password', method='pbkdf2:sha256:600000'))
app.register_blueprint(features)
app.before_request(csrf)
UPLOAD_FOLDER = "/tmp/uploads" if IS_SERVERLESS else "uploads"
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'pdf'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB

# Veritabanını ve Upload klasörünü başlat

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

if OCR_AVAILABLE:
    # TESSDATA_PREFIX ortam değişkenini proje düzeyindeki yerel klasörü kullanacak şekilde ayarla
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.environ["TESSDATA_PREFIX"] = os.path.join(root_dir, "tessdata")

    # Tesseract yolunu macOS ve Linux için yapılandır
    tesseract_paths = [
        "/usr/bin/tesseract",
        "/usr/local/bin/tesseract",
        "/opt/homebrew/bin/tesseract"
    ]
    for path in tesseract_paths:
        if os.path.exists(path):
            pytesseract.pytesseract.tesseract_cmd = path
            break

def allowed_file(filename):
    """Dosya uzantısının izin verilen türde olup olmadığını kontrol eder"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_ner_entities(text):
    """Metinden kural tabanlı olarak Kişi, Kurum ve Lokasyon varlıklarını (NER) ayıklar"""
    if not text:
        return {"persons": [], "orgs": [], "locs": []}
        
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    # 1. Kişi Varlıkları (Persons)
    persons = []
    explicit_name_pattern = r'\b(?:adı?\s*soyadı?|name|candidate)\s*:\s*([A-ZÇĞİÖŞÜa-zçğıöşü \t]+)'
    explicit_match = re.search(explicit_name_pattern, text, re.IGNORECASE)
    if explicit_match:
        name = explicit_match.group(1).strip()
        if len(name.split()) >= 2 and len(name) < 40:
            persons.append(name)
            
    if not persons:
        exclude_words = ["cv", "resume", "curriculum", "özgeçmiş", "analiz", "e-posta", "telefon", "tarih", "skills", "beceriler", "experience", "deneyim"]
        for line in lines[:6]:
            line_clean = line.strip()
            words = line_clean.split()
            if 2 <= len(words) <= 3 and all(w[0].isupper() if w else False for w in words):
                if not any(ex in line_clean.lower() for ex in exclude_words):
                    if len(line_clean) < 35:
                        persons.append(line_clean)
                        break
                        
    # 2. Kurum / Kuruluşlar (Organizations)
    orgs = []
    org_pattern = r'\b[A-ZÇĞİÖŞÜa-zçğıöşü0-9\s.-]*(?:Üniversitesi|Universitesi|University|LTD\.|LTD|ŞTİ\.|A\.Ş\.|Inc\.|Inc|LLC|Corp|Bankası|Bank|Technologies|Solutions|Holding|Belediyesi)\b'
    raw_orgs = re.findall(org_pattern, text)
    for org in raw_orgs:
        org_clean = org.strip()
        if 5 < len(org_clean) < 80 and not any(ch.isdigit() for ch in org_clean[:3]):
            orgs.append(org_clean)
    orgs = list(set(orgs))
    
    # 3. Lokasyonlar (Locations)
    locs = []
    city_list = ["İstanbul", "Istanbul", "Ankara", "İzmir", "Izmir", "Bursa", "Antalya", "Adana", "Kocaeli", "Sakarya", "Eskişehir", "Eskisehir", "Trabzon", "Samsun", "Konya", "Gaziantep", "London", "New York", "San Francisco", "Germany", "Turkey", "Türkiye", "Muğla", "Mugla", "Denizli", "Aydın", "Aydin"]
    for city in city_list:
        if re.search(r'\b' + re.escape(city) + r'\b', text, re.IGNORECASE):
            locs.append(city)
            
    address_pattern = r'\b(?:adres|address)\s*:\s*([A-ZÇĞİÖŞÜa-zçğıöşü0-9\s,.-]+)'
    addr_match = re.search(address_pattern, text, re.IGNORECASE)
    if addr_match:
        addr = addr_match.group(1).strip()
        parts = [p.strip() for p in addr.split(',') if p.strip()]
        if parts:
            last_part = parts[-1]
            if len(last_part) < 25 and last_part not in locs:
                locs.append(last_part)
                
    return {
        "persons": list(set(persons)),
        "orgs": orgs[:10],
        "locs": list(set(locs))[:6]
    }

def extract_metadata(text):
    """Metinden E-posta, Telefon, Tarih, Linkler ve NER Varlıklarını çıkarır"""
    if not text:
        return {"emails": [], "phones": [], "dates": [], "urls": [], "ner": {"persons": [], "orgs": [], "locs": []}}
    
    emails = list(set(re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)))
    
    phone_pattern = r'(?:\+?90|0)?\s*5\d{2}\s*[-.\s]?\d{3}\s*[-.\s]?\d{2}\s*[-.\s]?\d{2}|\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}'
    raw_phones = re.findall(phone_pattern, text)
    phones = []
    for p in raw_phones:
        cleaned = re.sub(r'[^\d+]', '', p)
        if len(cleaned) >= 10:
            phones.append(p.strip())
    phones = list(set(phones))
    
    date_pattern = r'\b\d{2}[./-]\d{2}[./-]\d{4}\b|\b\d{4}[./-]\d{2}[./-]\d{2}\b'
    dates = list(set(re.findall(date_pattern, text)))
    
    url_pattern = r'(?:https?://|www\.)[a-zA-Z0-9-._~:/?#\[\]@!$&\'()*+,;=%]+'
    raw_urls = re.findall(url_pattern, text)
    urls = list(set([u.strip() for u in raw_urls]))
    
    # NER Varlıkları
    ner = extract_ner_entities(text)
    
    return {
        "emails": emails,
        "phones": phones,
        "dates": dates,
        "urls": urls,
        "ner": ner
    }

def get_best_ocr_lang():
    """Sistemde mevcut olan en iyi dil paketini seçer (öncelik Türkçe)"""
    if not OCR_AVAILABLE:
        return 'unavailable'
    try:
        available_langs = pytesseract.get_languages()
        if 'tur' in available_langs:
            return 'tur+eng' if 'eng' in available_langs else 'tur'
        return 'eng'
    except Exception:
        return 'eng'

def deskew_image(image):
    """Görüntünün eğriliğini tespit eder ve düzeltir"""
    try:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        gray = cv2.bitwise_not(gray)
        thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
        
        coords = np.column_stack(np.where(thresh > 0))
        angle = cv2.minAreaRect(coords)[-1]
        
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
            
        if abs(angle) < 0.5 or abs(angle) > 45:
            return image
            
        (h, w) = image.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        return rotated
    except Exception as e:
        print(f"Eğrilik düzeltme hatası: {e}")
        return image

def analyze_cv_content(text):
    """CV içeriğini analiz eder: Becerileri, Eğitim ve Deneyim ifadelerini ayrıştırır"""
    if not text:
        return {"skills": [], "education": [], "experience": []}
        
    text_lower = text.lower()
    
    # Beceriler (Skills) Tanımlamaları
    technologies = ["Python", "Java", "C++", "C#", "JavaScript", "TypeScript", "HTML", "CSS", "React", "Vue", "Angular", "Node.js", "Django", "Flask", "FastAPI", "SQL", "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Git", "GitHub", "Docker", "Kubernetes", "AWS", "Azure", "GCP", "OpenCV", "PyTorch", "TensorFlow", "Excel", "Scrum", "Agile"]
    skills_dict = {name: r"(?<!\w)" + re.escape(name.lower()) + r"(?!\w)" for name in technologies}

    found_skills = []
    for skill, pattern in skills_dict.items():
        if re.search(pattern, text_lower):
            found_skills.append(skill)
            
    # Eğitim ve Deneyim Anahtar Kelimeleri (Türkçe, İngilizce ve Lehçe desteğiyle)
    education_keywords = [
        "üniversite", "universite", "university", "lise", "school", "szkoła", 
        "lisans", "doktora", "bachelor", "master", "phd", "mezun", "okul", "kolej", 
        "college", "student", "öğrenci", "öğrencisi", "fakülte", "faculty", "enstitü", 
        "institute", "academy", "akademisi", "wsti", "öğrenimi", "uniwersytet", "academic", "akademik"
    ]
    
    experience_keywords = [
        "staj", "intern", "traineeship", "deneyim", "tecrübe", "experience", 
        "yıl", "year", "engineer", "mühendis", "developer", "geliştirici", "yönetici", 
        "manager", "çalıştı", "görev", "engineered", "collaborated", "worked", "working",
        "tasarladı", "geliştirdi", "yönetti", "kodladı", "built", "designed", "implemented"
    ]
    
    found_education = []
    found_experience = []
    
    for line in text.split('\n'):
        line_clean = line.strip()
        if not line_clean or len(line_clean) < 8 or len(line_clean) > 150:
            continue
            
        line_lower = line_clean.lower()
        
        # Skorları hesapla
        edu_score = sum(1 for kw in education_keywords if kw in line_lower)
        exp_score = sum(1 for kw in experience_keywords if re.search(r"(?<!\w)" + re.escape(kw) + r"(?!\w)", line_lower))
        
        # Güçlü belirteçler
        has_strong_edu = any(kw in line_lower for kw in ["student", "öğrenci", "üniversite", "universite", "university", "szkoła", "wsti", "college", "bachelor", "lisans"])
        has_strong_exp = any(kw in line_lower for kw in ["worked", "çalıştı", "geliştirdi", "tasarladı", "yönetti", "kodladı", "engineered", "collaborated"])
        
        if edu_score > 0 and (edu_score >= exp_score or has_strong_edu) and not has_strong_exp:
            if line_clean not in found_education:
                found_education.append(line_clean)
        elif exp_score > 0:
            if has_strong_edu and not has_strong_exp:
                if line_clean not in found_education:
                    found_education.append(line_clean)
            else:
                # Hem staj hem üniversite geçiyorsa iki tarafa da eklenebilir
                if "staj" in line_lower or "intern" in line_lower or "traineeship" in line_lower:
                    if has_strong_edu and line_clean not in found_education:
                        found_education.append(line_clean)
                if line_clean not in found_experience:
                    found_experience.append(line_clean)
                    
    return {
        "skills": found_skills,
        "education": found_education[:5],
        "experience": found_experience[:8]
    }

def preprocess_image(image_path, binarization_mode="otsu", auto_deskew=False):
    """OpenCV ile OCR kalitesini artırmak için görsel ön işleme yapar"""
    try:
        img = cv2.imread(image_path)
        if img is None:
            return None
        
        # 1. Eğrilik Düzeltme
        if auto_deskew:
            img = deskew_image(img)
            
        # 2. Gri tonlamaya çevir
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
        
        # 3. Gürültü azaltma
        denoised = cv2.bilateralFilter(gray, 9, 75, 75)
        
        # 4. Eşikleme (Binarization)
        if binarization_mode == "otsu":
            _, thresh = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            result_img = thresh
        elif binarization_mode == "adaptive":
            result_img = cv2.adaptiveThreshold(
                denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                cv2.THRESH_BINARY, 11, 2
            )
        else:
            result_img = denoised
        
        preprocessed_path = image_path + ".preprocessed.png"
        cv2.imwrite(preprocessed_path, result_img)
        return preprocessed_path
    except Exception as e:
        print(f"Görüntü ön işleme hatası: {e}")
        return None

def extract_text_from_image(image_path, lang, binarization_mode="otsu", auto_deskew=False):
    """Görselden Tesseract OCR ile metin çıkarır"""
    preprocessed_path = preprocess_image(image_path, binarization_mode, auto_deskew)
    img_to_ocr = preprocessed_path if preprocessed_path else image_path
    
    try:
        img = Image.open(img_to_ocr)
        text = pytesseract.image_to_string(img, lang=lang)
        
        if preprocessed_path and os.path.exists(preprocessed_path):
            os.remove(preprocessed_path)
            
        return text.strip()
    except Exception as e:
        print(f"Görsel OCR hatası: {e}")
        try:
            img = Image.open(image_path)
            text = pytesseract.image_to_string(img, lang=lang)
            return text.strip()
        except Exception as e_inner:
            print(f"Alternatif OCR hatası: {e_inner}")
            return ""

def extract_text_from_pdf(pdf_path, lang, binarization_mode="otsu", auto_deskew=False):
    """PDF dosyasından metin çıkarır. Seçilebilir metin yoksa OCR yapar."""
    text = ""
    try:
        if PdfReader is None:
            return ''
        reader = PdfReader(pdf_path)
        if reader.is_encrypted or len(reader.pages)>20:
            return ''
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        
        if len(text.strip()) > 50:
            return text.strip()
    except Exception as e:
        print(f"Dijital PDF metin okuma başarısız oldu, OCR deneniyor: {e}")
    
    if not OCR_AVAILABLE:
        return text.strip()
    try:
        pages = convert_from_path(pdf_path, dpi=150, last_page=20)
        ocr_text = []
        for i, page in enumerate(pages):
            temp_page_path = f"{pdf_path}_page_{i}.png"
            page.save(temp_page_path, 'PNG')
            
            page_text = extract_text_from_image(temp_page_path, lang=lang, binarization_mode=binarization_mode, auto_deskew=auto_deskew)
            ocr_text.append(page_text)
            
            if os.path.exists(temp_page_path):
                os.remove(temp_page_path)
                
        return "\n--- Sayfa --- \n".join(ocr_text).strip()
    except Exception as e:
        print(f"PDF OCR Hatası: {e}")
        return text.strip()

@app.route("/")
def index():
    """Ana sayfa"""
    return render_template("index.html")

@app.route("/login")
def login():
    """Giriş sayfası"""
    return redirect("/")

@app.route("/register")
def register():
    """Kayıt sayfası"""
    return redirect("/")

@app.route("/test")
def test():
    return "Flask çalışıyor!"

@app.route("/api/ocr", methods=["POST"])
def upload_file():
    """Dosya yükleme ve OCR işlemi"""
    start_time = time.time()
    file_path = None
    try:
        # Dosya varlığını kontrol et
        if "file" not in request.files:
            return jsonify({
                "success": False, 
                "error": "Dosya alanı eksik"
            }), 400
        
        file = request.files["file"]
        
        # Dosya adı kontrolü
        if file.filename == "":
            return jsonify({
                "success": False,
                "error": "Dosya seçilmedi"
            }), 400
        
        # Dosya uzantısı kontrolü
        if not allowed_file(file.filename):
            return jsonify({
                "success": False,
                "error": "Desteklenmeyen dosya formatı. İzin verilen formatlar: PNG, JPG, JPEG, GIF, BMP, TIFF, PDF"
            }), 400
        
        # Dosyayı kaydet
        filename = secure_filename(file.filename) or 'document.' + file.filename.rsplit('.', 1)[1].lower()
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], uuid.uuid4().hex + '.' + file.filename.rsplit('.', 1)[1].lower())
        file.save(file_path)
        
        # En iyi dil seçeneğini al
        ocr_lang = get_best_ocr_lang()
        
        # OpenCV ayarlarını al
        binarization_mode = request.form.get("binarization_mode", "otsu")
        auto_deskew = request.form.get("auto_deskew", "false").lower() == "true"
        
        # Dosya uzantısına göre işlem yap
        file_ext = filename.rsplit('.', 1)[1].lower()
        
        if file_ext != 'pdf' and not OCR_AVAILABLE:
            return jsonify(success=False, error='Bu ortamda görseli tarayıcı OCR ile analiz edin.'), 503
        if file_ext == 'pdf':
            extracted_text = extract_text_from_pdf(file_path, ocr_lang, binarization_mode, auto_deskew)
        else:
            extracted_text = extract_text_from_image(file_path, ocr_lang, binarization_mode, auto_deskew)
            
        if not extracted_text.strip():
            return jsonify(success=False, error="Okunabilir metin bulunamadı. Daha net bir dosya veya metin girişi kullanın."), 422
        processing_time = round(time.time() - start_time, 2)
        
        # Kaydedilen geçici dosyayı temizle (Opsiyonel: Eğer saklamak istemiyorsak)
        # os.remove(file_path)
        
        # Metadata ve CV analizi
        metadata = extract_metadata(extracted_text)
        cv_analysis = analyze_cv_content(extracted_text)
        metadata["cv_analysis"] = cv_analysis
        
        metadata = enrich(extracted_text, metadata)
        return jsonify(save_private({
            "success": True,
            "message": "OCR işlemi başarıyla tamamlandı ve kaydedildi",
            "filename": filename,
            "extracted_text": extracted_text,
            "char_count": len(extracted_text),
            "word_count": len(extracted_text.split()) if extracted_text else 0,
            "processing_time": processing_time,
            "metadata": metadata
        })), 200
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "Belge işlenemedi. Dosyanın geçerli ve okunabilir olduğunu kontrol edin."
        }), 500

    finally:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)

@app.route("/api/analyze", methods=["POST"])
def analyze_text():
    data = request.get_json(silent=True)
    text = data.get("text") if isinstance(data, dict) else None
    if not isinstance(text, str) or not 20 <= len(text.strip()) <= 100000:
        return jsonify(success=False, error="20–100.000 karakter arasında bir CV metni girin."), 400
    text = text.strip()
    metadata = extract_metadata(text)
    metadata["cv_analysis"] = analyze_cv_content(text)
    job = data.get('job', '')
    excluded = data.get('excluded', [])
    from Proje.features import TECHNOLOGIES
    if not isinstance(job, str) or len(job)>30000 or not isinstance(excluded,list) or any(s not in TECHNOLOGIES for s in excluded):
        return jsonify(success=False,error='Geçersiz ilan veya beceri seçimi.'),400
    metadata = enrich(text, metadata, job, excluded)
    filename = data.get('filename','Metin analizi')
    if not isinstance(filename,str) or len(filename)>255:
        return jsonify(success=False,error='Geçersiz belge adı.'),400
    return jsonify(save_private(dict(success=True, filename=filename, extracted_text=text,
                   char_count=len(text), word_count=len(text.split()), processing_time=0, metadata=metadata)))

@app.route('/api/history')
@app.route('/api/history/<int:doc_id>')
def retired_history(doc_id=None):
    return jsonify(success=False, error='Ortak geçmiş kapatıldı. Kullanıcıya özel geçmiş için giriş yapın.'), 410

@app.route("/api/health", methods=["GET"])
def health_check():
    """Sistem sağlık kontrolü"""
    return jsonify({
        "status": "healthy",
        "message": "OCR Sistemi çalışıyor" if OCR_AVAILABLE else "Sistem çalışıyor (bu dağıtımda OCR devre dışı)",
        "ocr_available": OCR_AVAILABLE,
        "pdf_available": PdfReader is not None,
        "upload_folder": UPLOAD_FOLDER,
        "allowed_extensions": list(ALLOWED_EXTENSIONS),
        "tesseract_lang": get_best_ocr_lang()
    }), 200

@app.errorhandler(413)
def too_large(e):
    """Dosya boyutu çok büyük hatası"""
    return jsonify({
        "success": False,
        "error": "Dosya boyutu çok büyük. Maksimum 16MB"
    }), 413

@app.errorhandler(404)
def not_found(e):
    """Endpoint bulunamadı hatası"""
    return jsonify({
        "success": False,
        "error": "Endpoint bulunamadı"
    }), 404

if __name__ == '__main__':
    print("🚀 OCR Belge Sistemi başlatılıyor...")
    print(f"📁 Upload klasörü: {UPLOAD_FOLDER}")
    print(f"📋 Desteklenen formatlar: {', '.join(ALLOWED_EXTENSIONS)}")
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1", port=5001)