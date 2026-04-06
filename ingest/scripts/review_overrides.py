from __future__ import annotations

from pathlib import Path
from typing import Any

from common import load_json


def review_path(review_dir: str | Path, business_date: str) -> Path:
    return Path(review_dir) / f"{business_date}.json"


def load_review_overrides(review_dir: str | Path, business_date: str) -> dict[str, Any]:
    path = review_path(review_dir, business_date)
    if not path.exists():
        return {"date": business_date, "operators": {}}
    data = load_json(path)
    if "operators" not in data:
        data["operators"] = {}
    return data


def get_operator_override(review_data: dict[str, Any], userid: str) -> dict[str, Any]:
    return review_data.get("operators", {}).get(userid, {})
