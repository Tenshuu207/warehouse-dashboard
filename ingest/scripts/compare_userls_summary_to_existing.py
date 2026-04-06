from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from common import load_json, save_json


def forkstdl_user_map(forkstdl: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}

    for row in forkstdl.get("rows", []):
        if row.get("isTotalRow"):
            continue

        userid = row.get("userid")
        if userid not in result:
            result[userid] = {
                "userid": userid,
                "name": row.get("name"),
                "letdownMoves": 0,
                "putawayMoves": 0,
                "restockMoves": 0,
                "totalMoves": 0,
                "actualMinutes": 0,
                "standardMinutes": 0,
            }

        result[userid]["letdownMoves"] += int(row.get("letdownMoves", 0) or 0)
        result[userid]["putawayMoves"] += int(row.get("putawayMoves", 0) or 0)
        result[userid]["restockMoves"] += int(row.get("restockMoves", 0) or 0)
        result[userid]["totalMoves"] += (
            int(row.get("letdownMoves", 0) or 0)
            + int(row.get("putawayMoves", 0) or 0)
            + int(row.get("restockMoves", 0) or 0)
        )
        result[userid]["actualMinutes"] += int(row.get("actualMinutes", 0) or 0)
        result[userid]["standardMinutes"] += int(row.get("standardMinutes", 0) or 0)

    return result


def daily_user_map(daily: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}

    for op in daily.get("operators", []):
        total_plates_no_recv = op.get("totalPlatesNoRecv")
        total_pieces_no_recv = op.get("totalPiecesNoRecv")

        if total_plates_no_recv is None:
            total_plates_no_recv = int(op.get("totalPlates", 0) or 0) - int(op.get("receivingPlates", 0) or 0)
        if total_pieces_no_recv is None:
            total_pieces_no_recv = int(op.get("totalPieces", 0) or 0) - int(op.get("receivingPieces", 0) or 0)

        result[op["userid"]] = {
            "userid": op["userid"],
            "name": op.get("name"),
            "assignedArea": op.get("effectiveAssignedArea") or op.get("assignedArea"),
            "assignedRole": op.get("effectiveAssignedRole") or op.get("assignedRole"),
            "letdownPlates": int(op.get("letdownPlates", 0) or 0),
            "letdownPieces": int(op.get("letdownPieces", 0) or 0),
            "putawayPlates": int(op.get("putawayPlates", 0) or 0),
            "putawayPieces": int(op.get("putawayPieces", 0) or 0),
            "restockPlates": int(op.get("restockPlates", 0) or 0),
            "restockPieces": int(op.get("restockPieces", 0) or 0),
            "receivingPlates": int(op.get("receivingPlates", 0) or 0),
            "receivingPieces": int(op.get("receivingPieces", 0) or 0),
            "totalPlatesNoRecv": int(total_plates_no_recv or 0),
            "totalPiecesNoRecv": int(total_pieces_no_recv or 0),
        }

    return result


def userls_summary_map(userls_summary: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        row["userid"]: row
        for row in userls_summary.get("users", [])
    }


def delta(a: int | float | None, b: int | float | None) -> int | float | None:
    if a is None or b is None:
        return None
    return a - b


def compare(
    userls_summary_json: str,
    forkstdl_json: str,
    daily_json: str,
    output_json: str,
) -> None:
    userls_summary = load_json(userls_summary_json)
    forkstdl = load_json(forkstdl_json)
    daily = load_json(daily_json)

    userls_by_user = userls_summary_map(userls_summary)
    forkstdl_by_user = forkstdl_user_map(forkstdl)
    daily_by_user = daily_user_map(daily)

    all_userids = sorted(set(userls_by_user) | set(forkstdl_by_user) | set(daily_by_user))
    rows = []

    for userid in all_userids:
        u = userls_by_user.get(userid, {})
        f = forkstdl_by_user.get(userid, {})
        d = daily_by_user.get(userid, {})

        row = {
            "userid": userid,
            "names": {
                "userls": u.get("name"),
                "forkstdl": f.get("name"),
                "daily": d.get("name"),
            },
            "userls": u,
            "forkstdl": f,
            "daily": d,
            "deltas": {
                "userls_vs_daily": {
                    "letdownPlates": delta(u.get("letdownPlates", 0), d.get("letdownPlates", 0)),
                    "putawayPlates": delta(u.get("putawayPlates", 0), d.get("putawayPlates", 0)),
                    "restockLikeEstimatedPlates": delta(
                        u.get("restockLikePlatesEstimated", 0),
                        d.get("restockPlates", 0),
                    ),
                    "receivingPlates": delta(u.get("receivingPlates", 0), d.get("receivingPlates", 0)),
                    "replenishmentNoRecvPlates": delta(
                        u.get("replenishmentNoRecvPlates", 0),
                        d.get("totalPlatesNoRecv", 0),
                    ),
                    "replenishmentNoRecvPieces": delta(
                        u.get("replenishmentNoRecvPieces", 0),
                        d.get("totalPiecesNoRecv", 0),
                    ),
                },
                "userls_vs_forkstdl": {
                    "letdownMoves": delta(u.get("letdownPlates", 0), f.get("letdownMoves", 0)),
                    "putawayMoves": delta(u.get("putawayPlates", 0), f.get("putawayMoves", 0)),
                    "restockLikeEstimatedMoves": delta(
                        u.get("restockLikePlatesEstimated", 0),
                        f.get("restockMoves", 0),
                    ),
                    "replenishmentNoRecvVsTotalMoves": delta(
                        u.get("replenishmentNoRecvPlates", 0),
                        f.get("totalMoves", 0),
                    ),
                },
            },
        }
        rows.append(row)

    save_json(
        output_json,
        {
            "summary": {
                "reportDate": userls_summary.get("reportDate") or daily.get("date"),
                "sourceFiles": {
                    "userlsSummary": Path(userls_summary_json).name,
                    "forkstdl": Path(forkstdl_json).name,
                    "daily": Path(daily_json).name,
                },
                "rowCount": len(rows),
            },
            "rows": rows,
        },
    )


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print(
            "Usage: python3 compare_userls_summary_to_existing.py "
            "<userls_summary_json> <parsed_forkstdl_json> <derived_daily_json> <output_json>"
        )
        raise SystemExit(1)

    compare(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
    print(f"Wrote {sys.argv[4]}")
