import io
import os
import tempfile
import unittest
from unittest.mock import patch
os.environ['VERCEL'] = '1'
from Proje.app import app, analyze_cv_content, extract_metadata
from Proje import database

class AnalysisTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(database, 'DB_PATH', self.tmp.name + '/test.db')
        self.db_patch.start()
        database.init_db()
        self.client = app.test_client()
    def tearDown(self):
        self.db_patch.stop()
        self.tmp.cleanup()
    def test_distinct_skills_and_boundaries(self):
        skills = analyze_cv_content('JavaScript C++ C# React Flask PostgreSQL')['skills']
        self.assertIn('C++', skills)
        self.assertIn('C#', skills)
        self.assertIn('JavaScript', skills)
        self.assertNotIn('Java', skills)
        self.assertNotIn('SQL', skills)
    def test_name_is_not_experience(self):
        self.assertEqual(analyze_cv_content("Deniz Yılmaz")["experience"], [])

    def test_name_stays_on_one_line(self):
        self.assertEqual(extract_metadata('Name: Deniz Yilmaz\nPython Developer')['ner']['persons'], ['Deniz Yilmaz'])
    def test_text_analysis_history(self):
        response = self.client.post('/api/analyze', json={'text': 'Python developer with Flask and SQL experience.'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('Python', response.json['metadata']['cv_analysis']['skills'])
        history = self.client.get('/api/history').json['history']
        self.assertEqual(len(history), 1)
        self.assertEqual(self.client.get('/api/history/'+str(history[0]['id'])).status_code, 200)
    def test_invalid_text(self):
        for body in [None, {}, {'text': []}, {'text': 'short'}, {'text': 'x'*100001}]:
            self.assertEqual(self.client.post('/api/analyze', json=body).status_code, 400)
    def test_retention(self):
        for i in range(17):
            database.save_document(str(i), 'test', 4, 1, 0, {})
        self.assertEqual(len(database.get_documents_history()), 15)
        self.assertIsNone(database.get_document_by_id(1))
    def test_webhook_cannot_choose_target(self):
        with patch.dict(os.environ, {'N8N_WEBHOOK_URL': ''}):
            response = self.client.post('/api/send_webhook', json={'webhook_url':'http://127.0.0.1', 'payload': {'text': 'test'}})
            self.assertEqual(response.status_code, 503)
    def test_upload_cleanup(self):
        with patch('Proje.app.OCR_AVAILABLE', True), patch('Proje.app.extract_text_from_image', return_value='Python developer with practical Flask experience.'), patch.dict(app.config, UPLOAD_FOLDER=self.tmp.name):
            response = self.client.post('/api/ocr', data={'file':(io.BytesIO(b'fake'), 'cv.png')})
            self.assertEqual(response.status_code, 200)
            self.assertFalse(any(name.endswith('.png') for name in os.listdir(self.tmp.name)))
    def test_page_and_auth_redirect(self):
        self.assertEqual(self.client.get('/').status_code, 200)
        self.assertEqual(self.client.get('/login').status_code, 302)

if __name__ == '__main__':
    unittest.main()
