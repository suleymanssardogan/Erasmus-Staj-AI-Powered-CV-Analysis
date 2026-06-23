import sys
import os

# Projenin kök dizinini Python yoluna ekle
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from Proje.app import app

if __name__ == '__main__':
    print("🚀 OCR Belge Okuma ve Otomasyon Sistemi başlatılıyor...")
    app.run(debug=True)