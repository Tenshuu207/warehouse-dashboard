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
