from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = Path(
    os.environ.get(
        "WAREHOUSE_DB_PATH",
        str(REPO_ROOT / "ingest" / "state" / "warehouse_dashboard.db"),
    )
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


SCHEMA_SQL = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS key_value_store (
    namespace TEXT NOT NULL,
    key TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    source_path TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (namespace, key)
);

CREATE TABLE IF NOT EXISTS snapshots (
    snapshot_type TEXT NOT NULL,
    date_key TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    source_path TEXT,
    source_mtime TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (snapshot_type, date_key)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_type_date
    ON snapshots (snapshot_type, date_key);

CREATE TABLE IF NOT EXISTS audit_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    source TEXT,
    payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_events_type_time
    ON audit_events (event_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_date TEXT NOT NULL,
    report_type TEXT NOT NULL,
    source_path TEXT NOT NULL,
    checksum TEXT,
    size_bytes INTEGER,
    status TEXT NOT NULL,
    run_id TEXT,
    duplicate_of_run_id TEXT,
    manifest_path TEXT,
    created_at TEXT NOT NULL,
    details_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_uploads_date_type_created
    ON uploads (business_date, report_type, created_at DESC);

CREATE TABLE IF NOT EXISTS dataset_components (
    business_date TEXT NOT NULL,
    component_type TEXT NOT NULL,
    status TEXT NOT NULL,
    source_path TEXT,
    updated_at TEXT NOT NULL,
    details_json TEXT,
    PRIMARY KEY (business_date, component_type)
);

CREATE TABLE IF NOT EXISTS historical_role_alignment (
    year INTEGER NOT NULL,
    userid TEXT NOT NULL,
    name TEXT,
    primary_role TEXT,
    primary_role_share REAL,
    primary_area TEXT,
    primary_area_share REAL,
    primary_activity_area TEXT,
    yearly_repl_plates INTEGER NOT NULL DEFAULT 0,
    yearly_repl_pieces INTEGER NOT NULL DEFAULT 0,
    yearly_receiving_plates INTEGER NOT NULL DEFAULT 0,
    yearly_receiving_pieces INTEGER NOT NULL DEFAULT 0,
    yearly_pick_plates INTEGER NOT NULL DEFAULT 0,
    yearly_pick_pieces INTEGER NOT NULL DEFAULT 0,
    active_days INTEGER NOT NULL DEFAULT 0,
    active_weeks INTEGER NOT NULL DEFAULT 0,
    role_confidence TEXT NOT NULL,
    area_confidence TEXT NOT NULL,
    review_flag INTEGER NOT NULL DEFAULT 0,
    role_mix_json TEXT NOT NULL,
    area_mix_json TEXT NOT NULL,
    source_summary_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (year, userid)
);

CREATE INDEX IF NOT EXISTS idx_historical_role_alignment_year_review
    ON historical_role_alignment (year, review_flag, primary_role);
"""


def connect(db_path: str | Path | None = None) -> sqlite3.Connection:
    path = Path(db_path or DEFAULT_DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.executescript(SCHEMA_SQL)
    return conn


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def path_mtime_iso(path_value: str | Path | None) -> str | None:
    if not path_value:
        return None
    path = Path(path_value)
    if not path.exists():
        return None
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).replace(microsecond=0).isoformat()


def upsert_json_value(
    conn: sqlite3.Connection,
    namespace: str,
    key: str,
    payload: Any,
    source_path: str | Path | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO key_value_store (namespace, key, payload_json, source_path, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(namespace, key) DO UPDATE SET
            payload_json = excluded.payload_json,
            source_path = excluded.source_path,
            updated_at = excluded.updated_at
        """,
        (namespace, key, _json_dumps(payload), str(source_path) if source_path else None, utc_now_iso()),
    )
    conn.commit()


def upsert_snapshot(
    conn: sqlite3.Connection,
    snapshot_type: str,
    date_key: str,
    payload: Any,
    source_path: str | Path | None = None,
) -> None:
    source_str = str(source_path) if source_path else None
    conn.execute(
        """
        INSERT INTO snapshots (snapshot_type, date_key, payload_json, source_path, source_mtime, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(snapshot_type, date_key) DO UPDATE SET
            payload_json = excluded.payload_json,
            source_path = excluded.source_path,
            source_mtime = excluded.source_mtime,
            updated_at = excluded.updated_at
        """,
        (
            snapshot_type,
            date_key,
            _json_dumps(payload),
            source_str,
            path_mtime_iso(source_path),
            utc_now_iso(),
        ),
    )
    conn.commit()


def insert_audit_event(
    conn: sqlite3.Connection,
    event_id: str,
    event_type: str,
    occurred_at: str,
    source: str | None,
    payload: Any,
) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO audit_events (event_id, event_type, occurred_at, source, payload_json)
        VALUES (?, ?, ?, ?, ?)
        """,
        (event_id, event_type, occurred_at, source, _json_dumps(payload)),
    )
    conn.commit()


def record_upload(
    conn: sqlite3.Connection,
    *,
    business_date: str,
    report_type: str,
    source_path: str | Path,
    checksum: str | None,
    size_bytes: int | None,
    status: str,
    run_id: str | None,
    duplicate_of_run_id: str | None = None,
    manifest_path: str | Path | None = None,
    details: Any | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO uploads (
            business_date, report_type, source_path, checksum, size_bytes, status,
            run_id, duplicate_of_run_id, manifest_path, created_at, details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            business_date,
            report_type,
            str(source_path),
            checksum,
            size_bytes,
            status,
            run_id,
            duplicate_of_run_id,
            str(manifest_path) if manifest_path else None,
            utc_now_iso(),
            _json_dumps(details) if details is not None else None,
        ),
    )
    conn.commit()


def upsert_dataset_component(
    conn: sqlite3.Connection,
    *,
    business_date: str,
    component_type: str,
    status: str,
    source_path: str | Path | None = None,
    details: Any | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO dataset_components (
            business_date, component_type, status, source_path, updated_at, details_json
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(business_date, component_type) DO UPDATE SET
            status = excluded.status,
            source_path = excluded.source_path,
            updated_at = excluded.updated_at,
            details_json = excluded.details_json
        """,
        (
            business_date,
            component_type,
            status,
            str(source_path) if source_path else None,
            utc_now_iso(),
            _json_dumps(details) if details is not None else None,
        ),
    )
    conn.commit()


def load_json_file(path_value: str | Path) -> Any:
    return json.loads(Path(path_value).read_text(encoding="utf-8"))
