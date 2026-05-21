"""Teacher Parser - with slot merging for multi-hour labs."""

from collections import defaultdict
from typing import Dict, List

from slot_merger import SlotMerger


FACULTY_DIRECTORY = {
    "UPM": "Dr. Umesh Moharil", "MRY": "Dr. Meghna Yashwante",
    "MDB": "Ms. Manisha Bhise", "AGP": "Dr. Amita Pal",
    "AGD": "Dr. Anil Darekar", "BDP": "Dr. B D Patil",
    "PSD": "Dr. Pratibha Desai", "PMN": "Dr. Poonam Nakhate",
    "MS":  "Mr. Mukesh Sharma", "RBM": "Mr. Rahul Mali",
    "HDV": "Mr. Harshal Vaidya", "PG":  "Mr. Pankaj Gaur",
    "VVK": "Mr. Vishal Kulkarni", "RPD": "Mr. R P Dharmale",
    "SIB": "Mr. Sanket Barde", "SG":  "Dr. Sandhya Gadge",
    "NG":  "Mr. Nikhil Gurav", "PVM": "Mrs. Pallavi Munde",
    "SK":  "Ms. Sheetal Khande", "CJ":  "Dr. Chhaya Joshi",
    "TP":  "Mr. Tukaram Patil", "ST":  "Ms. Shilpa Tambe",
    "NV":  "Mrs. Neha Verma", "SM":  "Mrs. Sonali Murumkar",
    "SB":  "Ms. Swati Bagade", "SD":  "Mr. Shankar Deshmukh",
    "MPP": "Mr. Martand Pandagale",
}


class TeacherIndex:
    DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY",
                 "FRIDAY", "SATURDAY", "SUNDAY"]

    def __init__(self):
        self.merger = SlotMerger()

    def build(self, timetable: List[dict]) -> Dict[str, dict]:
        index: Dict[str, List[dict]] = defaultdict(list)

        for slot in timetable:
            slot_duration = slot.get("duration", 1)
            for entry in slot.get("entries", []):
                for code in entry.get("faculty", []):
                    index[code].append({
                        "day": slot.get("day"),
                        "time": slot.get("time"),
                        "division": slot.get("division"),
                        "batch": entry.get("batch"),
                        "subject": entry.get("subject"),
                        "room": entry.get("room"),
                        "kind": entry.get("kind"),
                        "duration": entry.get("duration", slot_duration),
                    })

        result = {}
        for code, slots in index.items():
            merged = self.merger.merge(slots)
            merged.sort(key=lambda s: (
                self.DAY_ORDER.index(s["day"]) if s["day"] in self.DAY_ORDER else 99,
                s["time"] or "",
            ))
            result[code] = {
                "code": code,
                "name": FACULTY_DIRECTORY.get(code, "Unknown Faculty"),
                "schedule": merged,
                "total_classes": len(merged),
                "total_hours": sum(s.get("duration", 1) for s in merged),
            }
        return result
