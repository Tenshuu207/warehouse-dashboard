from __future__ import annotations

import re
import sys
from collections import defaultdict
from typing import Any

from common import load_json, save_json


AREA_CODE_RE = re.compile(r"^\s*(\d+)")
ZONE_KEY_RE = re.compile(r"^\s*(\d+)\s*[-/]?\s*([A-Za-z])", re.I)

DRY_FLR_LETTERS = set("bcdefghijkl")
DRY_MIX_ZONES = {"1-a", "1-n", "1-p", "1-q", "1-r", "1-s", "1-t"}

FIXED_ROLE_ZONES = {
    "3-c": "ClrMeat",
    "3-d": "ClrMeat",
    "2-d": "ClrMeat",
    "3-a": "ClrDairy",
    "3-b": "ClrDairy",
    "4-a": "Produce",
    "4-b": "Produce",
    "4-c": "Produce",
    "4-d": "Produce",
    "2-e": "Produce",
    "2-f": "Produce",
    "6-c": "FrzMix",
    "6-d": "FrzMix",
    "6-s": "FrzMix",
}

FREEZER_SHARED_ZONES = {"6-a", "6-b", "6-e", "6-f", "6-g"}


def get_type(summary_by_type: dict[str, Any], transtype: str) -> dict[str, int]:
    value = summary_by_type.get(transtype, {})
    return {
        "lines": int(value.get("lines", 0) or 0),
        "pieces": int(value.get("pieces", 0) or 0),
    }


def safe_div(numerator: int | float, denominator: int | float) -> float | None:
    if not denominator:
        return None
    return round(float(numerator) / float(denominator), 4)


def round_or_none(value: float | None, places: int = 4) -> float | None:
    if value is None:
        return None
    return round(value, places)


def infer_area_code_from_bin(bin_value: str | None) -> str | None:
    if not bin_value:
        return None
    match = AREA_CODE_RE.match(str(bin_value).strip())
    if not match:
        return None
    return match.group(1)


def infer_zone_key_from_bin(bin_value: str | None) -> str | None:
    if not bin_value:
        return None

    cleaned = str(bin_value).strip().lower()
    cleaned = cleaned.replace("_", "-").replace(" ", "")
    match = ZONE_KEY_RE.match(cleaned)
    if not match:
        return None

    return f"{match.group(1)}-{match.group(2).lower()}"


def infer_role_from_zone(zone_key: str | None, area_code: str | None, transtype: str) -> str | None:
    if not zone_key and not area_code:
        return None

    transtype = (transtype or "").strip()

    if transtype == "Receive":
        return None

    if area_code == "5":
        return "DryPIR"

    if area_code == "7":
        return "FrzPIR"

    if zone_key in FIXED_ROLE_ZONES:
        return FIXED_ROLE_ZONES[zone_key]

    if zone_key in FREEZER_SHARED_ZONES:
        if transtype == "Putaway":
            return "FrzPut"
        if transtype == "Letdown":
            return "FrzLet"
        return "FrzHybrid"

    if zone_key:
        if zone_key in DRY_MIX_ZONES:
            return "DryMix"

        if zone_key.startswith("1-"):
            letter = zone_key.split("-", 1)[1]
            if letter in DRY_FLR_LETTERS:
                return "DryFlr"

    return None


def empty_area_bucket(area_code: str) -> dict[str, Any]:
    return {
        "areaCode": area_code,
        "totalLines": 0,
        "totalPieces": 0,
        "pickPlates": 0,
        "pickPieces": 0,
        "receivingPlates": 0,
        "receivingPieces": 0,
        "letdownPlates": 0,
        "letdownPieces": 0,
        "putawayPlates": 0,
        "putawayPieces": 0,
        "restockPlatesRaw": 0,
        "restockPiecesRaw": 0,
        "moveFromPlates": 0,
        "moveFromPieces": 0,
        "moveToPlates": 0,
        "moveToPieces": 0,
        "transferPlates": 0,
        "transferPieces": 0,
        "otherNonPickPlatesRaw": 0,
        "otherNonPickPiecesRaw": 0,
    }


def empty_role_bucket(role_name: str) -> dict[str, Any]:
    return {
        "role": role_name,
        "totalLines": 0,
        "totalPieces": 0,
        "pickPlates": 0,
        "pickPieces": 0,
        "letdownPlates": 0,
        "letdownPieces": 0,
        "putawayPlates": 0,
        "putawayPieces": 0,
        "restockPlatesRaw": 0,
        "restockPiecesRaw": 0,
        "moveFromPlates": 0,
        "moveFromPieces": 0,
        "moveToPlates": 0,
        "moveToPieces": 0,
        "transferPlates": 0,
        "transferPieces": 0,
        "otherNonPickPlatesRaw": 0,
        "otherNonPickPiecesRaw": 0,
    }


