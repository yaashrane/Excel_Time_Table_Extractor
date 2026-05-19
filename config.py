"""
Application Configuration
-------------------------
Central configuration for the Flask backend.
Loads environment-dependent settings and constants.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


class Config:
    """Base configuration class."""

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