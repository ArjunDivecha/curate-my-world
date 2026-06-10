"""
=============================================================================
SCRIPT NAME: geocode_registry.py
=============================================================================

DESCRIPTION:
    Reads a venue registry JSON file (venue-registry.json) containing venue
    names, addresses, and cities, then geocodes each venue that lacks
    lat/lng coordinates by querying the Nominatim (OpenStreetMap) API.
    Uses a geocode cache JSON file to avoid redundant API calls across runs.
    Respects Nominatim rate limits by enforcing a configurable delay between
    requests. Attempts multiple query variants per venue (address-based,
    name+cities, etc.) and retries failed requests up to 3 times with
    exponential backoff. Before writing results, creates a timestamped backup
    of the output file. Writes the updated venue registry and cache back to
    disk periodically during processing and once at completion. Prints
    progress and final summary to stdout.

INPUT FILES:
    /Users/arjundivecha/Dropbox/AAA Backup/A Working/Curate-My-World Squirtle/data/venue-registry.json
        JSON array of venue objects. Each venue may have fields:
        name, address, city, state, coordinates (dict with lat/lng),
        lat, lng. Venues with lat/lng already set are skipped.
        Path can be overridden via --input.
    /Users/arjundivecha/Dropbox/AAA Backup/A Working/Curate-My-World Squirtle/data/geocode-cache.json
        JSON dict mapping query strings to Nominatim result objects
        (lat, lng, display_name, importance). Persisted across runs
        to avoid re-querying the API. Path can be overridden via --cache.

OUTPUT FILES:
    /Users/arjundivecha/Dropbox/AAA Backup/A Working/Curate-My-World Squirtle/data/venue-registry.json
        Updated venue registry with top-level lat, lng, and geocoded_at
        fields added to newly geocoded venues. Path can be overridden via
        --output. A timestamped backup (venue-registry.backup-{ts}.json)
        is written alongside this file before modifications.
    /Users/arjundivecha/Dropbox/AAA Backup/A Working/Curate-My-World Squirtle/data/geocode-cache.json
        Updated geocode cache with newly resolved queries appended.
        Path can be overridden via --cache.

VERSION: 1.0
LAST UPDATED: 2026-06-05
AUTHOR: Arjun Divecha

DEPENDENCIES:
    None (stdlib only: argparse, json, re, sys, time, datetime,
    pathlib, urllib)

USAGE:
    python geocode_registry.py
    python geocode_registry.py --input path/to/venues.json --output path/to/out.json --cache path/to/cache.json
    python geocode_registry.py --max 50 --min-delay 1.1 --retry-none --start 100

NOTES:
    - Requires internet access to reach nominatim.openstreetmap.org.
    - Nominatim usage policy requires a meaningful User-Agent header and
      a minimum delay of 1 second between requests (enforced via
      --min-delay, default 1.1s).
    - The VIEWBOX is hardcoded to the San Francisco Bay Area bounding box
      by default.
    - All relative paths in the code resolve relative to the project root
      (three directories up from this script).
=============================================================================
"""

import argparse
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

PROJECT_ROOT = Path(__file__).parent.parent.parent
DEFAULT_INPUT = PROJECT_ROOT / "data" / "venue-registry.json"
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "venue-registry.json"
DEFAULT_CACHE = PROJECT_ROOT / "data" / "geocode-cache.json"

USER_AGENT = "CurateMyWorld/1.0 (venue geocoding; contact=local)"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
VIEWBOX = "-123.0,38.5,-121.5,36.9"


def load_json(path, default):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=True, indent=2, sort_keys=False)
        f.write("\n")


def clean_name_for_query(name):
    cleaned = (name or "").strip()
    if not cleaned:
        return cleaned

    pattern = r"^(calendar|events|event page|events page)\\s*[-:\u2013\u2014]\\s*"
    cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def build_queries(venue):
    base_name = clean_name_for_query(venue.get("name") or "")
    name_variants = []
    if base_name:
        name_variants.append(base_name)
        if base_name.lower().startswith("the "):
            name_variants.append(base_name[4:])
        for sep in [" - ", " : ", " | "]:
            if sep in base_name:
                parts = [p.strip() for p in base_name.split(sep) if p.strip()]
                if parts:
                    name_variants.append(parts[-1])
    # De-duplicate while preserving order
    name_variants = list(dict.fromkeys(name_variants))

    address = (venue.get("address") or "").strip()
    city = (venue.get("city") or "").strip()
    state = (venue.get("state") or "CA").strip() or "CA"

    queries = []
    if address and city:
        queries.append(f"{address}, {city}, {state}, USA")
    for name in name_variants:
        if city:
            queries.append(f"{name}, {city}, {state}, USA")
        else:
            queries.append(f"{name}, San Francisco Bay Area, {state}, USA")
        queries.append(f"{name}, {state}, USA")
    return list(dict.fromkeys(q for q in queries if q))