def apply_tx_to_bucket(bucket: dict[str, Any], transtype: str, qty: int) -> None:
    bucket["totalLines"] += 1
    bucket["totalPieces"] += qty

    if transtype == "Pick":
        bucket["pickPlates"] += 1
        bucket["pickPieces"] += qty
    elif transtype == "Receive":
        if "receivingPlates" in bucket:
            bucket["receivingPlates"] += 1
            bucket["receivingPieces"] += qty
        else:
            bucket["otherNonPickPlatesRaw"] += 1
            bucket["otherNonPickPiecesRaw"] += qty
    elif transtype == "Letdown":
        bucket["letdownPlates"] += 1
        bucket["letdownPieces"] += qty
    elif transtype == "Putaway":
        bucket["putawayPlates"] += 1
        bucket["putawayPieces"] += qty
    elif transtype == "Restock":
        bucket["restockPlatesRaw"] += 1
        bucket["restockPiecesRaw"] += qty
    elif transtype == "MoveFrom":
        bucket["moveFromPlates"] += 1
        bucket["moveFromPieces"] += qty
    elif transtype == "MoveTo":
        bucket["moveToPlates"] += 1
        bucket["moveToPieces"] += qty
    elif transtype == "Transfer":
        bucket["transferPlates"] += 1
        bucket["transferPieces"] += qty
    else:
        bucket["otherNonPickPlatesRaw"] += 1
        bucket["otherNonPickPiecesRaw"] += qty


def finalize_bucket(bucket: dict[str, Any]) -> dict[str, Any]:
    paired_move_actions = min(bucket["moveFromPlates"], bucket["moveToPlates"])
    paired_move_pieces = min(bucket["moveFromPieces"], bucket["moveToPieces"])

    restock_like_plates = bucket["restockPlatesRaw"] + paired_move_actions
    restock_like_pieces = bucket["restockPiecesRaw"] + paired_move_pieces

    replenishment_no_recv_plates = (
        bucket["letdownPlates"] + bucket["putawayPlates"] + restock_like_plates
    )
    replenishment_no_recv_pieces = (
        bucket["letdownPieces"] + bucket["putawayPieces"] + restock_like_pieces
    )

    nonpick_all_plates = bucket["totalLines"] - bucket["pickPlates"]
    nonpick_all_pieces = bucket["totalPieces"] - bucket["pickPieces"]

    receiving_plates = int(bucket.get("receivingPlates", 0) or 0)
    receiving_pieces = int(bucket.get("receivingPieces", 0) or 0)

    other_nonpick_plates = max(
        0,
        nonpick_all_plates
        - receiving_plates
        - replenishment_no_recv_plates
        - bucket["transferPlates"],
    )
    other_nonpick_pieces = max(
        0,
        nonpick_all_pieces
        - receiving_pieces
        - replenishment_no_recv_pieces
        - bucket["transferPieces"],
    )

    return {
        **bucket,
        "pairedMoveActions": paired_move_actions,
        "pairedMovePieces": paired_move_pieces,
        "restockLikePlatesEstimated": restock_like_plates,
        "restockLikePiecesEstimated": restock_like_pieces,
        "replenishmentNoRecvPlates": replenishment_no_recv_plates,
        "replenishmentNoRecvPieces": replenishment_no_recv_pieces,
        "nonPickAllPlates": nonpick_all_plates,
        "nonPickAllPieces": nonpick_all_pieces,
        "otherNonPickPlates": other_nonpick_plates,
        "otherNonPickPieces": other_nonpick_pieces,
    }


def choose_primary_bucket(
    buckets: list[dict[str, Any]],
    label_key: str,
    value_key: str,
    piece_key: str,
) -> tuple[str | None, float | None]:
    ranked = [
        bucket for bucket in buckets
        if int(bucket.get(value_key, 0) or 0) > 0
    ]
    if not ranked:
        return None, None

    ranked.sort(
        key=lambda b: (
            int(b.get(value_key, 0) or 0),
            int(b.get(piece_key, 0) or 0),
            int(b.get("totalLines", 0) or 0),
        ),
        reverse=True,
    )

    top = ranked[0]
    total = sum(int(bucket.get(value_key, 0) or 0) for bucket in ranked)
    share = round_or_none(safe_div(int(top.get(value_key, 0) or 0), total))
    return top.get(label_key), share


