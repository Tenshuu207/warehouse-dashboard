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

export function listSnapshotsInRange<T>(
  snapshotType: string,
  startKey: string,
  endKey: string
): Array<{ dateKey: string; payload: T }> {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT date_key, payload_json
        FROM snapshots
        WHERE snapshot_type = ?
          AND date_key >= ?
          AND date_key <= ?
        ORDER BY date_key ASC
      `
    )
    .all(snapshotType, startKey, endKey) as Array<{
      date_key: string;
      payload_json: string;
    }>;

  return rows.map((row) => ({
    dateKey: row.date_key,
    payload: JSON.parse(row.payload_json) as T,
  }));
}

