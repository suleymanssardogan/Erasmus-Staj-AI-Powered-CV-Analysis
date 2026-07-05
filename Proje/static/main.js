// Global State Variables
let selectedFile = null;
let processedText = '';
let ocrMetadata = null;

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const statusMessage = document.getElementById('statusMessage');
const resultArea = document.getElementById('resultArea');
const resultActions = document.getElementById('resultActions');
const processBtn = document.getElementById('processBtn');
const resultsTabs = document.getElementById('resultsTabs');
const uploadPrompt = document.getElementById('uploadPrompt');
const previewContainer = document.getElementById('previewContainer');
const themeToggle = document.getElementById('themeToggle');
const iconLight = themeToggle ? themeToggle.querySelector('.icon-light') : null;
const iconDark = themeToggle ? themeToggle.querySelector('.icon-dark') : null;

// Initialize Drag & Drop
function initializeDragAndDrop() {
    if (!uploadArea) return;
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });
}

// Handle selected file (Image/PDF validation & Preview)
function handleFile(file) {
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const validExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'pdf'];
    const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff', 'application/pdf'];
    
    const isValidExtension = validExtensions.includes(fileExtension);
    const isValidMime = validMimeTypes.includes(file.type) || file.type === ''; // Fallback for mime type
    
    if (!isValidExtension && !isValidMime) {
        showStatus('❌ Geçersiz dosya türü! Lütfen görsel (PNG, JPG vb.) veya PDF yükleyin.', 'error');
        fileInput.value = '';
        selectedFile = null;
        return;
    }
    
    selectedFile = file;
    uploadPrompt.style.display = 'none';
    previewContainer.style.display = 'block';
    
    const fileSize = (file.size / (1024 * 1024)).toFixed(2);
    
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            previewContainer.innerHTML = `
                <div class="preview-card">
                    <img src="${e.target.result}" alt="Dosya Önizleme" class="preview-img">
                    <div class="preview-info">
                        <div class="preview-name">${file.name}</div>
                        <div class="preview-size">${fileSize} MB</div>
                    </div>
                </div>
            `;
        };
        reader.readAsDataURL(file);
    } else {
        previewContainer.innerHTML = `
            <div class="preview-card">
                <div class="preview-pdf-icon">📄</div>
                <div class="preview-info">
                    <div class="preview-name">${file.name}</div>
                    <div class="preview-size">${fileSize} MB</div>
                </div>
            </div>
        `;
    }
}

