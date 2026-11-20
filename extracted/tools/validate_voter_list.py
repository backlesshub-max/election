#!/usr/bin/env python3
"""RCSU Election 2026-2027: preflight audit for an Excel-exported voter CSV.

Author: Reinhardson Sangma
This script prints aggregate data-quality counts only. It never prints student PII.
Run: python tools/validate_voter_list.py path/to/Voter-Details.csv
"""
from __future__ import annotations
import csv
import sys
from collections import Counter
from pathlib import Path

ALIASES = {
    "sl": {"sl no.", "sl no", "sl. no.", "serial no"},
    "name": {"name", "full name", "voter name"},
    "course": {"course / class", "course/class", "course", "class"},
    "enrollment": {"enrollment no.", "enrollment no", "enrolment no.", "enrolment no", "roll number", "roll no"},
    "mobile": {"mobile no.", "mobile no", "mobile number", "phone"},
}


def clean(value: object) -> str:
    return " ".join(str(value or "").strip().split())


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python tools/validate_voter_list.py <voter-list.csv>")
        return 2
    path = Path(sys.argv[1])
    if not path.is_file():
        print("File not found.")
        return 2
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames:
                raise ValueError("CSV has no header row.")
            headers = {clean(h).lower(): h for h in reader.fieldnames}
            columns: dict[str, str | None] = {}
            for key, aliases in ALIASES.items():
                columns[key] = next((headers[a] for a in aliases if a in headers), None)
            if not columns["name"]:
                raise ValueError("A Name column is required.")
            rows = list(reader)
    except (OSError, UnicodeError, csv.Error, ValueError) as exc:
        print(f"Cannot audit CSV: {exc}")
        return 1

    names, rolls, mobiles, serials, courses = [], [], [], [], []
    blank_name = blank_roll = blank_mobile = 0
    for row in rows:
        name = clean(row.get(columns["name"] or ""))
        roll = clean(row.get(columns["enrollment"] or ""))
        mobile = clean(row.get(columns["mobile"] or ""))
        serial = clean(row.get(columns["sl"] or ""))
        course = clean(row.get(columns["course"] or ""))
        if not name:
            blank_name += 1
            continue
        names.append(name.casefold())
        if roll: rolls.append(roll)
        else: blank_roll += 1
        if mobile: mobiles.append(mobile)
        else: blank_mobile += 1
        if serial: serials.append(serial)
        if course: courses.append(course)

    def duplicate_groups(values: list[str]) -> int:
        return sum(count > 1 for count in Counter(values).values())

    print("RCSU ELECTION 2026-2027 — VOTER LIST PREFLIGHT")
    print(f"Records read: {len(rows)}")
    print(f"Records with a name: {len(names)}")
    print(f"Blank-name rows: {blank_name}")
    print(f"Missing enrolment numbers: {blank_roll}")
    print(f"Missing mobile numbers: {blank_mobile}")
    print(f"Duplicate enrolment values: {duplicate_groups(rolls)}")
    print(f"Duplicate mobile values: {duplicate_groups(mobiles)}")
    print(f"Duplicate name groups: {duplicate_groups(names)}")
    print(f"Repeated SL No. values (informational): {duplicate_groups(serials)}")
    print(f"Course/class groups: {len(set(courses))}")
    print("\nNo student names, numbers or mobile values were printed.")
    if duplicate_groups(serials):
        print("NOTE: SL No. values repeat across class sections; the web importer uses physical sheet-row references instead.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
