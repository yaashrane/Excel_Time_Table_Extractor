"""
Application Configuration
-------------------------
Central configuration for the Flask backend.
Loads environment-dependent settings and constants.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

# Load .env file if it exists
load_dotenv(BASE_DIR / ".env")

# Demo credentials — move to env vars or a DB in production
APP_USERNAME = os.environ.get("APP_USERNAME", "admin")
APP_PASSWORD = os.environ.get("APP_PASSWORD", "admin123")


class Config:
    """Base configuration class."""

    SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production")

    # Email / OTP settings
    MAIL_SERVER   = os.environ.get("MAIL_SERVER",   "smtp.gmail.com")
    MAIL_PORT     = int(os.environ.get("MAIL_PORT",  "587"))
    MAIL_USE_TLS  = True
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME", "")   # your Gmail address
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD", "")   # Gmail app-password
    MAIL_DEFAULT_SENDER = os.environ.get("MAIL_USERNAME", "noreply@extractify.app")
    OTP_EXPIRY_SECONDS  = 600   # 10 minutes

    # File upload settings
    UPLOAD_FOLDER = BASE_DIR / "uploads"
    ALLOWED_EXTENSIONS = {"xlsx", "xls"}
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB

    # CORS settings
    CORS_ORIGINS = ["*"]  # Tighten in production

    # Parser tuning
    MAX_SCAN_ROWS = 80          # Rows to scan when detecting structure
    MIN_HEADER_CONFIDENCE = 0.55
    DEBUG = True

    @staticmethod
    def init_app():
        """Ensure required directories exist."""
        Config.UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)