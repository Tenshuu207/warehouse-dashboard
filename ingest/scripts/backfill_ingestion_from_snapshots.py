from __future__ import annotations

import json
from pathlib import Path

from db_sqlite import connect, record_upload, upsert_dataset_component

RAW_TYPES = ("b_forkl2", "rf2_forkstdl", "rf2_userls")
DERIVED_TYPES = ("daily", "daily_enriched", "weekly")


def safe_size(path_value: str | None) -> int | None:
    if not path_value:
        return None
    path = Path(path_value)
    if not path.is_absolute():
        path = Path.cwd() / path
    if not path.exists():
        return None
    return path.stat().st_size


def upload_exists(conn, business_date: str, report_type: str, run_id: str | None) -> bool:
    row = conn.execute(
        """
        SELECT 1
        FROM uploads
        WHERE business_date = ?
          AND report_type = ?
          AND COALESCE(run_id, '') = COALESCE(?, '')
        LIMIT 1
        """,
        (business_date, report_type, run_id),
    ).fetchone()
    return row is not None


def main():
    conn = connect()
    counts = {
        "raw_components": 0,
        "derived_components": 0,
        "uploads": 0,
    }

    try:
        rows = conn.execute(
            """
            SELECT snapshot_type, date_key, payload_json, source_path
            FROM snapshots
            ORDER BY date_key ASC, snapshot_type ASC
            """
        ).fetchall()

        for row in rows:
            snapshot_type = row["snapshot_type"]
            date_key = row["date_key"]
            source_path = row["source_path"]
            payload = json.loads(row["payload_json"])

            # Backfill derived artifact presence
            if snapshot_type in DERIVED_TYPES:
                upsert_dataset_component(
                    conn,
                    business_date=date_key,
                    component_type=snapshot_type,
                    status="ready",
                    source_path=source_path,
                    details={"backfilledFrom": "snapshots"},
                )
                counts["derived_components"] += 1

            # Backfill raw report components/uploads from daily-style payloads
            if snapshot_type in ("daily", "daily_enriched"):
                source_paths = payload.get("sourcePaths") or {}
                source_runs = payload.get("sourceRuns") or {}

                for report_type in RAW_TYPES:
                    raw_source = source_paths.get(report_type)
                    raw_run = source_runs.get(report_type)

                    if not raw_source:
                        continue

                    upsert_dataset_component(
                        conn,
                        business_date=date_key,
                        component_type=report_type,
                        status="ready",
                        source_path=raw_source,
                        details={
                            "runId": raw_run,
                            "activeRun": raw_run,
                            "backfilledFrom": snapshot_type,
                        },
                    )
                    counts["raw_components"] += 1

                    if not upload_exists(conn, date_key, report_type, raw_run):
                        record_upload(
                            conn,
                            business_date=date_key,
                            report_type=report_type,
                            source_path=raw_source,
                            checksum=None,
                            size_bytes=safe_size(raw_source),
                            status="backfilled",
                            run_id=raw_run,
                            manifest_path=None,
                            details={"backfilledFrom": snapshot_type},
                        )
                        counts["uploads"] += 1

        print(json.dumps({"status": "ok", "counts": counts}, indent=2))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
