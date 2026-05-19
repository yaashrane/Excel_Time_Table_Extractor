"""
File Service
------------
Handles upload validation, safe storage, and cleanup.
"""

import uuid
from pathlib import Path
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from config import Config


class FileService:
    """Manages file uploads on disk."""

    def __init__(self, upload_folder: Path = Config.UPLOAD_FOLDER):
        self.upload_folder = Path(upload_folder)
        self.upload_folder.mkdir(parents=True, exist_ok=True)

    def is_allowed(self, filename: str) -> bool:
        return (
            "." in filename
            and filename.rsplit(".", 1)[1].lower() in Config.ALLOWED_EXTENSIONS
        )

    def save(self, file: FileStorage) -> Path:
        """Save uploaded file with a unique name. Returns the path."""
        if not file or not file.filename:
            raise ValueError("No file provided.")
        if not self.is_allowed(file.filename):
            raise ValueError("Unsupported file format. Use .xlsx or .xls")

        safe_name = secure_filename(file.filename)
        unique = f"{uuid.uuid4().hex[:8]}_{safe_name}"
        target = self.upload_folder / unique
        file.save(target)
        return target