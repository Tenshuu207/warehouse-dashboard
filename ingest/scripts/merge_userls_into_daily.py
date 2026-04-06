from __future__ import annotations

import copy
import sys
from pathlib import Path
from typing import Any

from common import load_json, save_json


def build_userls_map(userls_summary: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        row["userid"]: row
        for row in userls_summary.get("users", [])
    }


def delta(a: int | float | None, b: int | float | None) -> int | float | None:
    if a is None or b is None:
        return None
    return a - b


def build_identity_map() -> dict[str, dict[str, Any]]:
    employees_path = Path("ingest/config/employees.json")
    mappings_path = Path("ingest/config/rf_username_mappings.json")

    if not employees_path.exists() or not mappings_path.exists():
        return {}

    employees_data = load_json(str(employees_path))
    mappings_data = load_json(str(mappings_path))

    employees = employees_data.get("employees", {}) or {}
    mappings = mappings_data.get("mappings", []) or []

    by_rf: dict[str, dict[str, Any]] = {}

    for mapping in mappings:
        if not mapping.get("active", True):
            continue

        rf = str(mapping.get("rfUsername") or "").strip()
        emp_id = str(mapping.get("employeeId") or "").strip()
        if not rf or not emp_id:
            continue

        emp = employees.get(emp_id)
        if not emp:
            continue

        by_rf[rf] = {
            "employeeId": emp_id,
            "displayName": emp.get("displayName") or rf,
            "defaultTeam": emp.get("defaultTeam"),
            "status": emp.get("status"),
        }

    return by_rf


def apply_identity_resolution(row: dict[str, Any], identity_map: dict[str, dict[str, Any]]) -> None:
    userid = str(row.get("userid") or "").strip()
    resolved = identity_map.get(userid)
    if not resolved:
        return

    current_name = row.get("name")
    display_name = resolved.get("displayName") or current_name or userid

    if current_name and current_name != display_name and "sourceName" not in row:
        row["sourceName"] = current_name

    row["resolvedEmployeeId"] = resolved.get("employeeId")
    row["resolvedEmployeeName"] = display_name
    row["resolvedDefaultTeam"] = resolved.get("defaultTeam")
    row["resolvedEmployeeStatus"] = resolved.get("status")
    row["name"] = display_name


