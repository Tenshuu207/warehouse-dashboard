from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from common import load_json, save_json
from db_sqlite import connect, upsert_dataset_component, upsert_snapshot


def avg(pieces: int | float, plates: int | float) -> float:
    return round((pieces / plates), 2) if plates else 0


def empty_area_mix_row() -> dict[str, Any]:
    return {
        "areaCode": None,
        "areaName": None,
        "letdownMoves": 0,
        "putawayMoves": 0,
        "restockMoves": 0,
        "actualMinutes": 0,
        "standardMinutes": 0,
        "totalMoves": 0,
    }


def daily_fact_from_flat_operator(op: dict[str, Any], daily_date: str | None) -> dict[str, Any]:
    total_plates = op.get("totalPlates", 0)
    total_pieces = op.get("totalPieces", 0)
    receiving_plates = op.get("receivingPlates", 0)
    receiving_pieces = op.get("receivingPieces", 0)

    total_plates_no_recv = op.get("totalPlatesNoRecv", total_plates - receiving_plates)
    total_pieces_no_recv = op.get("totalPiecesNoRecv", total_pieces - receiving_pieces)

    performance_overrides = op.get("performanceOverrides") or {}
    audit_overrides = op.get("auditOverrides") or {}

    review_assigned_role = op.get("reviewAssignedRoleOverride")
    review_assigned_area = op.get("reviewAssignedAreaOverride")

    return {
        "date": daily_date,
        "userid": op["userid"],
        "name": op.get("name", op["userid"]),
        "raw": {
            "assignedRole": op.get("rawAssignedRole", op.get("assignedRole")),
            "assignedArea": op.get("rawAssignedArea", op.get("assignedArea")),
            "dominantArea": op.get("rawDominantArea"),
            "areaMix": op.get("areaMix", []),
            "letdownPlates": op.get("letdownPlates", 0),
            "letdownPieces": op.get("letdownPieces", 0),
            "putawayPlates": op.get("putawayPlates", 0),
            "putawayPieces": op.get("putawayPieces", 0),
            "restockPlates": op.get("restockPlates", 0),
            "restockPieces": op.get("restockPieces", 0),
            "receivingPlates": receiving_plates,
            "receivingPieces": receiving_pieces,
            "totalPlates": total_plates,
            "totalPieces": total_pieces,
            "totalPlatesNoRecv": total_plates_no_recv,
            "totalPiecesNoRecv": total_pieces_no_recv,
            "avgPiecesPerPlate": op.get("avgPiecesPerPlate", avg(total_pieces, total_plates)),
            "avgPiecesPerPlateNoRecv": op.get(
                "avgPiecesPerPlateNoRecv", avg(total_pieces_no_recv, total_plates_no_recv)
            ),
            "actualMinutes": op.get("actualMinutes", 0),
            "standardMinutes": op.get("standardMinutes", 0),
            "performanceVsStandard": op.get("performanceVsStandard", 0),
        },
        "review": {
            "assignedRoleOverride": review_assigned_role,
            "assignedAreaOverride": review_assigned_area,
            "reviewNotes": op.get("reviewNotes", ""),
            "reviewStatus": op.get("reviewStatus"),
            "auditOverrides": audit_overrides,
            "performanceOverrides": performance_overrides,
            "hasNotes": bool(op.get("reviewNotes")),
            "hasReviewStatus": bool(op.get("reviewStatus")),
            "hasAssignedRoleOverride": bool(review_assigned_role),
            "hasAssignedAreaOverride": bool(review_assigned_area),
            "hasForcedPerformanceArea": bool(performance_overrides.get("forceArea")),
            "hasExclusion": bool(performance_overrides.get("excludeFromLeaderboard", False)),
        },
        "effective": {
            "assignedRole": op.get("effectiveAssignedRole", op.get("assignedRole")),
            "assignedArea": op.get("effectiveAssignedArea", op.get("assignedArea")),
            "performanceArea": op.get("effectivePerformanceArea"),
            "excludedFromLeaderboard": bool(op.get("excludedFromLeaderboard", False)),
            "excludeReason": op.get("excludeReason", ""),
        },
        "audit": {
            "flags": op.get("auditFlags", []),
        },
    }


def iter_daily_facts(data: dict[str, Any]) -> list[dict[str, Any]]:
    facts = data.get("operatorFacts")
    if isinstance(facts, list) and facts:
        return facts

    daily_date = data.get("date")
    return [daily_fact_from_flat_operator(op, daily_date) for op in data.get("operators", [])]


