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

        for sheet_idx, grid in enumerate(sheets):
            try:
                structure = self.detector.detect(grid)
            except ValueError:
                continue
            all_slots.extend(self._process_sheet(grid, structure, sheet_idx))

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

    def _process_sheet(self, grid, structure, sheet_idx: int) -> List[dict]:
        slots: List[dict] = []
        last_day = None  # Carry forward for merged day cells

        for r in range(structure.data_start_row, structure.data_end_row + 1):
            row = grid[r] if r < len(grid) else []

            # Resolve day (merged cells expand the same value down)
            day_text = safe_str(row[structure.day_col]) if structure.day_col < len(row) else ""
            day = normalize_day(day_text) or last_day
            if day:
                last_day = day

            # Time
            time_text = safe_str(row[structure.time_col]) if structure.time_col < len(row) else ""
            time_range = normalize_time_range(time_text) or time_text

            # Each division column
            for col, division in zip(structure.data_cols, structure.column_labels):
                if col >= len(row):
                    continue
                parsed = self.normalizer.parse(row[col])
                if parsed.is_empty:
                    continue

                slots.append({
                    "sheet": sheet_idx,
                    "day": day,
                    "time": time_range,
                    "division": division,
                    **parsed.to_dict(),
                })
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