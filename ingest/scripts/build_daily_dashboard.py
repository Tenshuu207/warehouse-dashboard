from __future__ import annotations

import sys
from pathlib import Path
from collections import defaultdict
from typing import Any

from common import load_json, save_json
from review_overrides import load_review_overrides, get_operator_override
from db_sqlite import connect, upsert_dataset_component, upsert_snapshot


def avg(pieces: int | float, plates: int | float) -> float:
    return round((pieces / plates), 2) if plates else 0


def build_area_mix_indexes(area_mix: dict[str, Any]) -> tuple[
    dict[str, list[dict[str, Any]]],
    dict[str, str],
    dict[tuple[str, str], dict[str, Any]],
    dict[tuple[str, str], set[str]],
    int,
]:
    mix_by_user: dict[str, list[dict[str, Any]]] = defaultdict(list)
    name_by_user: dict[str, str] = {}
    observed_area_totals: dict[tuple[str, str], dict[str, Any]] = defaultdict(
        lambda: {
            "areaCode": None,
            "areaName": None,
            "letdownMoves": 0,
            "putawayMoves": 0,
            "restockMoves": 0,
            "totalMoves": 0,
            "actualMinutes": 0,
            "standardMinutes": 0,
            "userCount": 0,
        }
    )
    observed_area_users: dict[tuple[str, str], set[str]] = defaultdict(set)

    unknown_area_rows = 0

    for row in area_mix["rows"]:
        userid = row["userid"]
        row_name = row.get("name")
        if row_name:
            name_by_user[userid] = row_name

        if row["isTotalRow"]:
            continue

        area_row = {
            "areaCode": row["areaCode"],
            "areaName": row["areaName"],
            "letdownMoves": row["letdownMoves"],
            "putawayMoves": row["putawayMoves"],
            "restockMoves": row["restockMoves"],
            "actualMinutes": row["actualMinutes"],
            "standardMinutes": row["standardMinutes"],
            "totalMoves": row["letdownMoves"]
            + row["putawayMoves"]
            + row["restockMoves"],
        }
        mix_by_user[userid].append(area_row)

        area_key = (row["areaCode"], row["areaName"])
        observed = observed_area_totals[area_key]
        observed["areaCode"] = row["areaCode"]
        observed["areaName"] = row["areaName"]
        observed["letdownMoves"] += row["letdownMoves"]
        observed["putawayMoves"] += row["putawayMoves"]
        observed["restockMoves"] += row["restockMoves"]
        observed["totalMoves"] += area_row["totalMoves"]
        observed["actualMinutes"] += row["actualMinutes"]
        observed["standardMinutes"] += row["standardMinutes"]

        observed_area_users[area_key].add(userid)

        if str(row["areaCode"]).startswith("Unknown") or str(
            row["areaName"]
        ).startswith("Unknown"):
            unknown_area_rows += 1
        elif row["areaCode"] not in {"1", "2", "3", "4", "5", "6", "7"}:
            unknown_area_rows += 1

    return (
        mix_by_user,
        name_by_user,
        observed_area_totals,
        observed_area_users,
        unknown_area_rows,
    )


