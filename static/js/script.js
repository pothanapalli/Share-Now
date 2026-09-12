// ==========================================================================
// NowShare — Client Interaction & Communication Engine
// ==========================================================================

let countdownInterval = null;

// --------------------------------------------------------------------------
// Editorial Toast Notification System
// --------------------------------------------------------------------------
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconSvg = type === 'error'
        ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c2410c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
        : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    toast.innerHTML = `<span class="toast-icon">${iconSvg}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        setTimeout(() => toast.remove(), 250);
    }, 3800);
}

// --------------------------------------------------------------------------
// Byte Formatter
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
// Dropzone Staging & File Preview Handling
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

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-active'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-active'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt.files && dt.files.length) {
            fileInput.files = dt.files;
            handleFileSelect(dt.files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files.length) {
            handleFileSelect(fileInput.files[0]);
        }
    });

    if (removeFileBtn) {
        removeFileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.value = '';
            filePreview.style.display = 'none';
            dropzonePrompt.style.display = 'block';
            const statusEl = document.getElementById('uploadStatus');
            if (statusEl) statusEl.textContent = '';
        });
    }

    function handleFileSelect(file) {
        if (!file) return;
        previewFileName.textContent = file.name;
        previewFileSize.textContent = formatBytes(file.size);
        dropzonePrompt.style.display = 'none';
        filePreview.style.display = 'flex';
        const statusEl = document.getElementById('uploadStatus');
        if (statusEl) statusEl.textContent = '';
    }
}

// --------------------------------------------------------------------------
// Payload Encryption & Dispatch
// --------------------------------------------------------------------------
async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');

    if (!fileInput.files.length) {
        showToast('Please stage a payload to dispatch.', 'error');
        return;
    }

    const uploadPopup = document.getElementById('uploadPopup');
    const progressContainer = document.getElementById('progressContainer');
    const successTick = document.getElementById('successTick');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const overlay = document.getElementById('overlay');

    // Open progress dialogue
    if (overlay) {
        overlay.style.display = 'block';
        setTimeout(() => overlay.classList.add('show'), 10);
    }
    if (uploadPopup) {
        uploadPopup.style.display = 'block';
        setTimeout(() => uploadPopup.classList.add('show'), 10);
    }

    if (progressContainer) progressContainer.style.display = 'block';
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

                        if (progressContainer) progressContainer.style.display = 'none';
                        if (successTick) successTick.style.display = 'block';

                        setTimeout(() => {
                            if (uploadPopup) uploadPopup.classList.remove('show');
                            setTimeout(() => {
                                if (uploadPopup) uploadPopup.style.display = 'none';
                            }, 180);

                            const codeEl = document.getElementById('transferCode');
                            const qrEl = document.getElementById('qrCodeImage');
                            if (codeEl) codeEl.innerText = data.code;
                            if (qrEl) qrEl.src = data.qr_code_url;

                            startCountdown(600);
                            updateHistory();
                            showScanPopup();
                            showToast('Payload encrypted and staged.', 'success');
                        }, 600);

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
        showToast('Upload failed: ' + error, 'error');
    }
}

// --------------------------------------------------------------------------
// Payload Retrieval & Decryption
// --------------------------------------------------------------------------
async function downloadFile() {
    const codeInput = document.getElementById('codeInput');
    const downloadBtn = document.getElementById('downloadBtn');
    const code = (codeInput ? codeInput.value : '').trim();

    if (!code || code.length !== 6) {
        showToast('Specify a valid 6-digit access PIN.', 'error');
        if (codeInput) codeInput.focus();
        return;
    }

    const originalBtnText = downloadBtn ? downloadBtn.innerHTML : '';
    if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<span>Decrypting Payload...</span>';
    }

    try {
        const response = await fetch(`/download/${code}`);
        if (!response.ok) {
            let errorMsg = 'Invalid PIN or payload has expired.';
            try {
                const errData = await response.json();
                errorMsg = errData.error || errorMsg;
            } catch (_) {}
            showToast(errorMsg, 'error');
            return;
        }

        let filename = 'retrieved_payload';
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

        showToast(`Retrieved: ${filename}`, 'success');
        updateHistory();
        if (codeInput) codeInput.value = '';

    } catch (error) {
        showToast('Retrieval error. Please try again.', 'error');
        console.error('Download error:', error);
    } finally {
        if (downloadBtn) {
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = originalBtnText;
        }
    }
}

// --------------------------------------------------------------------------
// Modal Show / Close Logic
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
    }, 200);
}

// --------------------------------------------------------------------------
// Copy Access PIN
// --------------------------------------------------------------------------
function copyCode() {
    const codeElement = document.getElementById('transferCode');
    const copyButton = document.getElementById('copyCodeButton');
    if (!codeElement) return;

    const code = codeElement.innerText.trim();
    if (!code || code === '------') return;

    const originalIcon = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
        </svg>`;

    const checkIcon = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
        </svg>`;

    navigator.clipboard.writeText(code).then(() => {
        if (copyButton) {
            copyButton.classList.add('copied');
            copyButton.innerHTML = checkIcon;
            setTimeout(() => {
                copyButton.classList.remove('copied');
                copyButton.innerHTML = originalIcon;
            }, 2000);
        }
        showToast(`PIN ${code} copied to clipboard.`, 'success');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        showToast(`PIN ${code} copied.`, 'success');
    });
}

// --------------------------------------------------------------------------
// Quick Paste Pin Helper
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
                showToast(`PIN ${cleanCode} pasted.`, 'info');
                codeInput.focus();
            } else if (cleanCode.length > 0) {
                codeInput.value = cleanCode;
                codeInput.focus();
            } else {
                showToast('Clipboard does not contain numerical digits.', 'error');
            }
        } catch (_) {
            codeInput.focus();
            showToast('Use Ctrl + V to paste PIN directly.', 'info');
        }
    });

    codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
        if (codeInput.value.length === 6) {
            downloadFile();
        }
    });
}

// --------------------------------------------------------------------------
// Share Action
// --------------------------------------------------------------------------
async function shareQRCode() {
    const code = document.getElementById('transferCode').innerText.trim();
    const shareUrl = `${window.location.origin}/?code=${code}`;

    if (navigator.share) {
        try {
            await navigator.share({
                title: 'NowShare — Ephemeral Payload',
                text: `Retrieve payload via NowShare PIN: ${code}`,
                url: shareUrl
            });
            showToast('Dispatched share request.', 'success');
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
        showToast('Retrieval URL copied to clipboard.', 'success');
    }).catch(() => {
        showToast(url, 'info');
    });
}

// --------------------------------------------------------------------------
// Expiry Countdown
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
            expiryElement.textContent = 'Payload Expired (Storage purged)';
            expiryElement.style.color = '#c2410c';
        }
        remaining--;
    }

    updateDisplay();
    countdownInterval = setInterval(updateDisplay, 1000);
}

// --------------------------------------------------------------------------
// Transfer History Updates
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
                  <td colspan="4" class="journal-empty">
                    No transfers registered in the current session journal.
                  </td>
                </tr>`;
            return;
        }

        tbody.innerHTML = '';
        historyData.forEach(entry => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="font-mono">${escapeHtml(entry.sender_ip || 'Internal')}</td>
                <td class="font-mono">${escapeHtml(entry.receiver_ip || 'Pending')}</td>
                <td class="history-filename" title="${escapeHtml(entry.filename || '')}">${escapeHtml(entry.filename || 'payload')}</td>
                <td><span class="badge-status-ok">Complete</span></td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Failed to update journal history:', error);
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
// Contact Form Handler
// --------------------------------------------------------------------------
function initContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const responseMsg = document.getElementById('response-message');
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : 'Transmit Message';

        const fd = new FormData(form);
        const formData = {
            name: (fd.get('name') || '').trim(),
            phone: (fd.get('phone') || '').trim(),
            email: (fd.get('email') || '').trim(),
            message: (fd.get('message') || '').trim()
        };

        if (responseMsg) {
            responseMsg.innerText = 'Transmitting message...';
            responseMsg.style.color = 'var(--text-muted)';
        }
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Transmitting...</span>';
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
                result = { message: res.ok ? 'Message transmitted successfully.' : `Server returned code ${res.status}` };
            }

            if (responseMsg) {
                responseMsg.innerText = result.message || (res.ok ? 'Message transmitted successfully.' : 'Transmission rejected.');
                responseMsg.style.color = res.ok ? 'var(--color-accent)' : '#c2410c';
            }

            if (res.ok) {
                form.reset();
                showToast('Inquiry transmission recorded.', 'success');
            } else {
                showToast(result.message || 'Transmission failed.', 'error');
            }
        } catch (err) {
            console.error('Contact form submission error:', err);
            if (responseMsg) {
                responseMsg.innerText = 'Unable to connect to gateway. Please try again.';
                responseMsg.style.color = '#c2410c';
            }
            showToast('Unable to reach server.', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        }
    });
}

// --------------------------------------------------------------------------
// Auto-Fill Code (?code=000000)
// --------------------------------------------------------------------------
function autoFillCodeFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
        const receiveInput = document.getElementById('codeInput');
        if (receiveInput) {
            receiveInput.value = code;
            showToast(`Loaded PIN: ${code}`, 'info');
            const receiveCard = document.getElementById('Receive');
            if (receiveCard) {
                setTimeout(() => receiveCard.scrollIntoView({ behavior: 'smooth' }), 400);
            }
        }
    }
}

// --------------------------------------------------------------------------
// DOM Initialization
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function () {
    initDropzone();
    initPasteButton();
    initContactForm();
    autoFillCodeFromURL();
    updateHistory();

    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', shareQRCode);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });
});
