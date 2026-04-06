from __future__ import annotations

import re
import sys
from pathlib import Path

from common import clean_spool_text, load_json, save_json


DATE_RANGE_RE = re.compile(r"From (\d{2}/\d{2}/\d{2})")
HEADER_RE = re.compile(r"^([a-z0-9]{5,8})\s+(.+?)\s*$", re.IGNORECASE)
AREA_ROW_RE = re.compile(
    r"^(Total|[A-Za-z0-9]+)\s+"
    r"(\d+)\s+([\d.]+)\s+"
    r"(\d+)\s+([\d.]+)\s+"
    r"(\d+)\s+([\d.]+)\s+"
    r"(\d+)\s+(\d+)\s+([\d.]+)\s*$"
)


def mmddyy_to_iso(value: str) -> str:
    mm, dd, yy = value.split("/")
    return f"20{yy}-{mm}-{dd}"


def parse_file(path: str, area_map_path: str) -> dict:
    raw = Path(path).read_text(encoding="utf-8", errors="replace")
    text = clean_spool_text(raw)
    lines = [line.rstrip() for line in text.splitlines()]
    area_map = load_json(area_map_path)

    report_date = None
    m = DATE_RANGE_RE.search(text)
    if m:
        report_date = mmddyy_to_iso(m.group(1))

    rows = []
    current_userid = None
    current_name = None

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("Skip "):
            continue
        if stripped.startswith("EMPLOYEE") or stripped.startswith("AREA") or stripped.startswith("From "):
            continue
        if "DENNIS FOOD SERVICE" in stripped or "RF2 FORKLIFT OPERATOR STANDARDS" in stripped or stripped.startswith("Page "):
            continue

        hm = HEADER_RE.match(stripped)
        if hm and not stripped.startswith("Total"):
            userid, name = hm.groups()
            if userid.lower() not in {"employee", "total"}:
                current_userid = userid
                current_name = name.strip()
                continue

        am = AREA_ROW_RE.match(stripped)
        if am and current_userid:
            area_code = am.group(1)
            rows.append({
                "userid": current_userid,
                "name": current_name,
                "areaCode": area_code,
                "areaName": "Total" if area_code == "Total" else area_map.get(area_code, f"Unknown-{area_code}"),
                "isTotalRow": area_code == "Total",
                "letdownMoves": int(am.group(2)),
                "letdownActualMin": float(am.group(3)),
                "putawayMoves": int(am.group(4)),
                "putawayActualMin": float(am.group(5)),
                "restockMoves": int(am.group(6)),
                "restockActualMin": float(am.group(7)),
                "actualMinutes": int(am.group(8)),
                "standardMinutes": int(am.group(9)),
                "standardPerActual": float(am.group(10)),
            })

    return {
        "reportType": "rf2_forkstdl",
        "reportDate": report_date,
        "rows": rows,
    }


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python3 parse_rf2_forkstdl.py <input_file> <area_map_json> <output_json>")
        sys.exit(1)

    parsed = parse_file(sys.argv[1], sys.argv[2])
    save_json(sys.argv[3], parsed)
    print(f"Wrote {sys.argv[3]}")