// Process Document with Flask API
async function processDocument() {
    if (!selectedFile) {
        showStatus('Lütfen önce bir dosya seçin!', 'error');
        return;
    }
    
    processBtn.disabled = true;
    processBtn.innerHTML = '<span>⏳</span> İşleniyor...';
    showProgress();
    
    const binarizationMode = document.getElementById('binarizationMode').value;
    const autoDeskew = document.getElementById('autoDeskew').checked;
    
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('binarization_mode', binarizationMode);
    formData.append('auto_deskew', autoDeskew);
    
    try {
        animateProgress();
        const response = await fetch('/api/ocr', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        hideProgress();
        
        if (result.success) {
            processedText = result.extracted_text;
            ocrMetadata = result.metadata;
            displayResult(processedText, result.filename);
            displayMetadata(ocrMetadata);
            
            // Calculate and display ATS Score and Role Match
            calculateATSScore(processedText);
            calculateRoleMatch();
            
            resultsTabs.style.display = 'flex';
            switchTab('textTab');
            loadHistoryList();
            
            showStatus(`✅ OCR işlemi başarıyla tamamlandı! ${result.char_count} karakter çıkarıldı.`, 'success');
        } else {
            showStatus(`❌ Hata: ${result.error}`, 'error');
        }
    } catch (error) {
        hideProgress();
        showStatus(`❌ Bağlantı hatası: ${error.message}`, 'error');
        console.error('OCR Error:', error);
    } finally {
        processBtn.disabled = false;
        processBtn.innerHTML = '<span>🔍</span> Metni Çıkar & Analiz Et';
    }
}

// Progress Bar Animation
let progressInterval = null;
function animateProgress() {
    let progress = 0;
    progressFill.style.width = '0%';
    if (progressInterval) clearInterval(progressInterval);
    
    progressInterval = setInterval(() => {
        progress += Math.random() * 12;
        if (progress > 92) {
            clearInterval(progressInterval);
        } else {
            progressFill.style.width = `${progress}%`;
        }
    }, 200);
}

function showProgress() {
    progressBar.style.display = 'block';
}

function hideProgress() {
    if (progressInterval) clearInterval(progressInterval);
    progressFill.style.width = '100%';
    setTimeout(() => {
        progressBar.style.display = 'none';
        progressFill.style.width = '0%';
    }, 400);
}

// Display extraction text result
function displayResult(text, filename) {
    if (text) {
        resultArea.innerHTML = text;
        resultArea.className = 'result-content';
        resultActions.style.display = 'flex';
    } else {
        resultArea.innerHTML = 'Belgeden okunabilir herhangi bir metin çıkarılamadı.';
        resultArea.className = 'result-placeholder';
        resultActions.style.display = 'none';
    }
}

// Copy extracted text
function copyText() {
    if (!processedText) return;
    navigator.clipboard.writeText(processedText)
        .then(() => showStatus('📋 Metin panoya kopyalandı!', 'success'))
        .catch(err => console.error('Copy failed:', err));
}

// Download extracted text
function downloadText() {
    if (!processedText) return;
    const blob = new Blob([processedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    a.href = url;
    a.download = `ocr-result-${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showStatus('💾 Dosya başarıyla indirildi!', 'success');
}

// Switch tabs inside results view
function switchTab(tabId) {
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    
    const clickedBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => 
        btn.getAttribute('onclick').includes(tabId)
    );
    if (clickedBtn) clickedBtn.classList.add('active');
}

// Display parsed metadata as badges & list items
function displayMetadata(metadata) {
    const emailsDiv = document.getElementById('metaEmails');
    const phonesDiv = document.getElementById('metaPhones');
    const datesDiv = document.getElementById('metaDates');
    const urlsDiv = document.getElementById('metaUrls');
    
    const renderList = (div, list, type) => {
        if (!div) return;
        if (!list || list.length === 0) {
            div.innerHTML = '<span class="no-data">Veri bulunamadı</span>';
            return;
        }
        div.innerHTML = list.map(item => {
            if (type === 'email') {
                return `<a href="mailto:${item}" class="meta-badge badge-email">✉️ ${item}</a>`;
            } else if (type === 'phone') {
                return `<a href="tel:${item.replace(/\s+/g, '')}" class="meta-badge badge-phone">📞 ${item}</a>`;
            } else if (type === 'url') {
                const displayUrl = item.startsWith('http') ? item : `https://${item}`;
                return `<a href="${displayUrl}" target="_blank" class="meta-badge badge-url">🌐 ${item}</a>`;
            } else if (type === 'ner_person') {
                return `<span class="meta-badge badge-email">👤 ${item}</span>`;
            } else if (type === 'ner_org') {
                return `<span class="meta-badge badge-phone">🏢 ${item}</span>`;
            } else if (type === 'ner_loc') {
                return `<span class="meta-badge badge-url">📍 ${item}</span>`;
            } else {
                return `<span class="meta-badge badge-date">📅 ${item}</span>`;
            }
        }).join('');
    };
    
    renderList(emailsDiv, metadata.emails, 'email');
    renderList(phonesDiv, metadata.phones, 'phone');
    renderList(datesDiv, metadata.dates, 'date');
    renderList(urlsDiv, metadata.urls, 'url');
    
    // Render NER Varlıkları
    const nerPersons = document.getElementById('nerPersons');
    const nerOrgs = document.getElementById('nerOrgs');
    const nerLocs = document.getElementById('nerLocs');
    
    if (metadata.ner) {
        renderList(nerPersons, metadata.ner.persons, 'ner_person');
        renderList(nerOrgs, metadata.ner.orgs, 'ner_org');
        renderList(nerLocs, metadata.ner.locs, 'ner_loc');
    } else {
        if (nerPersons) nerPersons.innerHTML = '<span class="no-data">Analiz edilmedi</span>';
        if (nerOrgs) nerOrgs.innerHTML = '<span class="no-data">Analiz edilmedi</span>';
        if (nerLocs) nerLocs.innerHTML = '<span class="no-data">Analiz edilmedi</span>';
    }
    
    // Render CV Analysis sections
    const skillsDiv = document.getElementById('cvSkills');
    const eduDiv = document.getElementById('cvEducation');
    const expDiv = document.getElementById('cvExperience');
    
    if (metadata.cv_analysis) {
        const skills = metadata.cv_analysis.skills || [];
        if (skills.length === 0) {
            skillsDiv.innerHTML = '<span class="no-data">Herhangi bir teknik beceri tespit edilemedi</span>';
        } else {
            skillsDiv.innerHTML = skills.map(skill => `<span class="meta-badge badge-url">🛠️ ${skill}</span>`).join('');
        }
        
        const edu = metadata.cv_analysis.education || [];
        if (edu.length === 0) {
            eduDiv.innerHTML = '<span class="no-data">Herhangi bir eğitim bilgisi tespit edilemedi</span>';
        } else {
            eduDiv.innerHTML = '<ul style="padding-left: 20px; list-style-type: square; font-size: 0.9rem;">' + 
                edu.map(item => `<li style="margin-bottom: 5px;">${item}</li>`).join('') + '</ul>';
        }
        
        const exp = metadata.cv_analysis.experience || [];
        if (exp.length === 0) {
            expDiv.innerHTML = '<span class="no-data">Herhangi bir deneyim bilgisi tespit edilemedi</span>';
        } else {
            expDiv.innerHTML = '<ul style="padding-left: 20px; list-style-type: square; font-size: 0.9rem;">' + 
                exp.map(item => `<li style="margin-bottom: 5px;">${item}</li>`).join('') + '</ul>';
        }
    } else {
        if (skillsDiv) skillsDiv.innerHTML = '<span class="no-data">Analiz edilmedi</span>';
        if (eduDiv) eduDiv.innerHTML = '<span class="no-data">Analiz edilmedi</span>';
        if (expDiv) expDiv.innerHTML = '<span class="no-data">Analiz edilmedi</span>';
    }
}

