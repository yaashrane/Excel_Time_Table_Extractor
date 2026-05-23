"""
API Routes
----------
RESTful endpoints for the Timetable Extractor.
"""

from functools import wraps
import os
import requests
from flask import Blueprint, jsonify, request, current_app, session

from timetable_engine import TimetableEngine
from file_service import FileService
import auth_store as store

api_bp = Blueprint("api", __name__, url_prefix="/api")
mail = None  # kept for app.py import compatibility

# Singleton instances
_engine = TimetableEngine()
_file_service = FileService()
_cache = {"latest": None}


# ---------- AUTH HELPERS ----------

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("logged_in"):
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated


def _send_otp_email(email: str, otp: str, subject: str) -> None:
    api_key     = os.environ.get("BREVO_API_KEY", "")
    sender_email = os.environ.get("MAIL_USERNAME", "")
    resp = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={"api-key": api_key, "Content-Type": "application/json"},
        json={
            "sender": {"name": "Extractify", "email": sender_email},
            "to": [{"email": email}],
            "subject": subject,
            "textContent": (
                f"Your Extractify verification code is: {otp}\n\n"
                f"This code expires in 10 minutes. Do not share it with anyone."
            ),
        },
        timeout=10,
    )
    if resp.status_code not in (200, 201):
        raise Exception(f"Brevo error {resp.status_code}: {resp.text}")


# ---------- LOGIN / LOGOUT ----------

@api_bp.route("/login", methods=["POST"])
def login():

    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL")
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

    data = request.get_json(force=True, silent=True) or {}

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    # ===== ADMIN LOGIN =====
    if email == ADMIN_EMAIL and password == ADMIN_PASSWORD:
        session["logged_in"] = True
        session["email"] = email
        session["full_name"] = "Admin"
        session["is_admin"] = True

        return jsonify({
            "ok": True,
            "full_name": "Admin",
            "is_admin": True
        })

    # ===== NORMAL USER LOGIN =====
    if not store.check_password(email, password):
        return jsonify({"error": "Invalid email or password."}), 401

    user = store.get_user(email)

    session["logged_in"] = True
    session["email"] = email
    session["full_name"] = user["full_name"]
    session["is_admin"] = False

    return jsonify({
        "ok": True,
        "full_name": user["full_name"],
        "is_admin": False
    })

@api_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@api_bp.route("/me", methods=["GET"])
def me():
    if session.get("logged_in"):
        return jsonify({"logged_in": True, "full_name": session.get("full_name"), "email": session.get("email")})
    return jsonify({"logged_in": False}), 401


# ---------- REGISTER ----------

@api_bp.route("/register/send-otp", methods=["POST"])
def register_send_otp():
    data      = request.get_json(force=True, silent=True) or {}
    full_name = (data.get("full_name") or "").strip()
    email     = (data.get("email") or "").strip().lower()
    if not full_name or not email:
        return jsonify({"error": "Full name and email are required."}), 400
    if store.user_exists(email):
        return jsonify({"error": "An account with this email already exists."}), 409
    otp = store.create_otp(email, purpose="register", full_name=full_name)
    try:
        _send_otp_email(email, otp, "Extractify — Verify your email")
    except Exception as e:
        current_app.logger.error(f"Email send failed for {email}: {e}")
        return jsonify({"error": "Failed to send OTP email. Please try again."}), 500
    return jsonify({"ok": True, "message": "OTP sent to your email."})


@api_bp.route("/register/verify-otp", methods=["POST"])
def register_verify_otp():
    data  = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    otp   = (data.get("otp") or "").strip()
    ok, msg = store.verify_otp(email, otp, purpose="register")
    if not ok:
        return jsonify({"error": msg}), 400
    return jsonify({"ok": True})


@api_bp.route("/register/complete", methods=["POST"])
def register_complete():
    data     = request.get_json(force=True, silent=True) or {}
    email    = (data.get("email") or "").strip().lower()
    otp      = (data.get("otp") or "").strip()
    password = data.get("password") or ""
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters."}), 400
    ok, msg = store.verify_otp(email, otp, purpose="register")
    if not ok:
        return jsonify({"error": msg}), 400
    record = store.consume_otp(email)
    store.create_user(email, record.get("full_name", ""), password)
    session["logged_in"] = True
    session["email"]     = email
    session["full_name"] = record.get("full_name", "")
    return jsonify({"ok": True, "full_name": record.get("full_name", "")})


# ---------- FORGOT PASSWORD ----------

@api_bp.route("/forgot/send-otp", methods=["POST"])
def forgot_send_otp():
    data  = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "Email is required."}), 400
    if not store.user_exists(email):
        # Don't reveal whether account exists
        return jsonify({"ok": True, "message": "If that email is registered, an OTP has been sent."})
    otp = store.create_otp(email, purpose="reset")
    try:
        _send_otp_email(email, otp, "Extractify — Password reset code")
    except Exception as e:
        current_app.logger.error(f"Email send failed for {email}: {e}")
        return jsonify({"error": "Failed to send OTP email. Please try again."}), 500
    return jsonify({"ok": True, "message": "If that email is registered, an OTP has been sent."})


@api_bp.route("/forgot/verify-otp", methods=["POST"])
def forgot_verify_otp():
    data  = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    otp   = (data.get("otp") or "").strip()
    ok, msg = store.verify_otp(email, otp, purpose="reset")
    if not ok:
        return jsonify({"error": msg}), 400
    return jsonify({"ok": True})


@api_bp.route("/forgot/reset", methods=["POST"])
def forgot_reset():
    data     = request.get_json(force=True, silent=True) or {}
    email    = (data.get("email") or "").strip().lower()
    otp      = (data.get("otp") or "").strip()
    password = data.get("password") or ""
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters."}), 400
    ok, msg = store.verify_otp(email, otp, purpose="reset")
    if not ok:
        return jsonify({"error": msg}), 400
    store.consume_otp(email)
    store.update_password(email, password)
    return jsonify({"ok": True})


@api_bp.route("/change-password", methods=["POST"])
@login_required
def change_password():
    data     = request.get_json(force=True, silent=True) or {}
    email    = session.get("email", "")
    current  = data.get("current_password") or ""
    new_pw   = data.get("new_password") or ""
    if not store.check_password(email, current):
        return jsonify({"error": "Current password is incorrect."}), 401
    if len(new_pw) < 8:
        return jsonify({"error": "Password must be at least 8 characters."}), 400
    store.update_password(email, new_pw)
    return jsonify({"ok": True})


# ---------- HEALTH ----------

@api_bp.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "timetable-extractor"})


# ---------- UPLOAD + EXTRACT (one-shot) ----------

@api_bp.route("/extract", methods=["POST"])
@login_required
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
@login_required
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
@login_required
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
@login_required
def teacher_timetable(teacher):
    if not _cache["latest"]:
        return jsonify({"error": "No timetable loaded"}), 404
    teachers = _cache["latest"]["teachers"]
    if teacher not in teachers:
        return jsonify({"error": f"Teacher '{teacher}' not found"}), 404
    return jsonify({"teacher": teacher, "schedule": teachers[teacher]})