def extract_pick_route_metrics(route_totals: dict[str, Any]) -> dict[str, Any]:
    pick_route_count = 0
    pick_minutes = 0
    pick_pieces_from_routes = 0
    weighted_rate_numerator = 0.0
    reported_rate_sum = 0.0
    reported_rate_count = 0

    for route_info in (route_totals or {}).values():
        pieces_by_type = route_info.get("piecesByType", {}) or {}
        pick_pieces = int(pieces_by_type.get("Pick", 0) or 0)

        if pick_pieces <= 0:
            continue

        pick_route_count += 1
        pick_pieces_from_routes += pick_pieces

        minutes = int(route_info.get("minutes", 0) or 0)
        rate = route_info.get("rate")

        if minutes > 0:
            pick_minutes += minutes

        if isinstance(rate, (int, float)):
            reported_rate_sum += float(rate)
            reported_rate_count += 1
            if minutes > 0:
                weighted_rate_numerator += float(rate) * minutes

    pick_rate_reported_avg = (
        round(reported_rate_sum / reported_rate_count, 4) if reported_rate_count else None
    )
    pick_rate_reported_weighted = (
        round(weighted_rate_numerator / pick_minutes, 4) if pick_minutes else None
    )
    pick_rate_derived_pieces_per_minute = round_or_none(
        safe_div(pick_pieces_from_routes, pick_minutes)
    )

    return {
        "pickRouteCount": pick_route_count,
        "pickMinutes": pick_minutes,
        "pickPiecesFromRouteTotals": pick_pieces_from_routes,
        "pickRateReportedAverage": pick_rate_reported_avg,
        "pickRateReportedWeighted": pick_rate_reported_weighted,
        "pickRateDerivedPiecesPerMinute": pick_rate_derived_pieces_per_minute,
    }


def build_destination_maps(
    users: list[dict[str, Any]],
) -> tuple[
    dict[tuple[str, str], dict[str, dict[str, int]]],
    dict[tuple[str, str], dict[str, dict[str, int]]],
]:
    putaway_destinations: dict[tuple[str, str], dict[str, dict[str, int]]] = defaultdict(
        lambda: defaultdict(lambda: {"plates": 0, "pieces": 0})
    )
    fallback_destinations: dict[tuple[str, str], dict[str, dict[str, int]]] = defaultdict(
        lambda: defaultdict(lambda: {"plates": 0, "pieces": 0})
    )

    for user in users:
        for tx in user.get("transactions", []) or []:
            item = str(tx.get("item") or "").strip()
            pallet_date = str(tx.get("palletDate") or "").strip()
            transtype = str(tx.get("transType") or "").strip()
            qty = int(tx.get("qty", 0) or 0)

            if not item or not pallet_date:
                continue

            area_code = infer_area_code_from_bin(tx.get("bin"))
            if not area_code:
                continue

            key = (item, pallet_date)

            if transtype == "Putaway":
                putaway_destinations[key][area_code]["plates"] += 1
                putaway_destinations[key][area_code]["pieces"] += qty

            if transtype in {"Putaway", "Letdown", "Restock", "MoveFrom", "MoveTo"}:
                fallback_destinations[key][area_code]["plates"] += 1
                fallback_destinations[key][area_code]["pieces"] += qty

    return putaway_destinations, fallback_destinations


def choose_destination_area(
    destinations: dict[tuple[str, str], dict[str, dict[str, int]]],
    key: tuple[str, str],
) -> str | None:
    area_map = destinations.get(key)
    if not area_map:
        return None

    ranked = sorted(
        area_map.items(),
        key=lambda kv: (kv[1]["plates"], kv[1]["pieces"], kv[0]),
        reverse=True,
    )
    return ranked[0][0] if ranked else None


def infer_area_code_for_tx(
    tx: dict[str, Any],
    putaway_destinations: dict[tuple[str, str], dict[str, dict[str, int]]],
    fallback_destinations: dict[tuple[str, str], dict[str, dict[str, int]]],
) -> str | None:
    direct = infer_area_code_from_bin(tx.get("bin"))
    if direct:
        return direct

    transtype = str(tx.get("transType") or "").strip()
    if transtype != "Receive":
        return None

    item = str(tx.get("item") or "").strip()
    pallet_date = str(tx.get("palletDate") or "").strip()
    if not item or not pallet_date:
        return None

    key = (item, pallet_date)

    return (
        choose_destination_area(putaway_destinations, key)
        or choose_destination_area(fallback_destinations, key)
    )