def build_operator_fact(
    report_date: str,
    user: dict[str, Any],
    role_info: dict[str, Any],
    review_info: dict[str, Any],
    user_area_mix: list[dict[str, Any]],
    valid_areas: set[str],
    valid_roles: set[str],
    fallback_name: str | None,
) -> dict[str, Any]:
    userid = user["userid"]

    name = review_info.get("name") or role_info.get("name") or fallback_name or userid

    raw_assigned_role = role_info.get("assignedRole")
    raw_assigned_area = role_info.get("assignedArea")

    review_assigned_role = review_info.get("assignedRole")
    review_assigned_area = review_info.get("assignedArea")

    effective_assigned_role = review_assigned_role or raw_assigned_role
    effective_assigned_area = review_assigned_area or raw_assigned_area

    raw_dominant_area = None
    if user_area_mix:
        dominant_row = max(
            user_area_mix,
            key=lambda x: (
                x.get("actualMinutes", 0),
                x.get("letdownMoves", 0)
                + x.get("putawayMoves", 0)
                + x.get("restockMoves", 0),
            ),
        )
        raw_dominant_area = dominant_row.get("areaName")

    performance_overrides = review_info.get("performanceOverrides") or {}
    audit_overrides = review_info.get("auditOverrides") or {}

    forced_area = performance_overrides.get("forceArea")
    excluded_from_leaderboard = bool(
        performance_overrides.get("excludeFromLeaderboard", False)
    )
    exclude_reason = performance_overrides.get("excludeReason", "")

    effective_performance_area = (
        forced_area or raw_dominant_area or effective_assigned_area
    )

    total_plates = user["totalPlates"]
    total_pieces = user["totalPieces"]
    receiving_plates = user["receivingPlates"]
    receiving_pieces = user["receivingPieces"]

    total_plates_no_recv = total_plates - receiving_plates
    total_pieces_no_recv = total_pieces - receiving_pieces

    total_actual_minutes = sum(row.get("actualMinutes", 0) for row in user_area_mix)
    total_standard_minutes = sum(row.get("standardMinutes", 0) for row in user_area_mix)
    performance_vs_standard = (
        round((total_standard_minutes / total_actual_minutes) * 100, 2)
        if total_actual_minutes
        else 0
    )

    audit_flags: list[str] = []

    if not raw_assigned_area:
        audit_flags.append("missing_raw_manual_assignment")
    if not effective_assigned_area:
        audit_flags.append("missing_manual_assignment")
    if not user_area_mix:
        audit_flags.append("missing_area_mix")

    if raw_assigned_area and raw_assigned_area not in valid_areas:
        audit_flags.append("invalid_raw_assigned_area")
    if effective_assigned_area and effective_assigned_area not in valid_areas:
        audit_flags.append("invalid_assigned_area")

    if raw_assigned_role and raw_assigned_role not in valid_roles:
        audit_flags.append("invalid_raw_assigned_role")
    if effective_assigned_role and effective_assigned_role not in valid_roles:
        audit_flags.append("invalid_assigned_role")

    if forced_area and forced_area not in valid_areas:
        audit_flags.append("invalid_force_area")

    if review_assigned_area:
        audit_flags.append("assigned_area_overridden")
    if review_assigned_role:
        audit_flags.append("assigned_role_overridden")
    if forced_area:
        audit_flags.append("performance_area_overridden")
    if excluded_from_leaderboard:
        audit_flags.append("excluded_from_leaderboard")

    fact = {
        "date": report_date,
        "userid": userid,
        "name": name,
        "raw": {
            "assignedRole": raw_assigned_role,
            "assignedArea": raw_assigned_area,
            "dominantArea": raw_dominant_area,
            "areaMix": user_area_mix,
            "letdownPlates": user["letdownPlates"],
            "letdownPieces": user["letdownPieces"],
            "putawayPlates": user["putawayPlates"],
            "putawayPieces": user["putawayPieces"],
            "restockPlates": user["restockPlates"],
            "restockPieces": user["restockPieces"],
            "receivingPlates": receiving_plates,
            "receivingPieces": receiving_pieces,
            "totalPlates": total_plates,
            "totalPieces": total_pieces,
            "totalPlatesNoRecv": total_plates_no_recv,
            "totalPiecesNoRecv": total_pieces_no_recv,
            "avgPiecesPerPlate": avg(total_pieces, total_plates),
            "avgPiecesPerPlateNoRecv": avg(total_pieces_no_recv, total_plates_no_recv),
            "actualMinutes": total_actual_minutes,
            "standardMinutes": total_standard_minutes,
            "performanceVsStandard": performance_vs_standard,
        },
        "review": {
            "assignedRoleOverride": review_assigned_role,
            "assignedAreaOverride": review_assigned_area,
            "reviewNotes": review_info.get("reviewNotes", ""),
            "reviewStatus": review_info.get("reviewStatus"),
            "auditOverrides": audit_overrides,
            "performanceOverrides": performance_overrides,
            "hasNotes": bool(review_info.get("reviewNotes")),
            "hasReviewStatus": bool(review_info.get("reviewStatus")),
            "hasAssignedRoleOverride": bool(review_assigned_role),
            "hasAssignedAreaOverride": bool(review_assigned_area),
            "hasForcedPerformanceArea": bool(forced_area),
            "hasExclusion": excluded_from_leaderboard,
        },
        "effective": {
            "assignedRole": effective_assigned_role,
            "assignedArea": effective_assigned_area,
            "performanceArea": effective_performance_area,
            "excludedFromLeaderboard": excluded_from_leaderboard,
            "excludeReason": exclude_reason,
        },
        "audit": {
            "flags": sorted(dict.fromkeys(audit_flags)),
        },
    }

    return fact