// SQLite document history list fetching
async function loadHistoryList() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    try {
        const response = await fetch('/api/history');
        const result = await response.json();
        
        if (result.success && result.history.length > 0) {
            historyList.innerHTML = result.history.map(item => {
                const date = new Date(item.created_at).toLocaleString('tr-TR', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                });
                return `
                    <div class="history-item" onclick="loadHistoryItem(${item.id})">
                        <span class="history-name" title="${item.filename}">${item.filename}</span>
                        <span class="history-date">${item.char_count} kr. | ${date}</span>
                    </div>
                `;
            }).join('');
        } else {
            historyList.innerHTML = '<span class="no-data">Yüklenmiş belge bulunamadı.</span>';
        }
    } catch (error) {
        console.warn('History list loading failed:', error.message);
        historyList.innerHTML = '<span class="no-data">Geçmiş yüklenemedi.</span>';
    }
}

// SQLite history document loading
async function loadHistoryItem(docId) {
    showProgress();
    try {
        const response = await fetch(`/api/history/${docId}`);
        const result = await response.json();
        hideProgress();
        
        if (result.success) {
            const doc = result.document;
            processedText = doc.extracted_text;
            ocrMetadata = doc.metadata;
            selectedFile = null;
            
            uploadPrompt.style.display = 'block';
            previewContainer.style.display = 'none';
            previewContainer.innerHTML = '';
            fileInput.value = '';
            
            displayResult(processedText, doc.filename);
            displayMetadata(ocrMetadata);
            
            // Calculate and display ATS Score and Role Match
            calculateATSScore(processedText);
            calculateRoleMatch();
            
            resultsTabs.style.display = 'flex';
            switchTab('textTab');
            
            showStatus(`📂 Geçmiş belge yüklendi: ${doc.filename}`, 'success');
        } else {
            showStatus(`❌ Geçmiş yükleme hatası: ${result.error}`, 'error');
        }
    } catch (error) {
        hideProgress();
        showStatus(`❌ Geçmiş yükleme hatası: ${error.message}`, 'error');
    }
}

// Send payload to custom webhook URL
async function sendToWebhook() {
    const webhookUrlInput = document.getElementById('webhookUrl');
    const webhookStatus = document.getElementById('webhookStatus');
    const webhookUrl = webhookUrlInput.value.trim();
    
    if (!webhookUrl) {
        showStatus('Lütfen geçerli bir webhook URL girin!', 'error');
        return;
    }
    if (!processedText) {
        showStatus('Gönderilecek OCR verisi bulunamadı! Önce döküman yükleyin.', 'error');
        return;
    }
    
    webhookStatus.style.display = 'block';
    webhookStatus.className = 'webhook-status status-info';
    webhookStatus.innerHTML = '⏳ Veri gönderiliyor, lütfen bekleyin...';
    
    const payload = {
        timestamp: new Date().toISOString(),
        filename: selectedFile ? selectedFile.name : 'history_loaded',
        extracted_text: processedText,
        metadata: ocrMetadata,
        stats: {
            char_count: processedText.length,
            word_count: processedText.split(/\s+/).length
        }
    };
    
    try {
        const response = await fetch('/api/send_webhook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                webhook_url: webhookUrl,
                payload: payload
            })
        });
        const result = await response.json();
        if (result.success) {
            webhookStatus.className = 'webhook-status status-success';
            webhookStatus.innerHTML = `✅ Webhook başarıyla tetiklendi!<br><small>Durum Kodu: ${result.status_code}</small>`;
        } else {
            webhookStatus.className = 'webhook-status status-error';
            webhookStatus.innerHTML = `❌ Hata: ${result.error}`;
        }
    } catch (error) {
        webhookStatus.className = 'webhook-status status-error';
        webhookStatus.innerHTML = `❌ Bağlantı hatası: ${error.message}`;
    }
}

