from __future__ import annotations

import sys
from typing import Any

from common import load_json, save_json


TOP_N = 15


def abs_sort_key(value: Any) -> float:
    if value is None:
        return -1
    try:
        return abs(float(value))
    except Exception:
        return -1


def userls_has_activity(row: dict[str, Any]) -> bool:
    u = row.get("userls", {})
    return any(
        [
            (u.get("pickPlates") or 0) > 0,
            (u.get("receivingPlates") or 0) > 0,
            (u.get("replenishmentNoRecvPlates") or 0) > 0,
        ]
    )


def forkstdl_has_activity(row: dict[str, Any]) -> bool:
    f = row.get("forkstdl", {})
    return (f.get("totalMoves") or 0) > 0


def daily_has_activity(row: dict[str, Any]) -> bool:
    d = row.get("daily", {})
    return any(
        [
            (d.get("receivingPlates") or 0) > 0,
            (d.get("totalPlatesNoRecv") or 0) > 0,
        ]
    )


def overlap_kind(row: dict[str, Any]) -> str:
    userls = userls_has_activity(row)
    forkstdl = forkstdl_has_activity(row)
    daily = daily_has_activity(row)

    if userls and forkstdl and daily:
        return "all_three"
    if userls and daily and not forkstdl:
        return "userls_and_daily_only"
    if userls and forkstdl and not daily:
        return "userls_and_forkstdl_only"
    if userls and not forkstdl and not daily:
        return "userls_only"
    if not userls and (forkstdl or daily):
        return "missing_userls_activity"
    return "other"


def top_delta_rows(
    rows: list[dict[str, Any]],
    delta_group: str,
    delta_key: str,
    limit: int = TOP_N,
) -> list[dict[str, Any]]:
    filtered: list[dict[str, Any]] = []

    for row in rows:
        kind = overlap_kind(row)
        if kind not in {"all_three", "userls_and_daily_only", "userls_and_forkstdl_only"}:
            continue

        value = row.get("deltas", {}).get(delta_group, {}).get(delta_key)
        if value is None:
            continue

        filtered.append(
            {
                "userid": row.get("userid"),
                "names": row.get("names", {}),
                "overlapKind": kind,
                "delta": value,
                "userls": row.get("userls", {}),
                "forkstdl": row.get("forkstdl", {}),
                "daily": row.get("daily", {}),
            }
        )

    filtered.sort(key=lambda r: abs_sort_key(r.get("delta")), reverse=True)
    return filtered[:limit]


def summarize(compare_json: str, output_json: str) -> None:
    data = load_json(compare_json)
    rows = data.get("rows", [])

    overlap_counts: dict[str, int] = {
        "all_three": 0,
        "userls_and_daily_only": 0,
        "userls_and_forkstdl_only": 0,
        "userls_only": 0,
        "missing_userls_activity": 0,
        "other": 0,
    }

    userls_only_pick = []
    userls_only_receiving = []
    userls_only_replenishment = []

    for row in rows:
        kind = overlap_kind(row)
        overlap_counts[kind] += 1

        if kind == "userls_only":
            u = row.get("userls", {})
            if (u.get("pickPlates") or 0) > 0:
                userls_only_pick.append(row)
            if (u.get("receivingPlates") or 0) > 0:
                userls_only_receiving.append(row)
            if (u.get("replenishmentNoRecvPlates") or 0) > 0:
                userls_only_replenishment.append(row)

    summary = {
        "reportDate": data.get("summary", {}).get("reportDate"),
        "sourceFiles": data.get("summary", {}).get("sourceFiles", {}),
        "rowCount": len(rows),
        "overlapCounts": overlap_counts,
        "topDeltas": {
            "userls_vs_daily": {
                "replenishmentNoRecvPlates": top_delta_rows(rows, "userls_vs_daily", "replenishmentNoRecvPlates"),
                "replenishmentNoRecvPieces": top_delta_rows(rows, "userls_vs_daily", "replenishmentNoRecvPieces"),
                "receivingPlates": top_delta_rows(rows, "userls_vs_daily", "receivingPlates"),
                "letdownPlates": top_delta_rows(rows, "userls_vs_daily", "letdownPlates"),
                "putawayPlates": top_delta_rows(rows, "userls_vs_daily", "putawayPlates"),
                "restockLikeEstimatedPlates": top_delta_rows(rows, "userls_vs_daily", "restockLikeEstimatedPlates"),
            },
            "userls_vs_forkstdl": {
                "replenishmentNoRecvVsTotalMoves": top_delta_rows(rows, "userls_vs_forkstdl", "replenishmentNoRecvVsTotalMoves"),
                "letdownMoves": top_delta_rows(rows, "userls_vs_forkstdl", "letdownMoves"),
                "putawayMoves": top_delta_rows(rows, "userls_vs_forkstdl", "putawayMoves"),
                "restockLikeEstimatedMoves": top_delta_rows(rows, "userls_vs_forkstdl", "restockLikeEstimatedMoves"),
            },
        },
        "userlsOnly": {
            "pickUsers": userls_only_pick[:TOP_N],
            "receivingUsers": userls_only_receiving[:TOP_N],
            "replenishmentUsers": userls_only_replenishment[:TOP_N],
        },
    }

    save_json(output_json, summary)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(
            "Usage: python3 summarize_userls_summary_compare.py "
            "<compare_json> <output_json>"
        )
        raise SystemExit(1)

    summarize(sys.argv[1], sys.argv[2])
    print(f"Wrote {sys.argv[2]}")