def init_weekly_fact(userid: str, name: str) -> dict[str, Any]:
    return {
        "userid": userid,
        "name": name,
        "sourceDates": set(),
        "raw": {
            "assignedRole": None,
            "assignedArea": None,
            "dominantArea": None,
            "assignedRolesSeen": set(),
            "assignedAreasSeen": set(),
            "dominantAreasSeen": set(),
            "areaMix": defaultdict(empty_area_mix_row),
            "letdownPlates": 0,
            "letdownPieces": 0,
            "putawayPlates": 0,
            "putawayPieces": 0,
            "restockPlates": 0,
            "restockPieces": 0,
            "receivingPlates": 0,
            "receivingPieces": 0,
            "totalPlates": 0,
            "totalPieces": 0,
            "totalPlatesNoRecv": 0,
            "totalPiecesNoRecv": 0,
            "avgPiecesPerPlate": 0,
            "avgPiecesPerPlateNoRecv": 0,
            "actualMinutes": 0,
            "standardMinutes": 0,
            "performanceVsStandard": 0,
        },
        "review": {
            "assignedRoleOverride": None,
            "assignedAreaOverride": None,
            "reviewNotes": "",
            "reviewStatus": None,
            "auditOverrides": {},
            "performanceOverrides": {},
            "reviewStatusesSeen": set(),
            "assignedRoleOverridesSeen": set(),
            "assignedAreaOverridesSeen": set(),
            "forcedPerformanceAreasSeen": set(),
            "daysWithReviewStatus": 0,
            "daysReviewed": 0,
            "daysWithNotes": 0,
            "daysWithAssignedRoleOverride": 0,
            "daysWithAssignedAreaOverride": 0,
            "daysWithForcedPerformanceArea": 0,
            "daysExcludedFromLeaderboard": 0,
            "hasNotes": False,
            "hasReviewStatus": False,
            "hasAssignedRoleOverride": False,
            "hasAssignedAreaOverride": False,
            "hasForcedPerformanceArea": False,
            "hasExclusion": False,
        },
        "effective": {
            "assignedRole": None,
            "assignedArea": None,
            "performanceArea": None,
            "assignedRolesSeen": set(),
            "assignedAreasSeen": set(),
            "performanceAreasSeen": set(),
            "excludedFromLeaderboard": False,
            "excludeReason": "",
        },
        "audit": {
            "flags": set(),
        },
    }


