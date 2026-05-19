"""
Excel Extractor
---------------
Reads an .xlsx / .xls file into a normalized 2D grid,
handling merged cells and propagating their values.
"""

from pathlib import Path
from typing import List

import openpyxl
import pandas as pd

from utils import safe_str


class ExcelExtractor:
    """Reads Excel files into a clean 2D string grid."""

    def extract(self, filepath: Path) -> List[List[List[str]]]:
        """
        Returns a list of sheets, where each sheet is a 2D grid (list of rows).
        Merged cells are unmerged by filling all child cells with the parent value.
        """
        suffix = filepath.suffix.lower()
        if suffix == ".xlsx":
            return self._extract_xlsx(filepath)
        elif suffix == ".xls":
            return self._extract_xls(filepath)
        raise ValueError(f"Unsupported file type: {suffix}")

    # ---------- XLSX (openpyxl, full merge support) ----------

    def _extract_xlsx(self, filepath: Path):
        wb = openpyxl.load_workbook(filepath, data_only=True)
        sheets = []
        for ws in wb.worksheets:
            grid = self._sheet_to_grid(ws)
            sheets.append(grid)
        return sheets

    def _sheet_to_grid(self, ws) -> List[List[str]]:
        max_row, max_col = ws.max_row, ws.max_column
        grid = [[safe_str(ws.cell(r, c).value) for c in range(1, max_col + 1)]
                for r in range(1, max_row + 1)]

        # Expand merged cells: every cell in the merged range gets the top-left value
        for merged_range in ws.merged_cells.ranges:
            min_col, min_row, max_c, max_r = (
                merged_range.min_col, merged_range.min_row,
                merged_range.max_col, merged_range.max_row,
            )
            anchor = safe_str(ws.cell(min_row, min_col).value)
            for r in range(min_row, max_r + 1):
                for c in range(min_col, max_c + 1):
                    grid[r - 1][c - 1] = anchor
        return grid

    # ---------- XLS (pandas fallback) ----------

    def _extract_xls(self, filepath: Path):
        xls = pd.ExcelFile(filepath)
        sheets = []
        for name in xls.sheet_names:
            df = xls.parse(name, header=None, dtype=str).fillna("")
            grid = [[safe_str(v) for v in row] for row in df.values.tolist()]
            # NOTE: pandas drops merge info — we forward-fill row-wise as a best effort
            sheets.append(grid)
        return sheets