def nominatim_search(query, timeout=20):
    params = {
        "q": query,
        "format": "json",
        "limit": 1,
        "addressdetails": 0,
        "countrycodes": "us",
        "viewbox": VIEWBOX,
        "bounded": 1,
    }
    url = f"{NOMINATIM_URL}?{urlencode(params)}"
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=timeout) as resp:
        payload = resp.read().decode("utf-8")
        data = json.loads(payload)
        if not data:
            return None, True
        top = data[0]
        return {
            "lat": float(top["lat"]),
            "lng": float(top["lon"]),
            "display_name": top.get("display_name"),
            "importance": top.get("importance"),
        }, True


def geocode_venues(venues, cache, min_delay, max_items=None, checkpoint_cb=None, retry_none=False, start_index=0):
    updated = 0
    skipped = 0
    failed = 0
    requests_made = 0
    last_request = 0.0

    for idx, venue in enumerate(venues):
        if idx < start_index:
            continue
        if max_items is not None and updated + skipped + failed >= max_items:
            break

        if venue.get("lat") is not None and venue.get("lng") is not None:
            skipped += 1
            continue

        coords = venue.get("coordinates") or {}
        if coords.get("lat") is not None and coords.get("lng") is not None:
            venue["lat"] = coords.get("lat")
            venue["lng"] = coords.get("lng")
            updated += 1
            continue

        queries = build_queries(venue)
        if not queries:
            failed += 1
            continue

        result = None
        for query in queries:
            if query in cache and not (retry_none and cache[query] is None):
                result = cache[query]
            else:
                now = time.time()
                elapsed = now - last_request
                if elapsed < min_delay:
                    time.sleep(min_delay - elapsed)
                result = None
                ok = False
                for attempt in range(1, 4):
                    try:
                        result, ok = nominatim_search(query)
                        requests_made += 1
                        break
                    except Exception:
                        ok = False
                        time.sleep(min_delay * attempt * 2)
                last_request = time.time()
                if ok:
                    cache[query] = result

            if result:
                break

        if result:
            venue["lat"] = result.get("lat")
            venue["lng"] = result.get("lng")
            venue["geocoded_at"] = datetime.utcnow().isoformat() + "Z"
            updated += 1
        else:
            failed += 1

        if (updated + failed + skipped) % 25 == 0:
            print(f"Progress: processed={updated+failed+skipped} updated={updated} failed={failed} skipped={skipped}")
            if checkpoint_cb:
                checkpoint_cb()

    return updated, failed, skipped, requests_made


def main():
    parser = argparse.ArgumentParser(description="Geocode venue registry with Nominatim")
    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--cache", default=str(DEFAULT_CACHE))
    parser.add_argument("--min-delay", type=float, default=1.1)
    parser.add_argument("--max", type=int, default=None, help="Max venues to process")
    parser.add_argument("--start", type=int, default=0, help="Start index in registry")
    parser.add_argument("--retry-none", action="store_true", help="Re-try cached None results")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    cache_path = Path(args.cache)

    venues = load_json(input_path, [])
    cache = load_json(cache_path, {})

    backup_path = output_path.with_name(output_path.stem + f".backup-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.json")
    if output_path.exists() and output_path != backup_path:
        backup_path.write_text(output_path.read_text(encoding="utf-8"), encoding="utf-8")

    def checkpoint():
        save_json(output_path, venues)
        save_json(cache_path, cache)

    updated, failed, skipped, requests_made = geocode_venues(
        venues,
        cache,
        min_delay=args.min_delay,
        max_items=args.max,
        checkpoint_cb=checkpoint,
        retry_none=args.retry_none,
        start_index=args.start,
    )

    save_json(output_path, venues)
    save_json(cache_path, cache)

    print("\nGeocoding complete")
    print(f"Updated: {updated}")
    print(f"Failed: {failed}")
    print(f"Skipped: {skipped}")
    print(f"Requests made: {requests_made}")
    print(f"Output: {output_path}")
    print(f"Cache: {cache_path}")
    print(f"Backup: {backup_path}")


if __name__ == "__main__":
    sys.exit(main())
