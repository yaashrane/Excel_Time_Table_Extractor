"""
Structure Detector — TUNED FOR FE TIMETABLE FORMAT
--------------------------------------------------
Detects:
  Row 1: Title "First Year Engineering"
  Row 2: Division headers "FE-A (Comp)", "FE-B (Civil)", ...
  Row 3: ["Day", "Time", "", "", "", ...]   ← Header marker
  Row 4+: Data rows where day is merged across 6 time slots
"""

from dataclasses import dataclass
from typing import List, Optional

from utils import looks_like_day, looks_like_time, safe_str, normalize_time_range


@dataclass
class TableStructure:
    division_header_row: int    # Row with "FE-A (Comp)" etc.
    header_row: int             # Row with "Day", "Time"
    day_col: int
    time_col: int
    data_cols: List[int]
    column_labels: List[str]
    data_start_row: int
    data_end_row: int


class StructureDetector:
    """Auto-detects timetable structure with smart fallbacks."""

    def __init__(self, max_scan_rows: int = 80):
        self.max_scan_rows = max_scan_rows

    def detect(self, grid: List[List[str]]) -> TableStructure:
        if not grid:
            raise ValueError("Empty sheet")

        # 1. Find the "Day/Time" header row
        header_row = self._find_header_row(grid)

        # 2. Day column = column containing the word "Day"
        # Time column = column containing the word "Time"
        day_col, time_col = self._find_day_time_cols(grid, header_row)

        # 3. Division header row = row immediately above header_row
        # (or use header_row itself if "FE-" cells found there)
        division_row = self._find_division_row(grid, header_row)

        # 4. Data columns = columns after time_col that have division labels
        data_cols, labels = self._extract_division_cols(grid, division_row, time_col)

        # 5. Data range
        data_start = header_row + 1
        data_end = self._find_data_end(grid, data_start)

        return TableStructure(
            division_header_row=division_row,
            header_row=header_row,
            day_col=day_col,
            time_col=time_col,
            data_cols=data_cols,
            column_labels=labels,
            data_start_row=data_start,
            data_end_row=data_end,
        )

    # ---------- INTERNALS ----------

    def _find_header_row(self, grid) -> int:
        """Row containing both 'Day' and 'Time' keywords."""
        scan = min(len(grid), self.max_scan_rows)
        for r in range(scan):
            row_text = " ".join(safe_str(v).lower() for v in grid[r])
            if "day" in row_text and "time" in row_text:
                return r
        # Fallback: any row with day-like content
        for r in range(scan):
            if any(looks_like_day(safe_str(v)) for v in grid[r]):
                return r - 1 if r > 0 else r
        return 2  # Sensible default for your format

    def _find_day_time_cols(self, grid, header_row: int):
        row = grid[header_row]
        day_col, time_col = 0, 1
        for c, val in enumerate(row):
            text = safe_str(val).lower()
            if text == "day":
                day_col = c
            elif text == "time":
                time_col = c
        return day_col, time_col

    def _find_division_row(self, grid, header_row: int) -> int:
        """Find row with division labels like FE-A, FE-B."""
        # Look upward from header_row
        for r in range(header_row, max(-1, header_row - 4), -1):
            if r < 0:
                continue
            row_text = " ".join(safe_str(v) for v in grid[r])
            if re.search(r"FE\s*[-–]\s*[A-H]", row_text, re.IGNORECASE):
                return r
        return max(0, header_row - 1)

    def _extract_division_cols(self, grid, division_row: int, time_col: int):
        """Extract columns that have division labels (FE-A, FE-B, ...)."""
        row = grid[division_row]
        cols, labels = [], []
        for c, val in enumerate(row):
            if c <= time_col:
                continue
            text = safe_str(val)
            if text and re.search(r"FE\s*[-–]\s*[A-H]", text, re.IGNORECASE):
                cols.append(c)
                # Clean the label: "FE - A (Comp)" → "FE-A"
                clean = re.sub(r"\s*\(.*?\)\s*", "", text).strip()
                clean = re.sub(r"\s+", "", clean)  # FE-A
                labels.append(clean)
        return cols, labels

    def _find_data_end(self, grid, start: int) -> int:
        last = start
        for r in range(start, len(grid)):
            if any(safe_str(v) for v in grid[r]):
                last = r
        return last


import re  # noqa: E402 (used in _find_division_row)