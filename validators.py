"""
Data Validation Layer
---------------------
Sanity-checks the parsed timetable and raises clean errors
or warnings the frontend can show to the user.
"""

from typing import Dict, List


class TimetableValidator:
    """Validates the extracted timetable for consistency."""

    def validate(self, timetable: List[dict]) -> Dict:
        warnings: List[str] = []

        if not timetable:
            return {"valid": False, "warnings": ["No timetable data extracted."]}

        days = {s["day"] for s in timetable if s.get("day")}
        if len(days) < 2:
            warnings.append(f"Only {len(days)} day(s) detected — file may be incomplete.")

        no_faculty = sum(1 for s in timetable if not s.get("faculty"))
        if no_faculty > 0.6 * len(timetable):
            warnings.append("Most slots have no detectable faculty codes.")

        return {
            "valid": True,
            "warnings": warnings,
            "stats": {
                "total_slots": len(timetable),
                "days": sorted(days),
                "unique_faculty": len({f for s in timetable for f in s.get("faculty", [])}),
            },
        }