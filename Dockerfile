# Python slim resmi imajını kullan
FROM python:3.11-slim

# Çevre değişkenlerini ayarla
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Çalışma dizinini oluştur
WORKDIR /app

# Gerekli sistem bağımlılıklarını kur (Tesseract OCR, Türkçe Dil Paketi, OpenCV bağımlılıkları ve Poppler)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-tur \
    libgl1-mesa-glx \
    libglib2.0-0 \
    poppler-utils \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Bağımlılıkları kopyala ve kur
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Uygulama dosyalarını kopyala
COPY app.py .
COPY Proje/ ./Proje/

# Portu dışarı aç
EXPOSE 5000

# Gunicorn ile uygulamayı başlat
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "120", "app:app"]
