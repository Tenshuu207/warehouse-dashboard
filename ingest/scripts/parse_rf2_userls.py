from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from common import save_json


DATE_RANGE_RE = re.compile(
    r"(?P<start>\d{2}/\d{2}/\d{2})\s+\d{6}\s*-\s*(?P<end>\d{2}/\d{2}/\d{2})\s+\d{6}"
)

TX_RE = re.compile(
    r"""
    ^\s*
    (?:(?P<route>\d+)\s+)?
    (?P<trans_date>\d{2}/\d{2}/\d{2})\s+
    (?P<time>\d{2}:\d{2}:\d{2})\s+
    (?P<item>\S+)\s+
    (?P<middle>.+?)\s+
    (?P<pallet_date>\d{2}/\d{2}/\d{2})\s+
    (?P<transtype>[A-Za-z][A-Za-z0-9]+)\s+
    (?P<bin>\S+)\s+
    (?P<qty>-?\d+)\s+
    (?P<unit>\S+)
    \s*$
    """,
    re.VERBOSE,
)

USER_HEADER_RE = re.compile(
    r"^(?P<userid>[A-Za-z0-9_]+)\s{2,}(?P<name>[A-Za-z].*?)\s*$"
)

TOTAL_HEADER_RE = re.compile(
    r"^(?P<userid>[A-Za-z0-9_]+)\s+(?P<name>.+?)\s+\(Total\)\s+Inactive Mins:\s+(?P<inactive>\d+)(?P<rest>.*)$"
)

TOTAL_PIECES_RE = re.compile(
    r"(?:Route:\s*(?P<route>\d+)\s+)?Total Pieces\s+(?P<transtype>[A-Za-z0-9]+):\s*(?P<pieces>-?\d+)"
)

TIMES_RE = re.compile(
    r"Times:\s*(?P<start>\d{2}:\d{2}:\d{2})\s+(?P<end>\d{2}:\d{2}:\d{2})\s+(?P<minutes>\d+)\s+minutes\s+Rate:\s*(?P<rate>[0-9.]+)"
)

NO_ACTIVITY_RE = re.compile(
    r"^No activity\s+(?P<start>\d{2}:\d{2}:\d{2})\s+to\s+(?P<end>\d{2}:\d{2}:\d{2})\s*-\s*(?P<minutes>\d+)\s+min$"
)

MIDDLE_SPLIT_RE = re.compile(
    r"^(?P<description>.+?)(?:\s{2,}(?P<customer_id>\d+)\s+(?P<customer_name>.+))?$"
)

HEADER_PREFIXES = (
    "RF2 USER ACTIVITY LOG",
    "USER ID   USER NAME",
    "ROUTE TRANS DT",
    "DENNIS FOOD SERVICE",
)

TRANSACTION_NORMALIZATION = {
    "pick": "Pick",
    "putaway": "Putaway",
    "letdown": "Letdown",
    "restock": "Restock",
    "movefrom": "MoveFrom",
    "moveto": "MoveTo",
    "receive": "Receive",
    "recv": "Receive",
    "transfer": "Transfer",
}


def clean_text(raw: str) -> str:
    raw = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", raw)
    raw = re.sub(r"\x1b[@-Z\\-_]", "", raw)
    raw = raw.replace("\r", "")
    raw = "".join(ch for ch in raw if ch == "\n" or ch == "\f" or ch == "\t" or ord(ch) >= 32)
    return raw


def mmddyy_to_iso(value: str) -> str:
    month, day, year = value.split("/")
    return f"20{year}-{month}-{day}"


def normalize_transtype(value: str) -> str:
    key = value.strip().lower()
    return TRANSACTION_NORMALIZATION.get(key, value.strip())


def should_skip_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return True
    if stripped.startswith("-"):
        return True
    if stripped.startswith("Page "):
        return True
    if any(prefix in stripped for prefix in HEADER_PREFIXES):
        return True
    if stripped.endswith(".p"):
        return True
    if re.match(r"^\d{2}/\d{2}/\d{2}\s+\d{6}\s+-\s+\d{2}/\d{2}/\d{2}\s+\d{6}", stripped):
        return True
    if re.match(r"^[A-Za-z]{3,9},\s+[A-Za-z]+\s+\d{1,2},\s+20\d{2}", stripped):
        return True
    if re.match(r"^\d{2}:\d{2}:\d{2}$", stripped):
        return True
    return False


