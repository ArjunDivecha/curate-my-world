#!/usr/bin/env python3
"""
=============================================================================
SCRIPT NAME: add_venue_registry_strict.py
=============================================================================

INPUT FILES:
- /Users/arjundivecha/Dropbox/AAA Backup/A Working/Curate-My-World Squirtle/data/venue-registry.json
  Existing active venue registry (JSON array).

INPUT ARGUMENTS:
- --url (required): Venue calendar or website URL.
- --category (optional, default: all)
- --name (optional): Override extracted venue name.
- --city (optional): Override extracted city.
- --state (optional, default: CA)
- --source (optional, default: manual_add_strict)
- --update-existing (flag): Allow update when domain already exists.
- --dry-run (flag): Validate and print candidate record without writing.

OUTPUT FILES:
- /Users/arjundivecha/Dropbox/AAA Backup/A Working/Curate-My-World Squirtle/data/venue-registry.json
  Appended or updated with strict validation.

VERSION: 1.0
LAST UPDATED: 2026-02-09
AUTHOR: Assistant

DESCRIPTION:
Adds a venue to the currently used venue registry from a URL. The script extracts
metadata, validates Bay Area city membership, checks duplicates, confirms the URL
is reachable, and writes atomically to avoid corruption.

DEPENDENCIES:
- requests
- beautifulsoup4

USAGE:
python add_venue_registry_strict.py --url "https://example.com/events"
python add_venue_registry_strict.py --url "https://example.com/events" --city "San Francisco" --category music
python add_venue_registry_strict.py --url "https://example.com/events" --update-existing
python add_venue_registry_strict.py --url "https://example.com/events" --dry-run
=============================================================================
"""

from __future__ import annotations

import argparse
import json
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse, urlunparse

import requests
from bs4 import BeautifulSoup

REGISTRY_PATH = Path(
    "/Users/arjundivecha/Dropbox/AAA Backup/A Working/Curate-My-World Squirtle/data/venue-registry.json"
)

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36"
)

ALLOWED_CATEGORIES = {
    "all",
    "music",
    "theatre",
    "comedy",
    "movies",
    "art",
    "food",
    "tech",
    "lectures",
    "kids",
}

# User preference: treat all provided venues as Bay Area venues.
# Keep a light city extractor for convenience, but do not hard-block writes.
CITY_REGEX = re.compile(
    r"\b(San Francisco|Oakland|Berkeley|San Jose|Palo Alto|Mountain View|Sunnyvale|"
    r"Santa Clara|Redwood City|San Mateo|Sausalito|Mill Valley|San Rafael|"
    r"Walnut Creek|Pleasanton|Fremont|Stanford|Santa Cruz|Napa|Sonoma)\b",
    re.IGNORECASE,
)


def fail(msg: str) -> None:
    raise RuntimeError(msg)


def normalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"}:
        fail(f"URL must start with http/https: {url}")
    if not parsed.netloc:
        fail(f"URL missing domain: {url}")
    normalized = parsed._replace(fragment="")
    return urlunparse(normalized)


def normalize_domain(url: str) -> str:
    host = urlparse(url).netloc.lower().strip()
    if host.startswith("www."):
        host = host[4:]
    if not host:
        fail(f"Could not parse domain from URL: {url}")
    return host


def fetch_html(url: str) -> str:
    try:
        resp = requests.get(
            url,
            timeout=20,
            headers={"User-Agent": USER_AGENT},
            allow_redirects=True,
        )
    except requests.RequestException as exc:
        fail(f"Request failed for {url}: {exc}")
    if resp.status_code >= 400:
        fail(f"URL not reachable (HTTP {resp.status_code}): {url}")
    return resp.text


def load_registry(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        fail(f"Registry file not found: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"Registry JSON is invalid: {exc}")
    if not isinstance(data, list):
        fail("Registry JSON must be an array.")
    return data


def atomic_write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        delete=False,
        dir=path.parent,
    ) as tmp:
        json.dump(data, tmp, ensure_ascii=False, indent=2)
        tmp.write("\n")
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)