def update_weekly_fact(agg: dict[str, Any], fact: dict[str, Any]) -> None:
    raw = fact.get("raw", {})
    review = fact.get("review", {})
    effective = fact.get("effective", {})

    date_value = fact.get("date")
    if date_value:
        agg["sourceDates"].add(date_value)

    agg["name"] = fact.get("name") or agg["name"]

    if raw.get("assignedRole"):
        agg["raw"]["assignedRole"] = raw.get("assignedRole")
        agg["raw"]["assignedRolesSeen"].add(raw.get("assignedRole"))
    if raw.get("assignedArea"):
        agg["raw"]["assignedArea"] = raw.get("assignedArea")
        agg["raw"]["assignedAreasSeen"].add(raw.get("assignedArea"))
    if raw.get("dominantArea"):
        agg["raw"]["dominantArea"] = raw.get("dominantArea")
        agg["raw"]["dominantAreasSeen"].add(raw.get("dominantArea"))

    for key in [
        "letdownPlates",
        "letdownPieces",
        "putawayPlates",
        "putawayPieces",
        "restockPlates",
        "restockPieces",
        "receivingPlates",
        "receivingPieces",
        "totalPlates",
        "totalPieces",
        "totalPlatesNoRecv",
        "totalPiecesNoRecv",
        "actualMinutes",
        "standardMinutes",
    ]:
        agg["raw"][key] += raw.get(key, 0)

    for mix in raw.get("areaMix", []):
        mix_key = (mix["areaCode"], mix["areaName"])
        m = agg["raw"]["areaMix"][mix_key]
        m["areaCode"] = mix["areaCode"]
        m["areaName"] = mix["areaName"]
        m["letdownMoves"] += mix.get("letdownMoves", 0)
        m["putawayMoves"] += mix.get("putawayMoves", 0)
        m["restockMoves"] += mix.get("restockMoves", 0)
        m["actualMinutes"] += mix.get("actualMinutes", 0)
        m["standardMinutes"] += mix.get("standardMinutes", 0)
        m["totalMoves"] += mix.get("totalMoves", 0)

    if review.get("assignedRoleOverride"):
        agg["review"]["assignedRoleOverride"] = review.get("assignedRoleOverride")
        agg["review"]["assignedRoleOverridesSeen"].add(review.get("assignedRoleOverride"))
        agg["review"]["daysWithAssignedRoleOverride"] += 1
        agg["review"]["hasAssignedRoleOverride"] = True

    if review.get("assignedAreaOverride"):
        agg["review"]["assignedAreaOverride"] = review.get("assignedAreaOverride")
        agg["review"]["assignedAreaOverridesSeen"].add(review.get("assignedAreaOverride"))
        agg["review"]["daysWithAssignedAreaOverride"] += 1
        agg["review"]["hasAssignedAreaOverride"] = True

    if review.get("reviewNotes"):
        agg["review"]["reviewNotes"] = review.get("reviewNotes")
        agg["review"]["daysWithNotes"] += 1
        agg["review"]["hasNotes"] = True

    if review.get("reviewStatus"):
        status = review.get("reviewStatus")
        agg["review"]["reviewStatus"] = status
        agg["review"]["reviewStatusesSeen"].add(status)
        agg["review"]["daysWithReviewStatus"] += 1
        agg["review"]["hasReviewStatus"] = True
        if status == "reviewed":
            agg["review"]["daysReviewed"] += 1

    if review.get("auditOverrides"):
        agg["review"]["auditOverrides"].update(review.get("auditOverrides", {}))

    performance_overrides = review.get("performanceOverrides") or {}
    if performance_overrides:
        agg["review"]["performanceOverrides"].update(performance_overrides)

    forced_area = performance_overrides.get("forceArea")
    if forced_area:
        agg["review"]["forcedPerformanceAreasSeen"].add(forced_area)
        agg["review"]["daysWithForcedPerformanceArea"] += 1
        agg["review"]["hasForcedPerformanceArea"] = True

    if performance_overrides.get("excludeFromLeaderboard", False):
        agg["review"]["daysExcludedFromLeaderboard"] += 1
        agg["review"]["hasExclusion"] = True

    if effective.get("assignedRole"):
        agg["effective"]["assignedRole"] = effective.get("assignedRole")
        agg["effective"]["assignedRolesSeen"].add(effective.get("assignedRole"))
    if effective.get("assignedArea"):
        agg["effective"]["assignedArea"] = effective.get("assignedArea")
        agg["effective"]["assignedAreasSeen"].add(effective.get("assignedArea"))
    if effective.get("performanceArea"):
        agg["effective"]["performanceArea"] = effective.get("performanceArea")
        agg["effective"]["performanceAreasSeen"].add(effective.get("performanceArea"))

    agg["effective"]["excludedFromLeaderboard"] = bool(effective.get("excludedFromLeaderboard", False))
    agg["effective"]["excludeReason"] = effective.get("excludeReason", "") or agg["effective"]["excludeReason"]

    for flag in fact.get("audit", {}).get("flags", []):
        agg["audit"]["flags"].add(flag)


def finalize_weekly_fact(agg: dict[str, Any]) -> dict[str, Any]:
    raw = agg["raw"]
    review = agg["review"]
    effective = agg["effective"]

    area_mix = list(raw["areaMix"].values())
    area_mix.sort(key=lambda x: (-x["totalMoves"], x["areaName"] or ""))

    raw["areaMix"] = area_mix
    raw["avgPiecesPerPlate"] = avg(raw["totalPieces"], raw["totalPlates"])
    raw["avgPiecesPerPlateNoRecv"] = avg(raw["totalPiecesNoRecv"], raw["totalPlatesNoRecv"])
    raw["performanceVsStandard"] = (
        round((raw["standardMinutes"] / raw["actualMinutes"]) * 100, 2) if raw["actualMinutes"] else 0
    )
    raw["assignedRolesSeen"] = sorted(raw["assignedRolesSeen"])
    raw["assignedAreasSeen"] = sorted(raw["assignedAreasSeen"])
    raw["dominantAreasSeen"] = sorted(raw["dominantAreasSeen"])

    review["reviewStatusesSeen"] = sorted(review["reviewStatusesSeen"])
    review["assignedRoleOverridesSeen"] = sorted(review["assignedRoleOverridesSeen"])
    review["assignedAreaOverridesSeen"] = sorted(review["assignedAreaOverridesSeen"])
    review["forcedPerformanceAreasSeen"] = sorted(review["forcedPerformanceAreasSeen"])

    effective["assignedRolesSeen"] = sorted(effective["assignedRolesSeen"])
    effective["assignedAreasSeen"] = sorted(effective["assignedAreasSeen"])
    effective["performanceAreasSeen"] = sorted(effective["performanceAreasSeen"])

    agg["sourceDates"] = sorted(agg["sourceDates"])
    agg["audit"]["flags"] = sorted(agg["audit"]["flags"])

    return agg