def blank_user() -> dict[str, Any]:
    return {
        "userid": None,
        "name": None,
        "inactiveMinutes": 0,
        "transactions": [],
        "noActivity": [],
        "routeTotals": {},
        "summaryByType": {},
        "summary": {
            "totalLines": 0,
            "totalPieces": 0,
            "pickLines": 0,
            "pickPieces": 0,
            "nonPickLines": 0,
            "nonPickPieces": 0,
        },
    }


def ensure_route_totals(user: dict[str, Any], route: str) -> dict[str, Any]:
    if route not in user["routeTotals"]:
        user["routeTotals"][route] = {
            "route": route,
            "piecesByType": {},
            "startTime": None,
            "endTime": None,
            "minutes": None,
            "rate": None,
        }
    return user["routeTotals"][route]


def ensure_summary_type(user: dict[str, Any], transtype: str) -> dict[str, Any]:
    if transtype not in user["summaryByType"]:
        user["summaryByType"][transtype] = {
            "lines": 0,
            "pieces": 0,
        }
    return user["summaryByType"][transtype]


def split_middle_fields(middle: str) -> dict[str, Any]:
    middle = middle.rstrip()
    match = MIDDLE_SPLIT_RE.match(middle)
    if not match:
        return {
            "description": middle,
            "customerId": None,
            "customerName": None,
        }

    description = (match.group("description") or "").strip()
    customer_id = match.group("customer_id")
    customer_name = match.group("customer_name")
    return {
        "description": description,
        "customerId": customer_id.strip() if customer_id else None,
        "customerName": customer_name.strip() if customer_name else None,
    }


def finalize_user(user: dict[str, Any]) -> dict[str, Any] | None:
    if not user["userid"]:
        return None

    by_type = user["summaryByType"]
    summary = user["summary"]

    summary["pickLines"] = 0
    summary["pickPieces"] = 0
    summary["nonPickLines"] = 0
    summary["nonPickPieces"] = 0

    for transtype, values in by_type.items():
        if transtype == "Pick":
            summary["pickLines"] += int(values["lines"])
            summary["pickPieces"] += int(values["pieces"])
        else:
            summary["nonPickLines"] += int(values["lines"])
            summary["nonPickPieces"] += int(values["pieces"])

    route_totals = dict(sorted(user["routeTotals"].items(), key=lambda kv: kv[0]))

    return {
        "userid": user["userid"],
        "name": user["name"],
        "inactiveMinutes": user["inactiveMinutes"],
        "transactions": user["transactions"],
        "noActivity": user["noActivity"],
        "routeTotals": route_totals,
        "summaryByType": dict(sorted(by_type.items(), key=lambda kv: kv[0])),
        "summary": summary,
    }


def apply_total_pieces_line(user: dict[str, Any], stripped: str, last_route: str | None) -> str | None:
    match = TOTAL_PIECES_RE.search(stripped)
    if not match:
        return last_route

    route = match.group("route") or last_route
    transtype = normalize_transtype(match.group("transtype"))
    pieces = int(match.group("pieces"))

    if route:
        route_total = ensure_route_totals(user, route)
        route_total["piecesByType"][transtype] = pieces
        last_route = route

    return last_route


def apply_times_line(user: dict[str, Any], stripped: str, last_route: str | None) -> str | None:
    match = TIMES_RE.search(stripped)
    if not match or not last_route:
        return last_route

    route_total = ensure_route_totals(user, last_route)
    route_total["startTime"] = match.group("start")
    route_total["endTime"] = match.group("end")
    route_total["minutes"] = int(match.group("minutes"))
    route_total["rate"] = float(match.group("rate"))
    return last_route


