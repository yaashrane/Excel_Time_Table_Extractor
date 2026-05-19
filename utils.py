"""
Parser Utilities
----------------
Shared helper functions used across the extraction pipeline.
Pure functions only — no I/O, no state.
"""

import re
from typing import Any, Optional


# ---------- TEXT UTILITIES ----------

def safe_str(value: Any) -> str:
    """Convert any cell value to a clean trimmed string."""
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def collapse_whitespace(text: str) -> str:
    """Replace runs of whitespace with a single space."""
    return re.sub(r"\s+", " ", text).strip()


def normalize_separators(text: str) -> str:
    """Normalize common separators (/, |, ,) into a unified pipe."""
    return re.sub(r"[\\/|]+", "|", text)


def is_empty(value: Any) -> bool:
    """True if cell is effectively empty."""
    return safe_str(value) in {"", "-", "—", "N/A", "NA", "nil", "Nil"}


# ---------- DAY / TIME UTILITIES ----------

DAY_PATTERNS = {
    "MONDAY":    r"^mon(day)?\.?$",
    "TUESDAY":   r"^tue(s(day)?)?\.?$",
    "WEDNESDAY": r"^wed(nesday)?\.?$",
    "THURSDAY":  r"^thu(rs(day)?)?\.?$",
    "FRIDAY":    r"^fri(day)?\.?$",
    "SATURDAY":  r"^sat(urday)?\.?$",
    "SUNDAY":    r"^sun(day)?\.?$",
}


def normalize_day(text: str) -> Optional[str]:
    """Return canonical day name, or None if not a day."""
    if not text:
        return None
    cleaned = collapse_whitespace(text).lower()
    for canonical, pattern in DAY_PATTERNS.items():
        if re.match(pattern, cleaned):
            return canonical
    return None


# Matches time tokens: 9:00, 09.00, 9 AM, 10:30am, 14:00, etc.
TIME_TOKEN = re.compile(
    r"(\d{1,2})\s*[:.]?\s*(\d{2})?\s*(am|pm|AM|PM)?",
    re.IGNORECASE,
)

# Matches a slot range "9:00 - 10:00", "9-10", "09:00 to 10:00"
TIME_RANGE = re.compile(
    r"(\d{1,2}[:.]?\d{0,2}\s*(?:am|pm)?)\s*(?:-|to|–|—)\s*(\d{1,2}[:.]?\d{0,2}\s*(?:am|pm)?)",
    re.IGNORECASE,
)


def normalize_time(text: str) -> Optional[str]:
    """
    Normalize a single time string to HH:MM (24h).
    Returns None if not a recognizable time.
    """
    if not text:
        return None
    text = text.strip().lower().replace(".", ":")
    m = TIME_TOKEN.match(text)
    if not m:
        return None

    hour = int(m.group(1))
    minute = int(m.group(2)) if m.group(2) else 0
    meridiem = m.group(3)

    if meridiem == "pm" and hour < 12:
        hour += 12
    elif meridiem == "am" and hour == 12:
        hour = 0
    # College timetables: 1–7 without AM/PM usually mean PM
    elif meridiem is None and 1 <= hour <= 7:
        hour += 12

    return f"{hour:02d}:{minute:02d}"


def normalize_time_range(text: str) -> Optional[str]:
    """Normalize a 'HH:MM - HH:MM' string."""
    if not text:
        return None
    m = TIME_RANGE.search(text)
    if not m:
        # Maybe it's just a single time
        single = normalize_time(text)
        return single
    start = normalize_time(m.group(1))
    end = normalize_time(m.group(2))
    if start and end:
        return f"{start} - {end}"
    return None


# ---------- DETECTION HELPERS ----------

def looks_like_time(text: str) -> bool:
    """Heuristic: does this cell contain time info?"""
    if not text:
        return False
    return bool(TIME_RANGE.search(text) or TIME_TOKEN.search(text))


def looks_like_day(text: str) -> bool:
    """Heuristic: does this cell contain a day name?"""
    return normalize_day(text) is not None