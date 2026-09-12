import os
import random
import string
import logging
import time
import threading
from io import BytesIO
import base64
import socket

from flask import Flask, render_template, request, jsonify, send_file
from cryptography.fernet import Fernet
import qrcode
from werkzeug.utils import secure_filename
from pymongo import MongoClient
from dotenv import load_dotenv
import certifi


if os.path.exists('.env'):
    load_dotenv(dotenv_path='.env', override=False)

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-fallback-key')
app.config['MAX_CONTENT_LENGTH'] = int(os.environ.get('MAX_FILE_SIZE_MB', 100)) * 1024 * 1024

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
)
logger = logging.getLogger(__name__)

# MongoDB
MONGO_URI = os.environ.get('MONGO_URI')
_mongo_client = None
_contact_collection = None


def get_contact_collection():
    """Get or reconnect to the MongoDB contacts collection."""
    global _mongo_client, _contact_collection
    if _contact_collection is not None:
        try:
            _mongo_client.admin.command('ping')
            return _contact_collection
        except Exception:
            logger.warning("MongoDB ping failed, reconnecting...")
            _mongo_client = None
            _contact_collection = None

    if not MONGO_URI:
        logger.warning("MONGO_URI not set. Contact form will be disabled.")
        return None

    try:
        _mongo_client = MongoClient(
            MONGO_URI,
            serverSelectionTimeoutMS=15000,
            connectTimeoutMS=15000,
            socketTimeoutMS=15000,
            tlsCAFile=certifi.where(),
            retryWrites=True
        )
        db = _mongo_client["nowshare_db"]
        _contact_collection = db["contacts"]
        logger.info("MongoDB client connected successfully.")
        return _contact_collection
    except Exception as e:
        logger.error(f"MongoDB connection failed: {e}")
        _mongo_client = None
        _contact_collection = None
        return None


# Initial connection attempt on startup
get_contact_collection()

# File storage
UPLOAD_FOLDER = 'uploads'
FILE_EXPIRY_SECONDS = int(os.environ.get('FILE_EXPIRY_MINUTES', 10)) * 60

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# In-memory stores — NOTE: data is lost on restart.
# For production at scale, use Redis or a database.
codes = {}      # code -> { path, key, created_at, filename }
history = []    # list of { sender_ip, receiver_ip, filename, created_at }

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def generate_code():
    """Generate a unique 6-digit code, retrying on collision."""
    for _ in range(100):
        code = ''.join(random.choices(string.digits, k=6))
        if code not in codes:
            return code
    # Extremely unlikely fallback
    raise RuntimeError("Could not generate a unique code after 100 attempts")


def get_lan_ip():
    """Retrieve primary LAN IP so mobile devices on the same Wi-Fi can connect."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return '127.0.0.1'


def generate_qr_code(code):
    """Generate a QR code containing the download URL as a base64 data-URI."""
    custom_base_url = os.environ.get('BASE_URL', '').rstrip('/')
    if custom_base_url:
        base_url = custom_base_url
    else:
        # Build the URL dynamically based on the current request
        base_url = request.host_url.rstrip('/')
        # When accessed from localhost or 127.0.0.1, use LAN IP so mobile phones scanning the QR code can connect
        for local_name in ('localhost', '127.0.0.1'):
            if local_name in base_url:
                lan_ip = get_lan_ip()
                base_url = base_url.replace(local_name, lan_ip)
                break

    url_with_code = f"{base_url}/?code={code}"

    img = qrcode.make(url_with_code)
    img_io = BytesIO()
    img.save(img_io, 'PNG')
    img_io.seek(0)

    img_base64 = base64.b64encode(img_io.getvalue()).decode('utf-8')
    return f"data:image/png;base64,{img_base64}"


def cleanup_expired_files():
    """Remove files and codes that have exceeded the expiry time."""
    now = time.time()
    expired_codes = [
        c for c, info in codes.items()
        if now - info['created_at'] > FILE_EXPIRY_SECONDS
    ]
    for c in expired_codes:
        info = codes.pop(c, None)
        if info and os.path.exists(info['path']):
            try:
                os.remove(info['path'])
                logger.info(f"Expired file removed: {info['path']}")
            except OSError as e:
                logger.error(f"Failed to remove expired file {info['path']}: {e}")


def start_cleanup_scheduler():
    """Run cleanup every 60 seconds in a background thread."""
    def _run():
        while True:
            time.sleep(60)
            try:
                cleanup_expired_files()
            except Exception as e:
                logger.error(f"Cleanup error: {e}")

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    logger.info(f"File cleanup scheduler started (expiry: {FILE_EXPIRY_SECONDS}s).")


# Start the cleanup scheduler
start_cleanup_scheduler()

@app.route('/health')
def health():
    """Simple health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'app': 'nowshare'
    }), 200


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route('/')
def index():
    return render_template('index.html', history=history)


