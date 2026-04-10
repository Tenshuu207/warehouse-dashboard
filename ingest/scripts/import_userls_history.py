from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from db_sqlite import connect, upsert_snapshot
from parse_rf2_userls import parse_file


def run_cmd(cmd: list[str], cwd: Path) -> dict[str, Any]:
    result = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    return {
        "cmd": cmd,
        "returncode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }


def json_dump(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def tx_key(userid: str, tx: dict[str, Any]) -> tuple[Any, ...]:
    return (
        userid,
        tx.get("route") or "",
        tx.get("transDate") or "",
        tx.get("time") or "",
        tx.get("item") or "",
        tx.get("description") or "",
        tx.get("customerId") or "",
        tx.get("customerName") or "",
        tx.get("palletDate") or "",
        tx.get("transType") or "",
        str(tx.get("bin") or "").upper(),
        int(tx.get("qty", 0) or 0),
        tx.get("unit") or "",
    )


def blank_user(userid: str, name: str | None) -> dict[str, Any]:
    return {
        "userid": userid,
        "name": name,
        "inactiveMinutes": 0,
        "transactions": [],
        "noActivity": [],
        "routeTotals": {},
        "summaryByType": {},
        "summary": {
            "totalLines": 0,
            "totalPieces": 0,
            "pickLines": 0,
            "pickPieces": 0,
            "nonPickLines": 0,
            "nonPickPieces": 0,
        },
    }


def ensure_summary_type(user: dict[str, Any], transtype: str) -> dict[str, int]:
    if transtype not in user["summaryByType"]:
        user["summaryByType"][transtype] = {"lines": 0, "pieces": 0}
    return user["summaryByType"][transtype]


def finalize_user(user: dict[str, Any]) -> dict[str, Any]:
    summary = user["summary"]
    summary["pickLines"] = 0
    summary["pickPieces"] = 0
    summary["nonPickLines"] = 0
    summary["nonPickPieces"] = 0

    for transtype, values in user["summaryByType"].items():
        lines = int(values.get("lines", 0) or 0)
        pieces = int(values.get("pieces", 0) or 0)
        if transtype == "Pick":
            summary["pickLines"] += lines
            summary["pickPieces"] += pieces
        else:
            summary["nonPickLines"] += lines
            summary["nonPickPieces"] += pieces

    return {
        "userid": user["userid"],
        "name": user["name"],
        "inactiveMinutes": int(user.get("inactiveMinutes", 0) or 0),
        "transactions": user["transactions"],
        "noActivity": user["noActivity"],
        "routeTotals": user.get("routeTotals", {}),
        "summaryByType": dict(sorted(user["summaryByType"].items(), key=lambda kv: kv[0])),
        "summary": summary,
    }


def build_day_payloads(
    parsed: dict[str, Any],
    *,
    fill_missing_only: bool,
    existing_dates: set[str],
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    users_by_date: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    seen_by_date: dict[str, set[tuple[Any, ...]]] = defaultdict(set)

    tx_rows_seen = 0
    tx_rows_written = 0
    duplicate_rows_skipped = 0
    no_activity_rows_written = 0

    for user in parsed.get("users", []):
        userid = str(user.get("userid") or "").strip()
        name = user.get("name")
        if not userid:
            continue

        for tx in user.get("transactions", []):
            trans_date = tx.get("transDate")
            if not trans_date:
                continue
            tx_rows_seen += 1
            if fill_missing_only and trans_date in existing_dates:
                continue

            key = tx_key(userid, tx)
            if key in seen_by_date[trans_date]:
                duplicate_rows_skipped += 1
                continue
            seen_by_date[trans_date].add(key)

            day_user = users_by_date[trans_date].setdefault(userid, blank_user(userid, name))
            day_user["transactions"].append(tx)
            tx_rows_written += 1

            transtype = str(tx.get("transType") or "").strip()
            qty = int(tx.get("qty", 0) or 0)

            summary_type = ensure_summary_type(day_user, transtype)
            summary_type["lines"] += 1
            summary_type["pieces"] += qty

            day_user["summary"]["totalLines"] += 1
            day_user["summary"]["totalPieces"] += qty

        for gap in user.get("noActivity", []):
            trans_date = gap.get("transDate")
            if not trans_date:
                continue
            if fill_missing_only and trans_date in existing_dates:
                continue
            day_user = users_by_date[trans_date].setdefault(userid, blank_user(userid, name))
            minutes = int(gap.get("minutes", 0) or 0)
            day_user["noActivity"].append(gap)
            day_user["inactiveMinutes"] += minutes
            no_activity_rows_written += 1

    payloads: dict[str, dict[str, Any]] = {}

    for date_key, user_map in sorted(users_by_date.items()):
        users = [finalize_user(row) for _, row in sorted(user_map.items(), key=lambda kv: kv[0])]

        totals_by_type: dict[str, dict[str, int]] = defaultdict(lambda: {"lines": 0, "pieces": 0})
        grand_summary = {
            "userCount": len(users),
            "totalLines": 0,
            "totalPieces": 0,
            "pickLines": 0,
            "pickPieces": 0,
            "nonPickLines": 0,
            "nonPickPieces": 0,
        }

        for user in users:
            summary = user["summary"]
            grand_summary["totalLines"] += int(summary.get("totalLines", 0) or 0)
            grand_summary["totalPieces"] += int(summary.get("totalPieces", 0) or 0)
            grand_summary["pickLines"] += int(summary.get("pickLines", 0) or 0)
            grand_summary["pickPieces"] += int(summary.get("pickPieces", 0) or 0)
            grand_summary["nonPickLines"] += int(summary.get("nonPickLines", 0) or 0)
            grand_summary["nonPickPieces"] += int(summary.get("nonPickPieces", 0) or 0)

            for transtype, values in user.get("summaryByType", {}).items():
                totals_by_type[transtype]["lines"] += int(values.get("lines", 0) or 0)
                totals_by_type[transtype]["pieces"] += int(values.get("pieces", 0) or 0)

        payloads[date_key] = {
            "reportDate": date_key,
            "sourceFile": parsed.get("sourceFile"),
            "sourceReportStartDate": parsed.get("reportDate"),
            "users": users,
            "totalsByType": dict(sorted(totals_by_type.items(), key=lambda kv: kv[0])),
            "summary": grand_summary,
            "historyImportMeta": {
                "routeTotalsPreserved": False,
                "reason": "Full-year RF2 route totals do not carry date and are not safe to split by day.",
            },
        }

    stats = {
        "txRowsSeen": tx_rows_seen,
        "txRowsWritten": tx_rows_written,
        "duplicateRowsSkipped": duplicate_rows_skipped,
        "noActivityRowsWritten": no_activity_rows_written,
        "dateCount": len(payloads),
    }
    return payloads, stats


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Split a multi-day RF2 UserLS file into per-date parsed files and per-date userls_daily summaries."
    )
    parser.add_argument("source_file")
    parser.add_argument("parsed_dir")
    parser.add_argument("userls_daily_dir")
    parser.add_argument("--db-path", default=None)
    parser.add_argument(
        "--mode",
        choices=["fill-missing", "replace-covered"],
        default="fill-missing",
        help="fill-missing skips dates that already have userls_daily outputs; replace-covered rebuilds all covered dates.",
    )
    parser.add_argument(
        "--daily-dir",
        default=None,
        help="Optional derived daily directory. If provided, importer will also build daily_enriched for dates where daily JSON already exists.",
    )
    parser.add_argument(
        "--daily-enriched-dir",
        default=None,
        help="Optional target directory for daily_enriched outputs. Defaults to sibling of userls_daily dir.",
    )
    parser.add_argument(
        "--report-json",
        default=None,
        help="Optional path for a JSON report of what was written/skipped.",
    )
    args = parser.parse_args()

    source_file = Path(args.source_file).resolve()
    parsed_dir = Path(args.parsed_dir).resolve()
    userls_daily_dir = Path(args.userls_daily_dir).resolve()
    repo_root = Path(__file__).resolve().parents[2]
    conn = connect(args.db_path)

    existing_dates: set[str] = set()
    if args.mode == "fill-missing" and userls_daily_dir.exists():
        existing_dates = {p.stem for p in userls_daily_dir.glob("*.json") if p.is_file()}

    parsed = parse_file(str(source_file))
    payloads_by_date, build_stats = build_day_payloads(
        parsed,
        fill_missing_only=(args.mode == "fill-missing"),
        existing_dates=existing_dates,
    )

    report: dict[str, Any] = {
        "sourceFile": str(source_file),
        "mode": args.mode,
        "existingDatesSkipped": sorted(existing_dates) if args.mode == "fill-missing" else [],
        "buildStats": build_stats,
        "dates": [],
    }

    if args.daily_dir:
        daily_dir = Path(args.daily_dir).resolve()
        daily_enriched_dir = (
            Path(args.daily_enriched_dir).resolve()
            if args.daily_enriched_dir
            else daily_dir.parent / "daily_enriched"
        )
        daily_enriched_dir.mkdir(parents=True, exist_ok=True)
    else:
        daily_dir = None
        daily_enriched_dir = None

    for date_key in sorted(payloads_by_date):
        day_payload = payloads_by_date[date_key]
        parsed_path = parsed_dir / f"rf2_userls_{date_key}.json"
        userls_daily_path = userls_daily_dir / f"{date_key}.json"

        json_dump(parsed_path, day_payload)

        summary_step = run_cmd(
            [
                sys.executable,
                "ingest/scripts/build_userls_daily_summary.py",
                str(parsed_path),
                str(userls_daily_path),
            ],
            cwd=repo_root,
        )

        if summary_step["returncode"] != 0:
            report["dates"].append(
                {
                    "date": date_key,
                    "status": "failed",
                    "stage": "build_userls_daily_summary",
                    "parsedPath": str(parsed_path),
                    "userlsDailyPath": str(userls_daily_path),
                    "stderr": summary_step["stderr"],
                }
            )
            continue

        upsert_snapshot(
            conn,
            snapshot_type="rf2_userls_parsed",
            date_key=date_key,
            payload=day_payload,
            source_path=str(source_file),
        )

        summary_payload = json.loads(userls_daily_path.read_text())
        upsert_snapshot(
            conn,
            snapshot_type="userls_daily",
            date_key=date_key,
            payload=summary_payload,
            source_path=str(source_file),
        )

        entry: dict[str, Any] = {
            "date": date_key,
            "status": "ready",
            "parsedPath": str(parsed_path),
            "userlsDailyPath": str(userls_daily_path),
        }

        if daily_dir is not None and daily_enriched_dir is not None:
            daily_path = daily_dir / f"{date_key}.json"
            daily_enriched_path = daily_enriched_dir / f"{date_key}.json"

            if daily_path.exists():
                merge_step = run_cmd(
                    [
                        sys.executable,
                        "ingest/scripts/merge_userls_into_daily.py",
                        str(userls_daily_path),
                        str(daily_path),
                        str(daily_enriched_path),
                    ],
                    cwd=repo_root,
                )
                entry["dailyPath"] = str(daily_path)
                entry["dailyEnrichedPath"] = str(daily_enriched_path)
                entry["mergeStatus"] = "ready" if merge_step["returncode"] == 0 else "failed"
                if merge_step["returncode"] != 0:
                    entry["mergeStderr"] = merge_step["stderr"]
            else:
                entry["mergeStatus"] = "skipped_daily_missing"

        report["dates"].append(entry)

    if args.report_json:
        report_path = Path(args.report_json).resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
