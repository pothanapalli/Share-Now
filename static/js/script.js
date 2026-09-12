// ==========================================================================
// NowShare — Frontend Logic & Interactions
// ==========================================================================

let countdownInterval = null;

// --------------------------------------------------------------------------
// Toast Notification Utility
// --------------------------------------------------------------------------
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// --------------------------------------------------------------------------
// File Format Helpers
// --------------------------------------------------------------------------
function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// --------------------------------------------------------------------------
// Dropzone & File Preview Interactivity
// --------------------------------------------------------------------------
function initDropzone() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const dropzonePrompt = document.getElementById('dropzonePrompt');
    const filePreview = document.getElementById('filePreview');
    const previewFileName = document.getElementById('previewFileName');
    const previewFileSize = document.getElementById('previewFileSize');
    const removeFileBtn = document.getElementById('removeFileBtn');

    if (!dropZone || !fileInput) return;

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    // Highlight dropzone on drag over
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-active'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-active'), false);
    });

    // Handle dropped files
    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt.files && dt.files.length) {
            fileInput.files = dt.files;
            handleFileSelect(dt.files[0]);
        }
    });

    // Handle standard file picker selection
    fileInput.addEventListener('change', (e) => {
        if (fileInput.files && fileInput.files.length) {
            handleFileSelect(fileInput.files[0]);
        }
    });

    // Remove selected file
    if (removeFileBtn) {
        removeFileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.value = '';
            filePreview.style.display = 'none';
            dropzonePrompt.style.display = 'block';
            document.getElementById('uploadStatus').textContent = '';
        });
    }

    function handleFileSelect(file) {
        if (!file) return;
        previewFileName.textContent = file.name;
        previewFileSize.textContent = formatBytes(file.size);
        dropzonePrompt.style.display = 'none';
        filePreview.style.display = 'flex';
        document.getElementById('uploadStatus').textContent = '';
    }
}

// --------------------------------------------------------------------------
// Upload Flow
// --------------------------------------------------------------------------
async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');

    if (!fileInput.files.length) {
        showToast('Please select or drop a file to upload.', 'error');
        return;
    }

    const uploadPopup = document.getElementById('uploadPopup');
    const progressContainer = document.getElementById('progressContainer');
    const successTick = document.getElementById('successTick');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const overlay = document.getElementById('overlay');

    // Show upload progress modal
    overlay.style.display = 'block';
    setTimeout(() => overlay.classList.add('show'), 10);

    uploadPopup.style.display = 'block';
    setTimeout(() => uploadPopup.classList.add('show'), 10);

    progressContainer.style.display = 'block';
    if (successTick) successTick.style.display = 'none';
    if (progressBar) progressBar.style.strokeDashoffset = '264';
    if (progressText) progressText.textContent = '0%';
    if (uploadBtn) uploadBtn.disabled = true;

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    try {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', function (e) {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                const offset = 264 - (264 * percent) / 100;
                if (progressBar) progressBar.style.strokeDashoffset = offset;
                if (progressText) progressText.textContent = `${percent}%`;
            }
        });

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (uploadBtn) uploadBtn.disabled = false;

                if (xhr.status === 200) {
                    try {
                        const data = JSON.parse(xhr.responseText);

                        // Show success tick briefly
                        progressContainer.style.display = 'none';
                        if (successTick) successTick.style.display = 'block';

                        setTimeout(() => {
                            uploadPopup.classList.remove('show');
                            setTimeout(() => {
                                uploadPopup.style.display = 'none';
                            }, 200);

                            // Populate and show QR Code modal
                            document.getElementById('transferCode').innerText = data.code;
                            document.getElementById('qrCodeImage').src = data.qr_code_url;
                            startCountdown(600); // 10 minutes
                            updateHistory();
                            showScanPopup();
                            showToast('File encrypted & ready to share!', 'success');
                        }, 700);

                    } catch (parseError) {
                        closeAllModals();
                        showToast('Error reading upload response.', 'error');
                    }
                } else {
                    closeAllModals();
                    let msg = 'Upload failed.';
                    try {
                        const errData = JSON.parse(xhr.responseText);
                        msg = errData.error || msg;
                    } catch (_) {
                        msg = xhr.responseText || msg;
                    }
                    showToast(msg, 'error');
                }
            }
        };

        xhr.open('POST', '/upload', true);
        xhr.send(formData);
    } catch (error) {
        if (uploadBtn) uploadBtn.disabled = false;
        closeAllModals();
        showToast('Upload error: ' + error, 'error');
    }
}

