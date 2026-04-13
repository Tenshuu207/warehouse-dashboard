from __future__ import annotations

import argparse
import os
import tempfile
from collections import defaultdict
from pathlib import Path
from typing import Any

from common import load_json, save_json
from db_sqlite import connect, upsert_dataset_component, upsert_snapshot
from merge_userls_into_daily import merge as merge_userls_into_daily
from review_overrides import get_operator_override, load_review_overrides
from build_daily_dashboard import (
    avg,
    build_assigned_areas,
    build_observed_areas,
    build_operator_fact,
    build_receiving_rows,
    project_operator_for_dashboard,
)

REPO_ROOT = Path(__file__).resolve().parents[2]

AREA_NAME_BY_CODE = {
    "1": "Dry",
    "2": "Seafood/Chicken",
    "3": "Cooler",
    "4": "Produce Cooler",
    "5": "Dry PIR",
    "6": "Freezer",
    "7": "Freezer PIR",
}

DEFAULT_ROLE_CANDIDATES = [
    "frontend/data/manual_roles.json",
    "ingest/config/manual_roles.json",
    "ingest/config/manual-roles.json",
]

DEFAULT_OPTIONS_CANDIDATES = [
    "frontend/data/options.json",
    "ingest/config/options.json",
]

DEFAULT_REVIEW_DIR_CANDIDATES = [
    "ingest/config/reviews",
    "frontend/data/review",
    "ingest/review",
]


def safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def first_existing(candidates: list[str]) -> str | None:
    for candidate in candidates:
        path = REPO_ROOT / candidate
        if path.exists():
            return str(path)
    return None


def area_name_for_code(area_code: str | None) -> str:
    code = str(area_code or "").strip()
    if not code:
        return "Unknown"
    return AREA_NAME_BY_CODE.get(code, f"Unknown-{code}")


def load_json_if_exists(path: str | None, fallback: dict[str, Any]) -> dict[str, Any]:
    if not path:
        return fallback
    p = Path(path)
    if not p.exists():
        return fallback
    return load_json(str(p))


def load_review_data(review_dir: str | None, report_date: str) -> dict[str, Any]:
    if not review_dir:
        return {}
    p = Path(review_dir)
    if not p.exists():
        return {}
    return load_review_overrides(str(p), report_date)


def build_userls_indexes(
    userls_summary: dict[str, Any] | None,
) -> tuple[
    dict[str, dict[str, Any]],
    dict[str, list[dict[str, Any]]],
    dict[tuple[str, str], dict[str, Any]],
    dict[tuple[str, str], set[str]],
    int,
]:
    by_user: dict[str, dict[str, Any]] = {}
    mix_by_user: dict[str, list[dict[str, Any]]] = defaultdict(list)
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

    if not userls_summary:
        return by_user, mix_by_user, observed_area_totals, observed_area_users, unknown_area_rows

    for user in userls_summary.get("users", []) or []:
        userid = str(user.get("userid") or "").strip()
        if not userid:
            continue

        by_user[userid] = user

        for bucket in user.get("areaBuckets", []) or []:
            area_code = str(bucket.get("areaCode") or "").strip()
            if not area_code:
                continue

            letdown_moves = safe_int(bucket.get("letdownPlates"))
            putaway_moves = safe_int(bucket.get("putawayPlates"))
            restock_moves = safe_int(
                bucket.get("restockLikePlatesEstimated", bucket.get("restockPlatesRaw"))
            )
            total_moves = letdown_moves + putaway_moves + restock_moves

            if total_moves <= 0:
                continue

            area_name = area_name_for_code(area_code)
            mix_row = {
                "areaCode": area_code,
                "areaName": area_name,
                "letdownMoves": letdown_moves,
                "putawayMoves": putaway_moves,
                "restockMoves": restock_moves,
                "actualMinutes": 0,
                "standardMinutes": 0,
                "totalMoves": total_moves,
            }
            mix_by_user[userid].append(mix_row)

            area_key = (area_code, area_name)
            observed = observed_area_totals[area_key]
            observed["areaCode"] = area_code
            observed["areaName"] = area_name
            observed["letdownMoves"] += letdown_moves
            observed["putawayMoves"] += putaway_moves
            observed["restockMoves"] += restock_moves
            observed["totalMoves"] += total_moves
            observed_area_users[area_key].add(userid)

            if area_code not in {"1", "2", "3", "4", "5", "6", "7"}:
                unknown_area_rows += 1

    return by_user, mix_by_user, observed_area_totals, observed_area_users, unknown_area_rows


