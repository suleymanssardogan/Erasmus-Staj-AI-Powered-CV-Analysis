import sys
import os

# Projenin kök dizinini Python yoluna ekle (Vercel bu dosyayı api/ altından, izole olarak çalıştırır)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from Proje.app import app

# Vercel'in Python runtime'ı bu modüldeki WSGI uygulamasını ("app") otomatik olarak kullanır.