// --------------------------------------------------------------------------
// Download Flow
// --------------------------------------------------------------------------
async function downloadFile() {
    const codeInput = document.getElementById('codeInput');
    const downloadBtn = document.getElementById('downloadBtn');
    const code = (codeInput ? codeInput.value : '').trim();

    if (!code || code.length !== 6) {
        showToast('Please enter a valid 6-digit access code.', 'error');
        if (codeInput) codeInput.focus();
        return;
    }

    const originalBtnText = downloadBtn ? downloadBtn.innerHTML : '';
    if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<span>⏳ Decrypting...</span>';
    }

    try {
        const response = await fetch(`/download/${code}`);
        if (!response.ok) {
            let errorMsg = 'Invalid access code or file expired.';
            try {
                const errData = await response.json();
                errorMsg = errData.error || errorMsg;
            } catch (_) {}
            showToast(errorMsg, 'error');
            return;
        }

        // Extract filename from Content-Disposition header
        let filename = 'downloaded_file';
        const disposition = response.headers.get('Content-Disposition');
        if (disposition && disposition.includes('filename=')) {
            filename = disposition.split('filename=')[1].replace(/["']/g, '').trim();
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        showToast(`Downloaded: ${filename}`, 'success');
        updateHistory();
        if (codeInput) codeInput.value = '';

    } catch (error) {
        showToast('Download error. Please try again.', 'error');
        console.error('Download error:', error);
    } finally {
        if (downloadBtn) {
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = originalBtnText;
        }
    }
}

// --------------------------------------------------------------------------
// Modal Show / Hide
// --------------------------------------------------------------------------
function showScanPopup() {
    const overlay = document.getElementById('overlay');
    const scanModal = document.getElementById('scan');

    if (overlay) {
        overlay.style.display = 'block';
        setTimeout(() => overlay.classList.add('show'), 10);
    }
    if (scanModal) {
        scanModal.style.display = 'block';
        setTimeout(() => scanModal.classList.add('show'), 10);
    }
}

function hideScanPopup() {
    closeAllModals();
}

function closeAllModals() {
    const overlay = document.getElementById('overlay');
    const scanModal = document.getElementById('scan');
    const uploadPopup = document.getElementById('uploadPopup');

    if (scanModal) scanModal.classList.remove('show');
    if (uploadPopup) uploadPopup.classList.remove('show');
    if (overlay) overlay.classList.remove('show');

    setTimeout(() => {
        if (scanModal) scanModal.style.display = 'none';
        if (uploadPopup) uploadPopup.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
    }, 250);
}

// --------------------------------------------------------------------------
// Copy Code to Clipboard
// --------------------------------------------------------------------------
function copyCode() {
    const codeElement = document.getElementById('transferCode');
    const copyButton = document.getElementById('copyCodeButton');
    if (!codeElement) return;

    const code = codeElement.innerText.trim();
    if (!code || code === '------') return;

    navigator.clipboard.writeText(code).then(() => {
        if (copyButton) {
            copyButton.classList.add('copied');
            copyButton.innerHTML = '✓';
            setTimeout(() => {
                copyButton.classList.remove('copied');
                copyButton.innerHTML = `
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                  </svg>`;
            }, 2000);
        }
        showToast(`Code ${code} copied to clipboard!`, 'success');
    }).catch(err => {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = code;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        showToast(`Code ${code} copied!`, 'success');
    });
}

// --------------------------------------------------------------------------
// Quick Paste Code Helper
// --------------------------------------------------------------------------
function initPasteButton() {
    const pasteBtn = document.getElementById('pasteBtn');
    const codeInput = document.getElementById('codeInput');

    if (!pasteBtn || !codeInput) return;

    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            const cleanCode = text.replace(/\D/g, '').slice(0, 6);
            if (cleanCode.length === 6) {
                codeInput.value = cleanCode;
                showToast('Code pasted!', 'info');
                codeInput.focus();
            } else if (cleanCode.length > 0) {
                codeInput.value = cleanCode;
                codeInput.focus();
            } else {
                showToast('No 6-digit code found in clipboard.', 'error');
            }
        } catch (_) {
            codeInput.focus();
            showToast('Press Ctrl + V to paste.', 'info');
        }
    });

    // Restrict input to numbers only
    codeInput.addEventListener('input', (e) => {
        codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
        if (codeInput.value.length === 6) {
            downloadFile();
        }
    });
}

// --------------------------------------------------------------------------
// Web Share API
// --------------------------------------------------------------------------
async function shareQRCode() {
    const code = document.getElementById('transferCode').innerText.trim();
    const qrImage = document.getElementById('qrCodeImage').src;
    const shareUrl = `${window.location.origin}/?code=${code}`;

    if (navigator.share) {
        try {
            await navigator.share({
                title: 'NowShare — File Transfer',
                text: `Download my file on NowShare using 6-digit code: ${code}`,
                url: shareUrl
            });
            showToast('Shared successfully!', 'success');
        } catch (err) {
            if (err.name !== 'AbortError') {
                copyShareLink(shareUrl);
            }
        }
    } else {
        copyShareLink(shareUrl);
    }
}

