from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from common import load_json, save_json


def userls_user_map(userls: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}

    for user in userls.get("users", []):
        by_type = user.get("summaryByType", {})

        letdown = by_type.get("Letdown", {"lines": 0, "pieces": 0})
        putaway = by_type.get("Putaway", {"lines": 0, "pieces": 0})
        restock = by_type.get("Restock", {"lines": 0, "pieces": 0})
        movefrom = by_type.get("MoveFrom", {"lines": 0, "pieces": 0})
        moveto = by_type.get("MoveTo", {"lines": 0, "pieces": 0})
        receive = by_type.get("Receive", {"lines": 0, "pieces": 0})
        pick = by_type.get("Pick", {"lines": 0, "pieces": 0})

        paired_move_actions = min(movefrom["lines"], moveto["lines"])
        paired_move_pieces = min(movefrom["pieces"], moveto["pieces"])

        result[user["userid"]] = {
            "userid": user["userid"],
            "name": user.get("name"),
            "summary": user.get("summary", {}),
            "byType": by_type,
            "derived": {
                "letdownPlates": letdown["lines"],
                "letdownPieces": letdown["pieces"],
                "putawayPlates": putaway["lines"],
                "putawayPieces": putaway["pieces"],
                "restockPlatesRaw": restock["lines"],
                "restockPiecesRaw": restock["pieces"],
                "moveFromPlates": movefrom["lines"],
                "moveFromPieces": movefrom["pieces"],
                "moveToPlates": moveto["lines"],
                "moveToPieces": moveto["pieces"],
                "pairedMoveActions": paired_move_actions,
                "pairedMovePieces": paired_move_pieces,
                "restockLikePlatesRaw": restock["lines"] + movefrom["lines"] + moveto["lines"],
                "restockLikePiecesRaw": restock["pieces"] + movefrom["pieces"] + moveto["pieces"],
                "restockLikeActionsEstimated": restock["lines"] + paired_move_actions,
                "restockLikePiecesEstimated": restock["pieces"] + paired_move_pieces,
                "receivingPlates": receive["lines"],
                "receivingPieces": receive["pieces"],
                "pickLines": pick["lines"],
                "pickPieces": pick["pieces"],
                "nonPickLines": user.get("summary", {}).get("nonPickLines", 0),
                "nonPickPieces": user.get("summary", {}).get("nonPickPieces", 0),
            },
        }

    return result


def forkstdl_user_map(forkstdl: dict[str, Any]) -> dict[str, dict[str, Any]]:
    agg: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "userid": None,
            "name": None,
            "letdownMoves": 0,
            "putawayMoves": 0,
            "restockMoves": 0,
            "totalMoves": 0,
            "actualMinutes": 0,
            "standardMinutes": 0,
            "areas": [],
        }
    )

    for row in forkstdl.get("rows", []):
        if row.get("isTotalRow"):
            continue

        userid = row.get("userid")
        rec = agg[userid]
        rec["userid"] = userid
        rec["name"] = row.get("name") or rec["name"]
        rec["letdownMoves"] += row.get("letdownMoves", 0)
        rec["putawayMoves"] += row.get("putawayMoves", 0)
        rec["restockMoves"] += row.get("restockMoves", 0)
        rec["totalMoves"] += (
            row.get("letdownMoves", 0)
            + row.get("putawayMoves", 0)
            + row.get("restockMoves", 0)
        )
        rec["actualMinutes"] += row.get("actualMinutes", 0)
        rec["standardMinutes"] += row.get("standardMinutes", 0)
        rec["areas"].append(
            {
                "areaCode": row.get("areaCode"),
                "areaName": row.get("areaName"),
                "letdownMoves": row.get("letdownMoves", 0),
                "putawayMoves": row.get("putawayMoves", 0),
                "restockMoves": row.get("restockMoves", 0),
            }
        )

    return dict(sorted(agg.items(), key=lambda kv: kv[0]))


def daily_user_map(daily: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}

    for op in daily.get("operators", []):
        total_plates_no_recv = op.get("totalPlatesNoRecv")
        total_pieces_no_recv = op.get("totalPiecesNoRecv")

        if total_plates_no_recv is None:
            total_plates_no_recv = op.get("totalPlates", 0) - op.get("receivingPlates", 0)
        if total_pieces_no_recv is None:
            total_pieces_no_recv = op.get("totalPieces", 0) - op.get("receivingPieces", 0)

        result[op["userid"]] = {
            "userid": op["userid"],
            "name": op.get("name"),
            "assignedArea": op.get("effectiveAssignedArea") or op.get("assignedArea"),
            "assignedRole": op.get("effectiveAssignedRole") or op.get("assignedRole"),
            "letdownPlates": op.get("letdownPlates", 0),
            "letdownPieces": op.get("letdownPieces", 0),
            "putawayPlates": op.get("putawayPlates", 0),
            "putawayPieces": op.get("putawayPieces", 0),
            "restockPlates": op.get("restockPlates", 0),
            "restockPieces": op.get("restockPieces", 0),
            "receivingPlates": op.get("receivingPlates", 0),
            "receivingPieces": op.get("receivingPieces", 0),
            "totalPlates": op.get("totalPlates", 0),
            "totalPieces": op.get("totalPieces", 0),
            "totalPlatesNoRecv": total_plates_no_recv,
            "totalPiecesNoRecv": total_pieces_no_recv,
        }

    return result