def merge(userls_summary_json: str, daily_json: str, output_json: str) -> None:
    userls_summary = load_json(userls_summary_json)
    daily = load_json(daily_json)

    identity_map = build_identity_map()
    userls_by_user = build_userls_map(userls_summary)
    daily_users = daily.get("operators", [])

    enriched = copy.deepcopy(daily)

    overlap_count = 0
    daily_only_count = 0

    for op in enriched.get("operators", []):
        userid = op.get("userid")
        u = userls_by_user.get(userid)

        total_plates_no_recv = op.get("totalPlatesNoRecv")
        total_pieces_no_recv = op.get("totalPiecesNoRecv")

        if total_plates_no_recv is None:
            total_plates_no_recv = int(op.get("totalPlates", 0) or 0) - int(op.get("receivingPlates", 0) or 0)
        if total_pieces_no_recv is None:
            total_pieces_no_recv = int(op.get("totalPieces", 0) or 0) - int(op.get("receivingPieces", 0) or 0)

        if not u:
            daily_only_count += 1
            op["userlsTracking"] = {
                "present": False,
                "pickPlates": 0,
                "pickPieces": 0,
                "pickRouteCount": 0,
                "pickMinutes": 0,
                "pickPiecesFromRouteTotals": 0,
                "pickRateReportedAverage": None,
                "pickRateReportedWeighted": None,
                "pickRateDerivedPiecesPerMinute": None,
                "receivingPlates": 0,
                "receivingPieces": 0,
                "letdownPlates": 0,
                "letdownPieces": 0,
                "putawayPlates": 0,
                "putawayPieces": 0,
                "restockLikePlatesEstimated": 0,
                "restockLikePiecesEstimated": 0,
                "replenishmentNoRecvPlates": 0,
                "replenishmentNoRecvPieces": 0,
                "otherNonPickPlates": 0,
                "otherNonPickPieces": 0,
                "primaryReplenishmentAreaCode": None,
                "primaryReplenishmentShare": None,
                "primaryActivityAreaCode": None,
                "primaryActivityShare": None,
                "primaryReplenishmentRole": None,
                "primaryReplenishmentRoleShare": None,
                "areaBuckets": [],
                "roleBuckets": [],
                "deltas": {
                    "receivingPlates": None,
                    "receivingPieces": None,
                    "replenishmentNoRecvPlates": None,
                    "replenishmentNoRecvPieces": None,
                    "letdownPlates": None,
                    "putawayPlates": None,
                    "restockLikeEstimatedPlates": None,
                },
            }
            apply_identity_resolution(op, identity_map)
            continue

        overlap_count += 1

        op["userlsTracking"] = {
            "present": True,
            "pickPlates": int(u.get("pickPlates", 0) or 0),
            "pickPieces": int(u.get("pickPieces", 0) or 0),
            "pickRouteCount": int(u.get("pickRouteCount", 0) or 0),
            "pickMinutes": int(u.get("pickMinutes", 0) or 0),
            "pickPiecesFromRouteTotals": int(u.get("pickPiecesFromRouteTotals", 0) or 0),
            "pickRateReportedAverage": u.get("pickRateReportedAverage"),
            "pickRateReportedWeighted": u.get("pickRateReportedWeighted"),
            "pickRateDerivedPiecesPerMinute": u.get("pickRateDerivedPiecesPerMinute"),
            "receivingPlates": int(u.get("receivingPlates", 0) or 0),
            "receivingPieces": int(u.get("receivingPieces", 0) or 0),
            "letdownPlates": int(u.get("letdownPlates", 0) or 0),
            "letdownPieces": int(u.get("letdownPieces", 0) or 0),
            "putawayPlates": int(u.get("putawayPlates", 0) or 0),
            "putawayPieces": int(u.get("putawayPieces", 0) or 0),
            "restockLikePlatesEstimated": int(u.get("restockLikePlatesEstimated", 0) or 0),
            "restockLikePiecesEstimated": int(u.get("restockLikePiecesEstimated", 0) or 0),
            "replenishmentNoRecvPlates": int(u.get("replenishmentNoRecvPlates", 0) or 0),
            "replenishmentNoRecvPieces": int(u.get("replenishmentNoRecvPieces", 0) or 0),
            "otherNonPickPlates": int(u.get("otherNonPickPlates", 0) or 0),
            "otherNonPickPieces": int(u.get("otherNonPickPieces", 0) or 0),
            "primaryReplenishmentAreaCode": u.get("primaryReplenishmentAreaCode"),
            "primaryReplenishmentShare": u.get("primaryReplenishmentShare"),
            "primaryActivityAreaCode": u.get("primaryActivityAreaCode"),
            "primaryActivityShare": u.get("primaryActivityShare"),
            "primaryReplenishmentRole": u.get("primaryReplenishmentRole"),
            "primaryReplenishmentRoleShare": u.get("primaryReplenishmentRoleShare"),
            "areaBuckets": u.get("areaBuckets", []),
            "roleBuckets": u.get("roleBuckets", []),
            "deltas": {
                "receivingPlates": delta(
                    int(u.get("receivingPlates", 0) or 0),
                    int(op.get("receivingPlates", 0) or 0),
                ),
                "receivingPieces": delta(
                    int(u.get("receivingPieces", 0) or 0),
                    int(op.get("receivingPieces", 0) or 0),
                ),
                "replenishmentNoRecvPlates": delta(
                    int(u.get("replenishmentNoRecvPlates", 0) or 0),
                    int(total_plates_no_recv or 0),
                ),
                "replenishmentNoRecvPieces": delta(
                    int(u.get("replenishmentNoRecvPieces", 0) or 0),
                    int(total_pieces_no_recv or 0),
                ),
                "letdownPlates": delta(
                    int(u.get("letdownPlates", 0) or 0),
                    int(op.get("letdownPlates", 0) or 0),
                ),
                "putawayPlates": delta(
                    int(u.get("putawayPlates", 0) or 0),
                    int(op.get("putawayPlates", 0) or 0),
                ),
                "restockLikeEstimatedPlates": delta(
                    int(u.get("restockLikePlatesEstimated", 0) or 0),
                    int(op.get("restockPlates", 0) or 0),
                ),
            },
        }

        apply_identity_resolution(op, identity_map)

    daily_userids = {op.get("userid") for op in daily_users}
    userls_only_users = []

    for userid, row in sorted(userls_by_user.items(), key=lambda kv: kv[0]):
        if userid in daily_userids:
            continue

        out_row = {
            "userid": userid,
            "name": row.get("name"),
            "pickPlates": int(row.get("pickPlates", 0) or 0),
            "pickPieces": int(row.get("pickPieces", 0) or 0),
            "pickRouteCount": int(row.get("pickRouteCount", 0) or 0),
            "pickMinutes": int(row.get("pickMinutes", 0) or 0),
            "pickPiecesFromRouteTotals": int(row.get("pickPiecesFromRouteTotals", 0) or 0),
            "pickRateReportedAverage": row.get("pickRateReportedAverage"),
            "pickRateReportedWeighted": row.get("pickRateReportedWeighted"),
            "pickRateDerivedPiecesPerMinute": row.get("pickRateDerivedPiecesPerMinute"),
            "receivingPlates": int(row.get("receivingPlates", 0) or 0),
            "receivingPieces": int(row.get("receivingPieces", 0) or 0),
            "replenishmentNoRecvPlates": int(row.get("replenishmentNoRecvPlates", 0) or 0),
            "replenishmentNoRecvPieces": int(row.get("replenishmentNoRecvPieces", 0) or 0),
            "otherNonPickPlates": int(row.get("otherNonPickPlates", 0) or 0),
            "otherNonPickPieces": int(row.get("otherNonPickPieces", 0) or 0),
            "primaryReplenishmentAreaCode": row.get("primaryReplenishmentAreaCode"),
            "primaryReplenishmentShare": row.get("primaryReplenishmentShare"),
            "primaryActivityAreaCode": row.get("primaryActivityAreaCode"),
            "primaryActivityShare": row.get("primaryActivityShare"),
            "primaryReplenishmentRole": row.get("primaryReplenishmentRole"),
            "primaryReplenishmentRoleShare": row.get("primaryReplenishmentRoleShare"),
            "areaBuckets": row.get("areaBuckets", []),
            "roleBuckets": row.get("roleBuckets", []),
        }
        apply_identity_resolution(out_row, identity_map)
        userls_only_users.append(out_row)

    enriched["userlsTrackingSummary"] = {
        "present": True,
        "sourceReportDate": userls_summary.get("reportDate"),
        "sourceFile": userls_summary.get("sourceFile"),
        "overlapUsers": overlap_count,
        "dailyOnlyUsers": daily_only_count,
        "userlsOnlyUsers": len(userls_only_users),
        "summary": userls_summary.get("summary", {}),
    }

    enriched["userlsOnlyUsers"] = userls_only_users

    save_json(output_json, enriched)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(
            "Usage: python3 merge_userls_into_daily.py "
            "<userls_summary_json> <daily_json> <output_json>"
        )
        raise SystemExit(1)

    merge(sys.argv[1], sys.argv[2], sys.argv[3])
    print(f"Wrote {sys.argv[3]}")
