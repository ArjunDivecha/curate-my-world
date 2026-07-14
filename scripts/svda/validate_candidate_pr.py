#!/usr/bin/env python3
"""Validate an SVDA candidate PR against its base branch.

The JSON schema checks shape. This validator enforces cross-file and operational
rules that JSON Schema cannot express: fetched-page evidence, runner caps,
registry cutoffs, and append-only registry changes.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
CANDIDATE_DIR = ROOT / "data" / "venue-candidates"
REGISTRY_PATH = ROOT / "data" / "venue-registry.json"
MAX_CANDIDATES = 5
MAX_SESSION_MINUTES = 7
MAX_COST_USD = 3


class ValidationError(Exception):
    """Raised when an SVDA artifact violates the repository contract."""


def canonical_domain(value: str) -> str:
    text = value.strip().lower()
    parsed = urlparse(text if "://" in text else f"https://{text}")
    host = parsed.netloc.split("@")[-1].split(":")[0]
    return host.removeprefix("www.")


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def validate_candidate_document(document: dict[str, Any]) -> list[dict[str, Any]]:
    errors: list[str] = []
    candidates = document.get("candidates_proposed")
    if not isinstance(candidates, list):
        raise ValidationError("candidates_proposed must be an array")

    if len(candidates) > MAX_CANDIDATES:
        errors.append(f"candidate cap exceeded: {len(candidates)} > {MAX_CANDIDATES}")
    duration = document.get("session_duration_minutes")
    if not isinstance(duration, (int, float)) or duration > MAX_SESSION_MINUTES:
        errors.append(f"session duration exceeds {MAX_SESSION_MINUTES} minutes: {duration!r}")
    cost = document.get("total_cost_usd")
    if not isinstance(cost, (int, float)) or cost > MAX_COST_USD:
        errors.append(f"cost exceeds ${MAX_COST_USD:.2f}: {cost!r}")

    proposed_rows: list[dict[str, Any]] = []
    for index, candidate in enumerate(candidates, start=1):
        label = candidate.get("id") or f"candidate #{index}"
        fetched = candidate.get("event_page_fetched")
        if not isinstance(fetched, bool):
            errors.append(f"{label}: event_page_fetched must be an explicit boolean")

        if not candidate.get("registry_row_proposed"):
            continue
        proposed_rows.append(candidate)
        if fetched is not True:
            errors.append(f"{label}: registry row requires a directly fetched event page")
        if candidate.get("agent_confidence", -1) < 0.70:
            errors.append(f"{label}: agent_confidence is below 0.70")
        if candidate.get("extraction_score", -1) < 0.70:
            errors.append(f"{label}: extraction_score is below 0.70")
        if candidate.get("dedup_status") != "novel":
            errors.append(f"{label}: dedup_status must be novel")
        if candidate.get("monthly_event_estimate", -1) < 3:
            errors.append(f"{label}: monthly_event_estimate is below 3")
        samples = candidate.get("sample_events") or []
        if not samples or any(not all(event.get(key) for key in ("title", "date", "url")) for event in samples):
            errors.append(f"{label}: sample events require title, date, and URL")

    if errors:
        raise ValidationError("\n".join(errors))
    return proposed_rows


def validate_registry_change(
    base_registry: list[dict[str, Any]],
    current_registry: list[dict[str, Any]],
    proposed_candidates: list[dict[str, Any]],
) -> None:
    if current_registry[: len(base_registry)] != base_registry:
        raise ValidationError("existing registry rows changed; SVDA registry edits must be append-only")

    added_rows = current_registry[len(base_registry) :]
    expected_domains = {canonical_domain(item["url"]) for item in proposed_candidates}
    actual_domains = {
        canonical_domain(row.get("domain") or row.get("calendar_url") or row.get("website") or "")
        for row in added_rows
    }
    if len(added_rows) != len(proposed_candidates) or actual_domains != expected_domains:
        raise ValidationError(
            "registry additions do not exactly match candidates marked registry_row_proposed"
        )


def git_output(*args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=ROOT, check=False, capture_output=True, text=True
    )
    if result.returncode:
        raise ValidationError(result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout


def changed_paths(base_ref: str) -> list[str]:
    output = git_output("diff", "--name-only", f"{base_ref}...HEAD")
    return [line.strip() for line in output.splitlines() if line.strip()]


def load_base_registry(base_ref: str) -> list[dict[str, Any]]:
    raw = git_output("show", f"{base_ref}:data/venue-registry.json")
    return json.loads(raw)


def validate_pr(base_ref: str) -> None:
    paths = changed_paths(base_ref)
    candidate_paths = [
        ROOT / path
        for path in paths
        if path.startswith("data/venue-candidates/") and path.endswith("_candidates.json")
    ]
    error_paths = [
        ROOT / path
        for path in paths
        if path.startswith("data/venue-candidates/") and path.endswith("_ERROR.md")
    ]
    registry_changed = "data/venue-registry.json" in paths

    if candidate_paths and error_paths:
        raise ValidationError("a run cannot contain both candidate and ERROR artifacts")
    if len(candidate_paths) + len(error_paths) != 1:
        raise ValidationError("an SVDA PR must contain exactly one candidate or ERROR artifact")
    if error_paths:
        if registry_changed:
            raise ValidationError("failed SVDA runs must not modify the production registry")
        return

    proposed: list[dict[str, Any]] = []
    for path in candidate_paths:
        proposed.extend(validate_candidate_document(load_json(path)))

    base_registry = load_base_registry(base_ref)
    current_registry = load_json(REGISTRY_PATH)
    validate_registry_change(base_registry, current_registry, proposed)
    if bool(proposed) != registry_changed:
        raise ValidationError("registry diff presence does not match proposed registry rows")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-ref", required=True, help="Git ref for the PR base")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        validate_pr(args.base_ref)
    except (ValidationError, json.JSONDecodeError, OSError) as exc:
        print(f"SVDA validation failed:\n{exc}", file=sys.stderr)
        return 1
    print("SVDA candidate PR validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