def project_operator_for_dashboard(fact: dict[str, Any]) -> dict[str, Any]:
    raw = fact["raw"]
    review = fact["review"]
    effective = fact["effective"]

    return {
        "userid": fact["userid"],
        "name": fact["name"],

        # Existing UI-compatible fields
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

        # Explicit raw/review/effective fields
        "rawAssignedRole": raw["assignedRole"],
        "rawAssignedArea": raw["assignedArea"],
        "reviewAssignedRoleOverride": review["assignedRoleOverride"],
        "reviewAssignedAreaOverride": review["assignedAreaOverride"],
        "effectiveAssignedRole": effective["assignedRole"],
        "effectiveAssignedArea": effective["assignedArea"],

        # No-receiving totals
        "totalPlatesNoRecv": raw["totalPlatesNoRecv"],
        "totalPiecesNoRecv": raw["totalPiecesNoRecv"],
        "avgPiecesPerPlateNoRecv": raw["avgPiecesPerPlateNoRecv"],

        # Helpful weekly context
        "sourceDates": fact["sourceDates"],
        "rawAssignedRolesSeen": raw["assignedRolesSeen"],
        "rawAssignedAreasSeen": raw["assignedAreasSeen"],
        "effectiveAssignedRolesSeen": effective["assignedRolesSeen"],
        "effectiveAssignedAreasSeen": effective["assignedAreasSeen"],
        "effectivePerformanceAreasSeen": effective["performanceAreasSeen"],
        "daysWithReviewStatus": review["daysWithReviewStatus"],
        "daysReviewed": review["daysReviewed"],
        "daysWithNotes": review["daysWithNotes"],
        "daysExcludedFromLeaderboard": review["daysExcludedFromLeaderboard"],
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
    observed_areas: dict[tuple[str, str], dict[str, Any]],
) -> list[dict[str, Any]]:
    return [
        {
            "areaCode": vals["areaCode"],
            "areaName": vals["areaName"],
            "letdownMoves": vals["letdownMoves"],
            "putawayMoves": vals["putawayMoves"],
            "restockMoves": vals["restockMoves"],
            "totalMoves": vals["totalMoves"],
            "actualMinutes": vals["actualMinutes"],
            "standardMinutes": vals["standardMinutes"],
            "userCount": len(vals["userIds"]),
        }
        for _, vals in sorted(observed_areas.items(), key=lambda item: (item[1]["areaName"], item[1]["areaCode"]))
    ]


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


