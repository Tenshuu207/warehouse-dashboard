from __future__ import annotations

import json
import math
import statistics
import sys
from pathlib import Path
from typing import Any


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def walk(value: Any):
    if isinstance(value, dict):
        yield value
        for v in value.values():
            yield from walk(v)
    elif isinstance(value, list):
        for item in value:
            yield from walk(item)


def find_operator_rows(doc: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[int] = set()

    for node in walk(doc):
        if not isinstance(node, dict):
            continue
        tracking = node.get("userlsTracking")
        if not isinstance(tracking, dict):
            continue
        if id(node) in seen:
            continue
        seen.add(id(node))
        rows.append(node)

    return rows


def as_num(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    try:
        text = str(value).strip()
        if not text:
            return None
        return float(text)
    except Exception:
        return None


def bucket_result(actual: float | None, delta: float | None) -> tuple[str, float | None]:
    if actual is None and delta is None:
        return ("missing", None)
    if delta is None:
        return ("no_delta", None)

    abs_delta = abs(delta)
    if abs_delta == 0:
        return ("exact", 0.0)

    if actual is None or actual == 0:
        return ("nonzero_delta_no_base", None)

    pct = abs_delta / abs(actual)
    if pct <= 0.05:
        return ("within_5pct", pct)
    if pct <= 0.10:
        return ("within_10pct", pct)
    return ("over_10pct", pct)


def summarize_bucket(rows: list[dict[str, Any]], actual_key: str, delta_key: str) -> dict[str, Any]:
    counts = {
        "missing": 0,
        "no_delta": 0,
        "exact": 0,
        "within_5pct": 0,
        "within_10pct": 0,
        "over_10pct": 0,
        "nonzero_delta_no_base": 0,
    }
    pct_values: list[float] = []
    abs_deltas: list[float] = []

    for row in rows:
        tracking = row.get("userlsTracking") or {}
        deltas = tracking.get("deltas") or {}

        actual = as_num(tracking.get(actual_key))
        delta = as_num(deltas.get(delta_key))

        label, pct = bucket_result(actual, delta)
        counts[label] += 1

        if pct is not None:
            pct_values.append(pct)
        if delta is not None:
            abs_deltas.append(abs(delta))

    out: dict[str, Any] = dict(counts)
    out["rowCount"] = len(rows)
    out["meanAbsDelta"] = round(statistics.mean(abs_deltas), 4) if abs_deltas else None
    out["medianAbsDelta"] = round(statistics.median(abs_deltas), 4) if abs_deltas else None
    out["meanPctDelta"] = round(statistics.mean(pct_values), 4) if pct_values else None
    out["medianPctDelta"] = round(statistics.median(pct_values), 4) if pct_values else None
    return out


def top_mismatches(rows: list[dict[str, Any]], actual_key: str, delta_key: str, limit: int = 15) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []

    for row in rows:
        tracking = row.get("userlsTracking") or {}
        deltas = tracking.get("deltas") or {}

        actual = as_num(tracking.get(actual_key))
        delta = as_num(deltas.get(delta_key))
        if delta is None:
            continue

        userid = row.get("userid") or row.get("userId") or row.get("user_id") or row.get("operatorId")
        name = row.get("name") or row.get("operatorName") or row.get("fullName")

        pct = None
        if actual not in (None, 0):
            pct = abs(delta) / abs(actual)

        out.append(
            {
                "userid": userid,
                "name": name,
                "actual": actual,
                "delta": delta,
                "absDelta": abs(delta),
                "pctDelta": round(pct, 4) if pct is not None else None,
            }
        )

    out.sort(key=lambda r: (r["absDelta"], r["pctDelta"] or -1), reverse=True)
    return out[:limit]


def analyze_file(path: Path) -> dict[str, Any]:
    doc = load_json(path)
    rows = find_operator_rows(doc)

    return {
        "file": str(path),
        "operatorRowsWithUserlsTracking": len(rows),
        "letdown": summarize_bucket(rows, "letdownPlates", "letdownPlates"),
        "putaway": summarize_bucket(rows, "putawayPlates", "putawayPlates"),
        "restockLike": summarize_bucket(rows, "restockLikePlatesEstimated", "restockLikeEstimatedPlates"),
        "replenishmentNoRecv": summarize_bucket(rows, "replenishmentNoRecvPlates", "replenishmentNoRecvPlates"),
        "topLetdownMismatches": top_mismatches(rows, "letdownPlates", "letdownPlates"),
        "topPutawayMismatches": top_mismatches(rows, "putawayPlates", "putawayPlates"),
        "topRestockLikeMismatches": top_mismatches(rows, "restockLikePlatesEstimated", "restockLikeEstimatedPlates"),
    }


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python3 ingest/scripts/validate_userls_against_existing.py <daily_enriched_json> [more_files...]")

    reports = [analyze_file(Path(arg)) for arg in sys.argv[1:]]
    print(json.dumps(reports, indent=2))


if __name__ == "__main__":
    main()
