import io
import os
import tempfile
import unittest
from unittest.mock import patch
from Proje.app import app, analyze_cv_content, extract_metadata
from Proje import features

class CVTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{},clear=False);self.env.start()
        os.environ.pop('VERCEL',None);os.environ.pop('DATABASE_URL',None)
        self.db_patch=patch.object(features,'DB_PATH',self.tmp.name+'/accounts.db');self.db_patch.start()
        app.config.update(TESTING=True,SECRET_KEY='test-secret')
        self.client=app.test_client()
        self.token=self.client.get('/api/account').json['csrf']
    def tearDown(self):
        self.env.stop();self.db_patch.stop();self.tmp.cleanup()
    def post(self,path,data,client=None,token=None):
        return (client or self.client).post(path,json=data,headers={'X-CSRF-Token':token or self.token})
    def register(self,email='a@example.com',client=None,token=None):
        response=self.post('/api/account/register',{'email':email,'password':'test-password-123'},client,token)
        self.assertEqual(response.status_code,200)
        if client is None:self.token=response.json['csrf']
        return response.json['csrf']
    def test_guest_not_saved(self):
        self.assertEqual(self.post('/api/analyze',{'text':'Python developer with Flask and SQL experience.'}).status_code,200)
        self.assertEqual(self.client.get('/api/documents').json['history'],[])
        self.assertEqual(self.client.get('/api/history').status_code,410)
    def test_csrf_and_validation(self):
        self.assertEqual(self.client.post('/api/analyze',json={'text':'Python developer with practical experience.'}).status_code,403)
        for text in [None,[], 'short', 'x'*100001]:
            self.assertEqual(self.post('/api/analyze',{'text':text}).status_code,400)
    def test_distinct_skills_and_evidence(self):
        result=self.post('/api/analyze',{'text':'JavaScript C++ C# React Flask PostgreSQL experience.'}).json
        proofs=result['metadata']['skill_evidence']
        self.assertIn('C++',proofs);self.assertIn('C#',proofs);self.assertNotIn('Java',proofs);self.assertNotIn('SQL',proofs)
        self.assertEqual(proofs['React'],['JavaScript C++ C# React Flask PostgreSQL experience.'])
    def test_job_and_corrections(self):
        result=self.post('/api/job-match',{'text':'Python and Git developer','job':'Requirements: Python, Docker, Git.','excluded':['Git']}).json['comparison']
        self.assertEqual([x['skill'] for x in result['matched']],['Python'])
        self.assertEqual({x['skill'] for x in result['missing']},{'Docker','Git'})
        self.assertIn('Requirements:',result['matched'][0]['job_evidence'][0])
    def test_versions(self):
        result=self.post('/api/compare',{'old':'Python developer\nBuilt a Flask project.','new':'Python and Docker developer\nBuilt a Flask project.'}).json['comparison']
        self.assertEqual(result['added_skills'],['Docker'])
        self.assertEqual(len(result['added_lines']),1)
    def test_private_history_and_delete(self):
        self.register()
        data=self.post('/api/analyze',{'text':'Python developer with Flask and SQL experience.'}).json
        self.assertIn('id',data)
        other=app.test_client();token=other.get('/api/account').json['csrf'];token=self.register('b@example.com',other,token)
        self.assertEqual(other.get('/api/documents').json['history'],[])
        self.assertEqual(other.get('/api/documents/'+data['id']).status_code,404)
        self.assertEqual(other.delete('/api/documents/'+data['id'],headers={'X-CSRF-Token':token}).status_code,404)
        self.assertEqual(self.client.delete('/api/documents/'+data['id'],headers={'X-CSRF-Token':self.token}).status_code,200)
        self.assertEqual(self.client.get('/api/documents').json['history'],[])
    def test_logout_login_retention(self):
        self.register();self.post('/api/account/logout',{})
        self.token=self.client.get('/api/account').json['csrf']
        self.assertEqual(self.post('/api/account/login',{'email':'a@example.com','password':'incorrect-password'}).status_code,401)
        response=self.post('/api/account/login',{'email':'a@example.com','password':'test-password-123'})
        self.token=response.json['csrf']
        self.assertEqual(self.client.patch('/api/account',json={'retention_days':7},headers={'X-CSRF-Token':self.token}).json['user']['retention_days'],7)
    def test_expired_record_hidden(self):
        self.register();data=self.post('/api/analyze',{'text':'Python developer with Flask and SQL experience.'}).json
        with features.db() as conn:conn.execute('UPDATE cv_documents SET expires_at=?',('2000-01-01T00:00:00+00:00',))
        self.assertEqual(self.client.get('/api/documents/'+data['id']).status_code,404)
        self.assertEqual(self.client.get('/api/documents').json['history'],[])
    def test_name_not_experience(self):
        self.assertEqual(analyze_cv_content('Deniz Yılmaz')['experience'],[])
    def test_pdf(self):
        response=self.post('/api/report',{'text':'Deniz Yılmaz\nPython developer with Flask and SQL experience.','job':'Requirements: Python and Docker experience.'})
        self.assertEqual(response.status_code,200);self.assertTrue(response.data.startswith(b'%PDF'))
    def test_digital_pdf_without_ocr(self):
        from reportlab.pdfgen.canvas import Canvas
        stream=io.BytesIO();canvas=Canvas(stream);canvas.drawString(40,700,'Python developer with Flask and SQL experience. Built APIs.');canvas.save();stream.seek(0)
        with patch('Proje.app.OCR_AVAILABLE',False),patch.dict(app.config,UPLOAD_FOLDER=self.tmp.name):
            response=self.client.post('/api/ocr',data={'file':(stream,'cv.pdf')},headers={'X-CSRF-Token':self.token})
            self.assertEqual(response.status_code,200);self.assertFalse(any(n.endswith('.pdf') for n in os.listdir(self.tmp.name)))

if __name__=='__main__':unittest.main()
