# 📊 AI-Powered CV Analysis & OCR System Evaluation Report

This report presents performance metrics evaluated over the sample CVs using **Tesseract OCR (5.5.2)**, **OpenCV Image Preprocessing**, and the project's **Regex/NLP extraction pipeline**.

## 📈 System Metrics Table

| Document Name | File Format | OCR Character Accuracy (%) | Processing Time (s) | Email Extracted | Phone Extracted | Technical Skills Extracted |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Suleyman_Sardogan_CV_AI.pdf | PDF (Scanned Mode) | 97.88% | 1.53s | ✅ Yes | ✅ Yes | 6 skills | 
| Suleyman_Sardogan_CV_AI_1.pdf | PDF (Scanned Mode) | 97.91% | 1.51s | ✅ Yes | ✅ Yes | 6 skills | 
| my-resume.pdf | PDF (Scanned Mode) | 91.29% | 1.36s | ✅ Yes | ✅ Yes | 7 skills | 
| my-resume-1.pdf | PDF (Scanned Mode) | 94.32% | 1.50s | ✅ Yes | ✅ Yes | 7 skills | 
| **Average / Overall** | **-** | **95.35%** | **1.48s** | **100.0%** | **100.0%** | **6.5 skills** |

---

## 🛠️ Key Takeaways for your CV/Resume:

1. **OCR Character Accuracy (95.35%)**:
   Achieved extremely high character similarity by utilizing a custom OpenCV preprocessing pipeline including **Otsu's Thresholding**, noise reduction (**Bilateral Filter**), and **Auto-Deskewing** (skew detection/correction).

2. **Entity Extraction & Categorization (100% Success)**:
   Contact details (emails, phone numbers) were extracted with a **100% success rate** directly from noisy text outputs.

3. **Skills & CV Parsing Engine**:
   Correctly categorized key technologies (Python, Django, Flask, SQL, Git, Docker, Machine Learning) and mapped them into structured schemas, detecting an average of **6.5 technical skills** per document.

4. **Response Time**:
   End-to-end pipeline processing time averaged **1.48 seconds** per page for scanned image-to-text processing.
