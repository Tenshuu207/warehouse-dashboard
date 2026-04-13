from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from db_sqlite import connect, record_upload, upsert_dataset_component


REPORT_TYPES = {"b_forkl2", "rf2_forkstdl", "rf2_userls"}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sha256_file(path: str | Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_json(path: str | Path, default: Any) -> Any:
    p = Path(path)
    if not p.exists():
        return default
    return json.loads(p.read_text(encoding="utf-8"))


def save_json(path: str | Path, data: Any) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def manifest_path(index_dir: str | Path, business_date: str) -> Path:
    return Path(index_dir) / f"{business_date}.json"


def empty_manifest(business_date: str) -> dict[str, Any]:
    return {
        "date": business_date,
        "reports": {},
        "createdAt": utc_now_iso(),
        "updatedAt": utc_now_iso(),
    }


def ensure_report(manifest: dict[str, Any], report_type: str) -> dict[str, Any]:
    if report_type not in REPORT_TYPES:
        raise ValueError(f"Unsupported report type: {report_type}")

    reports = manifest.setdefault("reports", {})
    if report_type not in reports:
        reports[report_type] = {
            "activeRun": None,
            "runs": [],
        }
    return reports[report_type]


def next_run_id(report_entry: dict[str, Any]) -> str:
    runs = report_entry.get("runs", [])
    max_num = 0
    for run in runs:
        run_id = run.get("runId", "")
        if run_id.startswith("run-"):
            try:
                max_num = max(max_num, int(run_id.split("-", 1)[1]))
            except ValueError:
                pass
    return f"run-{max_num + 1:03d}"


def register_ingest(
    index_dir: str | Path,
    business_date: str,
    report_type: str,
    source_path: str | Path,
) -> dict[str, Any]:
    source = Path(source_path)
    if not source.exists():
        raise FileNotFoundError(f"Source file not found: {source}")

    checksum = sha256_file(source)
    size = source.stat().st_size

    mpath = manifest_path(index_dir, business_date)
    manifest = load_json(mpath, empty_manifest(business_date))
    report_entry = ensure_report(manifest, report_type)

    existing_same_checksum = None
    for run in report_entry["runs"]:
        if run.get("checksum") == checksum:
            existing_same_checksum = run
            break

    if existing_same_checksum:
        manifest["updatedAt"] = utc_now_iso()
        save_json(mpath, manifest)

        conn = connect()
        try:
            record_upload(
                conn,
                business_date=business_date,
                report_type=report_type,
                source_path=source,
                checksum=checksum,
                size_bytes=size,
                status="duplicate",
                run_id=existing_same_checksum.get("runId"),
                duplicate_of_run_id=existing_same_checksum.get("runId"),
                manifest_path=mpath,
                details={"activeRun": report_entry.get("activeRun")},
            )
            upsert_dataset_component(
                conn,
                business_date=business_date,
                component_type=report_type,
                status="ready",
                source_path=existing_same_checksum.get("sourcePath") or source,
                details={
                    "runId": existing_same_checksum.get("runId"),
                    "activeRun": report_entry.get("activeRun"),
                    "kind": "raw_upload",
                    "duplicate": True,
                },
            )
        finally:
            conn.close()

        return {
            "status": "duplicate",
            "date": business_date,
            "reportType": report_type,
            "activeRun": report_entry.get("activeRun"),
            "matchedRunId": existing_same_checksum["runId"],
            "checksum": checksum,
            "manifestPath": str(mpath),
        }

    run_id = next_run_id(report_entry)

    if report_entry.get("activeRun"):
        for run in report_entry["runs"]:
            if run.get("runId") == report_entry["activeRun"] and run.get("status") == "active":
                run["status"] = "superseded"

    new_run = {
        "runId": run_id,
        "status": "active",
        "checksum": checksum,
        "size": size,
        "sourcePath": str(source),
        "ingestedAt": utc_now_iso(),
        "duplicateOf": None,
    }

    report_entry["runs"].append(new_run)
    report_entry["activeRun"] = run_id
    manifest["updatedAt"] = utc_now_iso()
    save_json(mpath, manifest)

    conn = connect()
    try:
        record_upload(
            conn,
            business_date=business_date,
            report_type=report_type,
            source_path=source,
            checksum=checksum,
            size_bytes=size,
            status="registered",
            run_id=run_id,
            manifest_path=mpath,
            details={"activeRun": run_id},
        )
        upsert_dataset_component(
            conn,
            business_date=business_date,
            component_type=report_type,
            status="ready",
            source_path=source,
            details={
                "runId": run_id,
                "activeRun": run_id,
                "kind": "raw_upload",
                "duplicate": False,
            },
        )
    finally:
        conn.close()

    return {
        "status": "registered",
        "date": business_date,
        "reportType": report_type,
        "activeRun": run_id,
        "checksum": checksum,
        "manifestPath": str(mpath),
    }


def get_active_run(index_dir: str | Path, business_date: str, report_type: str) -> dict[str, Any] | None:
    mpath = manifest_path(index_dir, business_date)
    manifest = load_json(mpath, None)
    if not manifest:
        return None

    report_entry = manifest.get("reports", {}).get(report_type)
    if not report_entry:
        return None

    active_run = report_entry.get("activeRun")
    if not active_run:
        return None

    for run in report_entry.get("runs", []):
        if run.get("runId") == active_run:
            return run

    return None


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 5:
        print("Usage: python3 ingest_manifest.py <index_dir> <business_date> <report_type> <source_path>")
        raise SystemExit(1)

    result = register_ingest(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
    print(json.dumps(result, indent=2))
