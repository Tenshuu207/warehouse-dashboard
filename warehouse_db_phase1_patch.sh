#!/usr/bin/env bash
set -euo pipefail

cd ~/homelab-stacks/warehouse-dashboard || exit 1

mkdir -p ingest/scripts ingest/state frontend/lib/server

cat > ingest/scripts/db_sqlite.py <<'PY'
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
"""


def connect(db_path: str | Path | None = None) -> sqlite3.Connection:
    path = Path(db_path or DEFAULT_DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
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
PY

cat > ingest/scripts/migrate_json_to_sqlite.py <<'PY'
from __future__ import annotations

import json
from pathlib import Path

from db_sqlite import connect, insert_audit_event, upsert_json_value, upsert_snapshot

REPO_ROOT = Path(__file__).resolve().parents[2]
INGEST_ROOT = REPO_ROOT / "ingest"
FRONTEND_ROOT = REPO_ROOT / "frontend"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sync_value(conn, namespace: str, key: str, path: Path) -> int:
    if not path.exists() or not path.is_file():
        return 0
    upsert_json_value(conn, namespace, key, load_json(path), source_path=path)
    return 1


def sync_snapshot_dir(conn, snapshot_type: str, directory: Path) -> int:
    if not directory.exists():
        return 0
    count = 0
    for file_path in sorted(directory.glob("*.json")):
        upsert_snapshot(conn, snapshot_type, file_path.stem, load_json(file_path), source_path=file_path)
        count += 1
    return count


def sync_reviews(conn, directory: Path) -> int:
    if not directory.exists():
        return 0
    count = 0
    for file_path in sorted(directory.glob("*.json")):
        upsert_json_value(conn, "reviews", file_path.stem, load_json(file_path), source_path=file_path)
        count += 1
    return count


def sync_daily_assignments(conn, directory: Path) -> int:
    if not directory.exists():
        return 0
    count = 0
    for file_path in sorted(directory.glob("*.json")):
        upsert_json_value(conn, "ui.daily-assignments", file_path.stem, load_json(file_path), source_path=file_path)
        count += 1
    return count


def sync_options_audit(conn, file_path: Path) -> int:
    if not file_path.exists():
        return 0
    count = 0
    for line in file_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        event = json.loads(line)
        insert_audit_event(
            conn,
            event_id=str(event.get("eventId") or f"options-audit-{count+1}"),
            event_type=str(event.get("eventType") or "options.updated"),
            occurred_at=str(event.get("timestamp") or ""),
            source=str(event.get("source") or "json-import"),
            payload=event,
        )
        count += 1
    return count


def main() -> None:
    conn = connect()
    counts: dict[str, int] = {}

    counts["config.options"] = sync_value(conn, "config", "options", INGEST_ROOT / "config" / "options.json")
    counts["config.employees"] = sync_value(conn, "config", "employees", INGEST_ROOT / "config" / "employees.json")
    counts["config.rf-mappings"] = sync_value(conn, "config", "rf-mappings", INGEST_ROOT / "config" / "rf_username_mappings.json")
    counts["config.operator-defaults"] = sync_value(conn, "config", "operator-defaults", INGEST_ROOT / "config" / "operator_defaults.json")
    counts["state.identity-review-queue"] = sync_value(conn, "state", "identity-review-queue", INGEST_ROOT / "config" / "identity_review_queue.json")
    counts["state.assignment-review-state"] = sync_value(conn, "state", "assignment-review-state", INGEST_ROOT / "config" / "assignment_review_state.json")
    counts["ui.home-assignments"] = sync_value(conn, "ui", "home-assignments", FRONTEND_ROOT / "data" / "assignments" / "home-assignments.json")

    counts["reviews"] = sync_reviews(conn, INGEST_ROOT / "config" / "reviews")
    counts["ui.daily-assignments"] = sync_daily_assignments(conn, FRONTEND_ROOT / "data" / "assignments" / "daily")
    counts["snapshots.daily"] = sync_snapshot_dir(conn, "daily", INGEST_ROOT / "derived" / "daily")
    counts["snapshots.daily_enriched"] = sync_snapshot_dir(conn, "daily_enriched", INGEST_ROOT / "derived" / "daily_enriched")
    counts["snapshots.weekly"] = sync_snapshot_dir(conn, "weekly", INGEST_ROOT / "derived" / "weekly")
    counts["audit.options"] = sync_options_audit(conn, INGEST_ROOT / "config" / "audit" / "options-events.ndjson")

    conn.close()

    print(json.dumps({"status": "ok", "counts": counts}, indent=2))


if __name__ == "__main__":
    main()
PY

cat > frontend/lib/server/db.ts <<'TS'
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const DB_PATH =
  process.env.WAREHOUSE_DB_PATH ||
  path.join(process.cwd(), "..", "ingest", "state", "warehouse_dashboard.db");

type DbHandle = Database.Database;

declare global {
  var __warehouseDashboardDb: DbHandle | undefined;
}

function nowIso() {
  return new Date().toISOString();
}

function ensureSchema(db: DbHandle) {
  db.pragma("journal_mode = WAL");
  db.exec(`
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
  `);
}

export function getDb(): DbHandle {
  if (!global.__warehouseDashboardDb) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const db = new Database(DB_PATH);
    ensureSchema(db);
    global.__warehouseDashboardDb = db;
  }

  return global.__warehouseDashboardDb;
}

export function getJsonValue<T>(namespace: string, key: string): T | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT payload_json FROM key_value_store WHERE namespace = ? AND key = ?`)
    .get(namespace, key) as { payload_json: string } | undefined;

  if (!row?.payload_json) return null;
  return JSON.parse(row.payload_json) as T;
}

export function upsertJsonValue(
  namespace: string,
  key: string,
  payload: unknown,
  sourcePath?: string | null
) {
  const db = getDb();
  db.prepare(
    `
      INSERT INTO key_value_store (namespace, key, payload_json, source_path, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(namespace, key) DO UPDATE SET
        payload_json = excluded.payload_json,
        source_path = excluded.source_path,
        updated_at = excluded.updated_at
    `
  ).run(namespace, key, JSON.stringify(payload), sourcePath ?? null, nowIso());
}

export function insertAuditEvent(
  eventId: string,
  eventType: string,
  occurredAt: string,
  source: string | null,
  payload: unknown
) {
  const db = getDb();
  db.prepare(
    `
      INSERT OR REPLACE INTO audit_events (event_id, event_type, occurred_at, source, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `
  ).run(eventId, eventType, occurredAt, source, JSON.stringify(payload));
}

export function getSnapshot<T>(snapshotType: string, dateKey: string): T | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT payload_json FROM snapshots WHERE snapshot_type = ? AND date_key = ?`)
    .get(snapshotType, dateKey) as { payload_json: string } | undefined;

  if (!row?.payload_json) return null;
  return JSON.parse(row.payload_json) as T;
}

export function upsertSnapshot(
  snapshotType: string,
  dateKey: string,
  payload: unknown,
  sourcePath?: string | null,
  sourceMtime?: string | null
) {
  const db = getDb();
  db.prepare(
    `
      INSERT INTO snapshots (snapshot_type, date_key, payload_json, source_path, source_mtime, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(snapshot_type, date_key) DO UPDATE SET
        payload_json = excluded.payload_json,
        source_path = excluded.source_path,
        source_mtime = excluded.source_mtime,
        updated_at = excluded.updated_at
    `
  ).run(
    snapshotType,
    dateKey,
    JSON.stringify(payload),
    sourcePath ?? null,
    sourceMtime ?? null,
    nowIso()
  );
}

export function resolveNearestSnapshot<T>(
  snapshotType: string,
  requestedKey: string
): { resolvedKey: string; payload: T } | null {
  const db = getDb();

  const exact = db
    .prepare(`SELECT date_key, payload_json FROM snapshots WHERE snapshot_type = ? AND date_key = ?`)
    .get(snapshotType, requestedKey) as { date_key: string; payload_json: string } | undefined;

  if (exact?.payload_json) {
    return {
      resolvedKey: exact.date_key,
      payload: JSON.parse(exact.payload_json) as T,
    };
  }

  const fallback = db
    .prepare(
      `
        SELECT date_key, payload_json
        FROM snapshots
        WHERE snapshot_type = ? AND date_key <= ?
        ORDER BY date_key DESC
        LIMIT 1
      `
    )
    .get(snapshotType, requestedKey) as { date_key: string; payload_json: string } | undefined;

  if (fallback?.payload_json) {
    return {
      resolvedKey: fallback.date_key,
      payload: JSON.parse(fallback.payload_json) as T,
    };
  }

  const oldest = db
    .prepare(
      `
        SELECT date_key, payload_json
        FROM snapshots
        WHERE snapshot_type = ?
        ORDER BY date_key ASC
        LIMIT 1
      `
    )
    .get(snapshotType) as { date_key: string; payload_json: string } | undefined;

  if (!oldest?.payload_json) {
    return null;
  }

  return {
    resolvedKey: oldest.date_key,
    payload: JSON.parse(oldest.payload_json) as T,
  };
}
TS

cat > frontend/app/api/dashboard/route.ts <<'TS'
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { resolveNearestSnapshot } from "@/lib/server/db";

async function resolveNearestFile(dirPath: string, requestedKey: string): Promise<{ filePath: string; resolvedKey: string } | null> {
  const entries = await fs.readdir(dirPath);
  const keys = entries
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""))
    .sort();

  if (keys.length === 0) return null;

  if (keys.includes(requestedKey)) {
    return {
      filePath: path.join(dirPath, `${requestedKey}.json`),
      resolvedKey: requestedKey,
    };
  }

  const earlier = keys.filter((key) => key <= requestedKey);
  const resolvedKey = earlier.length > 0 ? earlier[earlier.length - 1] : keys[0];

  return {
    filePath: path.join(dirPath, `${resolvedKey}.json`),
    resolvedKey,
  };
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || "2026-04-03";

  try {
    const resolvedDb = resolveNearestSnapshot<Record<string, unknown>>("daily", date);
    if (resolvedDb) {
      return NextResponse.json({
        ...resolvedDb.payload,
        requestedDate: date,
        resolvedDate: resolvedDb.resolvedKey,
        usedFallback: resolvedDb.resolvedKey !== date,
        source: "sqlite",
      });
    }

    const dirPath = path.join(process.cwd(), "..", "ingest", "derived", "daily");

    const resolved = await resolveNearestFile(dirPath, date);
    if (!resolved) {
      return NextResponse.json(
        {
          error: "dashboard_not_found",
          requestedDate: date,
          details: "No daily dashboard files available",
        },
        { status: 404 }
      );
    }

    const raw = await fs.readFile(resolved.filePath, "utf-8");
    const data = JSON.parse(raw);

    return NextResponse.json({
      ...data,
      requestedDate: date,
      resolvedDate: resolved.resolvedKey,
      usedFallback: resolved.resolvedKey !== date,
      source: "json",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "dashboard_not_found",
        requestedDate: date,
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 404 }
    );
  }
}
TS

cat > frontend/app/api/dashboard/weekly/route.ts <<'TS'
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { resolveNearestSnapshot } from "@/lib/server/db";

async function resolveNearestFile(dirPath: string, requestedKey: string): Promise<{ filePath: string; resolvedKey: string } | null> {
  const entries = await fs.readdir(dirPath);
  const keys = entries
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""))
    .sort();

  if (keys.length === 0) return null;

  if (keys.includes(requestedKey)) {
    return {
      filePath: path.join(dirPath, `${requestedKey}.json`),
      resolvedKey: requestedKey,
    };
  }

  const earlier = keys.filter((key) => key <= requestedKey);
  const resolvedKey = earlier.length > 0 ? earlier[earlier.length - 1] : keys[0];

  return {
    filePath: path.join(dirPath, `${resolvedKey}.json`),
    resolvedKey,
  };
}

export async function GET(req: NextRequest) {
  const weekStart = req.nextUrl.searchParams.get("weekStart") || "2026-04-03";

  try {
    const resolvedDb = resolveNearestSnapshot<Record<string, unknown>>("weekly", weekStart);
    if (resolvedDb) {
      return NextResponse.json({
        ...resolvedDb.payload,
        requestedWeekStart: weekStart,
        resolvedWeekStart: resolvedDb.resolvedKey,
        usedFallback: resolvedDb.resolvedKey !== weekStart,
        source: "sqlite",
      });
    }

    const dirPath = path.join(process.cwd(), "..", "ingest", "derived", "weekly");

    const resolved = await resolveNearestFile(dirPath, weekStart);
    if (!resolved) {
      return NextResponse.json(
        {
          error: "weekly_dashboard_not_found",
          requestedWeekStart: weekStart,
          details: "No weekly dashboard files available",
        },
        { status: 404 }
      );
    }

    const raw = await fs.readFile(resolved.filePath, "utf-8");
    const data = JSON.parse(raw);

    return NextResponse.json({
      ...data,
      requestedWeekStart: weekStart,
      resolvedWeekStart: resolved.resolvedKey,
      usedFallback: resolved.resolvedKey !== weekStart,
      source: "json",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "weekly_dashboard_not_found",
        requestedWeekStart: weekStart,
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 404 }
    );
  }
}
TS

cat > frontend/app/api/dashboard/daily-enriched/route.ts <<'TS'
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getSnapshot } from "@/lib/server/db";

function dailyEnrichedPath(date: string) {
  return path.join(process.cwd(), "..", "ingest", "derived", "daily_enriched", `${date}.json`);
}

function isDateLike(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date")?.trim() || "";
    const userid = req.nextUrl.searchParams.get("userid")?.trim() || "";

    if (!isDateLike(date)) {
      return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    }

    const fromDb = getSnapshot<Record<string, unknown>>("daily_enriched", date);
    const parsed = fromDb || JSON.parse(await fs.readFile(dailyEnrichedPath(date), "utf-8"));

    const operators = Array.isArray(parsed.operators) ? parsed.operators : [];
    const userlsOnlyUsers = Array.isArray(parsed.userlsOnlyUsers) ? parsed.userlsOnlyUsers : [];

    if (userid) {
      const operator = operators.find((row: { userid?: string }) => row.userid === userid) || null;
      const userlsOnlyUser =
        userlsOnlyUsers.find((row: { userid?: string }) => row.userid === userid) || null;

      return NextResponse.json({
        date,
        userid,
        userlsTrackingSummary: parsed.userlsTrackingSummary || null,
        operator,
        userlsOnlyUser,
        source: fromDb ? "sqlite" : "json",
      });
    }

    return NextResponse.json({
      ...parsed,
      source: fromDb ? "sqlite" : "json",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "daily_enriched_read_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
TS

python3 - <<'PY'
from pathlib import Path

root = Path('frontend/app/api/dashboard/team-groups/route.ts')
text = root.read_text()
text = text.replace('import { promises as fs } from "fs";\nimport path from "path";\n', 'import { promises as fs } from "fs";\nimport path from "path";\nimport { getSnapshot } from "@/lib/server/db";\n')
text = text.replace('    const raw = await fs.readFile(dailyEnrichedPath(date), "utf-8");\n    const parsed = JSON.parse(raw);\n', '    const parsed =\n      getSnapshot<Record<string, unknown>>("daily_enriched", date) ||\n      JSON.parse(await fs.readFile(dailyEnrichedPath(date), "utf-8"));\n')
root.write_text(text)
PY

cat > frontend/app/api/options/route.ts <<'TS'
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { getJsonValue, insertAuditEvent, upsertJsonValue } from "@/lib/server/db";

type OptionsData = {
  areas: string[];
  roles: string[];
  reviewStatuses: string[];
};

type ListChange = {
  added: string[];
  removed: string[];
  orderChanged: boolean;
};

type OptionsAuditEvent = {
  eventId: string;
  timestamp: string;
  eventType: "options.updated";
  source: "ui";
  actor: string | null;
  requestId: string;
  before: OptionsData;
  after: OptionsData;
  changes: {
    areas: ListChange;
    roles: ListChange;
    reviewStatuses: ListChange;
  };
};

function optionsFilePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "options.json");
}

function optionsAuditFilePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "audit", "options-events.ndjson");
}

const DEFAULTS: OptionsData = {
  areas: [],
  roles: [],
  reviewStatuses: ["pending", "reviewed", "dismissed"],
};

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

function normalizeOptions(value: unknown): OptionsData {
  const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  const reviewStatuses = normalizeList(obj.reviewStatuses);
  return {
    areas: normalizeList(obj.areas),
    roles: normalizeList(obj.roles),
    reviewStatuses: reviewStatuses.length > 0 ? reviewStatuses : DEFAULTS.reviewStatuses,
  };
}

async function readOptions(): Promise<OptionsData> {
  const fromDb = getJsonValue<OptionsData>("config", "options");
  if (fromDb) {
    return normalizeOptions(fromDb);
  }

  try {
    const raw = await fs.readFile(optionsFilePath(), "utf-8");
    return normalizeOptions(JSON.parse(raw));
  } catch {
    return DEFAULTS;
  }
}

function diffList(before: string[], after: string[]): ListChange {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);

  const added = after.filter((item) => !beforeSet.has(item));
  const removed = before.filter((item) => !afterSet.has(item));
  const orderChanged = before.length === after.length && before.some((item, index) => item !== after[index]);

  return {
    added,
    removed,
    orderChanged,
  };
}

function hasAnyChanges(change: ListChange): boolean {
  return change.added.length > 0 || change.removed.length > 0 || change.orderChanged;
}

function buildAuditEvent(before: OptionsData, after: OptionsData): OptionsAuditEvent {
  const timestamp = new Date().toISOString();
  const requestId = crypto.randomBytes(6).toString("hex");

  return {
    eventId: `${timestamp}__${requestId}`,
    timestamp,
    eventType: "options.updated",
    source: "ui",
    actor: null,
    requestId,
    before,
    after,
    changes: {
      areas: diffList(before.areas, after.areas),
      roles: diffList(before.roles, after.roles),
      reviewStatuses: diffList(before.reviewStatuses, after.reviewStatuses),
    },
  };
}

function eventHasChanges(event: OptionsAuditEvent): boolean {
  return (
    hasAnyChanges(event.changes.areas) ||
    hasAnyChanges(event.changes.roles) ||
    hasAnyChanges(event.changes.reviewStatuses)
  );
}

export async function GET() {
  try {
    const data = await readOptions();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(DEFAULTS);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const before = await readOptions();
    const after = normalizeOptions(body);
    const auditEvent = buildAuditEvent(before, after);

    await fs.mkdir(path.dirname(optionsFilePath()), { recursive: true });
    await fs.writeFile(optionsFilePath(), JSON.stringify(after, null, 2), "utf-8");
    upsertJsonValue("config", "options", after, optionsFilePath());

    if (eventHasChanges(auditEvent)) {
      await fs.mkdir(path.dirname(optionsAuditFilePath()), { recursive: true });
      await fs.appendFile(optionsAuditFilePath(), JSON.stringify(auditEvent) + "\n", "utf-8");
      insertAuditEvent(
        auditEvent.eventId,
        auditEvent.eventType,
        auditEvent.timestamp,
        auditEvent.source,
        auditEvent
      );
    }

    return NextResponse.json({
      status: "saved",
      changed: eventHasChanges(auditEvent),
      ...after,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "save_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
TS

cat > frontend/app/api/employees/route.ts <<'TS'
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getJsonValue, upsertJsonValue } from "@/lib/server/db";

const VALID_STATUSES = ["active", "inactive"] as const;

type EmployeeStatus = (typeof VALID_STATUSES)[number];

type EmployeeRecord = {
  displayName: string;
  status: EmployeeStatus;
  defaultTeam: string;
  notes?: string;
};

type EmployeesData = {
  employees: Record<string, EmployeeRecord>;
};

type EmployeeRowInput = {
  employeeId?: string;
  displayName?: string;
  status?: string;
  defaultTeam?: string;
  notes?: string;
};

function employeesFilePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "employees.json");
}

function optionsFilePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "options.json");
}

async function readValidTeams(): Promise<string[]> {
  try {
    const raw = await fs.readFile(optionsFilePath(), "utf-8");
    const data = JSON.parse(raw);
    const areas = Array.isArray(data?.areas)
      ? data.areas.filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0)
      : [];
    return areas.length ? areas : ["Other"];
  } catch {
    return ["Other"];
  }
}

function normalizeExistingData(input: unknown, validTeams: string[]): EmployeesData {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const rawEmployees =
    raw.employees && typeof raw.employees === "object" && !Array.isArray(raw.employees)
      ? (raw.employees as Record<string, unknown>)
      : {};

  const employees: Record<string, EmployeeRecord> = {};

  for (const [employeeId, value] of Object.entries(rawEmployees)) {
    const cleanId = employeeId.trim();
    if (!cleanId) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const row = value as Record<string, unknown>;
    const displayName = typeof row.displayName === "string" ? row.displayName.trim() : "";
    const status = typeof row.status === "string" ? row.status.trim() : "";
    const defaultTeam = typeof row.defaultTeam === "string" ? row.defaultTeam.trim() : "";
    const notes = typeof row.notes === "string" ? row.notes.trim() : "";

    if (!displayName) continue;
    if (!VALID_STATUSES.includes(status as EmployeeStatus)) continue;
    if (!defaultTeam || !validTeams.includes(defaultTeam)) continue;

    employees[cleanId] = {
      displayName,
      status: status as EmployeeStatus,
      defaultTeam,
      ...(notes ? { notes } : {}),
    };
  }

  return { employees };
}

async function readEmployees(validTeams: string[]): Promise<EmployeesData> {
  const fromDb = getJsonValue<EmployeesData>("config", "employees");
  if (fromDb) {
    return normalizeExistingData(fromDb, validTeams);
  }

  try {
    const raw = await fs.readFile(employeesFilePath(), "utf-8");
    return normalizeExistingData(JSON.parse(raw), validTeams);
  } catch {
    return { employees: {} };
  }
}

function nextEmployeeId(idsInUse: Set<string>): string {
  const numbers = [...idsInUse]
    .map((id) => {
      const match = /^EMP(\d+)$/i.exec(id.trim());
      return match ? Number(match[1]) : null;
    })
    .filter((value): value is number => value !== null && Number.isFinite(value));

  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  const employeeId = `EMP${String(next).padStart(4, "0")}`;
  idsInUse.add(employeeId);
  return employeeId;
}

function normalizeIncomingBody(input: unknown, validTeams: string[], existingIds: Set<string>): EmployeesData {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const employees: Record<string, EmployeeRecord> = {};

  if (Array.isArray(raw.rows)) {
    const seenExplicitIds = new Set<string>();

    for (const entry of raw.rows as unknown[]) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const row = entry as EmployeeRowInput;

      const displayName = typeof row.displayName === "string" ? row.displayName.trim() : "";
      const status = typeof row.status === "string" ? row.status.trim() : "";
      const defaultTeam = typeof row.defaultTeam === "string" ? row.defaultTeam.trim() : "";
      const notes = typeof row.notes === "string" ? row.notes.trim() : "";
      const suppliedId = typeof row.employeeId === "string" ? row.employeeId.trim() : "";

      if (!displayName) continue;
      if (!VALID_STATUSES.includes(status as EmployeeStatus)) continue;
      if (!defaultTeam || !validTeams.includes(defaultTeam)) continue;

      let employeeId = suppliedId;

      if (employeeId) {
        if (seenExplicitIds.has(employeeId)) {
          throw new Error(`Duplicate employeeId in request: ${employeeId}`);
        }
        seenExplicitIds.add(employeeId);
        existingIds.add(employeeId);
      } else {
        employeeId = nextEmployeeId(existingIds);
      }

      employees[employeeId] = {
        displayName,
        status: status as EmployeeStatus,
        defaultTeam,
        ...(notes ? { notes } : {}),
      };
    }

    return { employees };
  }

  return normalizeExistingData(raw, validTeams);
}

export async function GET() {
  const validTeams = await readValidTeams();
  const data = await readEmployees(validTeams);

  return NextResponse.json({
    ...data,
    validTeams,
    validStatuses: VALID_STATUSES,
  });
}

export async function POST(req: NextRequest) {
  try {
    const validTeams = await readValidTeams();
    const current = await readEmployees(validTeams);
    const currentIds = new Set(Object.keys(current.employees || {}));

    const body = await req.json();
    const data = normalizeIncomingBody(body, validTeams, currentIds);

    await fs.mkdir(path.dirname(employeesFilePath()), { recursive: true });
    await fs.writeFile(employeesFilePath(), JSON.stringify(data, null, 2), "utf-8");
    upsertJsonValue("config", "employees", data, employeesFilePath());

    return NextResponse.json({
      status: "saved",
      ...data,
      validTeams,
      validStatuses: VALID_STATUSES,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "save_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
TS

cat > frontend/app/api/rf-mappings/route.ts <<'TS'
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getJsonValue, upsertJsonValue } from "@/lib/server/db";

type RfMapping = {
  rfUsername: string;
  employeeId: string;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
  active: boolean;
  notes?: string;
};

type RfMappingsData = {
  mappings: RfMapping[];
};

function mappingsFilePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "rf_username_mappings.json");
}

function employeesFilePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "employees.json");
}

function isDateLike(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function readEmployeeIds(): Promise<Set<string>> {
  const fromDb = getJsonValue<{ employees?: Record<string, unknown> }>("config", "employees");
  if (fromDb?.employees && typeof fromDb.employees === "object") {
    return new Set(Object.keys(fromDb.employees));
  }

  try {
    const raw = await fs.readFile(employeesFilePath(), "utf-8");
    const data = JSON.parse(raw);
    const employees =
      data && typeof data === "object" && !Array.isArray(data) && data.employees && typeof data.employees === "object"
        ? (data.employees as Record<string, unknown>)
        : {};
    return new Set(Object.keys(employees));
  } catch {
    return new Set();
  }
}

function normalizeData(input: unknown, validEmployeeIds: Set<string>): RfMappingsData {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const rawMappings = Array.isArray(raw.mappings) ? raw.mappings : [];

  const mappings: RfMapping[] = [];

  for (const item of rawMappings) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;

    const rfUsername = typeof row.rfUsername === "string" ? row.rfUsername.trim() : "";
    const employeeId = typeof row.employeeId === "string" ? row.employeeId.trim() : "";
    const active = row.active === true;
    const effectiveStartDate =
      typeof row.effectiveStartDate === "string" && row.effectiveStartDate.trim()
        ? row.effectiveStartDate.trim()
        : "";
    const effectiveEndDate =
      typeof row.effectiveEndDate === "string" && row.effectiveEndDate.trim()
        ? row.effectiveEndDate.trim()
        : "";
    const notes = typeof row.notes === "string" ? row.notes.trim() : "";

    if (!rfUsername || !employeeId) continue;
    if (!validEmployeeIds.has(employeeId)) continue;
    if (effectiveStartDate && !isDateLike(effectiveStartDate)) continue;
    if (effectiveEndDate && !isDateLike(effectiveEndDate)) continue;

    mappings.push({
      rfUsername,
      employeeId,
      ...(effectiveStartDate ? { effectiveStartDate } : {}),
      ...(effectiveEndDate ? { effectiveEndDate } : {}),
      active,
      ...(notes ? { notes } : {}),
    });
  }

  mappings.sort((a, b) => {
    if (a.rfUsername !== b.rfUsername) return a.rfUsername.localeCompare(b.rfUsername);
    return (a.effectiveStartDate || "").localeCompare(b.effectiveStartDate || "");
  });

  return { mappings };
}

async function readMappings(validEmployeeIds: Set<string>): Promise<RfMappingsData> {
  const fromDb = getJsonValue<RfMappingsData>("config", "rf-mappings");
  if (fromDb) {
    return normalizeData(fromDb, validEmployeeIds);
  }

  try {
    const raw = await fs.readFile(mappingsFilePath(), "utf-8");
    return normalizeData(JSON.parse(raw), validEmployeeIds);
  } catch {
    return { mappings: [] };
  }
}

export async function GET() {
  const validEmployeeIds = await readEmployeeIds();
  const data = await readMappings(validEmployeeIds);

  return NextResponse.json({
    ...data,
  });
}

export async function POST(req: NextRequest) {
  try {
    const validEmployeeIds = await readEmployeeIds();
    const body = await req.json();
    const data = normalizeData(body, validEmployeeIds);

    await fs.mkdir(path.dirname(mappingsFilePath()), { recursive: true });
    await fs.writeFile(mappingsFilePath(), JSON.stringify(data, null, 2), "utf-8");
    upsertJsonValue("config", "rf-mappings", data, mappingsFilePath());

    return NextResponse.json({
      status: "saved",
      ...data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "save_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
TS

cat > frontend/app/api/operator-defaults/route.ts <<'TS'
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getJsonValue, upsertJsonValue } from "@/lib/server/db";

type OperatorDefault = {
  name?: string;
  defaultTeam: string;
};

type OperatorDefaultsData = {
  operators: Record<string, OperatorDefault>;
};

function defaultsFilePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "operator_defaults.json");
}

function optionsFilePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "options.json");
}

async function readValidTeams(): Promise<string[]> {
  try {
    const raw = await fs.readFile(optionsFilePath(), "utf-8");
    const data = JSON.parse(raw);
    const areas = Array.isArray(data?.areas)
      ? data.areas.filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0)
      : [];
    return areas.length ? areas : ["Other"];
  } catch {
    return ["Other"];
  }
}

function normalizeData(input: unknown, validTeams: string[]): OperatorDefaultsData {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const rawOperators =
    raw.operators && typeof raw.operators === "object" && !Array.isArray(raw.operators)
      ? (raw.operators as Record<string, unknown>)
      : {};

  const operators: Record<string, OperatorDefault> = {};

  for (const [userid, value] of Object.entries(rawOperators)) {
    if (!userid.trim()) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const row = value as Record<string, unknown>;
    const defaultTeam = typeof row.defaultTeam === "string" ? row.defaultTeam.trim() : "";

    if (!defaultTeam || !validTeams.includes(defaultTeam)) continue;

    const name = typeof row.name === "string" ? row.name.trim() : "";

    operators[userid] = {
      ...(name ? { name } : {}),
      defaultTeam,
    };
  }

  return { operators };
}

async function readDefaults(validTeams: string[]): Promise<OperatorDefaultsData> {
  const fromDb = getJsonValue<OperatorDefaultsData>("config", "operator-defaults");
  if (fromDb) {
    return normalizeData(fromDb, validTeams);
  }

  try {
    const raw = await fs.readFile(defaultsFilePath(), "utf-8");
    return normalizeData(JSON.parse(raw), validTeams);
  } catch {
    return { operators: {} };
  }
}

export async function GET() {
  const validTeams = await readValidTeams();
  const data = await readDefaults(validTeams);

  return NextResponse.json({
    ...data,
    validTeams,
  });
}

export async function POST(req: NextRequest) {
  try {
    const validTeams = await readValidTeams();
    const body = await req.json();
    const data = normalizeData(body, validTeams);

    await fs.mkdir(path.dirname(defaultsFilePath()), { recursive: true });
    await fs.writeFile(defaultsFilePath(), JSON.stringify(data, null, 2), "utf-8");
    upsertJsonValue("config", "operator-defaults", data, defaultsFilePath());

    return NextResponse.json({
      status: "saved",
      ...data,
      validTeams,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "save_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
TS

cat > frontend/app/api/reviews/route.ts <<'TS'
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { getJsonValue, upsertJsonValue } from "@/lib/server/db";

const execFileAsync = promisify(execFile);

function reviewFilePath(date: string) {
  return path.join(process.cwd(), "..", "ingest", "config", "reviews", `${date}.json`);
}

function optionsFilePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "options.json");
}

async function readReviewFile(date: string) {
  const fromDb = getJsonValue<Record<string, unknown>>("reviews", date);
  if (fromDb) {
    return fromDb;
  }

  const filePath = reviewFilePath(date);

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {
      date,
      operators: {},
    };
  }
}

async function readOptions() {
  try {
    const raw = await fs.readFile(optionsFilePath(), "utf-8");
    const data = JSON.parse(raw);
    return {
      areas: Array.isArray(data.areas) ? data.areas : [],
      roles: Array.isArray(data.roles) ? data.roles : [],
      reviewStatuses: Array.isArray(data.reviewStatuses) ? data.reviewStatuses : [],
    };
  } catch {
    return {
      areas: [],
      roles: [],
      reviewStatuses: [],
    };
  }
}

async function triggerRebuild(date: string) {
  const repoRoot = path.join(process.cwd(), "..");
  const pythonBin = process.env.PYTHON_BIN || "python3";

  const dailyArgs = [
    "ingest/scripts/rebuild_from_manifest.py",
    "ingest/index",
    date,
    "ingest/config/area_map.json",
    "ingest/config/manual_roles.json",
    "ingest/config/reviews",
    "ingest/config/options.json",
    "ingest/parsed",
    "ingest/derived/daily",
  ];

  const daily = await execFileAsync(pythonBin, dailyArgs, { cwd: repoRoot });

  const weeklyArgs = [
    "ingest/scripts/build_weekly_dashboard.py",
    "ingest/derived/daily",
    date,
    `ingest/derived/weekly/${date}.json`,
  ];

  const weekly = await execFileAsync(pythonBin, weeklyArgs, { cwd: repoRoot });

  return {
    daily: {
      status: "rebuilt",
      stdout: daily.stdout,
      stderr: daily.stderr,
    },
    weekly: {
      status: "rebuilt",
      stdout: weekly.stdout,
      stderr: weekly.stderr,
    },
  };
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "missing_date" }, { status: 400 });
  }

  const data = await readReviewFile(date);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const date = body?.date;
    const userid = body?.userid;

    if (!date || !userid) {
      return NextResponse.json({ error: "missing_date_or_userid" }, { status: 400 });
    }

    const options = await readOptions();

    if (body.assignedRole && !options.roles.includes(body.assignedRole)) {
      return NextResponse.json(
        { error: "invalid_assigned_role", assignedRole: body.assignedRole },
        { status: 400 }
      );
    }

    if (body.assignedArea && !options.areas.includes(body.assignedArea)) {
      return NextResponse.json(
        { error: "invalid_assigned_area", assignedArea: body.assignedArea },
        { status: 400 }
      );
    }

    if (body.reviewStatus && !options.reviewStatuses.includes(body.reviewStatus)) {
      return NextResponse.json(
        { error: "invalid_review_status", reviewStatus: body.reviewStatus },
        { status: 400 }
      );
    }

    const current = await readReviewFile(date);
    (current as { operators?: Record<string, Record<string, unknown>> }).operators ||= {};
    (current as { operators: Record<string, Record<string, unknown>> }).operators[userid] ||= {};

    const existing = (current as { operators: Record<string, Record<string, unknown>> }).operators[userid];

    const mergedPerformanceOverrides = {
      ...(existing.performanceOverrides || {}),
      ...(body.performanceOverrides || {}),
    };

    if (mergedPerformanceOverrides.forceArea && !options.areas.includes(String(mergedPerformanceOverrides.forceArea))) {
      return NextResponse.json(
        { error: "invalid_force_area", forceArea: mergedPerformanceOverrides.forceArea },
        { status: 400 }
      );
    }

    (current as { operators: Record<string, Record<string, unknown>> }).operators[userid] = {
      ...existing,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.assignedRole !== undefined ? { assignedRole: body.assignedRole } : {}),
      ...(body.assignedArea !== undefined ? { assignedArea: body.assignedArea } : {}),
      ...(body.reviewNotes !== undefined ? { reviewNotes: body.reviewNotes } : {}),
      ...(body.reviewStatus !== undefined ? { reviewStatus: body.reviewStatus } : {}),
      auditOverrides: {
        ...(existing.auditOverrides || {}),
        ...(body.auditOverrides || {}),
      },
      performanceOverrides: mergedPerformanceOverrides,
    };

    const filePath = reviewFilePath(date);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(current, null, 2), "utf-8");
    upsertJsonValue("reviews", date, current, filePath);

    const rebuild = await triggerRebuild(date);

    return NextResponse.json({
      status: "saved",
      date,
      userid,
      operator: (current as { operators: Record<string, Record<string, unknown>> }).operators[userid],
      rebuild,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "save_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
TS

python3 - <<'PY'
from pathlib import Path

files = [
    Path('ingest/scripts/build_daily_dashboard.py'),
    Path('ingest/scripts/build_weekly_dashboard.py'),
    Path('ingest/scripts/ingest_manifest.py'),
]

# build_daily_dashboard.py
p = files[0]
s = p.read_text()
if 'from db_sqlite import connect, upsert_dataset_component, upsert_snapshot\n' not in s:
    s = s.replace('from review_overrides import load_review_overrides, get_operator_override\n', 'from review_overrides import load_review_overrides, get_operator_override\nfrom db_sqlite import connect, upsert_dataset_component, upsert_snapshot\n')
old = '    save_json(output_path, payload)\n'
new = '    save_json(output_path, payload)\n\n    conn = connect()\n    try:\n        upsert_snapshot(conn, "daily", report_date, payload, source_path=output_path)\n        upsert_dataset_component(\n            conn,\n            business_date=report_date,\n            component_type="daily",\n            status="ready",\n            source_path=output_path,\n            details={"date": report_date},\n        )\n    finally:\n        conn.close()\n'
s = s.replace(old, new)
p.write_text(s)

# build_weekly_dashboard.py
p = files[1]
s = p.read_text()
if 'from db_sqlite import connect, upsert_dataset_component, upsert_snapshot\n' not in s:
    s = s.replace('from common import load_json, save_json\n', 'from common import load_json, save_json\nfrom db_sqlite import connect, upsert_dataset_component, upsert_snapshot\n')
old = '    save_json(output_path, payload)\n'
new = '    save_json(output_path, payload)\n\n    conn = connect()\n    try:\n        upsert_snapshot(conn, "weekly", week_start, payload, source_path=output_path)\n        upsert_dataset_component(\n            conn,\n            business_date=week_start,\n            component_type="weekly",\n            status="ready",\n            source_path=output_path,\n            details={"weekStart": week_start, "sourceDates": payload.get("sourceDates", [])},\n        )\n    finally:\n        conn.close()\n'
s = s.replace(old, new)
p.write_text(s)

# ingest_manifest.py
p = files[2]
s = p.read_text()
if 'from db_sqlite import connect, record_upload\n' not in s:
    s = s.replace('from typing import Any\n', 'from typing import Any\n\nfrom db_sqlite import connect, record_upload\n')
old_dup = '''        manifest["updatedAt"] = utc_now_iso()\n        save_json(mpath, manifest)\n        return {\n            "status": "duplicate",\n            "date": business_date,\n            "reportType": report_type,\n            "activeRun": report_entry.get("activeRun"),\n            "matchedRunId": existing_same_checksum["runId"],\n            "checksum": checksum,\n            "manifestPath": str(mpath),\n        }\n'''
new_dup = '''        manifest["updatedAt"] = utc_now_iso()\n        save_json(mpath, manifest)\n\n        conn = connect()\n        try:\n            record_upload(\n                conn,\n                business_date=business_date,\n                report_type=report_type,\n                source_path=source,\n                checksum=checksum,\n                size_bytes=size,\n                status="duplicate",\n                run_id=existing_same_checksum.get("runId"),\n                duplicate_of_run_id=existing_same_checksum.get("runId"),\n                manifest_path=mpath,\n                details={"activeRun": report_entry.get("activeRun")},\n            )\n        finally:\n            conn.close()\n\n        return {\n            "status": "duplicate",\n            "date": business_date,\n            "reportType": report_type,\n            "activeRun": report_entry.get("activeRun"),\n            "matchedRunId": existing_same_checksum["runId"],\n            "checksum": checksum,\n            "manifestPath": str(mpath),\n        }\n'''
s = s.replace(old_dup, new_dup)
old_reg = '''    report_entry["runs"].append(new_run)\n    report_entry["activeRun"] = run_id\n    manifest["updatedAt"] = utc_now_iso()\n    save_json(mpath, manifest)\n\n    return {\n        "status": "registered",\n        "date": business_date,\n        "reportType": report_type,\n        "activeRun": run_id,\n        "checksum": checksum,\n        "manifestPath": str(mpath),\n    }\n'''
new_reg = '''    report_entry["runs"].append(new_run)\n    report_entry["activeRun"] = run_id\n    manifest["updatedAt"] = utc_now_iso()\n    save_json(mpath, manifest)\n\n    conn = connect()\n    try:\n        record_upload(\n            conn,\n            business_date=business_date,\n            report_type=report_type,\n            source_path=source,\n            checksum=checksum,\n            size_bytes=size,\n            status="registered",\n            run_id=run_id,\n            manifest_path=mpath,\n            details={"activeRun": run_id},\n        )\n    finally:\n        conn.close()\n\n    return {\n        "status": "registered",\n        "date": business_date,\n        "reportType": report_type,\n        "activeRun": run_id,\n        "checksum": checksum,\n        "manifestPath": str(mpath),\n    }\n'''
s = s.replace(old_reg, new_reg)
p.write_text(s)
PY

echo 'Patch files written.'