def project_operator_for_dashboard(fact: dict[str, Any]) -> dict[str, Any]:
    raw = fact["raw"]
    review = fact["review"]
    effective = fact["effective"]

    return {
        "userid": fact["userid"],
        "name": fact["name"],
        # Backward-compatible fields used by existing UI
        "assignedRole": effective["assignedRole"],
        "assignedArea": effective["assignedArea"],
        "letdownPlates": raw["letdownPlates"],
        "letdownPieces": raw["letdownPieces"],
        "putawayPlates": raw["putawayPlates"],
        "putawayPieces": raw["putawayPieces"],
        "restockPlates": raw["restockPlates"],
        "restockPieces": raw["restockPieces"],
        "receivingPlates": raw["receivingPlates"],
        "receivingPieces": raw["receivingPieces"],
        "totalPlates": raw["totalPlates"],
        "totalPieces": raw["totalPieces"],
        "avgPiecesPerPlate": raw["avgPiecesPerPlate"],
        "actualMinutes": raw["actualMinutes"],
        "standardMinutes": raw["standardMinutes"],
        "performanceVsStandard": raw["performanceVsStandard"],
        "reviewNotes": review["reviewNotes"],
        "reviewStatus": review["reviewStatus"],
        "auditOverrides": review["auditOverrides"],
        "performanceOverrides": review["performanceOverrides"],
        "excludedFromLeaderboard": effective["excludedFromLeaderboard"],
        "excludeReason": effective["excludeReason"],
        "rawDominantArea": raw["dominantArea"],
        "effectivePerformanceArea": effective["performanceArea"],
        "areaMix": raw["areaMix"],
        "auditFlags": fact["audit"]["flags"],
        # New explicit fields
        "rawAssignedRole": raw["assignedRole"],
        "rawAssignedArea": raw["assignedArea"],
        "reviewAssignedRoleOverride": review["assignedRoleOverride"],
        "reviewAssignedAreaOverride": review["assignedAreaOverride"],
        "effectiveAssignedRole": effective["assignedRole"],
        "effectiveAssignedArea": effective["assignedArea"],
        "totalPlatesNoRecv": raw["totalPlatesNoRecv"],
        "totalPiecesNoRecv": raw["totalPiecesNoRecv"],
        "avgPiecesPerPlateNoRecv": raw["avgPiecesPerPlateNoRecv"],
    }


def build_assigned_areas(operator_facts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    assigned_area_totals: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "plates": 0,
            "pieces": 0,
            "platesNoRecv": 0,
            "piecesNoRecv": 0,
        }
    )
    assigned_area_users: dict[str, set[str]] = defaultdict(set)

    for fact in operator_facts:
        assigned_area = fact["effective"]["assignedArea"]
        if not assigned_area:
            continue

        raw = fact["raw"]
        assigned_area_totals[assigned_area]["plates"] += raw["totalPlates"]
        assigned_area_totals[assigned_area]["pieces"] += raw["totalPieces"]
        assigned_area_totals[assigned_area]["platesNoRecv"] += raw["totalPlatesNoRecv"]
        assigned_area_totals[assigned_area]["piecesNoRecv"] += raw["totalPiecesNoRecv"]
        assigned_area_users[assigned_area].add(fact["userid"])

    return [
        {
            "area": area,
            "plates": vals["plates"],
            "pieces": vals["pieces"],
            "avgPiecesPerPlate": avg(vals["pieces"], vals["plates"]),
            "platesNoRecv": vals["platesNoRecv"],
            "piecesNoRecv": vals["piecesNoRecv"],
            "avgPiecesPerPlateNoRecv": avg(vals["piecesNoRecv"], vals["platesNoRecv"]),
            "userCount": len(assigned_area_users[area]),
        }
        for area, vals in sorted(assigned_area_totals.items())
    ]


def build_observed_areas(
    observed_area_totals: dict[tuple[str, str], dict[str, Any]],
    observed_area_users: dict[tuple[str, str], set[str]],
) -> list[dict[str, Any]]:
    observed_areas = []

    for area_key, vals in sorted(
        observed_area_totals.items(),
        key=lambda item: (item[1]["areaName"], item[1]["areaCode"]),
    ):
        area_code, area_name = area_key
        observed_areas.append(
            {
                "areaCode": vals["areaCode"],
                "areaName": vals["areaName"],
                "letdownMoves": vals["letdownMoves"],
                "putawayMoves": vals["putawayMoves"],
                "restockMoves": vals["restockMoves"],
                "totalMoves": vals["totalMoves"],
                "actualMinutes": vals["actualMinutes"],
                "standardMinutes": vals["standardMinutes"],
                "userCount": len(observed_area_users[(area_code, area_name)]),
            }
        )

    return observed_areas


