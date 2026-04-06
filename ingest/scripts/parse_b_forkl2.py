from __future__ import annotations

import re
import sys
from pathlib import Path

from common import clean_spool_text, save_json


DATE_RANGE_RE = re.compile(r"From (\d{2}/\d{2}/\d{2}) - (\d{2}/\d{2}/\d{2})")
USER_RE = re.compile(r"^[a-z0-9]{5,8}\s*$", re.IGNORECASE)
TOTAL_RE = re.compile(
    r"^Total:\s+"
    r"(\d+)\s+([\d,]+)\s+"
    r"(\d+)\s+([\d,]+)\s+"
    r"(\d+)\s+([\d,]+)\s+"
    r"(\d+)\s+([\d,]+)\s+"
    r"(\d+)\s+([\d,]+)\s+"
    r"(\d+)\s+([\d,]+)\s*$"
)


def mmddyy_to_iso(value: str) -> str:
    mm, dd, yy = value.split("/")
    return f"20{yy}-{mm}-{dd}"


def parse_file(path: str) -> dict:
    raw = Path(path).read_text(encoding="utf-8", errors="replace")
    text = clean_spool_text(raw)
    lines = [line.rstrip() for line in text.splitlines()]

    report_date = None
    m = DATE_RANGE_RE.search(text)
    if m:
        report_date = mmddyy_to_iso(m.group(1))

    users = []
    current_userid = None

    for line in lines:
        stripped = line.strip()

        if USER_RE.match(stripped) and stripped.lower() not in {
            "employee", "totals", "moves", "units", "counts", "total"
        }:
            current_userid = stripped
            continue

        tm = TOTAL_RE.match(stripped)
        if current_userid and tm:
            nums = [int(x.replace(",", "")) for x in tm.groups()]
            users.append({
                "userid": current_userid,
                "letdownPlates": nums[0],
                "letdownPieces": nums[1],
                "putawayPlates": nums[2],
                "putawayPieces": nums[3],
                "restockPlates": nums[4],
                "restockPieces": nums[5],
                "receivingPlates": nums[6],
                "receivingPieces": nums[7],
                "countPlates": nums[8],
                "countPieces": nums[9],
                "totalPlates": nums[10],
                "totalPieces": nums[11],
            })
            current_userid = None

    return {
        "reportType": "b_forkl2",
        "reportDate": report_date,
        "users": users,
    }


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 parse_b_forkl2.py <input_file> <output_json>")
        sys.exit(1)

    parsed = parse_file(sys.argv[1])
    save_json(sys.argv[2], parsed)
    print(f"Wrote {sys.argv[2]}")
