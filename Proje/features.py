"""Account-scoped persistence and explainable CV comparison."""
import os
import json
import re
import sqlite3
import secrets
import hashlib
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, jsonify, session, current_app, send_file
from werkzeug.security import generate_password_hash, check_password_hash

features = Blueprint('features', __name__)
DB_PATH = os.environ.get('ACCOUNT_DB_PATH', 'accounts.db')
TECHNOLOGIES = ['Python', 'Java', 'C++', 'C#', 'JavaScript', 'TypeScript', 'HTML', 'CSS', 'React', 'Vue', 'Angular', 'Node.js', 'Django', 'Flask', 'FastAPI', 'SQL', 'PostgreSQL', 'MySQL', 'SQLite', 'MongoDB', 'Git', 'GitHub', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'n8n', 'OpenCV', 'PyTorch', 'TensorFlow', 'Pandas', 'NumPy', 'Excel', 'Scrum', 'Agile', 'REST', 'GraphQL', 'Linux', 'Figma', 'CI/CD', 'Testing']

def evidence(text):
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return {skill: [line[:600] + ('…' if len(line)>600 else '') for line in lines if re.search(r'(?<!\w)' + re.escape(skill) + r'(?!\w)', line, re.I)][:4]
            for skill in TECHNOLOGIES if re.search(r'(?<!\w)' + re.escape(skill) + r'(?!\w)', text, re.I)}

def compare_job(text, job, excluded=()):
    requirements = evidence(job)
    cv = evidence(text)
    return {'requirements': list(requirements), 'matched': [{'skill': skill, 'cv_evidence': cv[skill], 'job_evidence': lines} for skill, lines in requirements.items() if skill in cv and skill not in excluded],
            'missing': [{'skill': skill, 'job_evidence': lines} for skill, lines in requirements.items() if skill not in cv or skill in excluded],
            'note': 'Yalnızca teknik sözlükte tanınan terimler karşılaştırılır; deneyim seviyesi ve tüm ilan gereksinimleri değerlendirilmez.'}

def enrich(text, metadata, job='', excluded=()):
    proofs = evidence(text)
    metadata['cv_analysis']['skills'] = [skill for skill in proofs if skill not in excluded]
    metadata['skill_evidence'] = proofs
    metadata['excluded_skills'] = list(excluded)
    metadata['job_text'] = job
    metadata['job_match'] = compare_job(text, job, excluded)
    return metadata

class Connection:
    def __init__(self, conn, postgres):
        self.conn, self.postgres = conn, postgres
    def execute(self, query, args=()):
        return self.conn.execute(query.replace('?', '%s') if self.postgres else query, args)

@contextmanager
def db():
    postgres = bool(os.environ.get('DATABASE_URL'))
    if postgres:
        import psycopg
        from psycopg.rows import dict_row
        conn = psycopg.connect(os.environ['DATABASE_URL'], row_factory=dict_row, connect_timeout=8)
    else:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
    try:
        yield Connection(conn, postgres)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def accounts_available():
    return bool(current_app.secret_key) and (not os.environ.get('VERCEL') or bool(os.environ.get('DATABASE_URL') and os.environ.get('SECRET_KEY')))

def init_accounts():
    with db() as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS cv_users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, retention_days INTEGER NOT NULL DEFAULT 30)')
        conn.execute('CREATE TABLE IF NOT EXISTS cv_documents (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES cv_users(id), created_at TEXT NOT NULL, expires_at TEXT NOT NULL, data TEXT NOT NULL)')
        conn.execute('CREATE TABLE IF NOT EXISTS cv_auth_attempts (key TEXT PRIMARY KEY, started REAL NOT NULL, count INTEGER NOT NULL)')
        conn.execute('DELETE FROM cv_documents WHERE expires_at<=?', (datetime.now(timezone.utc).isoformat(),))

def user():
    if not accounts_available() or not session.get('user_id'):
        return None
    init_accounts()
    with db() as conn:
        row = conn.execute('SELECT id, email, retention_days FROM cv_users WHERE id=?', (session['user_id'],)).fetchone()
    return dict(row) if row else None

