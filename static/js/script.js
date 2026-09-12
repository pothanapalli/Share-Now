// ============================================
// NowShare — Frontend Logic
// ============================================

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------
async function uploadFile() {
    const fileInput = document.getElementById("fileInput");

    // Validate BEFORE showing popup
    if (!fileInput.files.length) {
        alert("Please select a file to upload.");
        return;
    }

    // Show upload popup with progress
    document.getElementById("uploadPopup").style.display = "block";
    document.getElementById("progressContainer").style.display = "block";
    const successTick = document.getElementById("successTick");
    if (successTick) successTick.style.display = "none";

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);

    try {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", function (e) {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                const offset = 282.6 - (282.6 * percent) / 100;
                document.getElementById("progressBar").style.strokeDashoffset = offset;
                document.getElementById("progressText").textContent = `${percent}%`;
            }
        });

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                document.getElementById("uploadPopup").style.display = "none";

                if (xhr.status === 200) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        document.getElementById("transferCode").innerText = data.code;
                        document.getElementById("qrCodeImage").src = data.qr_code_url;
                        startCountdown(600); // 10-minute countdown
                        updateHistory();
                        showScanPopup();
                    } catch (parseError) {
                        alert("Upload succeeded but response was invalid.");
                        console.error("Parse error:", parseError);
                    }
                } else {
                    let msg = "Upload failed.";
                    try {
                        const errData = JSON.parse(xhr.responseText);
                        msg = errData.error || msg;
                    } catch (_) {
                        msg = xhr.responseText || msg;
                    }
                    alert(msg);
                }

                // Reset progress bar for next upload
                document.getElementById("progressBar").style.strokeDashoffset = 282.6;
                document.getElementById("progressText").textContent = "0%";
            }
        };

        xhr.open("POST", "/upload", true);
        xhr.send(formData);
    } catch (error) {
        alert("Upload failed: " + error);
        document.getElementById("uploadPopup").style.display = "none";
    }
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------
async function downloadFile() {
    const code = document.getElementById("codeInput").value.trim();
    if (!code) {
        alert("Enter the code to download the file.");
        return;
    }

    // Show popup
    const popup = document.getElementById("uploadPopup");
    const tickIcon = document.getElementById("successTick");

    popup.style.display = "block";
    document.getElementById("progressContainer").style.display = "none";
    if (tickIcon) tickIcon.style.display = "none";

    try {
        const response = await fetch(`/download/${code}`);
        if (!response.ok) {
            let errorMsg = "Invalid code or file expired.";
            try {
                const errData = await response.json();
                errorMsg = errData.error || errorMsg;
            } catch (_) {
                errorMsg = await response.text() || errorMsg;
            }
            alert("Error: " + errorMsg);
            popup.style.display = "none";
            return;
        }

        const blob = await response.blob();
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'downloaded_file';

        if (contentDisposition) {
            const match = contentDisposition.match(/filename="?(.+)"?/);
            if (match && match[1]) {
                filename = match[1];
            }
        }

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        await updateHistory();

        // Show success
        if (tickIcon) {
            tickIcon.style.display = "flex";
            tickIcon.classList.add("animate-tick");
        }

        // Auto-close popup after 3 seconds
        setTimeout(() => {
            popup.style.display = "none";
            if (tickIcon) {
                tickIcon.classList.remove("animate-tick");
                tickIcon.style.display = "none";
            }
        }, 3000);

    } catch (error) {
        alert("Download failed: " + error);
        popup.style.display = "none";
    }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
async function updateHistory() {
    try {
        const res = await fetch("/get_history");
        const history = await res.json();
        const container = document.getElementById("historyContainer");
        if (!container) return;

        container.innerHTML = "";

        if (history.length === 0) {
            container.innerHTML = "<p style='text-align:center; color:#888;'>No history available.</p>";
            return;
        }

        history.forEach(entry => {
            const div = document.createElement("div");
            div.className = "history-entry";
            div.innerHTML = `
                <strong>Sender IP:</strong> ${entry.sender_ip}<br>
                <strong>Receiver IP:</strong> ${entry.receiver_ip || 'Pending'}<br>
                <strong>Filename:</strong> ${entry.filename}
            `;
            container.appendChild(div);
        });
    } catch (error) {
        console.error("Failed to update history:", error);
    }
}

// ---------------------------------------------------------------------------
// Copy code
// ---------------------------------------------------------------------------
function copyCode() {
    const code = document.getElementById("transferCode").innerText;
    if (!code) return;

    navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById("copyCodeButton");
        btn.classList.add("copied");
        setTimeout(() => btn.classList.remove("copied"), 1000);
    }).catch(err => {
        console.error("Copy failed:", err);
    });
}

