from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from db_sqlite import connect, upsert_dataset_component
from ingest_manifest import get_active_run

REPO_ROOT = Path(__file__).resolve().parents[2]


def run_cmd(cmd: list[str]) -> dict:
    result = subprocess.run(
        cmd,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
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
    details: dict | None = None,
) -> None:
    upsert_dataset_component(
        conn,
        business_date=business_date,
        component_type=component_type,
        status=status,
        source_path=source_path,
        details=details or {},
    )


def refresh_daily(
    *,
    index_dir: str,
    business_date: str,
    area_map_path: str,
    roles_path: str,
    review_dir: str,
    options_path: str,
    parsed_dir: str,
    derived_daily_dir: str,
    conn,
) -> dict:
    out_path = Path(derived_daily_dir) / f"{business_date}.json"

    result = run_cmd(
        [
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
    )

    if result["returncode"] != 0:
        mark_component(
            conn,
            business_date=business_date,
            component_type="daily",
            status="failed",
            source_path=out_path,
            details={"stage": "daily", "stderr": result["stderr"]},
        )
        return {"status": "failed", "details": result}

    payload = None
    try:
        payload = json.loads(result["stdout"] or "{}")
    except json.JSONDecodeError:
        payload = None

    if payload and payload.get("status") == "skipped":
        mark_component(
            conn,
            business_date=business_date,
            component_type="daily",
            status="missing",
            source_path=out_path,
            details=payload,
        )
        return payload

    if not out_path.exists():
        mark_component(
            conn,
            business_date=business_date,
            component_type="daily",
            status="failed",
            source_path=out_path,
            details={"stage": "daily", "reason": "output_missing"},
        )
        return {"status": "failed", "reason": "daily_output_missing", "details": result}

    mark_component(
        conn,
        business_date=business_date,
        component_type="daily",
        status="ready",
        source_path=out_path,
        details={"stage": "daily"},
    )
    return {"status": "rebuilt", "output": str(out_path), "details": payload}



def refresh_daily_enriched(
    *,
    index_dir: str,
    business_date: str,
    parsed_dir: str,
    derived_daily_dir: str,
    conn,
) -> dict:
    active_userls = get_active_run(index_dir, business_date, "rf2_userls")
    daily_path = Path(derived_daily_dir) / f"{business_date}.json"

    userls_daily_dir = Path(derived_daily_dir).parent / "userls_daily"
    daily_enriched_dir = Path(derived_daily_dir).parent / "daily_enriched"
    parsed_userls_path = Path(parsed_dir) / f"rf2_userls_{business_date}.json"
    userls_daily_path = userls_daily_dir / f"{business_date}.json"
    daily_enriched_path = daily_enriched_dir / f"{business_date}.json"

    has_canonical_parsed = parsed_userls_path.exists()

    if not active_userls and not has_canonical_parsed:
        mark_component(
            conn,
            business_date=business_date,
            component_type="daily_enriched",
            status="missing",
            source_path=daily_enriched_path,
            details={"reason": "no_active_userls_or_canonical_parsed"},
        )
        return {"status": "skipped", "reason": "no_active_userls_or_canonical_parsed"}

    if not daily_path.exists():
        mark_component(
            conn,
            business_date=business_date,
            component_type="daily_enriched",
            status="missing",
            source_path=daily_enriched_path,
            details={"reason": "daily_missing"},
        )
        return {"status": "skipped", "reason": "daily_missing"}

    parsed_userls_path.parent.mkdir(parents=True, exist_ok=True)
    userls_daily_dir.mkdir(parents=True, exist_ok=True)
    daily_enriched_dir.mkdir(parents=True, exist_ok=True)

    steps = []
    source_details: dict[str, str | None] = {
        "sourceMode": "canonical_parsed"
        if has_canonical_parsed and not active_userls
        else "raw_active_userls",
        "userlsSourcePath": active_userls["sourcePath"]
        if active_userls
        else str(parsed_userls_path),
        "runId": active_userls.get("runId") if active_userls else None,
    }

    if active_userls:
        step = run_cmd(
            [
                sys.executable,
                "ingest/scripts/parse_rf2_userls.py",
                active_userls["sourcePath"],
                str(parsed_userls_path),
            ]
        )
        steps.append({"stage": "parse_rf2_userls", **step})
        if step["returncode"] != 0:
            mark_component(
                conn,
                business_date=business_date,
                component_type="daily_enriched",
                status="failed",
                source_path=daily_enriched_path,
                details={"stage": "parse_rf2_userls", "stderr": step["stderr"]},
            )
            return {"status": "failed", "stage": "parse_rf2_userls", "details": steps}
    else:
        steps.append(
            {
                "stage": "parse_rf2_userls",
                "returncode": 0,
                "stdout": "",
                "stderr": "",
                "cmd": None,
                "skipped": True,
                "reason": "using_existing_canonical_parsed",
            }
        )

    step = run_cmd(
        [
            sys.executable,
            "ingest/scripts/build_userls_daily_summary.py",
            str(parsed_userls_path),
            str(userls_daily_path),
        ]
    )
    steps.append({"stage": "build_userls_daily_summary", **step})
    if step["returncode"] != 0:
        mark_component(
            conn,
            business_date=business_date,
            component_type="daily_enriched",
            status="failed",
            source_path=daily_enriched_path,
            details={"stage": "build_userls_daily_summary", "stderr": step["stderr"]},
        )
        return {"status": "failed", "stage": "build_userls_daily_summary", "details": steps}

    step = run_cmd(
        [
            sys.executable,
            "ingest/scripts/merge_userls_into_daily.py",
            str(userls_daily_path),
            str(daily_path),
            str(daily_enriched_path),
        ]
    )
    steps.append({"stage": "merge_userls_into_daily", **step})
    if step["returncode"] != 0:
        mark_component(
            conn,
            business_date=business_date,
            component_type="daily_enriched",
            status="failed",
            source_path=daily_enriched_path,
            details={"stage": "merge_userls_into_daily", "stderr": step["stderr"]},
        )
        return {"status": "failed", "stage": "merge_userls_into_daily", "details": steps}

    mark_component(
        conn,
        business_date=business_date,
        component_type="daily_enriched",
        status="ready",
        source_path=daily_enriched_path,
        details={
            "stage": "daily_enriched",
            **source_details,
        },
    )
    return {
        "status": "rebuilt",
        "output": str(daily_enriched_path),
        "details": steps,
        "source": source_details,
    }

def refresh_weekly(
    *,
    business_date: str,
    derived_daily_dir: str,
    derived_weekly_dir: str,
    conn,
) -> dict:
    out_path = Path(derived_weekly_dir) / f"{business_date}.json"

    result = run_cmd(
        [
            sys.executable,
            "ingest/scripts/build_weekly_dashboard.py",
            derived_daily_dir,
            business_date,
            str(out_path),
        ]
    )

    if result["returncode"] != 0:
        mark_component(
            conn,
            business_date=business_date,
            component_type="weekly",
            status="failed",
            source_path=out_path,
            details={"stage": "weekly", "stderr": result["stderr"]},
        )
        return {"status": "failed", "details": result}

    if not out_path.exists():
        mark_component(
            conn,
            business_date=business_date,
            component_type="weekly",
            status="failed",
            source_path=out_path,
            details={"stage": "weekly", "reason": "output_missing"},
        )
        return {"status": "failed", "reason": "weekly_output_missing", "details": result}

    mark_component(
        conn,
        business_date=business_date,
        component_type="weekly",
        status="ready",
        source_path=out_path,
        details={"stage": "weekly"},
    )
    return {"status": "rebuilt", "output": str(out_path)}


def main(
    index_dir: str,
    business_date: str,
    area_map_path: str,
    roles_path: str,
    review_dir: str,
    options_path: str,
    parsed_dir: str,
    derived_daily_dir: str,
    derived_weekly_dir: str,
) -> dict:
    conn = connect()
    try:
        daily = refresh_daily(
            index_dir=index_dir,
            business_date=business_date,
            area_map_path=area_map_path,
            roles_path=roles_path,
            review_dir=review_dir,
            options_path=options_path,
            parsed_dir=parsed_dir,
            derived_daily_dir=derived_daily_dir,
            conn=conn,
        )

        if daily.get("status") not in {"rebuilt"}:
            return {
                "date": business_date,
                "daily": daily,
                "dailyEnriched": {"status": "skipped", "reason": "daily_not_ready"},
                "weekly": {"status": "skipped", "reason": "daily_not_ready"},
            }

        daily_enriched = refresh_daily_enriched(
            index_dir=index_dir,
            business_date=business_date,
            parsed_dir=parsed_dir,
            derived_daily_dir=derived_daily_dir,
            conn=conn,
        )

        weekly = refresh_weekly(
            business_date=business_date,
            derived_daily_dir=derived_daily_dir,
            derived_weekly_dir=derived_weekly_dir,
            conn=conn,
        )

        return {
            "date": business_date,
            "daily": daily,
            "dailyEnriched": daily_enriched,
            "weekly": weekly,
        }
    finally:
        conn.close()


if __name__ == "__main__":
    if len(sys.argv) != 10:
        print(
            "Usage: python3 refresh_date_pipeline.py "
            "<index_dir> <business_date> <area_map_json> <manual_roles_json> "
            "<review_dir> <options_json> <parsed_dir> <derived_daily_dir> <derived_weekly_dir>"
        )
        raise SystemExit(1)

    result = main(
        index_dir=sys.argv[1],
        business_date=sys.argv[2],
        area_map_path=sys.argv[3],
        roles_path=sys.argv[4],
        review_dir=sys.argv[5],
        options_path=sys.argv[6],
        parsed_dir=sys.argv[7],
        derived_daily_dir=sys.argv[8],
        derived_weekly_dir=sys.argv[9],
    )
    print(json.dumps(result, indent=2))
