import sqlite3
import os
import json

DB_PATH = "documents.db"

def init_db():
    """Veritabanını ve belgeler tablosunu başlatır"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            extracted_text TEXT NOT NULL,
            char_count INTEGER,
            word_count INTEGER,
            processing_time REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            metadata TEXT
        )
    ''')
    conn.commit()
    conn.close()

def save_document(filename, extracted_text, char_count, word_count, processing_time, metadata):
    """Belge verilerini veritabanına kaydeder"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO documents (filename, extracted_text, char_count, word_count, processing_time, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (filename, extracted_text, char_count, word_count, processing_time, json.dumps(metadata)))
    doc_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return doc_id

def get_documents_history():
    """Son yüklenen 15 belgenin geçmişini listeler"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT id, filename, char_count, created_at FROM documents ORDER BY created_at DESC LIMIT 15')
        rows = cursor.fetchall()
        conn.close()
        
        history = []
        for r in rows:
            history.append({
                "id": r["id"],
                "filename": r["filename"],
                "char_count": r["char_count"],
                "created_at": r["created_at"]
            })
        return history
    except Exception as e:
        print(f"Veritabanı geçmişi okuma hatası: {e}")
        return []

def get_document_by_id(doc_id):
    """Belirtilen ID'deki belgenin detaylarını getirir"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM documents WHERE id = ?', (doc_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return {
                "id": row["id"],
                "filename": row["filename"],
                "extracted_text": row["extracted_text"],
                "char_count": row["char_count"],
                "word_count": row["word_count"],
                "processing_time": row["processing_time"],
                "created_at": row["created_at"],
                "metadata": json.loads(row["metadata"]) if row["metadata"] else {}
            }
        return None
    except Exception as e:
        print(f"Belge detayı getirme hatası: {e}")
        return None