function copyShareLink(url) {
    navigator.clipboard.writeText(url).then(() => {
        showToast('Direct download link copied to clipboard!', 'success');
    }).catch(() => {
        showToast(url, 'info');
    });
}

// --------------------------------------------------------------------------
// Countdown Timer
// --------------------------------------------------------------------------
function startCountdown(durationInSeconds) {
    const expiryElement = document.getElementById('expiryTime');
    if (!expiryElement) return;

    if (countdownInterval) clearInterval(countdownInterval);

    let remaining = durationInSeconds;

    function updateDisplay() {
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        expiryElement.textContent = `Expires in ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

        if (remaining <= 0) {
            clearInterval(countdownInterval);
            expiryElement.textContent = 'Expired (File automatically purged)';
            expiryElement.style.color = '#ef4444';
        }
        remaining--;
    }

    updateDisplay();
    countdownInterval = setInterval(updateDisplay, 1000);
}

// --------------------------------------------------------------------------
// Transfer History Fetcher
// --------------------------------------------------------------------------
async function updateHistory() {
    try {
        const response = await fetch('/get_history');
        if (!response.ok) return;

        const historyData = await response.json();
        const tbody = document.getElementById('historyTableBody');
        if (!tbody) return;

        if (!historyData || historyData.length === 0) {
            tbody.innerHTML = `
                <tr id="emptyHistoryRow">
                  <td colspan="4" class="empty-history">
                    <span class="empty-icon">📂</span>
                    <p>No transfers recorded in this session yet.</p>
                  </td>
                </tr>`;
            return;
        }

        tbody.innerHTML = '';
        historyData.forEach(entry => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><span class="ip-tag">${escapeHtml(entry.sender_ip || 'Unknown')}</span></td>
                <td><span class="ip-tag">${escapeHtml(entry.receiver_ip || 'Pending')}</span></td>
                <td class="history-filename" title="${escapeHtml(entry.filename || '')}">${escapeHtml(entry.filename || 'file')}</td>
                <td><span class="status-badge-done">Completed</span></td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Failed to update transfer history:', error);
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// --------------------------------------------------------------------------
// Contact Form Submission
// --------------------------------------------------------------------------
function initContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const responseMsg = document.getElementById('response-message');
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : 'Send Message';

        const fd = new FormData(form);
        const formData = {
            name: (fd.get('name') || '').trim(),
            phone: (fd.get('phone') || '').trim(),
            email: (fd.get('email') || '').trim(),
            message: (fd.get('message') || '').trim()
        };

        if (responseMsg) {
            responseMsg.innerText = 'Submitting message...';
            responseMsg.style.color = 'var(--text-muted)';
        }
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Sending...</span>';
        }

        try {
            const res = await fetch('/submit_contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            let result = {};
            try {
                result = await res.json();
            } catch (_) {
                result = { message: res.ok ? 'Message sent successfully!' : `Server error (${res.status})` };
            }

            if (responseMsg) {
                responseMsg.innerText = result.message || (res.ok ? 'Message sent successfully!' : 'Submission failed.');
                responseMsg.style.color = res.ok ? '#34d399' : '#ef4444';
            }

            if (res.ok) {
                form.reset();
                showToast('Contact message sent successfully!', 'success');
            } else {
                showToast(result.message || 'Submission failed.', 'error');
            }
        } catch (err) {
            console.error('Contact form submission error:', err);
            if (responseMsg) {
                responseMsg.innerText = 'Connection error: Unable to reach the server. Please try again.';
                responseMsg.style.color = '#ef4444';
            }
            showToast('Unable to connect to server.', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        }
    });
}

// --------------------------------------------------------------------------
// Auto-fill Code from URL (?code=123456)
// --------------------------------------------------------------------------
function autoFillCodeFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
        const receiveInput = document.getElementById('codeInput');
        if (receiveInput) {
            receiveInput.value = code;
            showToast(`Loaded access code: ${code}`, 'info');
            // Smoothly scroll down to receive section
            const receiveCard = document.getElementById('Receive');
            if (receiveCard) {
                setTimeout(() => receiveCard.scrollIntoView({ behavior: 'smooth' }), 500);
            }
        }
    }
}

// --------------------------------------------------------------------------
// Initialize Everything on Load
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function () {
    initDropzone();
    initPasteButton();
    initContactForm();
    autoFillCodeFromURL();
    updateHistory();

    // Share QR button
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', shareQRCode);
    }

    // Escape key to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });
});
