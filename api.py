"""
API Routes
----------
RESTful endpoints for the Timetable Extractor.
"""

from flask import Blueprint, jsonify, request, current_app

from timetable_engine import TimetableEngine
from file_service import FileService

api_bp = Blueprint("api", __name__, url_prefix="/api")

# Singleton instances (stateless)
_engine = TimetableEngine()
_file_service = FileService()

# In-memory cache of latest extraction (single-user demo).
# For production, store per-session or in Redis.
_cache = {"latest": None}


# ---------- HEALTH ----------

@api_bp.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "timetable-extractor"})


# ---------- UPLOAD + EXTRACT (one-shot) ----------

@api_bp.route("/extract", methods=["POST"])
def extract():
    """
    Upload an Excel file AND extract its timetable in a single call.
    Returns the full structured payload.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file part in request"}), 400

    try:
        path = _file_service.save(request.files["file"])
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    try:
        result = _engine.process(path)
    except Exception as e:
        current_app.logger.exception("Extraction failed")
        return jsonify({"error": f"Extraction failed: {e}"}), 500

    _cache["latest"] = result
    return jsonify(result), 200


# ---------- UPLOAD ONLY ----------

@api_bp.route("/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify({"error": "No file"}), 400
    try:
        path = _file_service.save(request.files["file"])
        return jsonify({"filename": path.name, "message": "Uploaded"}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


# ---------- TEACHERS ----------

@api_bp.route("/teachers", methods=["GET"])
def list_teachers():
    if not _cache["latest"]:
        return jsonify({"teachers": []})
    teachers = _cache["latest"]["teachers"]
    summary = [
        {"code": code, "slots": len(slots)}
        for code, slots in sorted(teachers.items())
    ]
    return jsonify({"teachers": summary})


@api_bp.route("/timetable/<teacher>", methods=["GET"])
def teacher_timetable(teacher):
    if not _cache["latest"]:
        return jsonify({"error": "No timetable loaded"}), 404
    teachers = _cache["latest"]["teachers"]
    if teacher not in teachers:
        return jsonify({"error": f"Teacher '{teacher}' not found"}), 404
    return jsonify({"teacher": teacher, "schedule": teachers[teacher]})