def parse_file(path: str) -> dict[str, Any]:
    text = clean_text(Path(path).read_text(errors="ignore"))
    lines = text.splitlines()

    report_date = None
    for line in lines:
        match = DATE_RANGE_RE.search(line)
        if match:
            report_date = mmddyy_to_iso(match.group("start"))
            break

    current = blank_user()
    users: list[dict[str, Any]] = []
    last_route_for_totals: str | None = None

    def flush_current() -> None:
        nonlocal current, last_route_for_totals
        finalized = finalize_user(current)
        if finalized:
            users.append(finalized)
        current = blank_user()
        last_route_for_totals = None

    for raw_line in lines:
        line = raw_line.rstrip()
        stripped = line.strip()

        if should_skip_line(line):
            continue

        total_header_match = TOTAL_HEADER_RE.match(stripped)
        if total_header_match:
            if current["userid"] and current["userid"] != total_header_match.group("userid"):
                flush_current()

            current["userid"] = total_header_match.group("userid")
            current["name"] = total_header_match.group("name").strip()
            current["inactiveMinutes"] = int(total_header_match.group("inactive"))

            rest = total_header_match.group("rest") or ""
            last_route_for_totals = apply_total_pieces_line(current, rest, last_route_for_totals)
            last_route_for_totals = apply_times_line(current, rest, last_route_for_totals)
            continue

        no_activity_match = NO_ACTIVITY_RE.match(stripped)
        if no_activity_match and current["userid"]:
            current["noActivity"].append(
                {
                    "startTime": no_activity_match.group("start"),
                    "endTime": no_activity_match.group("end"),
                    "minutes": int(no_activity_match.group("minutes")),
                }
            )
            continue

        if current["userid"]:
            maybe_route = apply_total_pieces_line(current, stripped, last_route_for_totals)
            if maybe_route != last_route_for_totals:
                last_route_for_totals = maybe_route
                continue

            before_times = last_route_for_totals
            last_route_for_totals = apply_times_line(current, stripped, last_route_for_totals)
            if TIMES_RE.search(stripped) and before_times == last_route_for_totals:
                continue
            if TIMES_RE.search(stripped):
                continue

        tx_match = TX_RE.match(line)
        if tx_match and current["userid"]:
            transtype = normalize_transtype(tx_match.group("transtype"))
            qty = int(tx_match.group("qty"))
            route = tx_match.group("route")
            middle = split_middle_fields(tx_match.group("middle"))

            tx = {
                "route": route,
                "transDate": mmddyy_to_iso(tx_match.group("trans_date")),
                "time": tx_match.group("time"),
                "item": tx_match.group("item"),
                "description": middle["description"],
                "customerId": middle["customerId"],
                "customerName": middle["customerName"],
                "palletDate": mmddyy_to_iso(tx_match.group("pallet_date")),
                "transType": transtype,
                "bin": tx_match.group("bin"),
                "qty": qty,
                "unit": tx_match.group("unit"),
                "plateCount": 1,
            }
            current["transactions"].append(tx)

            summary_type = ensure_summary_type(current, transtype)
            summary_type["lines"] += 1
            summary_type["pieces"] += qty

            current["summary"]["totalLines"] += 1
            current["summary"]["totalPieces"] += qty
            continue

        user_header_match = USER_HEADER_RE.match(stripped)
        if user_header_match and "(Total)" not in stripped and not re.search(r"\d{2}/\d{2}/\d{2}", stripped):
            maybe_userid = user_header_match.group("userid")
            maybe_name = user_header_match.group("name").strip()
            if maybe_userid.lower() != "user" and maybe_name.lower() != "user name":
                if current["userid"] and current["userid"] != maybe_userid:
                    flush_current()

                current["userid"] = maybe_userid
                current["name"] = maybe_name
                continue

    if current["userid"]:
        flush_current()

    users.sort(key=lambda row: row["userid"])

    totals_by_type: dict[str, dict[str, int]] = defaultdict(lambda: {"lines": 0, "pieces": 0})
    grand_summary = {
        "userCount": len(users),
        "totalLines": 0,
        "totalPieces": 0,
        "pickLines": 0,
        "pickPieces": 0,
        "nonPickLines": 0,
        "nonPickPieces": 0,
    }

    for user in users:
        grand_summary["totalLines"] += int(user["summary"]["totalLines"])
        grand_summary["totalPieces"] += int(user["summary"]["totalPieces"])
        grand_summary["pickLines"] += int(user["summary"]["pickLines"])
        grand_summary["pickPieces"] += int(user["summary"]["pickPieces"])
        grand_summary["nonPickLines"] += int(user["summary"]["nonPickLines"])
        grand_summary["nonPickPieces"] += int(user["summary"]["nonPickPieces"])

        for transtype, values in user["summaryByType"].items():
            totals_by_type[transtype]["lines"] += int(values["lines"])
            totals_by_type[transtype]["pieces"] += int(values["pieces"])

    return {
        "reportDate": report_date,
        "sourceFile": str(Path(path).name),
        "users": users,
        "totalsByType": dict(sorted(totals_by_type.items(), key=lambda kv: kv[0])),
        "summary": grand_summary,
    }


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 parse_rf2_userls.py <rf2_userls_report> <output_json>")
        sys.exit(1)

    parsed = parse_file(sys.argv[1])
    save_json(sys.argv[2], parsed)
    print(f"Wrote {sys.argv[2]}")