def build_weekly_dashboard(daily_dir: str, week_start: str, output_path: str) -> None:
    daily_path = Path(daily_dir)
    daily_files = sorted(daily_path.glob("*.json"))

    selected = [f for f in daily_files if f.stem >= week_start][:7]
    if not selected:
        raise FileNotFoundError(f"No daily dashboard files found from {week_start} in {daily_dir}")

    summary = {
        "totalPlates": 0,
        "totalPieces": 0,
        "receivingPlates": 0,
        "receivingPieces": 0,
        "totalPlatesNoRecv": 0,
        "totalPiecesNoRecv": 0,
        "avgPiecesPerPlate": 0,
        "avgPiecesPerPlateNoRecv": 0,
    }

    operators_by_user: dict[str, dict[str, Any]] = {}

    observed_areas: dict[tuple[str, str], dict[str, Any]] = defaultdict(
        lambda: {
            "areaCode": None,
            "areaName": None,
            "letdownMoves": 0,
            "putawayMoves": 0,
            "restockMoves": 0,
            "totalMoves": 0,
            "actualMinutes": 0,
            "standardMinutes": 0,
            "userIds": set(),
        }
    )

    audit_summary = {
        "usersWithMissingAreaMix": set(),
        "usersWithMissingManualAssignment": set(),
        "unknownAreaRows": 0,
        "negativeTransactions": 0,
    }

    week_end = selected[-1].stem

    for file in selected:
        data = load_json(file)

        s = data.get("summary", {})
        summary["totalPlates"] += s.get("totalPlates", 0)
        summary["totalPieces"] += s.get("totalPieces", 0)
        summary["receivingPlates"] += s.get("receivingPlates", 0)
        summary["receivingPieces"] += s.get("receivingPieces", 0)
        summary["totalPlatesNoRecv"] += s.get(
            "totalPlatesNoRecv", s.get("totalPlates", 0) - s.get("receivingPlates", 0)
        )
        summary["totalPiecesNoRecv"] += s.get(
            "totalPiecesNoRecv", s.get("totalPieces", 0) - s.get("receivingPieces", 0)
        )

        for fact in iter_daily_facts(data):
            userid = fact["userid"]
            if userid not in operators_by_user:
                operators_by_user[userid] = init_weekly_fact(userid, fact.get("name", userid))
            update_weekly_fact(operators_by_user[userid], fact)

            for mix in fact.get("raw", {}).get("areaMix", []):
                key = (mix["areaCode"], mix["areaName"])
                a = observed_areas[key]
                a["areaCode"] = mix["areaCode"]
                a["areaName"] = mix["areaName"]
                a["letdownMoves"] += mix.get("letdownMoves", 0)
                a["putawayMoves"] += mix.get("putawayMoves", 0)
                a["restockMoves"] += mix.get("restockMoves", 0)
                a["totalMoves"] += mix.get("totalMoves", 0)
                a["actualMinutes"] += mix.get("actualMinutes", 0)
                a["standardMinutes"] += mix.get("standardMinutes", 0)
                a["userIds"].add(userid)

        for area in data.get("observedAreas", []):
            key = (area["areaCode"], area["areaName"])
            a = observed_areas[key]
            a["areaCode"] = area["areaCode"]
            a["areaName"] = area["areaName"]

        audit = data.get("auditSummary", {})
        audit_summary["usersWithMissingAreaMix"].update(audit.get("usersWithMissingAreaMix", []))
        audit_summary["usersWithMissingManualAssignment"].update(audit.get("usersWithMissingManualAssignment", []))
        audit_summary["unknownAreaRows"] += audit.get("unknownAreaRows", 0)
        audit_summary["negativeTransactions"] += audit.get("negativeTransactions", 0)

    operator_facts = [finalize_weekly_fact(op) for op in operators_by_user.values()]
    operator_facts.sort(key=lambda x: x["raw"]["totalPieces"], reverse=True)

    operators = [project_operator_for_dashboard(fact) for fact in operator_facts]
    receiving = build_receiving_rows(operators)

    summary["avgPiecesPerPlate"] = avg(summary["totalPieces"], summary["totalPlates"])
    summary["avgPiecesPerPlateNoRecv"] = avg(summary["totalPiecesNoRecv"], summary["totalPlatesNoRecv"])

    payload = {
        "weekStart": week_start,
        "weekEnd": week_end,
        "sourceDates": [f.stem for f in selected],
        "summary": summary,
        "operators": operators,
        "operatorFacts": operator_facts,
        "assignedAreas": build_assigned_areas(operator_facts),
        "observedAreas": build_observed_areas(observed_areas),
        "receiving": receiving,
        "auditSummary": {
            "usersWithMissingAreaMix": sorted(audit_summary["usersWithMissingAreaMix"]),
            "usersWithMissingManualAssignment": sorted(audit_summary["usersWithMissingManualAssignment"]),
            "unknownAreaRows": audit_summary["unknownAreaRows"],
            "negativeTransactions": audit_summary["negativeTransactions"],
        },
    }

    save_json(output_path, payload)

    conn = connect()
    try:
        upsert_snapshot(conn, "weekly", week_start, payload, source_path=output_path)
        upsert_dataset_component(
            conn,
            business_date=week_start,
            component_type="weekly",
            status="ready",
            source_path=output_path,
            details={"weekStart": week_start, "sourceDates": payload.get("sourceDates", [])},
        )
    finally:
        conn.close()


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python3 build_weekly_dashboard.py <daily_dir> <week_start> <output_json>")
        sys.exit(1)

    build_weekly_dashboard(sys.argv[1], sys.argv[2], sys.argv[3])
    print(f"Wrote {sys.argv[3]}")
