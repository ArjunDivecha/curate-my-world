#!/usr/bin/env python3
"""
=============================================================================
SCRIPT NAME: merge_candidates.py
=============================================================================

DESCRIPTION:
    Merges one or more CSV candidate lists (e.g. from multiple venue-
    discovery scraping runs) into a single deduplicated CSV. Dedup is by
    normalized domain (lowercased, leading "www." stripped). On conflicts
    the strategy is deliberately simple: "latest wins" — the last input
    file's row for a given domain overwrites all earlier ones. Output
    rows are sorted alphabetically by normalized domain for readability.

INPUT FILES:
    (CLI positional arguments — one or more CSV paths)
    Each input CSV must contain columns: category, name, website, notes.
        category: venue category label (defaults to "all" if missing)
        name: venue name (rows without name are skipped)
        website: venue URL (rows without website are skipped)
        notes: free-text notes about the venue

OUTPUT FILES:
    (CLI argument --out <path>)
    CSV written with the same columns (category, name, website, notes)
    containing the deduplicated, sorted result rows.

VERSION: 1.0
LAST UPDATED: 2026-06-05
AUTHOR: Arjun Divecha

DEPENDENCIES:
    - (none beyond Python stdlib: argparse, csv, dataclasses, pathlib,
      typing, urllib.parse)

USAGE:
    python merge_candidates.py --out output.csv input1.csv [input2.csv ...]

NOTES:
    - All paths are specified at runtime via CLI arguments; there are no
      hardcoded file paths in this script.
    - Rows missing both name and website are silently skipped.
    - The "latest wins" rule means order of input files matters: put
      more authoritative sources last if they should take precedence.
=============================================================================
"""

from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional
from urllib.parse import urlparse


def norm_domain(website: str) -> str:
    host = urlparse((website or "").strip()).netloc.lower().strip()
    if host.startswith("www."):
        host = host[4:]
    return host


@dataclass
class Row:
    category: str
    name: str
    website: str
    notes: str

    @staticmethod
    def from_dict(d: Dict[str, str]) -> "Row":
        return Row(
            category=(d.get("category") or "all").strip(),
            name=(d.get("name") or "").strip(),
            website=(d.get("website") or "").strip(),
            notes=(d.get("notes") or "").strip(),
        )

    def to_dict(self) -> Dict[str, str]:
        return {
            "category": self.category,
            "name": self.name,
            "website": self.website,
            "notes": self.notes,
        }


def read_csv(path: Path) -> List[Row]:
    rows: List[Row] = []
    with path.open("r", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for d in r:
            row = Row.from_dict(d)
            if not row.name or not row.website:
                continue
            rows.append(row)
    return rows


def write_csv(path: Path, rows: List[Row]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["category", "name", "website", "notes"])
        w.writeheader()
        for row in rows:
            w.writerow(row.to_dict())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="Output CSV path")
    ap.add_argument("inputs", nargs="+", help="Input CSV files")
    args = ap.parse_args()

    merged: Dict[str, Row] = {}
    order: List[str] = []
    for inp in args.inputs:
        p = Path(inp)
        for row in read_csv(p):
            d = norm_domain(row.website)
            if not d:
                continue
            if d not in merged:
                order.append(d)
            merged[d] = row  # latest wins

    # Stable order, then alpha by domain for readability.
    rows = [merged[d] for d in sorted(set(order))]
    rows.sort(key=lambda r: norm_domain(r.website))
    write_csv(Path(args.out), rows)
    print(f"Wrote {len(rows)} deduped candidates to {args.out}")


if __name__ == "__main__":
    main()