def extract_jsonld_objects(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for tag in soup.find_all("script", attrs={"type": "application/ld+json"}):
        text = (tag.string or tag.get_text() or "").strip()
        if not text:
            continue
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            out.append(parsed)
        elif isinstance(parsed, list):
            out.extend([x for x in parsed if isinstance(x, dict)])
    return out


def clean_name(name: str) -> str:
    name = re.sub(r"\s+", " ", name).strip()
    for sep in [" | ", " - ", " — ", " :: "]:
        if sep in name:
            name = name.split(sep)[0].strip()
            break
    return name


def extract_name_city(
    soup: BeautifulSoup,
    jsonlds: List[Dict[str, Any]],
) -> Tuple[Optional[str], Optional[str]]:
    name: Optional[str] = None
    city: Optional[str] = None

    for obj in jsonlds:
        n = obj.get("name")
        if not name and isinstance(n, str) and n.strip():
            name = clean_name(n)

        addr = obj.get("address")
        if not city and isinstance(addr, dict):
            c = addr.get("addressLocality")
            if isinstance(c, str) and c.strip():
                city = c.strip()

    if not name:
        og_site = soup.find("meta", attrs={"property": "og:site_name"})
        if og_site and og_site.get("content"):
            name = clean_name(str(og_site["content"]))

    if not name:
        og_title = soup.find("meta", attrs={"property": "og:title"})
        if og_title and og_title.get("content"):
            name = clean_name(str(og_title["content"]))

    if not name and soup.title and soup.title.string:
        name = clean_name(soup.title.string)

    if not city:
        text = soup.get_text(" ", strip=True)
        match = CITY_REGEX.search(text)
        if match:
            city = match.group(1)

    return name, city


def normalize_city(city: Optional[str]) -> Optional[str]:
    if not city:
        return None
    clean = city.strip()
    return clean or None


def validate_category(category: str) -> str:
    normalized = category.strip().lower()
    if normalized not in ALLOWED_CATEGORIES:
        fail(
            f"Invalid category '{category}'. "
            f"Allowed: {sorted(ALLOWED_CATEGORIES)}"
        )
    return normalized


def find_duplicates(
    registry: List[Dict[str, Any]],
    domain: str,
    calendar_url: str,
) -> Tuple[Optional[int], Optional[int]]:
    domain_idx = None
    cal_idx = None
    for i, row in enumerate(registry):
        row_domain = str(row.get("domain", "")).lower().strip()
        row_cal = str(row.get("calendar_url", "")).strip()
        if row_domain == domain:
            domain_idx = i
        if row_cal == calendar_url:
            cal_idx = i
    return domain_idx, cal_idx


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Strict add/update venue-registry entry from URL"
    )
    parser.add_argument("--url", required=True, help="Venue site or calendar URL")
    parser.add_argument("--category", default="all")
    parser.add_argument("--name", default=None)
    parser.add_argument("--city", default=None)
    parser.add_argument("--state", default="CA")
    parser.add_argument("--source", default="manual_add_strict")
    parser.add_argument("--update-existing", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    calendar_url = normalize_url(args.url)
    domain = normalize_domain(calendar_url)
    category = validate_category(args.category)

    html = fetch_html(calendar_url)
    soup = BeautifulSoup(html, "html.parser")
    jsonlds = extract_jsonld_objects(soup)
    extracted_name, extracted_city = extract_name_city(soup, jsonlds)

    name = (args.name or extracted_name or "").strip()
    if not name:
        fail("Venue name could not be inferred. Provide --name explicitly.")

    city = normalize_city(args.city or extracted_city)
    state = (args.state or "CA").strip().upper()

    registry = load_registry(REGISTRY_PATH)
    domain_idx, cal_idx = find_duplicates(registry, domain, calendar_url)

    if cal_idx is not None and domain_idx != cal_idx:
        fail(
            f"calendar_url already exists under a different domain entry (index {cal_idx}). "
            "Resolve conflict manually."
        )

    record = {
        "name": name,
        "domain": domain,
        "category": category,
        "city": city,
        "state": state,
        "website": f"https://{domain}",
        "calendar_url": calendar_url,
        "source": args.source,
        "discovered_at": datetime.now(timezone.utc).isoformat(),
    }

    if domain_idx is not None:
        if not args.update_existing:
            fail(
                f"Domain already exists: {domain}. "
                "Re-run with --update-existing to modify existing record."
            )
        updated = dict(registry[domain_idx])
        updated.update(record)
        registry[domain_idx] = updated
        action = "updated"
    else:
        registry.append(record)
        action = "added"

    if args.dry_run:
        print("[DRY RUN] No file changes written.")
        print(json.dumps(record, indent=2, ensure_ascii=False))
        return

    atomic_write_json(REGISTRY_PATH, registry)
    print(f"Successfully {action} venue in active registry.")
    print(json.dumps(record, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