def build_summary(parsed_userls_json: str, output_json: str) -> None:
    parsed = load_json(parsed_userls_json)
    users = parsed.get("users", [])

    putaway_destinations, fallback_destinations = build_destination_maps(users)

    rows = []
    totals = {
        "pickPlates": 0,
        "pickPieces": 0,
        "pickRouteCount": 0,
        "pickMinutes": 0,
        "pickPiecesFromRouteTotals": 0,
        "receivingPlates": 0,
        "receivingPieces": 0,
        "letdownPlates": 0,
        "letdownPieces": 0,
        "putawayPlates": 0,
        "putawayPieces": 0,
        "restockPlatesRaw": 0,
        "restockPiecesRaw": 0,
        "moveFromPlates": 0,
        "moveFromPieces": 0,
        "moveToPlates": 0,
        "moveToPieces": 0,
        "restockLikePlatesEstimated": 0,
        "restockLikePiecesEstimated": 0,
        "replenishmentNoRecvPlates": 0,
        "replenishmentNoRecvPieces": 0,
        "nonPickAllPlates": 0,
        "nonPickAllPieces": 0,
        "otherNonPickPlates": 0,
        "otherNonPickPieces": 0,
        "transferPlates": 0,
        "transferPieces": 0,
    }

    area_totals: dict[str, dict[str, Any]] = {}
    role_totals: dict[str, dict[str, Any]] = {}

    for user in users:
        by_type = user.get("summaryByType", {})
        summary = user.get("summary", {})
        route_totals = user.get("routeTotals", {}) or {}
        transactions = user.get("transactions", []) or []

        letdown = get_type(by_type, "Letdown")
        putaway = get_type(by_type, "Putaway")
        restock = get_type(by_type, "Restock")
        move_from = get_type(by_type, "MoveFrom")
        move_to = get_type(by_type, "MoveTo")
        receive = get_type(by_type, "Receive")
        pick = get_type(by_type, "Pick")
        transfer = get_type(by_type, "Transfer")

        paired_move_actions = min(move_from["lines"], move_to["lines"])
        paired_move_pieces = min(move_from["pieces"], move_to["pieces"])

        restock_like_estimated_plates = restock["lines"] + paired_move_actions
        restock_like_estimated_pieces = restock["pieces"] + paired_move_pieces

        replenishment_no_recv_plates = (
            letdown["lines"] + putaway["lines"] + restock_like_estimated_plates
        )
        replenishment_no_recv_pieces = (
            letdown["pieces"] + putaway["pieces"] + restock_like_estimated_pieces
        )

        nonpick_all_plates = int(summary.get("nonPickLines", 0) or 0)
        nonpick_all_pieces = int(summary.get("nonPickPieces", 0) or 0)

        other_nonpick_plates = max(
            0,
            nonpick_all_plates - receive["lines"] - replenishment_no_recv_plates
        )
        other_nonpick_pieces = max(
            0,
            nonpick_all_pieces - receive["pieces"] - replenishment_no_recv_pieces
        )

        pick_route_metrics = extract_pick_route_metrics(route_totals)

        per_area: dict[str, dict[str, Any]] = {}
        per_role: dict[str, dict[str, Any]] = {}

        for tx in transactions:
            transtype = str(tx.get("transType") or "").strip()
            qty = int(tx.get("qty", 0) or 0)

            area_code = infer_area_code_for_tx(tx, putaway_destinations, fallback_destinations)
            if area_code:
                if area_code not in per_area:
                    per_area[area_code] = empty_area_bucket(area_code)
                if area_code not in area_totals:
                    area_totals[area_code] = empty_area_bucket(area_code)

                apply_tx_to_bucket(per_area[area_code], transtype, qty)
                apply_tx_to_bucket(area_totals[area_code], transtype, qty)

            zone_key = infer_zone_key_from_bin(tx.get("bin"))
            role_area_code = area_code or infer_area_code_from_bin(tx.get("bin"))
            role_name = infer_role_from_zone(zone_key, role_area_code, transtype)

            if role_name:
                if role_name not in per_role:
                    per_role[role_name] = empty_role_bucket(role_name)
                if role_name not in role_totals:
                    role_totals[role_name] = empty_role_bucket(role_name)

                apply_tx_to_bucket(per_role[role_name], transtype, qty)
                apply_tx_to_bucket(role_totals[role_name], transtype, qty)

        area_buckets = [
            finalize_bucket(bucket)
            for _, bucket in sorted(per_area.items(), key=lambda kv: int(kv[0]))
        ]
        role_buckets = [
            finalize_bucket(bucket)
            for _, bucket in sorted(per_role.items(), key=lambda kv: kv[0])
        ]

        primary_replenishment_area_code, primary_replenishment_share = choose_primary_bucket(
            area_buckets,
            "areaCode",
            "replenishmentNoRecvPlates",
            "replenishmentNoRecvPieces",
        )
        primary_activity_area_code, primary_activity_share = choose_primary_bucket(
            area_buckets,
            "areaCode",
            "nonPickAllPlates",
            "nonPickAllPieces",
        )

        primary_replenishment_role, primary_replenishment_role_share = choose_primary_bucket(
            role_buckets,
            "role",
            "replenishmentNoRecvPlates",
            "replenishmentNoRecvPieces",
        )

        row = {
            "userid": user.get("userid"),
            "name": user.get("name"),
            "inactiveMinutes": int(user.get("inactiveMinutes", 0) or 0),
            "pickPlates": pick["lines"],
            "pickPieces": pick["pieces"],
            "pickRouteCount": pick_route_metrics["pickRouteCount"],
            "pickMinutes": pick_route_metrics["pickMinutes"],
            "pickPiecesFromRouteTotals": pick_route_metrics["pickPiecesFromRouteTotals"],
            "pickRateReportedAverage": pick_route_metrics["pickRateReportedAverage"],
            "pickRateReportedWeighted": pick_route_metrics["pickRateReportedWeighted"],
            "pickRateDerivedPiecesPerMinute": pick_route_metrics["pickRateDerivedPiecesPerMinute"],
            "receivingPlates": receive["lines"],
            "receivingPieces": receive["pieces"],
            "letdownPlates": letdown["lines"],
            "letdownPieces": letdown["pieces"],
            "putawayPlates": putaway["lines"],
            "putawayPieces": putaway["pieces"],
            "restockPlatesRaw": restock["lines"],
            "restockPiecesRaw": restock["pieces"],
            "moveFromPlates": move_from["lines"],
            "moveFromPieces": move_from["pieces"],
            "moveToPlates": move_to["lines"],
            "moveToPieces": move_to["pieces"],
            "pairedMoveActions": paired_move_actions,
            "pairedMovePieces": paired_move_pieces,
            "restockLikePlatesEstimated": restock_like_estimated_plates,
            "restockLikePiecesEstimated": restock_like_estimated_pieces,
            "replenishmentNoRecvPlates": replenishment_no_recv_plates,
            "replenishmentNoRecvPieces": replenishment_no_recv_pieces,
            "nonPickAllPlates": nonpick_all_plates,
            "nonPickAllPieces": nonpick_all_pieces,
            "otherNonPickPlates": other_nonpick_plates,
            "otherNonPickPieces": other_nonpick_pieces,
            "transferPlates": transfer["lines"],
            "transferPieces": transfer["pieces"],
            "primaryReplenishmentAreaCode": primary_replenishment_area_code,
            "primaryReplenishmentShare": primary_replenishment_share,
            "primaryActivityAreaCode": primary_activity_area_code,
            "primaryActivityShare": primary_activity_share,
            "primaryReplenishmentRole": primary_replenishment_role,
            "primaryReplenishmentRoleShare": primary_replenishment_role_share,
            "areaBuckets": area_buckets,
            "roleBuckets": role_buckets,
        }

        rows.append(row)

        for key in totals:
            totals[key] += int(row.get(key, 0) or 0)

    rows.sort(key=lambda r: (r.get("userid") or ""))

    finalized_area_totals = [
        finalize_bucket(bucket)
        for _, bucket in sorted(area_totals.items(), key=lambda kv: int(kv[0]))
    ]
    finalized_role_totals = [
        finalize_bucket(bucket)
        for _, bucket in sorted(role_totals.items(), key=lambda kv: kv[0])
    ]

    summary_block = {
        "userCount": len(rows),
        **totals,
        "pickRateDerivedPiecesPerMinuteOverall": round_or_none(
            safe_div(totals["pickPiecesFromRouteTotals"], totals["pickMinutes"])
        ),
        "areaBuckets": finalized_area_totals,
        "roleBuckets": finalized_role_totals,
    }

    save_json(
        output_json,
        {
            "reportDate": parsed.get("reportDate"),
            "sourceFile": parsed.get("sourceFile"),
            "summary": summary_block,
            "users": rows,
        },
    )


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(
            "Usage: python3 build_userls_daily_summary.py "
            "<parsed_userls_json> <output_json>"
        )
        raise SystemExit(1)

    build_summary(sys.argv[1], sys.argv[2])
    print(f"Wrote {sys.argv[2]}")