def build_receiving_rows(operators: list[dict[str, Any]]) -> list[dict[str, Any]]:
    receiving = [
        {
            "userid": op["userid"],
            "name": op["name"],
            "plates": op["receivingPlates"],
            "pieces": op["receivingPieces"],
        }
        for op in operators
        if op["receivingPlates"] or op["receivingPieces"]
    ]

    receiving.sort(key=lambda x: x["pieces"], reverse=True)
    return receiving


def build_dashboard(
    b_forkl2_path: str,
    forkstdl_path: str,
    roles_path: str,
    review_dir: str,
    options_path: str,
    output_path: str,
) -> None:
    forklift = load_json(b_forkl2_path)
    area_mix = load_json(forkstdl_path)
    roles = load_json(roles_path)
    options = load_json(options_path)

    valid_areas = set(options.get("areas", []))
    valid_roles = set(options.get("roles", []))

    report_date = forklift.get("reportDate") or area_mix.get("reportDate") or Path(output_path).stem
    review_data = load_review_overrides(review_dir, report_date)
    role_map = roles.get(report_date, {})

    (
        mix_by_user,
        name_by_user,
        observed_area_totals,
        observed_area_users,
        unknown_area_rows,
    ) = build_area_mix_indexes(area_mix)

    operator_facts: list[dict[str, Any]] = []
    users_with_missing_area_mix: list[str] = []
    users_with_missing_manual_assignment: list[str] = []

    for user in forklift["users"]:
        userid = user["userid"]
        role_info = role_map.get(userid, {})
        review_info = get_operator_override(review_data, userid)
        user_area_mix = mix_by_user.get(userid, [])

        fact = build_operator_fact(
            report_date=report_date,
            user=user,
            role_info=role_info,
            review_info=review_info,
            user_area_mix=user_area_mix,
            valid_areas=valid_areas,
            valid_roles=valid_roles,
            fallback_name=name_by_user.get(userid),
        )

        if not fact["effective"]["assignedArea"]:
            users_with_missing_manual_assignment.append(userid)
        if not user_area_mix:
            users_with_missing_area_mix.append(userid)

        operator_facts.append(fact)

    operator_facts.sort(key=lambda x: x["raw"]["totalPieces"], reverse=True)
    operators = [project_operator_for_dashboard(fact) for fact in operator_facts]

    total_plates = sum(fact["raw"]["totalPlates"] for fact in operator_facts)
    total_pieces = sum(fact["raw"]["totalPieces"] for fact in operator_facts)
    receiving_plates = sum(fact["raw"]["receivingPlates"] for fact in operator_facts)
    receiving_pieces = sum(fact["raw"]["receivingPieces"] for fact in operator_facts)
    total_plates_no_recv = sum(
        fact["raw"]["totalPlatesNoRecv"] for fact in operator_facts
    )
    total_pieces_no_recv = sum(
        fact["raw"]["totalPiecesNoRecv"] for fact in operator_facts
    )

    payload = {
        "date": report_date,
        "summary": {
            "totalPlates": total_plates,
            "totalPieces": total_pieces,
            "receivingPlates": receiving_plates,
            "receivingPieces": receiving_pieces,
            "totalPlatesNoRecv": total_plates_no_recv,
            "totalPiecesNoRecv": total_pieces_no_recv,
            "avgPiecesPerPlate": avg(total_pieces, total_plates),
            "avgPiecesPerPlateNoRecv": avg(total_pieces_no_recv, total_plates_no_recv),
        },
        "operators": operators,
        "operatorFacts": operator_facts,
        "assignedAreas": build_assigned_areas(operator_facts),
        "observedAreas": build_observed_areas(
            observed_area_totals, observed_area_users
        ),
        "receiving": build_receiving_rows(operators),
        "auditSummary": {
            "usersWithMissingAreaMix": users_with_missing_area_mix,
            "usersWithMissingManualAssignment": users_with_missing_manual_assignment,
            "unknownAreaRows": unknown_area_rows,
            "negativeTransactions": 0,
        },
    }

    save_json(output_path, payload)

    conn = connect()
    try:
        upsert_snapshot(conn, "daily", report_date, payload, source_path=output_path)
        upsert_dataset_component(
            conn,
            business_date=report_date,
            component_type="daily",
            status="ready",
            source_path=output_path,
            details={"date": report_date},
        )
    finally:
        conn.close()


if __name__ == "__main__":
    if len(sys.argv) != 7:
        print(
            "Usage: python3 build_daily_dashboard.py "
            "<b_forkl2_json> <forkstdl_json> <manual_roles_json> <review_dir> <options_json> <output_json>"
        )
        sys.exit(1)

    build_dashboard(
        sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6]
    )
    print(f"Wrote {sys.argv[6]}")
