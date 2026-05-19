"""
Cell Normalization Pipeline — TUNED FOR FE TIMETABLE FORMAT
-----------------------------------------------------------
Handles patterns like:
  - PPS(SM)(E 301)              → Subject(Faculty)(Room)
  - A1-DTI(ST)(B 301)           → Batch-Subject(Faculty)(Room)
  - D1-BEE(SIB)(BEE Lab)        → Division-Subject(Faculty)(Lab)
  - M2 Tut(MS)(Tut Rm 1)        → Tutorial
  - Multi-line cells with A1/A2/A3 batches
"""

import re
from dataclasses import dataclass, field
from typing import List, Optional

from utils import collapse_whitespace, safe_str


# Known faculty codes from your legend (acts as a whitelist for accuracy)
KNOWN_FACULTY = {
    "UPM", "MRY", "MDB", "AGP", "AGD", "BDP", "PSD", "PMN", "MS", "RBM",
    "HDV", "PG", "VVK", "RPD", "SIB", "SG", "NG", "PVM", "SK", "CJ",
    "TP", "ST", "NV", "SM", "SB", "SD", "MPP",
}

# Main slot pattern: Subject(Faculty)(Room)
# Captures: subject, faculty, room
SLOT_PATTERN = re.compile(
    r"([A-Za-z0-9 ]+?)\s*\(([A-Z]{2,4})\)\s*\(([^)]+)\)",
    re.IGNORECASE,
)

# Batch prefix: A1-, A2-, B3-, D1-, E1-, F2-, G3-, H1-, etc.
BATCH_PREFIX = re.compile(r"^([A-H]\d)\s*[-–]\s*", re.IGNORECASE)

# Lab / Lecture indicators
LAB_KEYWORDS = re.compile(r"\b(lab|laboratory|workshop|prac(tical)?)\b", re.IGNORECASE)
TUT_KEYWORDS = re.compile(r"\b(tut|tutorial)\b", re.IGNORECASE)
BREAK_KEYWORDS = re.compile(r"\b(break|lunch|recess|tea)\b", re.IGNORECASE)


@dataclass
class SubSlot:
    """One sub-entry within a cell (one batch can have its own lecture/lab)."""
    batch: Optional[str] = None     # A1, A2, A3, D1, ...
    subject: str = ""
    faculty: List[str] = field(default_factory=list)
    room: str = ""
    kind: str = "lecture"           # lecture | lab | tutorial | break


@dataclass
class ParsedSlot:
    """Structured representation of a single timetable cell."""
    raw: str = ""
    entries: List[SubSlot] = field(default_factory=list)
    is_empty: bool = True
    is_break: bool = False

    # Flat aggregations (for backwards compatibility / search)
    @property
    def subjects(self) -> List[str]:
        return [e.subject for e in self.entries if e.subject]

    @property
    def faculty(self) -> List[str]:
        seen, out = set(), []
        for e in self.entries:
            for f in e.faculty:
                if f not in seen:
                    seen.add(f)
                    out.append(f)
        return out

    @property
    def rooms(self) -> List[str]:
        return list({e.room for e in self.entries if e.room})

    @property
    def is_lab(self) -> bool:
        return any(e.kind == "lab" for e in self.entries)

    def to_dict(self) -> dict:
        kind = "break" if self.is_break else (
            "lab" if self.is_lab else
            ("tutorial" if any(e.kind == "tutorial" for e in self.entries) else "lecture")
        )
        return {
            "raw": self.raw,
            "entries": [
                {
                    "batch": e.batch,
                    "subject": e.subject,
                    "faculty": e.faculty,
                    "room": e.room,
                    "kind": e.kind,
                } for e in self.entries
            ],
            "subjects": self.subjects,
            "faculty": self.faculty,
            "rooms": self.rooms,
            "type": kind,
            "is_empty": self.is_empty,
        }


class CellNormalizer:
    """Normalizes raw timetable cells into structured ParsedSlot objects."""

    def parse(self, raw_value) -> ParsedSlot:
        text = safe_str(raw_value)
        slot = ParsedSlot(raw=text)

        # Empty cell
        if not text or text in {"-", "—", "X", "x"}:
            return slot

        slot.is_empty = False

        # Break
        if BREAK_KEYWORDS.search(text):
            slot.is_break = True
            slot.entries.append(SubSlot(subject="Break", kind="break"))
            return slot

        # Split the cell into logical lines.
        # Cells often have multiple batches separated by newlines or by spaces.
        lines = self._split_cell_lines(text)

        for line in lines:
            sub = self._parse_line(line)
            if sub:
                slot.entries.append(sub)

        # Fallback — if no structured match, store raw as one entry
        if not slot.entries:
            slot.entries.append(SubSlot(subject=collapse_whitespace(text)))

        return slot

    # ---------- LINE-LEVEL PARSING ----------

    def _split_cell_lines(self, text: str) -> List[str]:
        """
        Split a cell into individual sub-entries.
        A cell like 'A1-DTI(ST)(B 301) A2-BEE(HDV)(BEE Lab) A3-CHEM(AGD)(CHEM Lab)'
        becomes 3 lines.
        """
        # First, normalize newlines
        text = re.sub(r"[\r\n]+", "\n", text)

        # If batch prefixes exist (A1-, A2-, B3-, D1-, E1-, etc.) split on them
        if re.search(r"[A-H]\d\s*[-–]", text):
            # Split before each batch prefix
            parts = re.split(r"(?=[A-H]\d\s*[-–])", text)
            return [p.strip() for p in parts if p.strip()]

        # Otherwise split on newlines
        return [l.strip() for l in text.split("\n") if l.strip()]

    def _parse_line(self, line: str) -> Optional[SubSlot]:
        """Parse a single line like 'A1-DTI(ST)(B 301)' → SubSlot."""
        sub = SubSlot()

        # 1. Extract batch prefix if present
        m = BATCH_PREFIX.match(line)
        if m:
            sub.batch = m.group(1).upper()
            line = line[m.end():].strip()

        # 2. Try to match Subject(Faculty)(Room)
        m = SLOT_PATTERN.search(line)
        if m:
            subject = collapse_whitespace(m.group(1))
            faculty_code = m.group(2).upper()
            room = collapse_whitespace(m.group(3))

            sub.subject = subject
            sub.room = room
            if faculty_code in KNOWN_FACULTY:
                sub.faculty = [faculty_code]
            else:
                # Still include unknown 2-4 letter codes (graceful fallback)
                sub.faculty = [faculty_code]
        else:
            # Loose fallback: try to detect just (FACULTY) anywhere
            faculty_match = re.findall(r"\(([A-Z]{2,4})\)", line)
            sub.faculty = [f for f in faculty_match if f in KNOWN_FACULTY]
            room_match = re.search(r"\(([^)]+)\)\s*$", line)
            if room_match:
                sub.room = room_match.group(1).strip()
            # Subject = remove all parens content
            subject = re.sub(r"\([^)]*\)", "", line).strip(" -–")
            sub.subject = collapse_whitespace(subject)

        # 3. Classify kind
        if LAB_KEYWORDS.search(line) or "Lab" in sub.room or "Workshop" in sub.room:
            sub.kind = "lab"
        elif TUT_KEYWORDS.search(line) or "Tut" in sub.room:
            sub.kind = "tutorial"
        else:
            sub.kind = "lecture"

        # Skip if completely empty
        if not sub.subject and not sub.faculty:
            return None
        return sub