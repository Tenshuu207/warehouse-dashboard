from __future__ import annotations

import argparse
import json
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from db_sqlite import DEFAULT_DB_PATH, connect, utc_now_iso
from merge_userls_into_daily import apply_identity_resolution, build_identity_map

REPO_ROOT = Path(__file__).resolve().parents[2]
USERLS_DAILY_DIR = REPO_ROOT / "ingest" / "derived" / "userls_daily"


@dataclass
class BucketTotals:
    label: str
    plates: int = 0
    pieces: int = 0


@dataclass
class UserTotals:
    userid: str
    name: str | None = None
    yearly_repl_plates: int = 0
    yearly_repl_pieces: int = 0
    yearly_receiving_plates: int = 0
    yearly_receiving_pieces: int = 0
    yearly_pick_plates: int = 0
    yearly_pick_pieces: int = 0
    active_dates: set[str] = field(default_factory=set)
    active_weeks: set[str] = field(default_factory=set)
    role_buckets: dict[str, BucketTotals] = field(default_factory=dict)
    area_buckets: dict[str, BucketTotals] = field(default_factory=dict)
    activity_area_buckets: dict[str, BucketTotals] = field(default_factory=dict)


def as_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def safe_share(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return round(numerator / denominator, 4)


def confidence(share: float | None, high: float, medium: float) -> str:
    if share is None:
        return "low"
    if share >= high:
        return "high"
    if share >= medium:
        return "medium"
    return "low"


def week_key(date_key: str) -> str:
    parsed = date.fromisoformat(date_key)
    iso = parsed.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def add_bucket(
    buckets: dict[str, BucketTotals],
    label: str | None,
    plates: int,
    pieces: int,
) -> None:
    if not label or plates <= 0:
        return
    bucket = buckets.setdefault(label, BucketTotals(label=label))
    bucket.plates += plates
    bucket.pieces += pieces


def build_mix(buckets: dict[str, BucketTotals]) -> list[dict[str, Any]]:
    total_plates = sum(bucket.plates for bucket in buckets.values())
    total_pieces = sum(bucket.pieces for bucket in buckets.values())
    rows = [
        {
            "label": bucket.label,
            "plates": bucket.plates,
            "pieces": bucket.pieces,
            "plateShare": safe_share(bucket.plates, total_plates) or 0,
            "pieceShare": safe_share(bucket.pieces, total_pieces),
        }
        for bucket in buckets.values()
    ]
    return sorted(rows, key=lambda row: (-row["plates"], -row["pieces"], row["label"]))


def choose_primary(buckets: dict[str, BucketTotals]) -> tuple[str | None, float | None]:
    rows = build_mix(buckets)
    if not rows:
        return None, None
    top = rows[0]
    return str(top["label"]), float(top["plateShare"])


def load_sqlite_snapshots(year: int, db_path: Path) -> list[dict[str, Any]]:
    conn = connect(db_path)
    rows = conn.execute(
        """
        SELECT date_key, payload_json, source_path
        FROM snapshots
        WHERE snapshot_type = 'userls_daily'
          AND date_key >= ?
          AND date_key <= ?
        ORDER BY date_key
        """,
        (f"{year}-01-01", f"{year}-12-31"),
    ).fetchall()
    conn.close()

    return [
        {
            "dateKey": row["date_key"],
            "payload": json.loads(row["payload_json"]),
            "sourcePath": row["source_path"],
            "source": "sqlite:snapshots.userls_daily",
        }
        for row in rows
    ]


def load_file_snapshots(year: int) -> list[dict[str, Any]]:
    rows = []
    for path in sorted(USERLS_DAILY_DIR.glob(f"{year}-*.json")):
        rows.append(
            {
                "dateKey": path.stem,
                "payload": json.loads(path.read_text(encoding="utf-8")),
                "sourcePath": str(path),
                "source": "json:ingest/derived/userls_daily",
            }
        )
    return rows


def load_source_rows(year: int, db_path: Path, source: str) -> list[dict[str, Any]]:
    if source in {"auto", "sqlite"}:
        rows = load_sqlite_snapshots(year, db_path)
        if rows or source == "sqlite":
            return rows
    return load_file_snapshots(year)


def aggregate_rows(source_rows: list[dict[str, Any]], year: int) -> list[dict[str, Any]]:
    users: dict[str, UserTotals] = {}
    identity_map = build_identity_map()

    for source_row in source_rows:
        date_key = str(source_row["dateKey"])
        week = week_key(date_key)
        payload = source_row["payload"]

        for user in payload.get("users", []) or []:
            userid = str(user.get("userid") or "").strip()
            if not userid:
                continue

            totals = users.setdefault(userid, UserTotals(userid=userid))
            if user.get("name"):
                totals.name = str(user.get("name"))

            repl_plates = as_int(user.get("replenishmentNoRecvPlates"))
            repl_pieces = as_int(user.get("replenishmentNoRecvPieces"))
            receiving_plates = as_int(user.get("receivingPlates"))
            receiving_pieces = as_int(user.get("receivingPieces"))
            pick_plates = as_int(user.get("pickPlates"))
            pick_pieces = as_int(user.get("pickPieces"))

            totals.yearly_repl_plates += repl_plates
            totals.yearly_repl_pieces += repl_pieces
            totals.yearly_receiving_plates += receiving_plates
            totals.yearly_receiving_pieces += receiving_pieces
            totals.yearly_pick_plates += pick_plates
            totals.yearly_pick_pieces += pick_pieces

            if repl_plates or receiving_plates or pick_plates:
                totals.active_dates.add(date_key)
                totals.active_weeks.add(week)

            for bucket in user.get("roleBuckets", []) or []:
                add_bucket(
                    totals.role_buckets,
                    bucket.get("role"),
                    as_int(bucket.get("replenishmentNoRecvPlates")),
                    as_int(bucket.get("replenishmentNoRecvPieces")),
                )

            for bucket in user.get("areaBuckets", []) or []:
                add_bucket(
                    totals.area_buckets,
                    bucket.get("areaCode"),
                    as_int(bucket.get("replenishmentNoRecvPlates")),
                    as_int(bucket.get("replenishmentNoRecvPieces")),
                )
                add_bucket(
                    totals.activity_area_buckets,
                    bucket.get("areaCode"),
                    as_int(bucket.get("nonPickAllPlates")),
                    as_int(bucket.get("nonPickAllPieces")),
                )

    source_counts = defaultdict(int)
    for source_row in source_rows:
        source_counts[source_row["source"]] += 1

    first_date = source_rows[0]["dateKey"] if source_rows else None
    last_date = source_rows[-1]["dateKey"] if source_rows else None

    output_rows: list[dict[str, Any]] = []
    updated_at = utc_now_iso()

    for totals in users.values():
        identity_row = {"userid": totals.userid, "name": totals.name}
        apply_identity_resolution(identity_row, identity_map)

        role_mix = build_mix(totals.role_buckets)
        area_mix = build_mix(totals.area_buckets)
        primary_role, primary_role_share = choose_primary(totals.role_buckets)
        primary_area, primary_area_share = choose_primary(totals.area_buckets)
        primary_activity_area, _ = choose_primary(totals.activity_area_buckets)

        role_confidence = confidence(primary_role_share, high=0.70, medium=0.55)
        area_confidence = confidence(primary_area_share, high=0.65, medium=0.50)
        review_flag = (
            (primary_role_share is None or primary_role_share < 0.55)
            or (primary_area_share is None or primary_area_share < 0.50)
            or totals.yearly_repl_plates < 500
            or len(totals.active_weeks) < 8
            or not primary_role
            or not primary_area
        )

        output_rows.append(
            {
                "year": year,
                "userid": totals.userid,
                "name": identity_row.get("name") or totals.name,
                "primaryRole": primary_role,
                "primaryRoleShare": primary_role_share,
                "primaryArea": primary_area,
                "primaryAreaShare": primary_area_share,
                "primaryActivityArea": primary_activity_area,
                "yearlyReplPlates": totals.yearly_repl_plates,
                "yearlyReplPieces": totals.yearly_repl_pieces,
                "yearlyReceivingPlates": totals.yearly_receiving_plates,
                "yearlyReceivingPieces": totals.yearly_receiving_pieces,
                "yearlyPickPlates": totals.yearly_pick_plates,
                "yearlyPickPieces": totals.yearly_pick_pieces,
                "activeDays": len(totals.active_dates),
                "activeWeeks": len(totals.active_weeks),
                "roleConfidence": role_confidence,
                "areaConfidence": area_confidence,
                "reviewFlag": review_flag,
                "roleMixJson": role_mix,
                "areaMixJson": area_mix,
                "sourceSummaryJson": {
                    "sourceCounts": dict(source_counts),
                    "sourceDateCount": len(source_rows),
                    "firstDate": first_date,
                    "lastDate": last_date,
                    "activeDays": len(totals.active_dates),
                    "activeWeeks": len(totals.active_weeks),
                },
                "updatedAt": updated_at,
            }
        )

    return sorted(
        output_rows,
        key=lambda row: (
            not row["reviewFlag"],
            row["primaryRoleShare"] if row["primaryRoleShare"] is not None else -1,
            -row["yearlyReplPlates"],
            row["userid"],
        ),
    )


def persist_rows(rows: list[dict[str, Any]], year: int, db_path: Path) -> None:
    conn = connect(db_path)
    with conn:
        conn.execute("DELETE FROM historical_role_alignment WHERE year = ?", (year,))
        conn.executemany(
            """
            INSERT INTO historical_role_alignment (
                year, userid, name, primary_role, primary_role_share,
                primary_area, primary_area_share, primary_activity_area,
                yearly_repl_plates, yearly_repl_pieces,
                yearly_receiving_plates, yearly_receiving_pieces,
                yearly_pick_plates, yearly_pick_pieces,
                active_days, active_weeks, role_confidence, area_confidence,
                review_flag, role_mix_json, area_mix_json, source_summary_json, updated_at
            ) VALUES (
                :year, :userid, :name, :primaryRole, :primaryRoleShare,
                :primaryArea, :primaryAreaShare, :primaryActivityArea,
                :yearlyReplPlates, :yearlyReplPieces,
                :yearlyReceivingPlates, :yearlyReceivingPieces,
                :yearlyPickPlates, :yearlyPickPieces,
                :activeDays, :activeWeeks, :roleConfidence, :areaConfidence,
                :reviewFlag, :roleMixJson, :areaMixJson, :sourceSummaryJson, :updatedAt
            )
            """,
            [
                {
                    **row,
                    "reviewFlag": 1 if row["reviewFlag"] else 0,
                    "roleMixJson": json.dumps(row["roleMixJson"], separators=(",", ":")),
                    "areaMixJson": json.dumps(row["areaMixJson"], separators=(",", ":")),
                    "sourceSummaryJson": json.dumps(
                        row["sourceSummaryJson"], separators=(",", ":")
                    ),
                }
                for row in rows
            ],
        )
    conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build yearly historical role alignment from imported UserLS daily summaries."
    )
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH))
    parser.add_argument("--source", choices=["auto", "sqlite", "files"], default="auto")
    args = parser.parse_args()

    source_rows = load_source_rows(args.year, Path(args.db_path), args.source)
    rows = aggregate_rows(source_rows, args.year)
    persist_rows(rows, args.year, Path(args.db_path))

    print(
        json.dumps(
            {
                "year": args.year,
                "sourceDateCount": len(source_rows),
                "operatorCount": len(rows),
                "reviewFlagCount": sum(1 for row in rows if row["reviewFlag"]),
                "dbPath": str(args.db_path),
                "source": source_rows[0]["source"] if source_rows else None,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
