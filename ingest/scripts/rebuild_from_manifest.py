from __future__ import annotations

import json
import subprocess  # nosec B404
import sys
from typing import Any
from pathlib import Path

from ingest_manifest import get_active_run, load_json, save_json

REQUIRED_FOR_DAILY = ["b_forkl2", "rf2_forkstdl"]


def run_cmd(cmd: list[str]) -> None:
    if not cmd or any(not isinstance(part, str) for part in cmd):
        raise ValueError("cmd must be a non-empty list[str]")
    result = subprocess.run(  # nosec B603 - trusted internal command list
        cmd,
        check=False,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}")


def ensure_parent(path: str | Path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)


def manifest_path(index_dir: str | Path, business_date: str) -> Path:
    return Path(index_dir) / f"{business_date}.json"


def build_daily_from_manifest(
    index_dir: str,
    business_date: str,
    area_map_path: str,
    roles_path: str,
    review_dir: str,
    options_path: str,
    parsed_dir: str,
    derived_daily_dir: str,
) -> dict:
    manifest_file = manifest_path(index_dir, business_date)
    manifest = load_json(manifest_file, None)
    if not manifest:
        raise FileNotFoundError(f"Manifest not found: {manifest_file}")

    active: dict[str, dict[str, Any] | None] = {}
    for report_type in ["b_forkl2", "rf2_forkstdl", "rf2_userls"]:
        active[report_type] = get_active_run(index_dir, business_date, report_type)

    missing = [r for r in REQUIRED_FOR_DAILY if not active.get(r)]
    if missing:
        return {
            "status": "skipped",
            "date": business_date,
            "reason": "missing_required_reports",
            "missingReports": missing,
        }

    b_run = active["b_forkl2"]
    f_run = active["rf2_forkstdl"]
    userls_run = active.get("rf2_userls")

    if b_run is None or f_run is None:
        raise RuntimeError("Required active runs missing after validation")

    parsed_b = Path(parsed_dir) / f"b_forkl2_{business_date}.json"
    parsed_f = Path(parsed_dir) / f"rf2_forkstdl_{business_date}.json"
    daily_out = Path(derived_daily_dir) / f"{business_date}.json"

    ensure_parent(parsed_b)
    ensure_parent(parsed_f)
    ensure_parent(daily_out)

    run_cmd(
        [
            sys.executable,
            "ingest/scripts/parse_b_forkl2.py",
            b_run["sourcePath"],
            str(parsed_b),
        ]
    )

    run_cmd(
        [
            sys.executable,
            "ingest/scripts/parse_rf2_forkstdl.py",
            f_run["sourcePath"],
            area_map_path,
            str(parsed_f),
        ]
    )

    run_cmd(
        [
            sys.executable,
            "ingest/scripts/build_daily_dashboard.py",
            str(parsed_b),
            str(parsed_f),
            roles_path,
            review_dir,
            options_path,
            str(daily_out),
        ]
    )

    daily = load_json(daily_out, {})
    daily["sourceRuns"] = {
        "b_forkl2": b_run["runId"],
        "rf2_forkstdl": f_run["runId"],
        "rf2_userls": userls_run["runId"] if userls_run else None,
    }
    daily["sourcePaths"] = {
        "b_forkl2": b_run["sourcePath"],
        "rf2_forkstdl": f_run["sourcePath"],
        "rf2_userls": userls_run["sourcePath"] if userls_run else None,
    }
    save_json(daily_out, daily)

    return {
        "status": "rebuilt",
        "date": business_date,
        "dailyOutput": str(daily_out),
        "sourceRuns": daily["sourceRuns"],
    }


def build_weekly_if_possible(
    derived_daily_dir: str,
    week_start: str,
    derived_weekly_dir: str,
) -> dict:
    weekly_out = Path(derived_weekly_dir) / f"{week_start}.json"
    ensure_parent(weekly_out)

    run_cmd(
        [
            sys.executable,
            "ingest/scripts/build_weekly_dashboard.py",
            derived_daily_dir,
            week_start,
            str(weekly_out),
        ]
    )

    weekly = load_json(weekly_out, {})
    return {
        "status": "rebuilt",
        "weekStart": week_start,
        "weeklyOutput": str(weekly_out),
        "sourceDates": weekly.get("sourceDates", []),
    }


if __name__ == "__main__":
    if len(sys.argv) != 9:
        print(
            "Usage: python3 rebuild_from_manifest.py "
            "<index_dir> <business_date> <area_map_json> <manual_roles_json> <review_dir> <options_json> <parsed_dir> <derived_daily_dir>"
        )
        raise SystemExit(1)

    result = build_daily_from_manifest(
        index_dir=sys.argv[1],
        business_date=sys.argv[2],
        area_map_path=sys.argv[3],
        roles_path=sys.argv[4],
        review_dir=sys.argv[5],
        options_path=sys.argv[6],
        parsed_dir=sys.argv[7],
        derived_daily_dir=sys.argv[8],
    )
    print(json.dumps(result, indent=2))
