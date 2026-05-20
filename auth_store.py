"""
auth_store.py
-------------
User store persisted to users.json.
OTPs remain in-memory (intentionally ephemeral).
"""

import random
import string
import time
import hashlib
import json
import os
from pathlib import Path

_USERS_FILE = Path(os.environ.get("USERS_FILE", str(Path(__file__).resolve().parent / "users.json")))

# OTPs stay in-memory — ephemeral by design
_otps: dict = {}

OTP_EXPIRY = 600  # seconds


# ---------- persistence ----------

def _load_users() -> dict:
    if _USERS_FILE.exists():
        try:
            return json.loads(_USERS_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save_users(users: dict) -> None:
    _USERS_FILE.write_text(json.dumps(users, indent=2), encoding="utf-8")


# ---------- helpers ----------

def _hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def _gen_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


# ---------- OTP ----------

def create_otp(email: str, purpose: str, full_name: str = None) -> str:
    otp = _gen_otp()
    _otps[email] = {
        "otp": otp,
        "expires": time.time() + OTP_EXPIRY,
        "purpose": purpose,
        "full_name": full_name,
    }
    return otp


def verify_otp(email: str, otp: str, purpose: str) -> tuple[bool, str]:
    record = _otps.get(email)
    if not record:
        return False, "No OTP requested for this email."
    if record["purpose"] != purpose:
        return False, "Invalid OTP purpose."
    if time.time() > record["expires"]:
        _otps.pop(email, None)
        return False, "OTP has expired. Please request a new one."
    if record["otp"] != otp:
        return False, "Incorrect OTP."
    return True, "ok"


def consume_otp(email: str) -> dict:
    return _otps.pop(email, {})


# ---------- users ----------

def user_exists(email: str) -> bool:
    return email.lower() in _load_users()


def create_user(email: str, full_name: str, password: str) -> None:
    users = _load_users()
    users[email.lower()] = {
        "full_name": full_name,
        "password_hash": _hash(password),
    }
    _save_users(users)


def check_password(email: str, password: str) -> bool:
    user = _load_users().get(email.lower())
    if not user:
        return False
    return user["password_hash"] == _hash(password)


def update_password(email: str, password: str) -> None:
    users = _load_users()
    if email.lower() in users:
        users[email.lower()]["password_hash"] = _hash(password)
        _save_users(users)


def get_user(email: str) -> dict | None:
    return _load_users().get(email.lower())