// Clear all inputs & analysis panels
function clearAll() {
    fileInput.value = '';
    selectedFile = null;
    ocrMetadata = null;
    processedText = '';
    
    uploadPrompt.style.display = 'block';
    previewContainer.style.display = 'none';
    previewContainer.innerHTML = '';
    resultsTabs.style.display = 'none';
    
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    document.getElementById('textTab').classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const textTabBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => 
        btn.getAttribute('onclick').includes('textTab')
    );
    if (textTabBtn) textTabBtn.classList.add('active');
    
    resultArea.innerHTML = 'Henüz bir döküman işlenmedi. Lütfen sol taraftan bir belge seçin.';
    resultArea.className = 'result-placeholder';
    resultActions.style.display = 'none';
    
    document.getElementById('metaEmails').innerHTML = '<span class="no-data">Veri yok</span>';
    document.getElementById('metaPhones').innerHTML = '<span class="no-data">Veri yok</span>';
    document.getElementById('metaDates').innerHTML = '<span class="no-data">Veri yok</span>';
    document.getElementById('metaUrls').innerHTML = '<span class="no-data">Veri yok</span>';
    
    document.getElementById('cvSkills').innerHTML = '<span class="no-data">Analiz edilmedi</span>';
    document.getElementById('cvEducation').innerHTML = '<span class="no-data">Analiz edilmedi</span>';
    document.getElementById('cvExperience').innerHTML = '<span class="no-data">Analiz edilmedi</span>';
    
    const webhookStatus = document.getElementById('webhookStatus');
    if (webhookStatus) {
        webhookStatus.style.display = 'none';
        webhookStatus.innerHTML = '';
    }
    
    progressBar.style.display = 'none';
    progressFill.style.width = '0%';
    
    processBtn.disabled = false;
    processBtn.innerHTML = '<span>🔍</span> Metni Çıkar & Analiz Et';
    
    resetATSScore();
    resetRoleMatch();
    
    showStatus('🗑️ Tüm veriler temizlendi.', 'success');
}

// Show Status alert toast
function showStatus(msg, type) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 10000; display: flex; flex-direction: column; gap: 8px;';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `status-message status-${type}`;
    toast.style.cssText = 'margin: 0; padding: 12px 24px; border-radius: var(--radius-md); animation: slideIn 0.3s ease; box-shadow: var(--shadow-lg); font-size: 0.9rem; font-weight: 500; min-width: 250px; display: block;';
    
    let emoji = 'ℹ️';
    if (type === 'success') emoji = '✅';
    else if (type === 'error') emoji = '❌';
    else if (type === 'info') emoji = 'ℹ️';
    
    toast.innerHTML = `${emoji} ${msg}`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

// FAQ Accordion Toggle Setup
function initializeFAQ() {
    document.querySelectorAll('.faq-question').forEach(question => {
        question.addEventListener('click', () => {
            const faqItem = question.parentElement;
            const answer = question.nextElementSibling;
            
            // Check if already open
            const isOpen = faqItem.classList.contains('active');
            
            // Close all
            document.querySelectorAll('.faq-item').forEach(item => {
                item.classList.remove('active');
                item.querySelector('.faq-answer').style.maxHeight = null;
            });
            
            // Toggle current
            if (!isOpen) {
                faqItem.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + 'px';
            }
        });
    });
}

// Dark/Light Theme Switcher
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    if (isDark) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    
    if (!themeToggle) return;
    
    if (isDark) {
        if (iconLight) iconLight.style.display = 'none';
        if (iconDark) iconDark.style.display = 'inline-block';
    } else {
        if (iconLight) iconLight.style.display = 'inline-block';
        if (iconDark) iconDark.style.display = 'none';
    }
    
    themeToggle.addEventListener('click', () => {
        const hasDark = document.body.classList.toggle('dark-mode');
        if (hasDark) {
            localStorage.setItem('theme', 'dark');
            if (iconLight) iconLight.style.display = 'none';
            if (iconDark) iconDark.style.display = 'inline-block';
        } else {
            localStorage.setItem('theme', 'light');
            if (iconLight) iconLight.style.display = 'inline-block';
            if (iconDark) iconDark.style.display = 'none';
        }
    });
}

