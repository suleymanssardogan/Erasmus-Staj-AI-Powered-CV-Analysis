from flask import Flask, request, jsonify, render_template
import os
import time
from werkzeug.utils import secure_filename
import cv2
import numpy as np
import pytesseract
from PIL import Image
from pypdf import PdfReader
from pdf2image import convert_from_path

app = Flask(__name__)
UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'pdf'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB

# Upload klasörünü oluştur
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

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

def get_best_ocr_lang():
    """Sistemde mevcut olan en iyi dil paketini seçer (öncelik Türkçe)"""
    try:
        available_langs = pytesseract.get_languages()
        if 'tur' in available_langs:
            return 'tur+eng'
        return 'eng'
    except Exception:
        return 'eng'

def preprocess_image(image_path):
    """OpenCV ile OCR kalitesini artırmak için görsel ön işleme yapar"""
    try:
        img = cv2.imread(image_path)
        if img is None:
            return None
        
        # 1. Gri tonlamaya çevir (Grayscale)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # 2. Gürültü azaltma (Bilateral Filter kenarları korur)
        denoised = cv2.bilateralFilter(gray, 9, 75, 75)
        
        # 3. Eşikleme (Binarization - Otsu Thresholding)
        _, thresh = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Ön işlenmiş görseli geçici olarak kaydet
        preprocessed_path = image_path + ".preprocessed.png"
        cv2.imwrite(preprocessed_path, thresh)
        return preprocessed_path
    except Exception as e:
        print(f"Görüntü ön işleme hatası: {e}")
        return None

def extract_text_from_image(image_path, lang):
    """Görselden Tesseract OCR ile metin çıkarır"""
    preprocessed_path = preprocess_image(image_path)
    img_to_ocr = preprocessed_path if preprocessed_path else image_path
    
    try:
        img = Image.open(img_to_ocr)
        text = pytesseract.image_to_string(img, lang=lang)
        
        # Geçici dosyayı temizle
        if preprocessed_path and os.path.exists(preprocessed_path):
            os.remove(preprocessed_path)
            
        return text.strip()
    except Exception as e:
        print(f"Görsel OCR hatası: {e}")
        # Ön işleme başarısız olduysa orijinal görsel ile tekrar dene
        try:
            img = Image.open(image_path)
            text = pytesseract.image_to_string(img, lang=lang)
            return text.strip()
        except Exception as e_inner:
            print(f"Alternatif OCR hatası: {e_inner}")
            return ""

def extract_text_from_pdf(pdf_path, lang):
    """PDF dosyasından metin çıkarır. Seçilebilir metin yoksa OCR yapar."""
    text = ""
    try:
        # Önce dijital metin çıkarımını dene
        reader = PdfReader(pdf_path)
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        
        # Eğer yeterli metin çıkarıldıysa döndür
        if len(text.strip()) > 50:
            return text.strip()
    except Exception as e:
        print(f"Dijital PDF metin okuma başarısız oldu, OCR deneniyor: {e}")
    
    # Görsel tabanlı/taranmış PDF ise OCR yap
    try:
        pages = convert_from_path(pdf_path, dpi=150)
        ocr_text = []
        for i, page in enumerate(pages):
            temp_page_path = f"{pdf_path}_page_{i}.png"
            page.save(temp_page_path, 'PNG')
            
            page_text = extract_text_from_image(temp_page_path, lang=lang)
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

@app.route("/test")
def test():
    return "Flask çalışıyor!"

@app.route("/api/ocr", methods=["POST"])
def upload_file():
    """Dosya yükleme ve OCR işlemi"""
    start_time = time.time()
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
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        
        # En iyi dil seçeneğini al
        ocr_lang = get_best_ocr_lang()
        
        # Dosya uzantısına göre işlem yap
        file_ext = filename.rsplit('.', 1)[1].lower()
        
        if file_ext == 'pdf':
            extracted_text = extract_text_from_pdf(file_path, ocr_lang)
        else:
            extracted_text = extract_text_from_image(file_path, ocr_lang)
            
        processing_time = round(time.time() - start_time, 2)
        
        # Kaydedilen geçici dosyayı temizle (Opsiyonel: Eğer saklamak istemiyorsak)
        # os.remove(file_path)
        
        return jsonify({
            "success": True,
            "message": "OCR işlemi başarıyla tamamlandı",
            "filename": filename,
            "extracted_text": extracted_text,
            "char_count": len(extracted_text),
            "word_count": len(extracted_text.split()),
            "processing_time": processing_time
        }), 200
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Sunucu hatası: {str(e)}"
        }), 500

@app.route("/api/health", methods=["GET"])
def health_check():
    """Sistem sağlık kontrolü"""
    return jsonify({
        "status": "healthy",
        "message": "OCR Sistemi çalışıyor",
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
    app.run(debug=True)