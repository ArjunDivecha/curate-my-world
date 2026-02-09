#!/usr/bin/env python3
"""
Apply vetted candidates to data/venue-registry.json using add_venue_registry_strict.py.

Input:
- data/venue-vetting/<date>-results.json (from vet_candidates.py)

Behavior:
- For each candidate with recommendation == "add":
  - choose calendar_url = first suggested_calendar_urls entry (or fallback to website)
  - call add_venue_registry_strict.py with --url, --category, and --name
  - record successes/failures

Output:
- docs/venue-vetting/<date>-applied.md
- data/venue-vetting/<date>-applied.json
"""

from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

PROJECT_ROOT = Path(__file__).resolve().parents[2]
STRICT_ADDER = PROJECT_ROOT / "add_venue_registry_strict.py"
REGISTRY_PATH = PROJECT_ROOT / "data" / "venue-registry.json"
OUT_DOCS = PROJECT_ROOT / "docs" / "venue-vetting"
OUT_DATA = PROJECT_ROOT / "data" / "venue-vetting"


ALLOWED = {"all", "music", "theatre", "comedy", "movies", "art", "food", "tech", "lectures", "kids"}


def map_category(cat: str) -> str:
    c = (cat or "").strip().lower()
    # Normalize a few common alternates coming from external lists.
    if c in {"theater", "theatre"}:
        return "theatre"
    if c in {"university"}:
        return "lectures"
    if c in {"arena", "event_space", "event space", "venue"}:
        return "all"
    if c not in ALLOWED:
        return "all"
    return c


@dataclass
class ApplyResult:
    name: str
    domain: str
    category: str
    website: str
    calendar_url: str
    ok: bool
    stdout: str
    stderr: str


def run_add(name: str, url: str, category: str) -> ApplyResult:
    # We pass --name to keep registry display stable even if title parsing is odd.
    cmd = [
        "python3",
        str(STRICT_ADDER),
        "--url",
        url,
        "--category",
        category,
        "--name",
        name,
    ]
    p = subprocess.run(cmd, capture_output=True, text=True)
    dom = ""
    try:
        from urllib.parse import urlparse

        dom = urlparse(url).netloc.lower().removeprefix("www.")
    except Exception:
        dom = ""
    return ApplyResult(
        name=name,
        domain=dom,
        category=category,
        website=url,
        calendar_url=url,
        ok=p.returncode == 0,
        stdout=p.stdout.strip(),
        stderr=p.stderr.strip(),
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", required=True, help="Path to vet results JSON")
    ap.add_argument("--limit", type=int, default=10_000, help="Max venues to apply")
    args = ap.parse_args()

    results_path = Path(args.results)
    rows: List[Dict[str, Any]] = json.loads(results_path.read_text(encoding="utf-8"))
    to_add = [r for r in rows if r.get("recommendation") == "add"]
    to_add = to_add[: max(0, int(args.limit))]

    applied: List[ApplyResult] = []
    for r in to_add:
        name = (r.get("name") or "").strip()
        website = (r.get("website") or "").strip()
        sug = r.get("suggested_calendar_urls") or []
        url = (sug[0] if sug else website).strip()
        cat = map_category(r.get("category") or "all")
        applied.append(run_add(name, url, cat))

    OUT_DOCS.mkdir(parents=True, exist_ok=True)
    OUT_DATA.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now().strftime("%Y-%m-%d")
    out_json = OUT_DATA / f"{stamp}-applied.json"
    out_md = OUT_DOCS / f"{stamp}-applied.md"

    out_json.write_text(json.dumps([asdict(a) for a in applied], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    ok = [a for a in applied if a.ok]
    fail = [a for a in applied if not a.ok]
    lines: List[str] = []
    lines.append(f"# Applied Vetted Venues ({stamp})")
    lines.append("")
    lines.append(f"- Attempted: {len(applied)}")
    lines.append(f"- Added: {len(ok)}")
    lines.append(f"- Failed: {len(fail)}")
    lines.append("")
    lines.append("## Added")
    lines.append("")
    for a in ok:
        lines.append(f"- {a.name} (`{a.domain}`) -> {a.calendar_url}")
    lines.append("")
    lines.append("## Failed")
    lines.append("")
    for a in fail:
        msg = a.stderr or a.stdout
        msg = (msg.splitlines()[-1] if msg else "").strip()
        lines.append(f"- {a.name} (`{a.domain}`) -> {a.calendar_url} :: {msg}")
    lines.append("")

    out_md.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote: {out_md}")
    print(f"Wrote: {out_json}")


if __name__ == "__main__":
    main()