// Google Login Simulation
function googleSignIn() {
    let modal = document.getElementById('googleModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'googleModal';
        modal.className = 'google-modal-overlay';
        modal.innerHTML = `
            <div class="google-modal-card">
                <div class="google-modal-header">
                    <svg class="google-logo-svg" viewBox="0 0 24 24" width="32" height="32" style="display:block; margin: 0 auto 16px auto;">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <h3>Google ile Giriş Yapın</h3>
                    <p>Devam etmek için bir hesap seçin</p>
                </div>
                <div class="google-accounts-list">
                    <div class="google-account-item" onclick="selectGoogleAccount('Süleyman Şardoğan', 'suleyman.sardogan@gmail.com', 'https://api.dicebear.com/7.x/adventurer/svg?seed=Suleyman')">
                        <img src="https://api.dicebear.com/7.x/adventurer/svg?seed=Suleyman" alt="Avatar" class="account-avatar">
                        <div class="account-details">
                            <span class="account-name">Süleyman Şardoğan</span>
                            <span class="account-email">suleyman.sardogan@gmail.com</span>
                        </div>
                    </div>
                    <div class="google-account-item" onclick="selectGoogleAccount('Canan Kaya', 'canan.kaya@gmail.com', 'https://api.dicebear.com/7.x/adventurer/svg?seed=Canan')">
                        <img src="https://api.dicebear.com/7.x/adventurer/svg?seed=Canan" alt="Avatar" class="account-avatar">
                        <div class="account-details">
                            <span class="account-name">Canan Kaya</span>
                            <span class="account-email">canan.kaya@gmail.com</span>
                        </div>
                    </div>
                    <div class="google-account-item" onclick="selectGoogleAccount('Misafir Kullanıcı', 'misafir@gmail.com', 'https://api.dicebear.com/7.x/adventurer/svg?seed=Guest')">
                        <img src="https://api.dicebear.com/7.x/adventurer/svg?seed=Guest" alt="Avatar" class="account-avatar">
                        <div class="account-details">
                            <span class="account-name">Misafir Kullanıcı</span>
                            <span class="account-email">misafir@gmail.com</span>
                        </div>
                    </div>
                </div>
                <div class="google-modal-footer">
                    <button type="button" class="btn btn-secondary btn-full" onclick="closeGoogleModal()">İptal Et</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
}

function closeGoogleModal() {
    const modal = document.getElementById('googleModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function selectGoogleAccount(name, email, avatar) {
    const user = { name, email, avatar };
    localStorage.setItem('user', JSON.stringify(user));
    closeGoogleModal();
    showStatus(`Hoş geldin, ${name}! Giriş yapıldı.`, 'success');
    setTimeout(() => {
        window.location.href = '/';
    }, 800);
}

// Logout Action
function logoutUser() {
    localStorage.removeItem('user');
    window.location.reload();
}

// Update Navbar profile avatar and name if user is logged in
function updateNavbarUser() {
    const user = JSON.parse(localStorage.getItem('user'));
    const navAuthButtons = document.getElementById('navAuthButtons');
    const navUserProfile = document.getElementById('navUserProfile');
    
    if (user) {
        if (navAuthButtons) navAuthButtons.style.display = 'none';
        if (navUserProfile) {
            navUserProfile.style.display = 'flex';
            const avatarImg = document.getElementById('userAvatar');
            const nameSpan = document.getElementById('userName');
            if (avatarImg) avatarImg.src = user.avatar;
            if (nameSpan) nameSpan.textContent = user.name;
        }
    } else {
        if (navAuthButtons) navAuthButtons.style.display = 'block';
        if (navUserProfile) navUserProfile.style.display = 'none';
    }
}

// ==========================================
// ATS Score and Role Matcher Logic
// ==========================================

function calculateATSScore(text) {
    if (!text) {
        resetATSScore();
        return;
    }
    
    // 1. Length Score
    let lengthScore = 0;
    const len = text.length;
    if (len > 3000) lengthScore = 80;
    else if (len > 1500) lengthScore = 100;
    else if (len > 800) lengthScore = 90;
    else if (len > 300) lengthScore = 60;
    else lengthScore = 30;
    
    // 2. Readability Score
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    let readabilityScore = 85;
    if (lines.length < 5) readabilityScore = 40;
    else if (lines.length < 15) readabilityScore = 70;
    else if (lines.length > 50) readabilityScore = 95;
    
    // 3. Action Verbs Score
    const actionVerbs = [
        "geliştirdi", "yönetti", "tasarladı", "koordine etti", "hazırladı", "uyguladı", 
        "wrote", "built", "managed", "designed", "led", "developed", "created", 
        "implemented", "organized", "improved", "optimized", "kodladı", "kodlama"
    ];
    let verbCount = 0;
    actionVerbs.forEach(verb => {
        const regex = new RegExp('\\b' + verb, 'gi');
        const matches = text.match(regex);
        if (matches) verbCount += matches.length;
    });
    let verbScore = Math.min(30 + verbCount * 15, 100);
    
    // 4. Metrics Score
    const percentMatches = text.match(/%/g) || [];
    const numberMatches = text.match(/\b\d+(?:\.\d+)?\b/g) || [];
    let metricCount = percentMatches.length + (numberMatches.length > 5 ? 3 : 0);
    let metricScore = Math.min(40 + metricCount * 20, 100);
    
    // Average
    const totalScore = Math.round((lengthScore + readabilityScore + verbScore + metricScore) / 4);
    
    const scoreNum = document.getElementById('atsScoreNum');
    if (scoreNum) scoreNum.textContent = totalScore;
    
    const ring = document.getElementById('atsScoreRing');
    if (ring) {
        const radius = 40;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (totalScore / 100) * circumference;
        ring.style.strokeDashoffset = offset;
    }
    
    const levelEl = document.getElementById('atsScoreLevel');
    const descEl = document.getElementById('atsScoreSummaryText');
    const tipsList = document.getElementById('atsTipsList');
    
    if (levelEl && descEl && tipsList) {
        tipsList.innerHTML = '';
        if (totalScore >= 85) {
            levelEl.textContent = '🏆 Mükemmel Seviyede';
            levelEl.style.color = '#27c93f';
            descEl.textContent = 'Özgeçmişiniz ATS tarayıcıları ve İK filtreleri için en iyi standartlara sahip.';
            tipsList.innerHTML += '<li>CV yapınız harika! Mevcut yapıyı bozmadan güncel tutmaya devam edin.</li>';
        } else if (totalScore >= 70) {
            levelEl.textContent = '✨ İyi Seviyede';
            levelEl.style.color = 'var(--accent-purple)';
            descEl.textContent = 'Özgeçmişiniz çoğu filtreden geçebilir ancak ufak iyileştirmelerle şansınızı artırabilirsiniz.';
            tipsList.innerHTML += '<li>İş deneyimlerinizde başarılarınızı daha fazla metrikle (% ve sayılar) destekleyin.</li>';
            tipsList.innerHTML += '<li>Zayıf bölümlerdeki fiilleri daha aktif eylem kelimeleriyle değiştirin.</li>';
        } else if (totalScore >= 50) {
            levelEl.textContent = '⚠ Geliştirilmeli';
            levelEl.style.color = '#FBBC05';
            descEl.textContent = 'CV içeriğiniz ATS sistemlerinde takılabilir. Aşağıdaki önerileri uygulamanız önerilir.';
            tipsList.innerHTML += '<li>Daha fazla teknik anahtar kelime ve eylem odaklı kelime kullanın.</li>';
            tipsList.innerHTML += '<li>Deneyim tanımlarını çok kısa tutmak yerine yaptığınız projeleri detaylandırın.</li>';
        } else {
            levelEl.textContent = '❌ Zayıf Uyum';
            levelEl.style.color = '#ff5f56';
            descEl.textContent = 'Belgedeki okunabilir metin oranı çok az veya biçimlendirme ATS standartlarına uymuyor.';
            tipsList.innerHTML += '<li>CV\'nizi tek sütunlu ve standart yazı tiplerine sahip temiz bir formata dönüştürün.</li>';
            tipsList.innerHTML += '<li>Döküman içerisinde kayıp kelimeleri en aza indirmek için kaliteli bir PDF veya görsel yükleyin.</li>';
        }
    }
    
    const barRead = document.getElementById('barReadability');
    const txtRead = document.getElementById('txtReadability');
    if (barRead) barRead.style.width = readabilityScore + '%';
    if (txtRead) txtRead.textContent = readabilityScore + '/100';
    
    const barLen = document.getElementById('barLength');
    const txtLen = document.getElementById('txtLength');
    if (barLen) barLen.style.width = lengthScore + '%';
    if (txtLen) txtLen.textContent = lengthScore + '/100';
    
    const barVerb = document.getElementById('barVerbs');
    const txtVerb = document.getElementById('txtVerbs');
    if (barVerb) barVerb.style.width = verbScore + '%';
    if (txtVerb) txtVerb.textContent = verbScore + '/100';
    
    const barMet = document.getElementById('barMetrics');
    const txtMet = document.getElementById('txtMetrics');
    if (barMet) barMet.style.width = metricScore + '%';
    if (txtMet) txtMet.textContent = metricScore + '/100';
}

function resetATSScore() {
    const scoreNum = document.getElementById('atsScoreNum');
    if (scoreNum) scoreNum.textContent = '0';
    
    const ring = document.getElementById('atsScoreRing');
    if (ring) ring.style.strokeDashoffset = '251.2';
    
    const levelEl = document.getElementById('atsScoreLevel');
    if (levelEl) levelEl.textContent = 'Hesaplanıyor...';
    
    const descEl = document.getElementById('atsScoreSummaryText');
    if (descEl) descEl.textContent = 'CV yapınızın puanlanması için lütfen sol taraftan bir belge analiz edin.';
    
    const barRead = document.getElementById('barReadability');
    const txtRead = document.getElementById('txtReadability');
    if (barRead) barRead.style.width = '0%';
    if (txtRead) txtRead.textContent = '0/100';
    
    const barLen = document.getElementById('barLength');
    const txtLen = document.getElementById('txtLength');
    if (barLen) barLen.style.width = '0%';
    if (txtLen) txtLen.textContent = '0/100';
    
    const barVerb = document.getElementById('barVerbs');
    const txtVerb = document.getElementById('txtVerbs');
    if (barVerb) barVerb.style.width = '0%';
    if (txtVerb) txtVerb.textContent = '0/100';
    
    const barMet = document.getElementById('barMetrics');
    const txtMet = document.getElementById('txtMetrics');
    if (barMet) barMet.style.width = '0%';
    if (txtMet) txtMet.textContent = '0/100';
    
    const tipsList = document.getElementById('atsTipsList');
    if (tipsList) tipsList.innerHTML = '<li>Lütfen bir CV yükleyin ve analiz edin.</li>';
}

const rolesKeywords = {
    python_dev: {
        title: "Python Developer",
        keywords: ["Python", "Django", "Flask", "SQL", "Git", "Docker", "AWS", "API", "FastAPI", "Postgres", "Redis"]
    },
    frontend_dev: {
        title: "Frontend Developer (React/UI)",
        keywords: ["HTML", "CSS", "JavaScript", "TypeScript", "React", "Vue", "Angular", "Git", "Tailwind", "Sass"]
    },
    data_scientist: {
        title: "Data Scientist (AI/ML)",
        keywords: ["Python", "SQL", "OpenCV", "TensorFlow", "PyTorch", "Pandas", "NumPy", "Machine Learning", "AI", "NLP"]
    },
    product_manager: {
        title: "Product Manager",
        keywords: ["Agile", "Scrum", "Kanban", "Proje Yönetimi", "Excel", "Office", "Jira", "Product Roadmaps", "KPI", "SQL"]
    }
};

function calculateRoleMatch() {
    const text = processedText;
    const roleSelect = document.getElementById('targetRoleSelect');
    if (!roleSelect) return;
    
    const selectedRoleKey = roleSelect.value;
    const roleData = rolesKeywords[selectedRoleKey];
    
    if (!text) {
        resetRoleMatch();
        return;
    }
    
    const found = [];
    const missing = [];
    
    roleData.keywords.forEach(keyword => {
        const escaped = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp('\\b' + escaped + '\\b', 'i');
        if (regex.test(text)) {
            found.push(keyword);
        } else {
            missing.push(keyword);
        }
    });
    
    const totalKeywords = roleData.keywords.length;
    const matchPercentage = Math.round((found.length / totalKeywords) * 100);
    
    document.getElementById('roleMatchScore').textContent = `${matchPercentage}%`;
    
    const statusEl = document.getElementById('roleMatchStatus');
    const feedbackEl = document.getElementById('roleMatchFeedback');
    
    if (matchPercentage >= 80) {
        statusEl.textContent = '🌟 Güçlü Uyum!';
        statusEl.style.color = '#27c93f';
        feedbackEl.textContent = `Özgeçmişiniz ${roleData.title} pozisyonu için kritik anahtar kelimelerin çoğunu barındırıyor. Harika bir eşleşme!`;
    } else if (matchPercentage >= 50) {
        statusEl.textContent = '⚖ Orta Düzey Uyum';
        statusEl.style.color = 'var(--accent-purple)';
        feedbackEl.textContent = `Temel gereksinimlerin bir kısmı mevcut ancak ${roleData.title} ilanı için şansınızı artırmak adına eksik teknolojileri CV'nize ekleyebilirsiniz.`;
    } else {
        statusEl.textContent = '❌ Düşük Uyum';
        statusEl.style.color = '#ff5f56';
        feedbackEl.textContent = `Bu rol için aranan temel becerilerden birçoğu eksik görünüyor. Aşağıdaki eksik kelimeleri projelerinizle entegre etmeniz önerilir.`;
    }
    
    const foundDiv = document.getElementById('foundKeywords');
    const missingDiv = document.getElementById('missingKeywords');
    
    if (found.length === 0) {
        foundDiv.innerHTML = '<span class="no-data">Eşleşen kelime bulunamadı</span>';
    } else {
        foundDiv.innerHTML = found.map(kw => `<span class="meta-badge badge-url" style="background: rgba(39, 201, 63, 0.1); color: #27c93f; border-color: rgba(39, 201, 63, 0.2);">✔ ${kw}</span>`).join('');
    }
    
    if (missing.length === 0) {
        missingDiv.innerHTML = '<span class="no-data" style="color: #27c93f;">Tebrikler, tüm anahtar kelimeler mevcut!</span>';
    } else {
        missingDiv.innerHTML = missing.map(kw => `<span class="meta-badge badge-url" style="background: rgba(255, 95, 86, 0.1); color: #ff5f56; border-color: rgba(255, 95, 86, 0.2);">⚠ ${kw}</span>`).join('');
    }
}