def save_private(data):
    account = user()
    if not account:
        return data
    now = datetime.now(timezone.utc)
    doc_id = secrets.token_hex(16)
    data = dict(data, id=doc_id, created_at=now.isoformat())
    with db() as conn:
        conn.execute('DELETE FROM cv_documents WHERE user_id=? AND expires_at <= ?', (account['id'], now.isoformat()))
        conn.execute('INSERT INTO cv_documents VALUES (?,?,?,?,?)', (doc_id, account['id'], now.isoformat(), (now+timedelta(days=account['retention_days'])).isoformat(), json.dumps(data, ensure_ascii=False)))
    return data

def csrf():
    if request.method in ('POST','PATCH') and request.is_json and not isinstance(request.get_json(silent=True),dict):
        return jsonify(success=False,error='Geçerli bir JSON nesnesi gönderin.'),400
    if request.method in ('POST', 'PATCH', 'DELETE') and request.path.startswith('/api/'):
        if os.environ.get('VERCEL') and not os.environ.get('SECRET_KEY'):
            from urllib.parse import urlparse
            origin = request.headers.get('Origin', '')
            if request.headers.get('X-CSRF-Token') == 'guest' and urlparse(origin).netloc == request.host:
                return None
            return jsonify(success=False, error='Sayfayı yenileyip tekrar deneyin.'), 403
        supplied = request.headers.get('X-CSRF-Token', '')
        if not supplied or not secrets.compare_digest(supplied, session.get('csrf', '')):
            return jsonify(success=False, error='Oturumu yenileyip tekrar deneyin.'), 403

@features.get('/api/account')
def account_info():
    if os.environ.get('VERCEL') and not os.environ.get('SECRET_KEY'):
        return jsonify(success=True, user=None, csrf='guest', accounts_available=False)
    session.setdefault('csrf', secrets.token_urlsafe(32))
    return jsonify(success=True, user=user(), csrf=session['csrf'], accounts_available=accounts_available())

@features.post('/api/account/<action>')
def authenticate(action):
    if action == 'logout':
        session.clear()
        return jsonify(success=True)
    if action not in ('login', 'register'):
        return jsonify(success=False, error='İşlem bulunamadı.'), 404
    if not accounts_available():
        return jsonify(success=False, error='Kalıcı hesaplar için sunucuda DATABASE_URL ve SECRET_KEY yapılandırılmalı.'), 503
    data = request.get_json(silent=True) or {}
    email, password = data.get('email', ''), data.get('password', '')
    if not isinstance(email, str) or not isinstance(password, str) or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or len(email)>254 or not 10<=len(password)<=128:
        return jsonify(success=False, error='Geçerli e-posta ve 10–128 karakterlik parola girin.'), 400
    email = email.strip().lower()
    init_accounts()
    # Persist counters so limits survive worker changes and serverless invocations.
    key = hashlib.sha256((email+'|'+(request.remote_addr or '')).encode()).hexdigest()
    with db() as conn:
        conn.execute('DELETE FROM cv_auth_attempts WHERE started < ?', (time.time()-900,))
        conn.execute('INSERT INTO cv_auth_attempts VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET count=cv_auth_attempts.count+1', (key,time.time()))
        if conn.execute('SELECT count FROM cv_auth_attempts WHERE key=?', (key,)).fetchone()['count'] > 10:
            return jsonify(success=False, error='Çok fazla deneme. 15 dakika sonra tekrar deneyin.'), 429
        row = conn.execute('SELECT * FROM cv_users WHERE email=?', (email,)).fetchone()
        if action == 'register':
            if row:
                return jsonify(success=False, error='Bu adresle kayıt yapılamadı. Giriş yapmayı deneyin.'), 409
            uid = secrets.token_hex(16)
            conn.execute('INSERT INTO cv_users (id,email,password_hash) VALUES (?,?,?)', (uid,email,generate_password_hash(password, method='pbkdf2:sha256:600000')))
        else:
            dummy = current_app.config['DUMMY_PASSWORD_HASH']
            valid = check_password_hash(row['password_hash'] if row else dummy, password)
            if not row or not valid:
                return jsonify(success=False, error='E-posta veya parola yanlış.'), 401
            uid = row['id']
    session.clear()
    session['user_id'] = uid
    session['csrf'] = secrets.token_urlsafe(32)
    return jsonify(success=True, user=user(), csrf=session['csrf'])