// ---------------------------------------------------------------------------
// QR popup show/hide
// ---------------------------------------------------------------------------
function showScanPopup() {
    document.getElementById("scan").style.display = "block";
    document.getElementById("overlay").style.display = "block";
}

function hideScanPopup() {
    document.getElementById("scan").style.display = "none";
    document.getElementById("overlay").style.display = "none";
}

// ---------------------------------------------------------------------------
// Countdown timer
// ---------------------------------------------------------------------------
function startCountdown(durationInSeconds) {
    const expiryTimeElement = document.getElementById("expiryTime");
    let remaining = durationInSeconds;

    const interval = setInterval(() => {
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        expiryTimeElement.textContent = `Expires in: ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

        if (remaining <= 0) {
            clearInterval(interval);
            expiryTimeElement.textContent = "File expired.";
        }

        remaining--;
    }, 1000);
}

// ---------------------------------------------------------------------------
// QR code sharing (Web Share API)
// ---------------------------------------------------------------------------
function shareQRCode() {
    const qrImg = document.getElementById('qrCodeImage');
    const dataUrl = qrImg ? qrImg.src : '';

    if (!dataUrl || !dataUrl.startsWith('data:image')) {
        alert("QR Code not available yet. Upload a file first.");
        return;
    }

    // Convert base64 data URL to Blob
    try {
        const byteString = atob(dataUrl.split(',')[1]);
        const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeString });
        const file = new File([blob], 'qr-code.png', { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({
                title: 'NowShare QR Code',
                text: 'Scan this to download your file:',
                files: [file],
            }).catch(error => {
                console.error('Sharing failed:', error);
            });
        } else {
            alert('Sharing is not supported on this device/browser.');
        }
    } catch (error) {
        console.error('Share error:', error);
        alert('Could not share QR code.');
    }
}

// ---------------------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------------------
function initContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const responseMsg = document.getElementById('response-message');
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerText : 'Submit';

        // Extract inputs safely using FormData
        const fd = new FormData(form);
        const formData = {
            name: (fd.get('name') || '').trim(),
            phone: (fd.get('phone') || '').trim(),
            email: (fd.get('email') || '').trim(),
            message: (fd.get('message') || '').trim()
        };

        if (responseMsg) {
            responseMsg.innerText = 'Submitting message...';
            responseMsg.style.color = '#555';
        }
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = 'Sending...';
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
                responseMsg.style.color = res.ok ? 'green' : 'red';
            }

            if (res.ok) {
                form.reset();
            }
        } catch (err) {
            console.error('Contact form submission error:', err);
            if (responseMsg) {
                responseMsg.innerText = 'Connection error: Unable to reach the server. Please check your connection and try again.';
                responseMsg.style.color = 'red';
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = originalBtnText;
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Auto-fill code from QR scan URL
// ---------------------------------------------------------------------------
function autoFillCodeFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
        const receiveInput = document.getElementById('codeInput');
        if (receiveInput) {
            receiveInput.value = code;
        }
    }
}

// ---------------------------------------------------------------------------
// Initialize on page load
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function () {
    updateHistory();
    autoFillCodeFromURL();
    initContactForm();

    // Share button
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', shareQRCode);
    }
});