def delta(a: int | float | None, b: int | float | None) -> int | float | None:
    if a is None or b is None:
        return None
    return a - b


def compare(
    userls_json: str,
    forkstdl_json: str,
    daily_json: str,
    output_json: str,
) -> None:
    userls = load_json(userls_json)
    forkstdl = load_json(forkstdl_json)
    daily = load_json(daily_json)

    userls_by_user = userls_user_map(userls)
    forkstdl_by_user = forkstdl_user_map(forkstdl)
    daily_by_user = daily_user_map(daily)

    all_userids = sorted(set(userls_by_user) | set(forkstdl_by_user) | set(daily_by_user))

    rows = []

    for userid in all_userids:
        u = userls_by_user.get(userid, {})
        f = forkstdl_by_user.get(userid, {})
        d = daily_by_user.get(userid, {})

        userls_derived = u.get("derived", {})

        row = {
            "userid": userid,
            "names": {
                "userls": u.get("name"),
                "forkstdl": f.get("name"),
                "daily": d.get("name"),
            },
            "userls": userls_derived,
            "forkstdl": {
                "letdownMoves": f.get("letdownMoves", 0),
                "putawayMoves": f.get("putawayMoves", 0),
                "restockMoves": f.get("restockMoves", 0),
                "totalMoves": f.get("totalMoves", 0),
                "actualMinutes": f.get("actualMinutes", 0),
                "standardMinutes": f.get("standardMinutes", 0),
            },
            "daily": {
                "assignedArea": d.get("assignedArea"),
                "assignedRole": d.get("assignedRole"),
                "letdownPlates": d.get("letdownPlates", 0),
                "letdownPieces": d.get("letdownPieces", 0),
                "putawayPlates": d.get("putawayPlates", 0),
                "putawayPieces": d.get("putawayPieces", 0),
                "restockPlates": d.get("restockPlates", 0),
                "restockPieces": d.get("restockPieces", 0),
                "receivingPlates": d.get("receivingPlates", 0),
                "receivingPieces": d.get("receivingPieces", 0),
                "totalPlatesNoRecv": d.get("totalPlatesNoRecv", 0),
                "totalPiecesNoRecv": d.get("totalPiecesNoRecv", 0),
            },
            "deltas": {
                "userls_vs_forkstdl": {
                    "letdown": delta(userls_derived.get("letdownPlates", 0), f.get("letdownMoves", 0)),
                    "putaway": delta(userls_derived.get("putawayPlates", 0), f.get("putawayMoves", 0)),
                    "restock_raw": delta(userls_derived.get("restockPlatesRaw", 0), f.get("restockMoves", 0)),
                    "restock_like_raw": delta(userls_derived.get("restockLikePlatesRaw", 0), f.get("restockMoves", 0)),
                    "restock_like_estimated": delta(
                        userls_derived.get("restockLikeActionsEstimated", 0),
                        f.get("restockMoves", 0),
                    ),
                    "nonpick_total": delta(userls_derived.get("nonPickLines", 0), f.get("totalMoves", 0)),
                },
                "userls_vs_daily": {
                    "letdownPlates": delta(userls_derived.get("letdownPlates", 0), d.get("letdownPlates", 0)),
                    "letdownPieces": delta(userls_derived.get("letdownPieces", 0), d.get("letdownPieces", 0)),
                    "putawayPlates": delta(userls_derived.get("putawayPlates", 0), d.get("putawayPlates", 0)),
                    "putawayPieces": delta(userls_derived.get("putawayPieces", 0), d.get("putawayPieces", 0)),
                    "restockRawPlates": delta(userls_derived.get("restockPlatesRaw", 0), d.get("restockPlates", 0)),
                    "restockLikeEstimated": delta(
                        userls_derived.get("restockLikeActionsEstimated", 0),
                        d.get("restockPlates", 0),
                    ),
                    "receivingPlates": delta(userls_derived.get("receivingPlates", 0), d.get("receivingPlates", 0)),
                    "receivingPieces": delta(userls_derived.get("receivingPieces", 0), d.get("receivingPieces", 0)),
                    "nonpickPlatesVsTotalNoRecv": delta(
                        userls_derived.get("nonPickLines", 0),
                        d.get("totalPlatesNoRecv", 0),
                    ),
                    "nonpickPiecesVsTotalNoRecv": delta(
                        userls_derived.get("nonPickPieces", 0),
                        d.get("totalPiecesNoRecv", 0),
                    ),
                },
            },
        }
        rows.append(row)

    summary = {
        "reportDate": userls.get("reportDate") or daily.get("date"),
        "sourceFiles": {
            "userls": Path(userls_json).name,
            "forkstdl": Path(forkstdl_json).name,
            "daily": Path(daily_json).name,
        },
        "userCount": len(rows),
    }

    save_json(
        output_json,
        {
            "summary": summary,
            "rows": rows,
        },
    )


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print(
            "Usage: python3 compare_userls_to_existing.py "
            "<parsed_userls_json> <parsed_forkstdl_json> <derived_daily_json> <output_json>"
        )
        sys.exit(1)

    compare(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
    print(f"Wrote {sys.argv[4]}")
