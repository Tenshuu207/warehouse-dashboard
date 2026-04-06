from __future__ import annotations

import sys
from pathlib import Path
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


def has_userls_activity(row: dict[str, Any]) -> bool:
    u = row.get("userls", {})
    return any(
        [
            (u.get("nonPickLines") or 0) > 0,
            (u.get("receivingPlates") or 0) > 0,
            (u.get("pickLines") or 0) > 0,
        ]
    )


def has_forkstdl_activity(row: dict[str, Any]) -> bool:
    f = row.get("forkstdl", {})
    return (f.get("totalMoves") or 0) > 0


def has_daily_activity(row: dict[str, Any]) -> bool:
    d = row.get("daily", {})
    return any(
        [
            (d.get("totalPlatesNoRecv") or 0) > 0,
            (d.get("receivingPlates") or 0) > 0,
        ]
    )


def overlap_kind(row: dict[str, Any]) -> str:
    userls = has_userls_activity(row)
    forkstdl = has_forkstdl_activity(row)
    daily = has_daily_activity(row)

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


def compact_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "userid": row.get("userid"),
        "names": row.get("names", {}),
        "userls": row.get("userls", {}),
        "forkstdl": row.get("forkstdl", {}),
        "daily": row.get("daily", {}),
        "deltas": row.get("deltas", {}),
    }


def top_delta_rows(
    rows: list[dict[str, Any]],
    delta_group: str,
    delta_key: str,
    limit: int = TOP_N,
    require_overlap: bool = True,
) -> list[dict[str, Any]]:
    filtered: list[dict[str, Any]] = []

    for row in rows:
        kind = overlap_kind(row)
        if require_overlap and kind not in {"all_three", "userls_and_daily_only", "userls_and_forkstdl_only"}:
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

    overlap_buckets = {
        "all_three": [],
        "userls_and_daily_only": [],
        "userls_and_forkstdl_only": [],
        "userls_only": [],
        "missing_userls_activity": [],
        "other": [],
    }

    for row in rows:
        overlap_buckets[overlap_kind(row)].append(compact_row(row))

    overlap_counts = {key: len(value) for key, value in overlap_buckets.items()}

    summary = {
        "reportDate": data.get("summary", {}).get("reportDate"),
        "sourceFiles": data.get("summary", {}).get("sourceFiles", {}),
        "rowCount": len(rows),
        "overlapCounts": overlap_counts,
        "topDeltas": {
            "userls_vs_daily": {
                "letdownPlates": top_delta_rows(rows, "userls_vs_daily", "letdownPlates"),
                "putawayPlates": top_delta_rows(rows, "userls_vs_daily", "putawayPlates"),
                "restockRawPlates": top_delta_rows(rows, "userls_vs_daily", "restockRawPlates"),
                "restockLikeEstimated": top_delta_rows(rows, "userls_vs_daily", "restockLikeEstimated"),
                "receivingPlates": top_delta_rows(rows, "userls_vs_daily", "receivingPlates"),
                "receivingPieces": top_delta_rows(rows, "userls_vs_daily", "receivingPieces"),
                "nonpickPlatesVsTotalNoRecv": top_delta_rows(rows, "userls_vs_daily", "nonpickPlatesVsTotalNoRecv"),
                "nonpickPiecesVsTotalNoRecv": top_delta_rows(rows, "userls_vs_daily", "nonpickPiecesVsTotalNoRecv"),
            },
            "userls_vs_forkstdl": {
                "letdown": top_delta_rows(rows, "userls_vs_forkstdl", "letdown"),
                "putaway": top_delta_rows(rows, "userls_vs_forkstdl", "putaway"),
                "restockRaw": top_delta_rows(rows, "userls_vs_forkstdl", "restock_raw"),
                "restockLikeRaw": top_delta_rows(rows, "userls_vs_forkstdl", "restock_like_raw"),
                "restockLikeEstimated": top_delta_rows(rows, "userls_vs_forkstdl", "restock_like_estimated"),
                "nonpickTotal": top_delta_rows(rows, "userls_vs_forkstdl", "nonpick_total"),
            },
        },
        "userlsOnlyUsers": overlap_buckets["userls_only"],
    }

    save_json(output_json, summary)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(
            "Usage: python3 summarize_userls_overlap.py "
            "<userls_compare_json> <output_json>"
        )
        raise SystemExit(1)

    summarize(sys.argv[1], sys.argv[2])
    print(f"Wrote {sys.argv[2]}")
