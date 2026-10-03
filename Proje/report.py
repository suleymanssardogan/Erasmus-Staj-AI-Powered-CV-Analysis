"""Unicode PDF report built from validated CV text, never client HTML."""
import io
import os
from xml.sax.saxutils import escape
import reportlab
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, KeepTogether
from Proje.features import evidence, compare_job

font_dir = os.path.join(os.path.dirname(reportlab.__file__), 'fonts')
pdfmetrics.registerFont(TTFont('Vera', os.path.join(font_dir, 'Vera.ttf')))
pdfmetrics.registerFont(TTFont('VeraBold', os.path.join(font_dir, 'VeraBd.ttf')))

def create_report(text, job='', excluded=()):
    buffer = io.BytesIO()
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='CVTitle', fontName='VeraBold', fontSize=24, leading=30, textColor=colors.HexColor('#176b57'), spaceAfter=18))
    styles.add(ParagraphStyle(name='CVHead', fontName='VeraBold', fontSize=13, leading=19, spaceBefore=18, spaceAfter=8, keepWithNext=True))
    styles.add(ParagraphStyle(name='CVBody', fontName='Vera', fontSize=9, leading=15, spaceAfter=7))
    story=[]
    def para(value,style='CVBody'):
        return Paragraph(escape(str(value)), styles[style])
    story += [para('CV Studio | Analiz Raporu','CVTitle'),para(f'{len(text.split())} kelime - Kural tabanlı, açıklanabilir analiz'),para('Bu rapor beceri seviyesini veya işe uygunluğu ölçmez. Kaynak cümleleri orijinal CV ile doğrulayın.')]
    proofs = evidence(text)
    for skill,lines in proofs.items():
        if skill in excluded:
            continue
        story.extend([para(skill,'CVHead')]+[para(line) for line in lines])
    if not proofs:
        story.append(para('Teknik sözlükte eşleşen beceri bulunamadı.'))
    if excluded:
        story.append(para('Kullanıcı tarafından hariç tutulan tespitler: '+', '.join(excluded)))
    if job:
        comparison=compare_job(text,job,excluded)
        story.append(para('İş ilanıyla karşılaştırma','CVHead'))
        story.append(para(comparison['note']))
        for kind,label in [('matched','CV’de bulunan gereksinim'),('missing','CV’de bulunmayan gereksinim')]:
            for item in comparison[kind]:
                content=[para(label+': '+item['skill'],'CVHead')]
                content += [para('İlan: '+line) for line in item['job_evidence']]
                content += [para('CV: '+line) for line in item.get('cv_evidence',[])]
                story.extend(content)
    story.append(para('Geliştirme önerileri','CVHead'))
    if len(text.split())<100:
        story.append(para('Metin kısa. Eksik sayfa veya OCR kaybı olup olmadığını kontrol edin.'))
    if not re_metric(text):
        story.append(para('Başarıları gerçek ölçümlerle destekleyin: süre, kullanıcı sayısı veya iyileşme oranı.'))
    story.append(para('İletişim bilgilerini, tarihleri ve teknik becerilerin kaynak cümlelerini doğrulayın. Yalnızca gerçekten sahip olduğunuz becerileri ekleyin.'))
    def footer(canvas, doc):
        canvas.setFont('Vera',8)
        canvas.setFillColor(colors.HexColor('#647284'))
        canvas.drawString(42,28,'CV Studio - Erasmus Internship Project')
        canvas.drawRightString(A4[0]-42,28,str(doc.page))
    SimpleDocTemplate(buffer,pagesize=A4,rightMargin=42,leftMargin=42,topMargin=42,bottomMargin=45,title='CV Studio Analiz Raporu').build(story,onFirstPage=footer,onLaterPages=footer)
    buffer.seek(0)
    return buffer

def re_metric(text):
    import re
    return bool(re.search(r'\d+\s*%',text))
