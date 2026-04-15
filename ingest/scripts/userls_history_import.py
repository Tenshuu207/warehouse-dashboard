from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import uuid
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

from common import save_json
from db_sqlite import connect, utc_now_iso, upsert_dataset_component, upsert_snapshot
from ingest_manifest import get_active_run
from parse_rf2_userls import parse_file

REPO_ROOT = Path(__file__).resolve().parents[2]

ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def is_valid_business_date(value: str | None) -> bool:
    if value is None:
        return False
    date_value = str(value).strip()
    if not ISO_DATE_RE.match(date_value):
        return False
    try:
        datetime.strptime(date_value, "%Y-%m-%d")
    except ValueError:
        return False
    return True


def run_cmd(cmd: list[str]) -> dict[str, Any]:
    result = subprocess.run(
        cmd,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    return {
        "cmd": cmd,
        "returncode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }


def mark_component(
    conn,
    *,
    business_date: str,
    component_type: str,
    status: str,
    source_path: str | Path | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    upsert_dataset_component(
        conn,
        business_date=business_date,
        component_type=component_type,
        status=status,
        source_path=source_path,
        details=details or {},
    )


def ensure_history_schema(conn) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS userls_history_jobs (
            job_id TEXT PRIMARY KEY,
            source_path TEXT NOT NULL,
            source_name TEXT NOT NULL,
            mode TEXT,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT,
            summary_json TEXT,
            error_text TEXT
        );

        CREATE TABLE IF NOT EXISTS userls_history_job_dates (
            job_id TEXT NOT NULL,
            business_date TEXT NOT NULL,
            status TEXT NOT NULL,
            action TEXT,
            parsed_path TEXT,
            userls_daily_path TEXT,
            daily_enriched_path TEXT,
            details_json TEXT,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (job_id, business_date)
        );

        CREATE INDEX IF NOT EXISTS idx_userls_history_jobs_created
            ON userls_history_jobs (created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_userls_history_job_dates_date
            ON userls_history_job_dates (business_date, updated_at DESC);
        """
    )
    conn.commit()


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def upsert_job(
    conn,
    *,
    job_id: str,
    source_path: str,
    source_name: str,
    mode: str | None,
    status: str,
    created_at: str | None = None,
    started_at: str | None = None,
    finished_at: str | None = None,
    summary: dict[str, Any] | None = None,
    error_text: str | None = None,
) -> None:
    existing_created = created_at
    if existing_created is None:
        row = conn.execute(
            "SELECT created_at FROM userls_history_jobs WHERE job_id = ?",
            (job_id,),
        ).fetchone()
        existing_created = row["created_at"] if row else utc_now_iso()

    conn.execute(
        """
        INSERT INTO userls_history_jobs (
            job_id, source_path, source_name, mode, status, created_at, started_at, finished_at,
            summary_json, error_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET
            source_path = excluded.source_path,
            source_name = excluded.source_name,
            mode = excluded.mode,
            status = excluded.status,
            started_at = excluded.started_at,
            finished_at = excluded.finished_at,
            summary_json = excluded.summary_json,
            error_text = excluded.error_text
        """,
        (
            job_id,
            source_path,
            source_name,
            mode,
            status,
            existing_created,
            started_at,
            finished_at,
            json_dumps(summary) if summary is not None else None,
            error_text,
        ),
    )
    conn.commit()


def replace_job_dates(conn, job_id: str, rows: list[dict[str, Any]]) -> None:
    with conn:
        conn.execute("DELETE FROM userls_history_job_dates WHERE job_id = ?", (job_id,))
        now = utc_now_iso()
        for row in rows:
            conn.execute(
                """
                INSERT INTO userls_history_job_dates (
                    job_id, business_date, status, action, parsed_path, userls_daily_path,
                    daily_enriched_path, details_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    row["businessDate"],
                    row["status"],
                    row.get("action"),
                    row.get("parsedPath"),
                    row.get("userlsDailyPath"),
                    row.get("dailyEnrichedPath"),
                    json_dumps(row.get("details", {})),
                    now,
                ),
            )


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


def load_job(conn, job_id: str) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT job_id, source_path, source_name, mode, status, created_at, started_at, finished_at,
               summary_json, error_text
        FROM userls_history_jobs
        WHERE job_id = ?
        """,
        (job_id,),
    ).fetchone()
    if row is None:
        raise SystemExit(f"Job not found: {job_id}")

    summary = json.loads(row["summary_json"]) if row["summary_json"] else None
    return {
        "jobId": row["job_id"],
        "sourcePath": row["source_path"],
        "sourceName": row["source_name"],
        "mode": row["mode"],
        "status": row["status"],
        "createdAt": row["created_at"],
        "startedAt": row["started_at"],
        "finishedAt": row["finished_at"],
        "summary": summary,
        "errorText": row["error_text"],
    }


def list_job_dates(conn, job_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT business_date, status, action, parsed_path, userls_daily_path,
               daily_enriched_path, details_json, updated_at
        FROM userls_history_job_dates
        WHERE job_id = ?
        ORDER BY business_date ASC
        """,
        (job_id,),
    ).fetchall()

    out = []
    for row in rows:
        details = json.loads(row["details_json"]) if row["details_json"] else {}
        out.append(
            {
                "businessDate": row["business_date"],
                "status": row["status"],
                "action": row["action"],
                "parsedPath": row["parsed_path"],
                "userlsDailyPath": row["userls_daily_path"],
                "dailyEnrichedPath": row["daily_enriched_path"],
                "details": details,
                "updatedAt": row["updated_at"],
            }
        )
    return out


def rebuild_user_summary_from_transactions(
    transactions: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    summary_by_type: dict[str, dict[str, int]] = defaultdict(
        lambda: {"lines": 0, "pieces": 0}
    )
    summary = {
        "totalLines": 0,
        "totalPieces": 0,
        "pickLines": 0,
        "pickPieces": 0,
        "nonPickLines": 0,
        "nonPickPieces": 0,
    }

    for tx in transactions:
        transtype = str(tx.get("transType") or "").strip()
        qty = int(tx.get("qty", 0) or 0)
        if not transtype:
            continue

        summary_by_type[transtype]["lines"] += 1
        summary_by_type[transtype]["pieces"] += qty
        summary["totalLines"] += 1
        summary["totalPieces"] += qty

        if transtype == "Pick":
            summary["pickLines"] += 1
            summary["pickPieces"] += qty
        else:
            summary["nonPickLines"] += 1
            summary["nonPickPieces"] += qty

    return dict(sorted(summary_by_type.items(), key=lambda kv: kv[0])), summary


def split_parsed_by_date(parsed: dict[str, Any]) -> dict[str, dict[str, Any]]:
    users = parsed.get("users", []) or []
    source_file = parsed.get("sourceFile")
    per_date_users: dict[str, list[dict[str, Any]]] = defaultdict(list)
    seen_by_date: dict[str, set[tuple[Any, ...]]] = defaultdict(set)
    tx_rows_seen_by_date: dict[str, int] = defaultdict(int)
    tx_rows_written_by_date: dict[str, int] = defaultdict(int)
    duplicate_rows_skipped_by_date: dict[str, int] = defaultdict(int)
    no_activity_rows_by_date: dict[str, int] = defaultdict(int)

    for user in users:
        tx_by_date: dict[str, list[dict[str, Any]]] = defaultdict(list)
        no_activity_by_date: dict[str, list[dict[str, Any]]] = defaultdict(list)
        route_totals_by_date: dict[str, dict[str, Any]] = defaultdict(dict)

        for tx in user.get("transactions", []) or []:
            date_key = str(tx.get("transDate") or "").strip()
            if is_valid_business_date(date_key):
                tx_rows_seen_by_date[date_key] += 1
                key = tx_key(str(user.get("userid") or ""), tx)
                if key in seen_by_date[date_key]:
                    duplicate_rows_skipped_by_date[date_key] += 1
                    continue
                seen_by_date[date_key].add(key)
                tx_rows_written_by_date[date_key] += 1
                tx_by_date[date_key].append(tx)

        for row in user.get("noActivity", []) or []:
            date_key = str(row.get("transDate") or "").strip()
            if is_valid_business_date(date_key):
                no_activity_rows_by_date[date_key] += 1
                no_activity_by_date[date_key].append(row)

        for route_key, route_info in (user.get("routeTotals", {}) or {}).items():
            date_key = str(route_info.get("transDate") or "").strip()
            if not date_key and "|" in str(route_key):
                date_key = str(route_key).split("|", 1)[0].strip()
            if is_valid_business_date(date_key):
                route_totals_by_date[date_key][str(route_key)] = route_info

        all_dates = sorted(
            set(tx_by_date.keys())
            | set(no_activity_by_date.keys())
            | set(route_totals_by_date.keys())
        )

        for date_key in all_dates:
            day_transactions = tx_by_date.get(date_key, [])
            day_no_activity = no_activity_by_date.get(date_key, [])
            day_route_totals = route_totals_by_date.get(date_key, {})
            if not day_transactions and not day_no_activity and not day_route_totals:
                continue

            summary_by_type, summary = rebuild_user_summary_from_transactions(
                day_transactions
            )
            inactive_minutes = sum(
                int(row.get("minutes", 0) or 0) for row in day_no_activity
            )

            per_date_users[date_key].append(
                {
                    "userid": user.get("userid"),
                    "name": user.get("name"),
                    "inactiveMinutes": inactive_minutes,
                    "transactions": day_transactions,
                    "noActivity": day_no_activity,
                    "routeTotals": day_route_totals,
                    "summaryByType": summary_by_type,
                    "summary": summary,
                }
            )

    per_date_payloads: dict[str, dict[str, Any]] = {}
    for date_key, rows in sorted(per_date_users.items()):
        if not is_valid_business_date(date_key):
            continue
        rows = sorted(rows, key=lambda row: str(row.get("userid") or ""))
        totals_by_type: dict[str, dict[str, int]] = defaultdict(
            lambda: {"lines": 0, "pieces": 0}
        )
        grand_summary = {
            "userCount": len(rows),
            "totalLines": 0,
            "totalPieces": 0,
            "pickLines": 0,
            "pickPieces": 0,
            "nonPickLines": 0,
            "nonPickPieces": 0,
        }

        for user in rows:
            summary = user.get("summary", {}) or {}
            grand_summary["totalLines"] += int(summary.get("totalLines", 0) or 0)
            grand_summary["totalPieces"] += int(summary.get("totalPieces", 0) or 0)
            grand_summary["pickLines"] += int(summary.get("pickLines", 0) or 0)
            grand_summary["pickPieces"] += int(summary.get("pickPieces", 0) or 0)
            grand_summary["nonPickLines"] += int(summary.get("nonPickLines", 0) or 0)
            grand_summary["nonPickPieces"] += int(summary.get("nonPickPieces", 0) or 0)

            for transtype, values in (user.get("summaryByType", {}) or {}).items():
                totals_by_type[transtype]["lines"] += int(values.get("lines", 0) or 0)
                totals_by_type[transtype]["pieces"] += int(
                    values.get("pieces", 0) or 0
                )

        per_date_payloads[date_key] = {
            "reportDate": date_key,
            "sourceFile": source_file,
            "sourceReportStartDate": parsed.get("reportDate"),
            "users": rows,
            "totalsByType": dict(sorted(totals_by_type.items(), key=lambda kv: kv[0])),
            "summary": grand_summary,
            "historyImportMeta": {
                "txRowsSeen": tx_rows_seen_by_date.get(date_key, 0),
                "txRowsWritten": tx_rows_written_by_date.get(date_key, 0),
                "duplicateRowsSkipped": duplicate_rows_skipped_by_date.get(date_key, 0),
                "noActivityRowsWritten": no_activity_rows_by_date.get(date_key, 0),
                "routeTotalsPreserved": any(
                    bool(user.get("routeTotals")) for user in rows
                ),
                "routeTotalsNote": (
                    "RF2 UserLS route totals are preserved only when the source row "
                    "carries an unambiguous transaction date."
                ),
            },
        }

    return per_date_payloads


def build_preview_rows(
    *,
    per_date_payloads: dict[str, dict[str, Any]],
    index_dir: str,
    parsed_dir: str,
    derived_daily_dir: str,
) -> list[dict[str, Any]]:
    userls_daily_dir = str(Path(derived_daily_dir).parent / "userls_daily")
    daily_enriched_dir = str(Path(derived_daily_dir).parent / "daily_enriched")

    rows: list[dict[str, Any]] = []
    for business_date, payload in sorted(per_date_payloads.items()):
        if not is_valid_business_date(business_date):
            continue
        parsed_path = str(Path(parsed_dir) / f"rf2_userls_{business_date}.json")
        userls_daily_path = str(Path(userls_daily_dir) / f"{business_date}.json")
        daily_path = str(Path(derived_daily_dir) / f"{business_date}.json")
        daily_enriched_path = str(Path(daily_enriched_dir) / f"{business_date}.json")

        active_raw = get_active_run(index_dir, business_date, "rf2_userls")
        has_active_raw = active_raw is not None
        has_existing_parsed = Path(parsed_path).exists()
        has_existing_userls_daily = Path(userls_daily_path).exists()
        has_existing_daily = Path(daily_path).exists()
        has_existing_daily_enriched = Path(daily_enriched_path).exists()

        user_count = len(payload.get("users", []) or [])
        transaction_count = sum(
            len(user.get("transactions", []) or [])
            for user in (payload.get("users", []) or [])
        )
        import_meta = payload.get("historyImportMeta", {}) or {}
        coverage_exists = (
            has_active_raw
            or has_existing_parsed
            or has_existing_userls_daily
            or has_existing_daily_enriched
        )

        rows.append(
            {
                "businessDate": business_date,
                "status": "preview",
                "action": None,
                "parsedPath": parsed_path,
                "userlsDailyPath": userls_daily_path,
                "dailyEnrichedPath": daily_enriched_path,
                "details": {
                    "userCount": user_count,
                    "transactionCount": transaction_count,
                    "txRowsSeen": int(import_meta.get("txRowsSeen", transaction_count) or 0),
                    "txRowsWritten": int(import_meta.get("txRowsWritten", transaction_count) or 0),
                    "duplicateRowsSkipped": int(import_meta.get("duplicateRowsSkipped", 0) or 0),
                    "noActivityRowsWritten": int(import_meta.get("noActivityRowsWritten", 0) or 0),
                    "routeTotalsPreserved": bool(import_meta.get("routeTotalsPreserved")),
                    "hasActiveRawUserls": has_active_raw,
                    "activeRawSourcePath": active_raw.get("sourcePath")
                    if active_raw
                    else None,
                    "hasExistingParsed": has_existing_parsed,
                    "hasExistingUserlsDaily": has_existing_userls_daily,
                    "hasExistingDaily": has_existing_daily,
                    "hasExistingDailyEnriched": has_existing_daily_enriched,
                    "coverageExists": coverage_exists,
                },
            }
        )
    return rows


def summarize_preview_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total_dates = len(rows)
    covered_dates = sum(1 for row in rows if row["details"].get("coverageExists"))
    missing_dates = total_dates - covered_dates
    total_users = sum(int(row["details"].get("userCount", 0) or 0) for row in rows)
    total_transactions = sum(
        int(row["details"].get("transactionCount", 0) or 0) for row in rows
    )
    tx_rows_seen = sum(int(row["details"].get("txRowsSeen", 0) or 0) for row in rows)
    tx_rows_written = sum(
        int(row["details"].get("txRowsWritten", 0) or 0) for row in rows
    )
    duplicate_rows_skipped = sum(
        int(row["details"].get("duplicateRowsSkipped", 0) or 0) for row in rows
    )
    no_activity_rows_written = sum(
        int(row["details"].get("noActivityRowsWritten", 0) or 0) for row in rows
    )
    return {
        "totalDates": total_dates,
        "coveredDates": covered_dates,
        "missingDates": missing_dates,
        "totalUsersAcrossDates": total_users,
        "totalTransactionsAcrossDates": total_transactions,
        "txRowsSeen": tx_rows_seen,
        "txRowsWritten": tx_rows_written,
        "duplicateRowsSkipped": duplicate_rows_skipped,
        "noActivityRowsWritten": no_activity_rows_written,
    }


def preview_job(
    *,
    source_file: str,
    index_dir: str,
    parsed_dir: str,
    derived_daily_dir: str,
    job_id: str | None,
) -> dict[str, Any]:
    source_path = str(Path(source_file).resolve())
    parsed = parse_file(source_path)
    per_date_payloads = split_parsed_by_date(parsed)
    rows = build_preview_rows(
        per_date_payloads=per_date_payloads,
        index_dir=index_dir,
        parsed_dir=parsed_dir,
        derived_daily_dir=derived_daily_dir,
    )
    summary = summarize_preview_rows(rows)
    summary["dateRange"] = {
        "start": rows[0]["businessDate"] if rows else None,
        "end": rows[-1]["businessDate"] if rows else None,
    }

    conn = connect()
    try:
        ensure_history_schema(conn)
        actual_job_id = job_id or uuid.uuid4().hex[:12]
        upsert_job(
            conn,
            job_id=actual_job_id,
            source_path=source_path,
            source_name=Path(source_path).name,
            mode=None,
            status="preview_ready",
            summary=summary,
        )
        replace_job_dates(conn, actual_job_id, rows)
    finally:
        conn.close()

    return {
        "jobId": actual_job_id,
        "sourcePath": source_path,
        "summary": summary,
        "dates": rows,
    }


def decide_action(mode: str, coverage_exists: bool) -> str:
    if mode == "fill-missing" and coverage_exists:
        return "skip"
    if mode == "replace-covered" and coverage_exists:
        return "replace"
    return "create"


def apply_job(
    *,
    job_id: str,
    mode: str,
    index_dir: str,
    parsed_dir: str,
    derived_daily_dir: str,
) -> dict[str, Any]:
    if mode not in {"fill-missing", "replace-covered"}:
        raise SystemExit("mode must be one of: fill-missing, replace-covered")

    conn = connect()
    ensure_history_schema(conn)
    job = load_job(conn, job_id)
    job_rows = list_job_dates(conn, job_id)

    upsert_job(
        conn,
        job_id=job_id,
        source_path=job["sourcePath"],
        source_name=job["sourceName"],
        mode=mode,
        status="running",
        started_at=utc_now_iso(),
        summary=job.get("summary") or {},
    )

    parsed = parse_file(job["sourcePath"])
    per_date_payloads = split_parsed_by_date(parsed)

    userls_daily_dir = Path(derived_daily_dir).parent / "userls_daily"
    daily_enriched_dir = Path(derived_daily_dir).parent / "daily_enriched"
    userls_daily_dir.mkdir(parents=True, exist_ok=True)
    daily_enriched_dir.mkdir(parents=True, exist_ok=True)
    Path(parsed_dir).mkdir(parents=True, exist_ok=True)

    result_rows: list[dict[str, Any]] = []
    counts = {"applied": 0, "skipped": 0, "failed": 0}

    for preview_row in job_rows:
        business_date = preview_row["businessDate"]
        payload = per_date_payloads.get(business_date)
        details = dict(preview_row.get("details") or {})

        if not is_valid_business_date(business_date):
            result_rows.append(
                {
                    "businessDate": business_date,
                    "status": "skipped",
                    "action": "skip",
                    "parsedPath": str(Path(parsed_dir) / f"rf2_userls_{business_date}.json"),
                    "userlsDailyPath": str(userls_daily_dir / f"{business_date}.json"),
                    "dailyEnrichedPath": str(daily_enriched_dir / f"{business_date}.json"),
                    "details": {
                        **details,
                        "reason": "invalid_business_date",
                    },
                }
            )
            counts["skipped"] += 1
            continue
        for stale_key in (
            "reason",
            "buildUserlsDailySummary",
            "mergeUserlsIntoDaily",
            "dailyExists",
            "mergeSkippedReason",
        ):
            details.pop(stale_key, None)

        coverage_exists = bool(details.get("coverageExists"))
        action = decide_action(mode, coverage_exists)

        parsed_path = Path(parsed_dir) / f"rf2_userls_{business_date}.json"
        userls_daily_path = userls_daily_dir / f"{business_date}.json"
        daily_path = Path(derived_daily_dir) / f"{business_date}.json"
        daily_enriched_path = daily_enriched_dir / f"{business_date}.json"

        row_out = {
            "businessDate": business_date,
            "status": "done",
            "action": action,
            "parsedPath": str(parsed_path),
            "userlsDailyPath": str(userls_daily_path),
            "dailyEnrichedPath": str(daily_enriched_path),
            "details": details,
        }

        if payload is None:
            row_out["status"] = "failed"
            row_out["details"] = {
                **details,
                "reason": "date_not_found_in_source_after_reparse",
            }
            counts["failed"] += 1
            result_rows.append(row_out)
            continue

        if action == "skip":
            row_out["status"] = "skipped"
            row_out["details"] = {
                **details,
                "reason": "coverage_exists_and_mode_is_fill_missing",
            }
            counts["skipped"] += 1
            result_rows.append(row_out)
            continue

        save_json(str(parsed_path), payload)

        build_step = run_cmd(
            [
                sys.executable,
                "ingest/scripts/build_userls_daily_summary.py",
                str(parsed_path),
                str(userls_daily_path),
            ]
        )
        row_out["details"] = {**details, "buildUserlsDailySummary": build_step}
        if build_step["returncode"] != 0:
            row_out["status"] = "failed"
            counts["failed"] += 1
            result_rows.append(row_out)
            continue

        userls_daily_payload = json.loads(userls_daily_path.read_text())
        upsert_snapshot(
            conn,
            snapshot_type="rf2_userls_parsed",
            date_key=business_date,
            payload=payload,
            source_path=parsed_path,
        )
        upsert_snapshot(
            conn,
            snapshot_type="userls_daily",
            date_key=business_date,
            payload=userls_daily_payload,
            source_path=userls_daily_path,
        )
        row_out["details"]["snapshots"] = {
            "rf2UserlsParsed": "upserted",
            "userlsDaily": "upserted",
        }

        mark_component(
            conn,
            business_date=business_date,
            component_type="rf2_userls",
            status="ready",
            source_path=parsed_path,
            details={
                "sourceMode": "historical_userls_import",
                "jobId": job_id,
                "mode": mode,
                "action": action,
                "sourceFile": job["sourcePath"],
                "parsedPath": str(parsed_path),
                "userlsDailyPath": str(userls_daily_path),
            },
        )

        if daily_path.exists():
            merge_step = run_cmd(
                [
                    sys.executable,
                    "ingest/scripts/merge_userls_into_daily.py",
                    str(userls_daily_path),
                    str(daily_path),
                    str(daily_enriched_path),
                ]
            )
            row_out["details"]["mergeUserlsIntoDaily"] = merge_step
            row_out["details"]["dailyExists"] = True
            if merge_step["returncode"] != 0:
                row_out["status"] = "failed"
                counts["failed"] += 1
                result_rows.append(row_out)
                continue

            mark_component(
                conn,
                business_date=business_date,
                component_type="daily_enriched",
                status="ready",
                source_path=daily_enriched_path,
                details={
                    "sourceMode": "historical_userls_import",
                    "jobId": job_id,
                    "mode": mode,
                    "action": action,
                    "sourceFile": job["sourcePath"],
                    "dailyPath": str(daily_path),
                    "userlsDailyPath": str(userls_daily_path),
                    "dailyEnrichedPath": str(daily_enriched_path),
                },
            )
        else:
            row_out["details"]["dailyExists"] = False
            row_out["details"]["mergeSkippedReason"] = "daily_missing"
            mark_component(
                conn,
                business_date=business_date,
                component_type="daily_enriched",
                status="missing",
                source_path=daily_enriched_path,
                details={
                    "sourceMode": "historical_userls_import",
                    "jobId": job_id,
                    "mode": mode,
                    "action": action,
                    "sourceFile": job["sourcePath"],
                    "dailyPath": str(daily_path),
                    "userlsDailyPath": str(userls_daily_path),
                    "reason": "daily_missing",
                },
            )

        counts["applied"] += 1
        result_rows.append(row_out)

    summary = summarize_preview_rows(job_rows)
    summary.update(
        {
            "mode": mode,
            "appliedDates": counts["applied"],
            "skippedDates": counts["skipped"],
            "failedDates": counts["failed"],
        }
    )

    final_status = "completed" if counts["failed"] == 0 else "completed_with_errors"
    replace_job_dates(conn, job_id, result_rows)
    upsert_job(
        conn,
        job_id=job_id,
        source_path=job["sourcePath"],
        source_name=job["sourceName"],
        mode=mode,
        status=final_status,
        started_at=job.get("startedAt") or utc_now_iso(),
        finished_at=utc_now_iso(),
        summary=summary,
        error_text=None if counts["failed"] == 0 else "One or more dates failed",
    )
    conn.close()

    return {
        "jobId": job_id,
        "status": final_status,
        "summary": summary,
        "dates": result_rows,
    }


def show_job(job_id: str) -> dict[str, Any]:
    conn = connect()
    try:
        ensure_history_schema(conn)
        job = load_job(conn, job_id)
        dates = list_job_dates(conn, job_id)
    finally:
        conn.close()
    return {**job, "dates": dates}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Preview and apply historical RF2 UserLS imports into canonical by-day outputs."
    )
    parser.add_argument(
        "--index-dir",
        default="ingest/index",
        help="Ingest manifest/index directory (default: ingest/index)",
    )
    parser.add_argument(
        "--parsed-dir",
        default="ingest/parsed",
        help="Canonical parsed output directory (default: ingest/parsed)",
    )
    parser.add_argument(
        "--derived-daily-dir",
        default="ingest/derived/daily",
        help="Daily dashboard directory (default: ingest/derived/daily)",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    preview = subparsers.add_parser("preview", help="Parse source and create a preview job")
    preview.add_argument("source_file")
    preview.add_argument("--job-id", default=None)

    apply_cmd = subparsers.add_parser("apply", help="Apply a preview job")
    apply_cmd.add_argument("job_id")
    apply_cmd.add_argument("mode", choices=["fill-missing", "replace-covered"])

    show = subparsers.add_parser("show", help="Show stored job status")
    show.add_argument("job_id")

    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.command == "preview":
        result = preview_job(
            source_file=args.source_file,
            index_dir=args.index_dir,
            parsed_dir=args.parsed_dir,
            derived_daily_dir=args.derived_daily_dir,
            job_id=args.job_id,
        )
    elif args.command == "apply":
        result = apply_job(
            job_id=args.job_id,
            mode=args.mode,
            index_dir=args.index_dir,
            parsed_dir=args.parsed_dir,
            derived_daily_dir=args.derived_daily_dir,
        )
    elif args.command == "show":
        result = show_job(args.job_id)
    else:
        raise SystemExit(f"Unsupported command: {args.command}")

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
