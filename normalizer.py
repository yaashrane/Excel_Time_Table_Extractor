"""
Cell Normalization Pipeline - tuned for FE timetable format.

Handles patterns like:
  - PPS(SM)(E 301)                         -> Subject(Faculty)(Room)
  - A1-DTI(ST)(B 301)                      -> Batch-Subject(Faculty)(Room)
  - M2 Tut(MS) & IKS(CJ) (Tut Rm 1)        -> Two faculty entries, same batch/room
  - A1-DTI(ST)(B 301) A2-BEE(HDV)(BEE Lab) -> Multiple batch entries in one cell
"""

import re
from dataclasses import dataclass, field
from typing import List, Optional

from utils import collapse_whitespace, safe_str


KNOWN_FACULTY = {
    "UPM", "MRY", "MDB", "AGP", "AGD", "BDP", "PSD", "PMN", "MS", "RBM",
    "HDV", "PG", "VVK", "RPD", "SIB", "SG", "NG", "PVM", "SK", "CJ",
    "TP", "ST", "NV", "SM", "SB", "SD", "MPP",
}

BATCH_PREFIX = re.compile(r"^(?:CC)?([A-H]\d)\s*[-\u2013\u2014]\s*", re.IGNORECASE)
BATCH_SPLIT = re.compile(r"(?<!\w)(?=(?:CC)?[A-H]\d\s*[-\u2013\u2014])", re.IGNORECASE)
FACULTY_PAIR = re.compile(r"([^()&\n]+?)\s*\(([A-Z]{2,4})\)", re.IGNORECASE)
AMP_SPLIT = re.compile(r"\s*&\s*")
PAREN_CONTENT = re.compile(r"\(([^()]*)\)")

LAB_KEYWORDS = re.compile(r"\b(lab|laboratory|workshop|prac(tical)?)\b", re.IGNORECASE)
TUT_KEYWORDS = re.compile(r"\b(tut|tutorial)\b", re.IGNORECASE)
BREAK_KEYWORDS = re.compile(r"\b(break|lunch|recess|tea)\b", re.IGNORECASE)


@dataclass
class SubSlot:
    """One sub-entry within a cell."""

    batch: Optional[str] = None
    subject: str = ""
    faculty: List[str] = field(default_factory=list)
    room: str = ""
    kind: str = "lecture"


@dataclass
class ParsedSlot:
    """Structured representation of a single timetable cell."""

    raw: str = ""
    entries: List[SubSlot] = field(default_factory=list)
    is_empty: bool = True
    is_break: bool = False

    @property
    def subjects(self) -> List[str]:
        return [entry.subject for entry in self.entries if entry.subject]

    @property
    def faculty(self) -> List[str]:
        seen, out = set(), []
        for entry in self.entries:
            for faculty in entry.faculty:
                if faculty not in seen:
                    seen.add(faculty)
                    out.append(faculty)
        return out

    @property
    def rooms(self) -> List[str]:
        seen, out = set(), []
        for entry in self.entries:
            if entry.room and entry.room not in seen:
                seen.add(entry.room)
                out.append(entry.room)
        return out

    @property
    def is_lab(self) -> bool:
        return any(entry.kind == "lab" for entry in self.entries)

    def to_dict(self) -> dict:
        kind = "break" if self.is_break else (
            "lab" if self.is_lab else
            ("tutorial" if any(entry.kind == "tutorial" for entry in self.entries) else "lecture")
        )
        return {
            "raw": self.raw,
            "entries": [
                {
                    "batch": entry.batch,
                    "subject": entry.subject,
                    "faculty": entry.faculty,
                    "room": entry.room,
                    "kind": entry.kind,
                }
                for entry in self.entries
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

        if not text or text in {"-", "\u2014", "X", "x"}:
            return slot

        slot.is_empty = False

        if BREAK_KEYWORDS.search(text):
            slot.is_break = True
            slot.entries.append(SubSlot(subject="Break", kind="break"))
            return slot

        for line in self._split_cell_lines(text):
            slot.entries.extend(self._parse_line(line))

        if not slot.entries:
            slot.entries.append(SubSlot(subject=collapse_whitespace(text)))

        return slot

    def _split_cell_lines(self, text: str) -> List[str]:
        text = re.sub(r"[\r\n]+", "\n", text)

        if BATCH_PREFIX.search(text) or BATCH_SPLIT.search(text):
            parts = BATCH_SPLIT.split(text)
            return [part.strip() for part in parts if part.strip()]

        return [line.strip() for line in text.split("\n") if line.strip()]

    def _parse_line(self, line: str) -> List[SubSlot]:
        original = collapse_whitespace(line)
        batch = None

        match = BATCH_PREFIX.match(original)
        if match:
            batch = match.group(1).upper()
            original = original[match.end():].strip()

        # Extract common room (last paren that is not a faculty code)
        room, body = self._extract_common_room(original)

        # Handle "SubjA(FAC1) & SubjB(FAC2)" patterns with shared room
        if "&" in body:
            parts = AMP_SPLIT.split(body)
            entries: List[SubSlot] = []
            for part in parts:
                part = part.strip()
                if not part:
                    continue
                sub_entries = self._parse_faculty_pairs(part, batch, room, original)
                if sub_entries:
                    entries.extend(sub_entries)
                else:
                    entries.extend(self._fallback_entry(part, batch, room))
            if entries:
                return entries

        entries = self._parse_faculty_pairs(body, batch, room, original)

        if entries:
            return entries

        return self._fallback_entry(original, batch, room)

    def _extract_common_room(self, line: str) -> tuple[str, str]:
        matches = list(PAREN_CONTENT.finditer(line))
        if not matches:
            return "", line

        last = matches[-1]
        value = collapse_whitespace(last.group(1))
        if value.upper() in KNOWN_FACULTY:
            return "", line

        body = f"{line[:last.start()]} {line[last.end():]}".strip()
        return value, collapse_whitespace(body)

    def _parse_faculty_pairs(self, body: str, batch: Optional[str], room: str, source: str) -> List[SubSlot]:
        entries: List[SubSlot] = []

        for match in FACULTY_PAIR.finditer(body):
            subject = self._clean_subject(match.group(1))
            faculty_code = match.group(2).upper()
            if not subject and not faculty_code:
                continue

            entry = SubSlot(
                batch=batch,
                subject=subject,
                faculty=[faculty_code],
                room=room,
                kind=self._classify(subject, room, source),
            )
            entries.append(entry)

        return entries

    def _fallback_entry(self, line: str, batch: Optional[str], room: str) -> List[SubSlot]:
        faculty = [code.upper() for code in re.findall(r"\(([A-Z]{2,4})\)", line) if code.upper() in KNOWN_FACULTY]
        subject = self._clean_subject(PAREN_CONTENT.sub(" ", line))
        if not subject and not faculty:
            return []

        return [
            SubSlot(
                batch=batch,
                subject=subject,
                faculty=faculty,
                room=room,
                kind=self._classify(subject, room, line),
            )
        ]

    @staticmethod
    def _clean_subject(text: str) -> str:
        text = re.sub(r"^[&,\s]+", "", text)
        text = re.sub(r"[&,\s]+$", "", text)
        text = re.sub(r"\s*[-\u2013\u2014]\s*$", "", text)
        return collapse_whitespace(text)

    @staticmethod
    def _classify(subject: str, room: str, source: str) -> str:
        haystack = f"{subject} {room} {source}"
        if LAB_KEYWORDS.search(haystack):
            return "lab"
        if TUT_KEYWORDS.search(haystack):
            return "tutorial"
        return "lecture"
