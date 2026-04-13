from __future__ import annotations

import json
import subprocess  # nosec B404
import sys
from pathlib import Path

from ingest_manifest import register_ingest

DAILY_DEPENDENCIES = {"b_forkl2", "rf2_forkstdl"}


def run_cmd(cmd: list[str]) -> dict:
    if not cmd or any(not isinstance(part, str) for part in cmd):
        raise ValueError("cmd must be a non-empty list[str]")
    result = subprocess.run(  # nosec B603 - trusted internal command list
        cmd,
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


def main(
    index_dir: str,
    business_date: str,
    report_type: str,
    source_path: str,
    area_map_path: str,
    roles_path: str,
    review_dir: str,
    options_path: str,
    parsed_dir: str,
    derived_daily_dir: str,
    derived_weekly_dir: str,
) -> dict:
    registration = register_ingest(index_dir, business_date, report_type, source_path)

    result = {
        "registration": registration,
        "dailyRebuild": None,
        "weeklyRebuild": None,
    }

    if registration["status"] == "duplicate":
        result["dailyRebuild"] = {
            "status": "skipped",
            "reason": "duplicate_ingest",
        }
        result["weeklyRebuild"] = {
            "status": "skipped",
            "reason": "duplicate_ingest",
        }
        return result

    if report_type not in DAILY_DEPENDENCIES:
        result["dailyRebuild"] = {
            "status": "skipped",
            "reason": f"{report_type} does not trigger dashboard rebuild",
        }
        result["weeklyRebuild"] = {
            "status": "skipped",
            "reason": f"{report_type} does not trigger dashboard rebuild",
        }
        return result

    daily_cmd = [
        sys.executable,
        "ingest/scripts/rebuild_from_manifest.py",
        index_dir,
        business_date,
        area_map_path,
        roles_path,
        review_dir,
        options_path,
        parsed_dir,
        derived_daily_dir,
    ]
    daily = run_cmd(daily_cmd)

    if daily["returncode"] != 0:
        result["dailyRebuild"] = {
            "status": "failed",
            "details": daily,
        }
        result["weeklyRebuild"] = {
            "status": "skipped",
            "reason": "daily_rebuild_failed",
        }
        return result

    result["dailyRebuild"] = {
        "status": "rebuilt",
        "details": daily,
    }

    weekly_cmd = [
        sys.executable,
        "ingest/scripts/build_weekly_dashboard.py",
        derived_daily_dir,
        business_date,
        str(Path(derived_weekly_dir) / f"{business_date}.json"),
    ]
    weekly = run_cmd(weekly_cmd)

    if weekly["returncode"] != 0:
        result["weeklyRebuild"] = {
            "status": "failed",
            "details": weekly,
        }
        return result

    result["weeklyRebuild"] = {
        "status": "rebuilt",
        "details": weekly,
    }

    return result


if __name__ == "__main__":
    if len(sys.argv) != 12:
        print(
            "Usage: python3 register_and_rebuild.py "
            "<index_dir> <business_date> <report_type> <source_path> "
            "<area_map_json> <manual_roles_json> <review_dir> <options_json> <parsed_dir> <derived_daily_dir> <derived_weekly_dir>"
        )
        raise SystemExit(1)

    output = main(
        index_dir=sys.argv[1],
        business_date=sys.argv[2],
        report_type=sys.argv[3],
        source_path=sys.argv[4],
        area_map_path=sys.argv[5],
        roles_path=sys.argv[6],
        review_dir=sys.argv[7],
        options_path=sys.argv[8],
        parsed_dir=sys.argv[9],
        derived_daily_dir=sys.argv[10],
        derived_weekly_dir=sys.argv[11],
    )
    print(json.dumps(output, indent=2))