def build_dashboard(
    *,
    b_forkl2_path: str,
    output_path: str,
    userls_summary_path: str | None = None,
    daily_enriched_output_path: str | None = None,
    roles_path: str | None = None,
    review_dir: str | None = None,
    options_path: str | None = None,
) -> None:
    forklift = load_json(b_forkl2_path)
    report_date = forklift.get("reportDate") or Path(output_path).stem

    roles_path = roles_path or first_existing(DEFAULT_ROLE_CANDIDATES)
    options_path = options_path or first_existing(DEFAULT_OPTIONS_CANDIDATES)
    review_dir = review_dir or first_existing(DEFAULT_REVIEW_DIR_CANDIDATES)

    roles = load_json_if_exists(roles_path, {})
    options = load_json_if_exists(options_path, {"areas": [], "roles": []})
    review_data = load_review_data(review_dir, report_date)

    valid_areas = set(options.get("areas", []))
    valid_roles = set(options.get("roles", []))
    role_map = roles.get(report_date, {}) or {}

    userls_summary = None
    if userls_summary_path and Path(userls_summary_path).exists():
        userls_summary = load_json(userls_summary_path)

    (
        userls_by_user,
        mix_by_user,
        observed_area_totals,
        observed_area_users,
        unknown_area_rows,
    ) = build_userls_indexes(userls_summary)

    operator_facts: list[dict[str, Any]] = []
    users_with_missing_area_mix: list[str] = []
    users_with_missing_manual_assignment: list[str] = []

    for user in forklift.get("users", []) or []:
        userid = str(user.get("userid") or "").strip()
        if not userid:
            continue

        role_info = role_map.get(userid, {}) or {}
        review_info = get_operator_override(review_data, userid)
        user_area_mix = mix_by_user.get(userid, [])
        fallback_name = (userls_by_user.get(userid) or {}).get("name")

        fact = build_operator_fact(
            report_date=report_date,
            user=user,
            role_info=role_info,
            review_info=review_info,
            user_area_mix=user_area_mix,
            valid_areas=valid_areas,
            valid_roles=valid_roles,
            fallback_name=fallback_name,
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
    total_plates_no_recv = sum(fact["raw"]["totalPlatesNoRecv"] for fact in operator_facts)
    total_pieces_no_recv = sum(fact["raw"]["totalPiecesNoRecv"] for fact in operator_facts)

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
        "observedAreas": build_observed_areas(observed_area_totals, observed_area_users),
        "receiving": build_receiving_rows(operators),
        "auditSummary": {
            "usersWithMissingAreaMix": users_with_missing_area_mix,
            "usersWithMissingManualAssignment": users_with_missing_manual_assignment,
            "unknownAreaRows": unknown_area_rows,
            "negativeTransactions": 0,
        },
        "sourceRuns": {
            "b_forkl2": None,
            "rf2_forkstdl": None,
            "rf2_userls": None,
        },
        "sourcePaths": {
            "b_forkl2": str(Path(b_forkl2_path)),
            "rf2_forkstdl": None,
            "rf2_userls": str(Path(userls_summary_path)) if userls_summary_path else None,
        },
    }

    final_payload = payload

    if userls_summary_path and Path(userls_summary_path).exists():
        tmp = tempfile.NamedTemporaryFile(prefix="hist_daily_base_", suffix=".json", delete=False)
        tmp.close()
        try:
            save_json(tmp.name, payload)
            merge_userls_into_daily(str(userls_summary_path), tmp.name, output_path)
            final_payload = load_json(output_path)
        finally:
            try:
                os.unlink(tmp.name)
            except FileNotFoundError:
                pass
    else:
        save_json(output_path, payload)

    if daily_enriched_output_path:
        save_json(daily_enriched_output_path, final_payload)

    conn = connect()
    try:
        upsert_snapshot(conn, "daily", report_date, final_payload, source_path=output_path)
        upsert_dataset_component(
            conn,
            business_date=report_date,
            component_type="daily",
            status="ready",
            source_path=output_path,
            details={
                "date": report_date,
                "builder": "historical_forkl2_lite",
                "hasUserlsSummary": bool(userls_summary_path and Path(userls_summary_path).exists()),
            },
        )

        if daily_enriched_output_path:
            upsert_snapshot(
                conn,
                "daily_enriched",
                report_date,
                final_payload,
                source_path=daily_enriched_output_path,
            )
            upsert_dataset_component(
                conn,
                business_date=report_date,
                component_type="daily_enriched",
                status="ready",
                source_path=daily_enriched_output_path,
                details={
                    "date": report_date,
                    "builder": "historical_forkl2_lite",
                    "mirrorsDaily": True,
                },
            )
    finally:
        conn.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build historical-lite daily payload from b_forkl2, optionally enriched with userls_daily."
    )
    parser.add_argument("b_forkl2_json")
    parser.add_argument("output_json")
    parser.add_argument("--userls-summary-json", default=None)
    parser.add_argument("--daily-enriched-output-json", default=None)
    parser.add_argument("--roles-json", default=None)
    parser.add_argument("--review-dir", default=None)
    parser.add_argument("--options-json", default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    build_dashboard(
        b_forkl2_path=args.b_forkl2_json,
        output_path=args.output_json,
        userls_summary_path=args.userls_summary_json,
        daily_enriched_output_path=args.daily_enriched_output_json,
        roles_path=args.roles_json,
        review_dir=args.review_dir,
        options_path=args.options_json,
    )
    print(f"Wrote {args.output_json}")


if __name__ == "__main__":
    main()
