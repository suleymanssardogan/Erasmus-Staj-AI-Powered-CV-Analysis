# syntax=docker/dockerfile:1

# ---------- Stage 1: builder ----------
# Bağımlılıkları izole bir virtualenv içine kurar; derleme araçları
# (gcc vb. gerekirse) bu aşamada kalır ve runtime imajına taşınmaz.
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements-full.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements-full.txt

# ---------- Stage 2: runtime ----------
# Yalnızca çalışma zamanı için gereken sistem kütüphaneleri (derleme araçları hariç)
# ve önceki aşamada hazırlanmış virtualenv kopyalanır; bu imaj daha küçük ve daha güvenlidir.
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Tesseract OCR, Türkçe dil paketi, OpenCV runtime bağımlılıkları ve Poppler
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-tur \
    libgl1 \
    libglib2.0-0 \
    poppler-utils \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv

COPY app.py .
COPY Proje/ ./Proje/
COPY tessdata/ ./tessdata/

RUN useradd --create-home --shell /bin/bash appuser && \
    mkdir -p /app/uploads /app/data && \
    chown -R appuser:appuser /app
USER appuser

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "120", "app:app"]
