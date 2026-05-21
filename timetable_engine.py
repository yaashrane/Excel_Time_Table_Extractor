"""Timetable Engine — handles merged day cells & batch entries."""

from pathlib import Path
from typing import Dict, List

from extractor import ExcelExtractor
from normalizer import CellNormalizer
from structure_detector import StructureDetector
from teacher_parser import TeacherIndex, FACULTY_DIRECTORY
from utils import normalize_day, normalize_time_range, safe_str
from validators import TimetableValidator


class TimetableEngine:
    def __init__(self):
        self.extractor = ExcelExtractor()
        self.detector = StructureDetector()
        self.normalizer = CellNormalizer()
        self.teacher_index = TeacherIndex()
        self.validator = TimetableValidator()

    def process(self, filepath: Path) -> Dict:
        sheets = self.extractor.extract(filepath)
        all_slots: List[dict] = []

        for sheet_idx, sheet in enumerate(sheets):
            try:
                grid = sheet["grid"]
                row_span = sheet["row_span"]
                structure = self.detector.detect(grid)
            except (ValueError, KeyError):
                continue
            all_slots.extend(self._process_sheet(grid, row_span, structure, sheet_idx))

        all_slots = self._deduplicate(all_slots)
        teachers = self.teacher_index.build(all_slots)
        validation = self.validator.validate(all_slots)

        return {
            "timetable": all_slots,
            "teachers": teachers,
            "faculty_directory": FACULTY_DIRECTORY,
            "divisions": sorted({s["division"] for s in all_slots if s.get("division")}),
            "days": sorted({s["day"] for s in all_slots if s.get("day")}),
            "validation": validation,
        }

    def _process_sheet(self, grid, row_span, structure, sheet_idx: int) -> List[dict]:
        slots: List[dict] = []
        last_day = None
        # Track which (row, col) cells are continuation rows of a merged span — skip them
        skip_cells: set = set()

        for r in range(structure.data_start_row, structure.data_end_row + 1):
            row = grid[r] if r < len(grid) else []
            spans = row_span[r] if r < len(row_span) else []

            day_text = safe_str(row[structure.day_col]) if structure.day_col < len(row) else ""
            day = normalize_day(day_text) or last_day
            if day:
                last_day = day

            time_text = safe_str(row[structure.time_col]) if structure.time_col < len(row) else ""
            time_range = normalize_time_range(time_text) or time_text

            for col, division in zip(structure.data_cols, structure.column_labels):
                if col >= len(row):
                    continue

                # Skip continuation rows of a vertically merged cell
                if (r, col) in skip_cells:
                    continue

                parsed = self.normalizer.parse(row[col])
                if parsed.is_empty:
                    continue

                # Determine duration from row span
                span = spans[col] if col < len(spans) else 1
                duration = span if span > 1 else 1

                # Mark subsequent rows of this merge as skip
                for sr in range(r + 1, r + span):
                    skip_cells.add((sr, col))

                slot_dict = {
                    "sheet": sheet_idx,
                    "day": day,
                    "time": time_range,
                    "division": division,
                    **parsed.to_dict(),
                }

                # Propagate duration to each entry
                if duration > 1:
                    for entry in slot_dict.get("entries", []):
                        entry["duration"] = duration
                    slot_dict["duration"] = duration

                slots.append(slot_dict)
        return slots

    def _deduplicate(self, slots):
        seen, out = set(), []
        for s in slots:
            key = (s["day"], s["time"], s["division"], s["raw"])
            if key in seen:
                continue
            seen.add(key)
            out.append(s)
        return out