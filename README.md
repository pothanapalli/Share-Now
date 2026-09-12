# 📤 NowShare

NowShare is a **secure file-sharing web application** that lets you upload, encrypt, and share files using a unique 6-digit code or QR code. Files are encrypted with AES (Fernet) and automatically expire after 10 minutes.

---

## 🚀 Features

- 🔐 **AES Encryption** — Files are encrypted before storage using `cryptography.Fernet`
- 📎 **6-Digit Codes** — Every upload generates a unique access code
- 📷 **QR Code Sharing** — Share access instantly with scannable QR codes
- ⏱️ **Auto-Expiry** — Files automatically delete after 10 minutes
- 🧾 **Transfer History** — View recent uploads/downloads in-session
- 📱 **Mobile Friendly** — Responsive design works on all devices
- 📬 **Contact Form** — Submissions saved to MongoDB Atlas

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python, Flask |
| **Frontend** | HTML, CSS, JavaScript (Jinja2 templates) |
| **Database** | MongoDB Atlas |
| **Encryption** | AES via `cryptography.Fernet` |
| **QR Codes** | `qrcode` library |
| **Production Server** | Gunicorn |

---

## 📂 Project Structure

```
nowshare/
├── app.py              # Flask application (all routes & logic)
├── requirements.txt    # Python dependencies
├── .env                # Environment variables (gitignored)
├── .env.example        # Template for .env
├── .gitignore          # Git ignore rules
├── Procfile            # Render/Railway startup command
├── test_app.py         # Test suite
├── static/
│   ├── css/style.css   # Stylesheet
│   └── js/script.js    # Frontend JavaScript
├── templates/
│   └── index.html      # Main HTML template
└── uploads/            # Encrypted file storage (gitignored)
```

---

## ⚡ Quick Start (Local Development)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/nowshare.git
cd nowshare
```

### 2. Create a virtual environment

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` with your MongoDB Atlas connection string:

```env
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/?appName=Nowshare
SECRET_KEY=your-secret-key
FLASK_DEBUG=true
PORT=10000
```

### 5. Run the application

```bash
python app.py
```

Open **http://localhost:10000** in your browser.

---

## 🧪 Running Tests

```bash
python test_app.py
```

---

## 🚀 Deployment (Render)

1. Push your code to GitHub
2. Create a new **Web Service** on [render.com](https://render.com)
3. Connect your repository
4. Set the following:
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app --bind 0.0.0.0:$PORT`
5. Add environment variables in the Render dashboard:
   - `MONGO_URI` — your MongoDB Atlas connection string
   - `SECRET_KEY` — a random secret key
   - `PORT` — `10000`
   - `FILE_EXPIRY_MINUTES` — `10`
6. Deploy!

---

## 📝 License

This project is for educational purposes.

