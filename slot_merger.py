"""
Slot Merger
-----------
Detects consecutive timetable entries with the same subject/division/batch/room
and merges them into a single multi-period block.
"""

import re
from typing import Dict, List, Optional


class SlotMerger:
    """Merges back-to-back identical slots into multi-hour blocks."""

    PERIODS = [
        {"key": "08:30", "start": "08:30", "end": "09:30", "aliases": {"08:30"}},
        {"key": "09:30", "start": "09:30", "end": "10:30", "aliases": {"09:30", "09:00"}},
        {"key": "10:45", "start": "10:45", "end": "11:45", "aliases": {"10:45"}},
        {"key": "11:45", "start": "11:45", "end": "12:45", "aliases": {"11:45"}},
        {"key": "13:30", "start": "13:30", "end": "14:30", "aliases": {"13:30", "13:00"}},
        {"key": "14:30", "start": "14:30", "end": "15:30", "aliases": {"14:30", "14:00"}},
    ]
    MERGE_PAIRS = {(0, 1), (2, 3), (4, 5)}

    def merge(self, schedule: List[dict]) -> List[dict]:
        if not schedule:
            return []

        by_day: Dict[str, List[dict]] = {}
        for slot in schedule:
            day = slot.get("day")
            if day:
                by_day.setdefault(day, []).append(slot)

        merged_all: List[dict] = []
        for _, slots in by_day.items():
            slots_sorted = sorted(slots, key=lambda slot: self._time_index(slot.get("time", "")))
            merged_all.extend(self._merge_day(slots_sorted))

        return merged_all

    def _merge_day(self, slots: List[dict]) -> List[dict]:
        merged: List[dict] = []
        i = 0

        while i < len(slots):
            current = dict(slots[i])
            current["_period_key"] = self._period_key(current.get("time", ""))
            # Preserve pre-set duration from merged cells; only override if merging
            if "duration" not in current:
                current["duration"] = 1
            current["time_slots"] = [current.get("time")]

            # Only attempt slot merging if duration is 1 (not already a merged cell)
            if current["duration"] == 1:
                j = i + 1
                while j < len(slots) and self._can_merge(current, slots[j]):
                    current["duration"] += 1
                    current["time_slots"].append(slots[j].get("time"))
                    current["_period_key"] = self._period_key(slots[j].get("time", ""))
                    j += 1
            else:
                j = i + 1

            if current["duration"] > 1 and len(current["time_slots"]) > 1:
                current["time"] = self._merged_time_label(current["time_slots"])
                current["time_end"] = current["time"].split(" - ")[-1]
            elif current["duration"] > 1:
                # Pre-set duration from merged cell — compute time label from period index
                key = self._period_key(current.get("time", ""))
                start_idx = next((i for i, p in enumerate(self.PERIODS) if p["key"] == key), None)
                if start_idx is not None:
                    end_idx = start_idx + current["duration"] - 1
                    if end_idx < len(self.PERIODS):
                        end_period = self.PERIODS[end_idx]
                        start_period = self.PERIODS[start_idx]
                        current["time"] = f"{start_period['start']} - {end_period['end']}"
                        current["time_end"] = end_period["end"]

            current.pop("_period_key", None)
            merged.append(current)
            i = j

        return merged

    def _can_merge(self, current: dict, candidate: dict) -> bool:
        if current.get("subject") != candidate.get("subject"):
            return False
        if current.get("division") != candidate.get("division"):
            return False
        if current.get("batch") != candidate.get("batch"):
            return False
        if current.get("room") != candidate.get("room"):
            return False
        if current.get("kind") != candidate.get("kind"):
            return False

        last_idx = self._time_index(current.get("_period_key") or current.get("time_slots", [""])[-1])
        next_idx = self._time_index(candidate.get("time", ""))
        return (last_idx, next_idx) in self.MERGE_PAIRS

    def _time_index(self, time_str: str) -> int:
        key = self._period_key(time_str)
        for index, period in enumerate(self.PERIODS):
            if period["key"] == key:
                return index
        return 999

    def _period_key(self, time_str: str) -> Optional[str]:
        start = self._start_time(time_str)
        if not start:
            return None

        for period in self.PERIODS:
            if start in period["aliases"] or start == period["key"]:
                return period["key"]
        return start

    def _merged_time_label(self, time_slots: List[str]) -> str:
        first_key = self._period_key(time_slots[0])
        last_key = self._period_key(time_slots[-1])
        first = next((p for p in self.PERIODS if p["key"] == first_key), None)
        last = next((p for p in self.PERIODS if p["key"] == last_key), None)

        if first and last:
            return f"{first['start']} - {last['end']}"
        return f"{time_slots[0]} - {time_slots[-1]}"

    @staticmethod
    def _start_time(time_str: str) -> Optional[str]:
        text = str(time_str or "").strip()
        if not text:
            return None

        start = text.split(" - ")[0].strip()
        match = re.search(r"(\d{1,2})\s*:\s*(\d{2})", start)
        if not match:
            return start

        hour = int(match.group(1))
        minute = int(match.group(2))
        return f"{hour:02d}:{minute:02d}"