@app.route('/upload', methods=['POST'])
def upload():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file part in request'}), 400

        file = request.files['file']
        if file.filename == '' or file.filename is None:
            return jsonify({'error': 'No file selected'}), 400

        sender_ip = request.headers.get(
            'X-Forwarded-For', request.remote_addr
        ).split(',')[0].strip()

        code = generate_code()

        original_filename = secure_filename(file.filename)
        if not original_filename:
            original_filename = 'unnamed_file'

        filename = f"{code}_{original_filename}"
        path = os.path.join(UPLOAD_FOLDER, filename)

        # Encrypt file data
        key = Fernet.generate_key()
        fernet = Fernet(key)
        encrypted_data = fernet.encrypt(file.read())

        with open(path, 'wb') as f:
            f.write(encrypted_data)

        # Store metadata
        codes[code] = {
            'path': path,
            'key': key,
            'created_at': time.time(),
            'filename': original_filename,
        }

        history.append({
            'sender_ip': sender_ip,
            'receiver_ip': '',
            'filename': original_filename,
            'created_at': time.time(),
        })

        qr_code_url = generate_qr_code(code)

        logger.info(f"File uploaded: {original_filename} (code: {code}) from {sender_ip}")
        return jsonify({'code': code, 'qr_code_url': qr_code_url})

    except Exception as e:
        logger.error(f"Upload error: {e}", exc_info=True)
        return jsonify({'error': 'Upload failed. Please try again.'}), 500


@app.route('/download/<code>', methods=['GET'])
def download(code):
    info = codes.get(code)

    if not info:
        return jsonify({'error': 'Invalid code or file expired.'}), 404

    path = info['path']
    key = info['key']

    if not os.path.exists(path):
        codes.pop(code, None)
        return jsonify({'error': 'File not found. It may have expired.'}), 404

    try:
        fernet = Fernet(key)
        with open(path, 'rb') as f:
            encrypted_data = f.read()
        decrypted_data = fernet.decrypt(encrypted_data)
    except Exception as e:
        logger.error(f"Decryption failed for code {code}: {e}")
        return jsonify({'error': 'Decryption failed.'}), 500

    original_filename = info.get('filename', 'downloaded_file')

    # Update history with receiver IP
    receiver_ip = request.headers.get(
        'X-Forwarded-For', request.remote_addr
    ).split(',')[0].strip()

    for entry in history:
        if entry['filename'] == original_filename and entry['receiver_ip'] == '':
            entry['receiver_ip'] = receiver_ip
            break

    logger.info(f"File downloaded: {original_filename} (code: {code}) by {receiver_ip}")

    return send_file(
        BytesIO(decrypted_data),
        as_attachment=True,
        download_name=original_filename,
        mimetype='application/octet-stream'
    )


@app.route('/get_history', methods=['GET'])
def get_history():
    # Return sanitized history (strip code prefix from filenames)
    safe_history = []
    for entry in history:
        safe_history.append({
            'sender_ip': entry.get('sender_ip', ''),
            'receiver_ip': entry.get('receiver_ip', ''),
            'filename': entry.get('filename', ''),
        })
    return jsonify(safe_history)


@app.route('/submit_contact', methods=['POST'])
def submit_contact():
    data = request.get_json(silent=True)

    if not data:
        logger.warning("Contact submission failed: No JSON data received")
        return jsonify({"message": "Invalid form data received."}), 400

    name = str(data.get('name') or '').strip()
    phone = str(data.get('phone') or '').strip()
    email = str(data.get('email') or '').strip()
    message = str(data.get('message') or '').strip()

    missing = []
    if not name: missing.append("Name")
    if not phone: missing.append("Phone")
    if not email: missing.append("Email")
    if not message: missing.append("Message")

    if missing:
        logger.warning(f"Contact submission missing fields: {missing}")
        return jsonify({"message": f"Please fill out all fields: {', '.join(missing)} required."}), 400

    # Basic email validation
    if '@' not in email or '.' not in email:
        logger.warning(f"Contact submission invalid email: {email}")
        return jsonify({"message": "Please enter a valid email address."}), 400

    doc = {
        "name": name,
        "phone": phone,
        "email": email,
        "message": message,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    # Attempt insert with 1 retry in case of transient Atlas replica election or SSL timeout
    last_error = None
    for attempt in range(2):
        col = get_contact_collection()
        if col is None:
            return jsonify({"message": "Database is temporarily unreachable. Please check your internet or try again."}), 503

        try:
            col.insert_one(doc)
            logger.info(f"Contact form submitted successfully by {name} ({email})")
            return jsonify({"message": "Contact submitted successfully!"}), 200
        except Exception as e:
            last_error = e
            logger.warning(f"Database insert attempt {attempt + 1} failed: {e}")
            time.sleep(1)

    logger.error(f"Contact form database insert error after retries: {last_error}", exc_info=True)
    return jsonify({"message": "Could not connect to database. If this persists, ensure your current IP is allowed in MongoDB Atlas Network Access."}), 500



# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404


@app.errorhandler(413)
def file_too_large(e):
    max_mb = int(os.environ.get('MAX_FILE_SIZE_MB', 100))
    return jsonify({'error': f'File too large. Maximum size is {max_mb} MB.'}), 413


@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error'}), 500


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port, debug=debug, use_reloader=False)