@features.patch('/api/account')
def retention():
    account = user()
    if not account:
        return jsonify(success=False, error='Giriş yapın.'), 401
    days = (request.get_json(silent=True) or {}).get('retention_days')
    if type(days) is not int or days not in (7,30,90):
        return jsonify(success=False, error='7, 30 veya 90 gün seçin.'), 400
    with db() as conn:
        conn.execute('UPDATE cv_users SET retention_days=? WHERE id=?', (days, account['id']))
        # Shortening also shortens existing records; extending never resurrects data.
        limit = (datetime.now(timezone.utc)+timedelta(days=days)).isoformat()
        conn.execute('UPDATE cv_documents SET expires_at=? WHERE user_id=? AND expires_at>?', (limit, account['id'], limit))
    return jsonify(success=True, user=user())

@features.get('/api/documents')
def documents():
    account = user()
    if not account:
        return jsonify(success=True, history=[])
    with db() as conn:
        conn.execute('DELETE FROM cv_documents WHERE user_id=? AND expires_at<=?', (account['id'],datetime.now(timezone.utc).isoformat()))
        rows = conn.execute('SELECT id,created_at,expires_at,data FROM cv_documents WHERE user_id=? ORDER BY created_at DESC LIMIT 100', (account['id'],)).fetchall()
    return jsonify(success=True, history=[dict(id=r['id'],created_at=r['created_at'],expires_at=r['expires_at'],filename=json.loads(r['data'])['filename']) for r in rows])

@features.route('/api/documents/<doc_id>', methods=['GET','DELETE'])
def document(doc_id):
    account = user()
    if not account:
        return jsonify(success=False, error='Giriş yapın.'), 401
    with db() as conn:
        row = conn.execute('SELECT data FROM cv_documents WHERE id=? AND user_id=? AND expires_at>?', (doc_id,account['id'],datetime.now(timezone.utc).isoformat())).fetchone()
        if not row:
            return jsonify(success=False, error='Analiz bulunamadı.'), 404
        if request.method == 'DELETE':
            conn.execute('DELETE FROM cv_documents WHERE id=? AND user_id=?', (doc_id,account['id']))
            return jsonify(success=True)
    return jsonify(success=True, document=json.loads(row['data']))

@features.post('/api/job-match')
def job_match():
    data=request.get_json(silent=True) or {}
    text, job = data.get('text'),data.get('job')
    if not isinstance(text,str) or not isinstance(job,str) or len(text)>100000 or not 20<=len(job)<=30000:
        return jsonify(success=False,error='CV metni ve 20–30.000 karakterlik ilan metni girin.'),400
    excluded=data.get('excluded',[])
    if not isinstance(excluded,list) or any(s not in TECHNOLOGIES for s in excluded):
        return jsonify(success=False,error='Geçersiz beceri seçimi.'),400
    return jsonify(success=True, comparison=compare_job(text,job,excluded))

@features.post('/api/compare')
def compare_versions():
    data=request.get_json(silent=True) or {}
    old,new=data.get('old'),data.get('new')
    if not all(isinstance(t,str) and 20<=len(t)<=100000 for t in (old,new)):
        return jsonify(success=False,error='Her iki CV için 20–100.000 karakterlik metin girin.'),400
    old_skills,new_skills=evidence(old),evidence(new)
    old_lines=set(line.strip() for line in old.splitlines() if line.strip())
    new_lines=set(line.strip() for line in new.splitlines() if line.strip())
    return jsonify(success=True, comparison={'added_skills':sorted(set(new_skills)-set(old_skills)), 'removed_skills':sorted(set(old_skills)-set(new_skills)), 'added_lines':[line for line in new.splitlines() if line.strip() and line.strip() not in old_lines][:50], 'removed_lines':[line for line in old.splitlines() if line.strip() and line.strip() not in new_lines][:50], 'word_delta':len(new.split())-len(old.split())})

@features.post('/api/report')
def report():
    from Proje.report import create_report
    data=request.get_json(silent=True) or {}
    text,job=data.get('text'),data.get('job','')
    excluded=data.get('excluded',[])
    if not isinstance(text,str) or not 20<=len(text)<=100000 or not isinstance(job,str) or len(job)>30000 or not isinstance(excluded,list) or any(s not in TECHNOLOGIES for s in excluded):
        return jsonify(success=False,error='Geçersiz rapor verisi.'),400
    return send_file(create_report(text,job,excluded),mimetype='application/pdf',as_attachment=True,download_name='cv-studio-report.pdf')