function resetRoleMatch() {
    const scoreVal = document.getElementById('roleMatchScore');
    if (scoreVal) scoreVal.textContent = '0%';
    
    const statusEl = document.getElementById('roleMatchStatus');
    if (statusEl) {
        statusEl.textContent = 'Analiz Bekleniyor...';
        statusEl.style.color = '';
    }
    
    const feedbackEl = document.getElementById('roleMatchFeedback');
    if (feedbackEl) feedbackEl.textContent = 'Öncelikle sol taraftan bir CV yükleyin veya geçmişten bir döküman seçin.';
    
    const foundDiv = document.getElementById('foundKeywords');
    if (foundDiv) foundDiv.innerHTML = '<span class="no-data">Veri yok</span>';
    
    const missingDiv = document.getElementById('missingKeywords');
    if (missingDiv) missingDiv.innerHTML = '<span class="no-data">Veri yok</span>';
}

// DomContentLoaded init
document.addEventListener('DOMContentLoaded', () => {
    initializeDragAndDrop();
    initializeFAQ();
    initializeTheme();
    updateNavbarUser();
    
    // Check if page contains elements for history loading
    if (document.getElementById('historyList')) {
        loadHistoryList();
    }
    
    // Custom registration form listener
    const registerForm = document.querySelector('form.auth-form');
    if (registerForm && window.location.pathname.includes('register')) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const fullName = document.getElementById('fullName').value.trim();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            if (password.length < 8) {
                showStatus('Şifre en az 8 karakter olmalıdır.', 'error');
                return;
            }
            if (password !== confirmPassword) {
                showStatus('Şifreler eşleşmiyor.', 'error');
                return;
            }
            
            const newUser = { name: fullName, email: email, password: password };
            localStorage.setItem('customUser_' + email, JSON.stringify(newUser));
            localStorage.setItem('registerSuccess', 'Hesabınız başarıyla oluşturuldu! Şimdi giriş yapabilirsiniz.');
            window.location.href = '/login';
        });
    }
    
    // Custom login form listener
    const loginForm = document.querySelector('form.auth-form');
    if (loginForm && window.location.pathname.includes('login')) {
        const regSuccess = localStorage.getItem('registerSuccess');
        if (regSuccess) {
            showStatus(regSuccess, 'success');
            localStorage.removeItem('registerSuccess');
        }
        
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            
            const storedUserJson = localStorage.getItem('customUser_' + email);
            if (!storedUserJson) {
                showStatus('Bu e-posta ile kayıtlı bir kullanıcı bulunamadı.', 'error');
                return;
            }
            
            const storedUser = JSON.parse(storedUserJson);
            if (storedUser.password !== password) {
                showStatus('Hatalı şifre girdiniz.', 'error');
                return;
            }
            
            const mockUser = {
                name: storedUser.name,
                email: storedUser.email,
                avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(storedUser.name)}`
            };
            localStorage.setItem('user', JSON.stringify(mockUser));
            showStatus('Giriş başarılı! Yönlendiriliyorsunuz...', 'success');
            setTimeout(() => {
                window.location.href = '/';
            }, 800);
        });
    }
});

// Window Exports
window.processDocument = processDocument;
window.copyText = copyText;
window.downloadText = downloadText;
window.clearAll = clearAll;
window.switchTab = switchTab;
window.sendToWebhook = sendToWebhook;
window.loadHistoryItem = loadHistoryItem;
window.googleSignIn = googleSignIn;
window.logoutUser = logoutUser;
window.closeGoogleModal = closeGoogleModal;
window.selectGoogleAccount = selectGoogleAccount;
window.calculateRoleMatch = calculateRoleMatch;
window.calculateATSScore = calculateATSScore;
window.resetATSScore = resetATSScore;
window.resetRoleMatch = resetRoleMatch;