#!/usr/bin/env python3
"""
=============================================================================
SCRIPT NAME: discover_local.py
=============================================================================

DESCRIPTION:
    Local Venue Discovery Agent (SVDA v3, free-compute window edition).
    End-to-end pipeline that proposes NEW Bay Area event venues for the
    Squirtle registry, with per-candidate evidence so a human can approve
    each venue individually. Nothing here writes to data/venue-registry.json.

    Stages:
      1. SEED     - candidate venues come from (a) parsing the legacy
                    missing_venues_report.md tables and (b) LLM generation
                    via `claude -p` for categories the legacy report is thin
                    on. Seeds are deduped against the live registry by
                    domain and normalized name.
      2. FETCH    - homepage fetched through Jina Reader (same pattern as
                    the production scraper; direct fetches 403 on many
                    venue sites). Best calendar/events URL chosen by
                    heuristic scoring of markdown links + common path
                    guesses; one bounded "latest/current" sub-page follow
                    when the calendar looks like an archive index.
      3. EXTRACT  - `claude -p` extracts structured future events from the
                    calendar markdown. Strict grounding: only events
                    literally present on the page.
      4. VOLUME   - events/month estimated from dated listings actually
                    observed (the July failure mode was estimating volume
                    from vibes). proposed >= 3/mo, borderline 1-3/mo,
                    else rejected with a PRD reason enum.
      5. GEOCODE  - Nominatim lookup (1.1s politeness sleep) for lat/lng.
      6. REPORT   - JSON run artifact (checkpointed after EVERY candidate,
                    atomic writes) + human review Markdown where every
                    candidate gets an approval ID (V01, V02, ...).

INPUT FILES:
    /Users/arjundivecha/Dropbox/AAA Backup/A Working/Curate-My-World Squirtle/data/venue-registry.json
        Existing registry - used ONLY for dedup. Never modified.
    /Users/arjundivecha/Dropbox/AAA Backup/A Working/Curate-My-World Squirtle/missing_venues_report.md
        Legacy Feb-2026 gap analysis; table rows become seeds.
    /Users/arjundivecha/Dropbox/AAA Backup/.env.txt
        Read for JINA_API_KEY (Jina Reader auth). Values never printed.

OUTPUT FILES (under data/venue-candidates/<RUN_ID>/):
    checkpoints.jsonl   - one line per finished candidate (crash-safe)
    candidates.json     - full run artifact, atomically rewritten as
                          candidates complete
    review.md           - THE deliverable to read: per-venue approval IDs

    Registry is NOT touched. Approved venues are merged later via
    add_venue_registry_strict.py --url <calendar_url> --category <cat>.

VERSION: 3.0
LAST UPDATED: 2026-08-24
AUTHOR: Arjun Divecha (ox-alpha session)

DEPENDENCIES:
    - requests          (Jina fetches, Nominatim)
    - claude CLI on PATH (headless `claude -p` for LLM steps)

USAGE:
    python3 scripts/svda/discover_local.py                     # full run
    python3 scripts/svda/discover_local.py --limit 2           # smoke test
    python3 scripts/svda/discover_local.py --categories desi dance lgbtq
    python3 scripts/svda/discover_local.py --no-llm-seed       # report file only

NOTES:
    - LLM steps use the local `claude` CLI (subscription lane), NOT the
      Anthropic API key, so discovery costs ~$0 in the free window.
    - Politeness: >=1s between Jina calls, 429 backoff x2, Nominatim 1.1s.
    - Rejection reasons reuse the PRD closed enum:
      no_structured_events, geographic_mismatch, category_mismatch,
      duplicate_existing, dead_site, extraction_failed, low_event_volume.
=============================================================================
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import requests

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_PATH = PROJECT_ROOT / "data" / "venue-registry.json"
MISSING_REPORT = PROJECT_ROOT / "missing_venues_report.md"
ENV_FILE = Path("/Users/arjundivecha/AAA Backup/.env.txt")
if not ENV_FILE.exists():
    ENV_FILE = Path("/Users/arjundivecha/Dropbox/AAA Backup/.env.txt")

RUN_DATE = date.today().isoformat()
RUN_ID = f"svda-local-{RUN_DATE}"
OUT_DIR = PROJECT_ROOT / "data" / "venue-candidates" / RUN_ID

VALID_CATEGORIES = {
    "music", "theatre", "comedy", "movies", "art", "food", "tech",
    "lectures", "kids", "desi", "dance", "lgbtq", "museums", "all",
}

# Thin categories get extra LLM seed effort (registry counts, Aug 2026).
THIN_CATEGORIES = ["desi", "lgbtq", "dance", "kids", "museums"]

BAY_AREA_CITIES = [
    "san francisco", "oakland", "berkeley", "san jose", "palo alto",
    "mountain view", "sunnyvale", "santa clara", "redwood city", "san mateo",
    "sausalito", "mill valley", "san rafael", "walnut creek", "pleasanton",
    "fremont", "stanford", "santa cruz", "napa", "sonoma", "daly city",
    "alameda", "emeryville", "hayward", "campbell", "los gatos", "menlo park",
    "corte madera", "larkspur", "petaluma", "sebastopol", "half moon bay",
    "pacifica", "concord", "martinez", "vallejo", "benicia", "livermore",
    "dublin", "san ramon", "danville", "orinda", "lafayette", "moraga",
    "piedmont", "albany", "el cerrito", "richmond", "pinole", "novato",
    "tiburon", "brisbane", "south san francisco", "burlingame", "los altos",
    "cupertino", "saratoga", "milpitas", "morgan hill", "gilroy",
    "scotts valley", "capitola", "aptos", "watsonville", "east palo alto",
]
NON_BAY_HINTS = [
    "los angeles", "sacramento", "san diego", "new york", "chicago", "tahoe",
    "seattle", "portland", "fresno", "monterey", "las vegas", "boston",
]

USER_AGENT = "SquirtleSVDA/3.0 (local discovery; contact: arjun)"
EVENT_LINK_KEYWORDS = ["events", "calendar", "shows", "schedule", "whats-on",
                       "whatson", "program", "programs", "tickets", "upcoming", "performances"]
BAD_LINK_WORDS = ["privacy", "terms", "contact", "about", "donate", "membership",
                  "login", "rental", "sponsor", "press", "careers", "archive"]
ARCHIVE_HINTS = ["archive", "past-events", "1985", "1999", "20"]


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def jina_key() -> Optional[str]:
    if not ENV_FILE.exists():
        return None
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^JINA_API_KEY\s*=\s*(.+)\s*$", line.strip())
        if m:
            return m.group(1).strip().strip('"').strip("'")
    return None


_JKEY = jina_key()


def jina_fetch(url: str, timeout: int = 45) -> tuple[Optional[str], Optional[int]]:
    """Fetch a page as markdown via Jina Reader. Returns (markdown, http_status)."""
    headers = {"User-Agent": USER_AGENT, "X-Return-Format": "markdown"}
    if _JKEY:
        headers["Authorization"] = f"Bearer {_JKEY}"
    target = url if url.startswith("http://r.jina.ai") or "r.jina.ai/" in url else f"https://r.jina.ai/{url}"
    for attempt in range(3):
        try:
            r = requests.get(target, timeout=timeout, headers=headers)
            if r.status_code == 200 and r.text.strip():
                return r.text, 200
            if r.status_code == 429:
                wait = 8 * (attempt + 1)
                log(f"    Jina 429, backing off {wait}s")
                time.sleep(wait)
                continue
            return None, r.status_code
        except requests.RequestException as exc:
            if attempt == 2:
                log(f"    Jina failed: {exc}")
                return None, None
            time.sleep(3)
    return None, 429


def claude(prompt: str, timeout: int = 180) -> str:
    """Headless Claude CLI call on the subscription lane.

    IMPORTANT: strips ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN
    from the child environment so the CLI uses the local claude.ai login instead
    of the router API key (which may be rate-limited or metered). If the call
    still fails we return '' and the caller treats extraction as unavailable -
    surfaced per-candidate rather than silently swallowing the whole run.
    """
    env = {
        k: v for k, v in os.environ.items()
        if not k.startswith("ANTHROPIC_")
    }
    try:
        out = subprocess.run(
            ["claude", "-p", prompt, "--output-format", "text"],
            capture_output=True, text=True, timeout=timeout, env=env,
        )
        text = (out.stdout or "").strip()
        if not text and out.stderr:
            log(f"    claude stderr: {out.stderr.strip()[:200]}")
        return text
    except (subprocess.TimeoutExpired, FileNotFoundError) as exc:
        log(f"    claude CLI failed: {exc}")
        return ""


def parse_json_block(text: str) -> Optional[Any]:
    """Best-effort extraction of the first JSON object/array from LLM output.

    Order matters: try the whole stripped string first, then prefer OBJECT
    matches over ARRAY matches - the greedy \\[.*\\] pattern otherwise captures
    the inner "events": [...] array of a larger JSON object and loses the
    wrapper keys.
    """
    if not text:
        return None
    stripped = re.sub(r"^```(?:json)?\s*|```\s*$", "", text.strip(), flags=re.MULTILINE).strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass
    for pattern in (r"\{.*\}", r"\[.*\]"):
        m = re.search(pattern, stripped, flags=re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                continue
    return None


def normalize_domain(url: str) -> str:
    host = urlparse(url).netloc.lower().strip()
    return host[4:] if host.startswith("www.") else host


def load_registry() -> List[Dict[str, Any]]:
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def registry_index(registry: List[Dict[str, Any]]) -> Dict[str, set]:
    domains, names = set(), set()
    for row in registry:
        d = str(row.get("domain", "")).lower().strip()
        if d:
            domains.add(d)
        n = re.sub(r"[^a-z0-9]", "", str(row.get("name", "")).lower())
        if n:
            names.add(n)
    return {"domains": domains, "names": names}


def is_duplicate(candidate: Dict[str, Any], idx: Dict[str, set]) -> bool:
    dom = candidate.get("domain") or ""
    if dom and dom in idx["domains"]:
        return True
    n = re.sub(r"[^a-z0-9]", "", str(candidate.get("name", "")).lower())
    return bool(n) and n in idx["names"]


# --------------------------------------------------------------------------
# Stage 1: seeds
# --------------------------------------------------------------------------

def seeds_from_report() -> List[Dict[str, Any]]:
    """Parse venue tables out of missing_venues_report.md."""
    seeds: List[Dict[str, Any]] = []
    if not MISSING_REPORT.exists():
        return seeds
    section = ""
    for line in MISSING_REPORT.read_text(encoding="utf-8").splitlines():
        hm = re.match(r"^#{2,4}\s+(.*)$", line)
        if hm:
            section = hm.group(1).lower()
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")] if line.strip().startswith("|") else []
        if len(cells) < 2 or set(cells[0]) <= set("- :"):
            continue
        name_m = re.match(r"\*\*(.+?)\*\*", cells[0])
        raw_site = next(
            (c.strip().strip("*").strip() for c in cells
             if re.search(r"[\w-]+\.(com|org|net|edu|us)/?(`.*)?$", c.strip())),
            "",
        )
        if not name_m or not raw_site or "." not in raw_site or " " in raw_site.split("/")[0]:
            continue
        # Bare domains (theuctheatre.org) must become fetchable URLs.
        website = raw_site if raw_site.startswith("http") else f"https://{raw_site}"
        category = "all"
        for cat in VALID_CATEGORIES:
            if cat in section:
                category = cat
                break
        city = ""
        for c in cells[2:]:
            cl = c.lower()
            if any(city_name in cl for city_name in BAY_AREA_CITIES):
                city = next(cn for cn in BAY_AREA_CITIES if cn in cl).title()
                break
        seeds.append({
            "name": name_m.group(1).strip(), "website": website.strip(),
            "category": category, "city": city, "origin": "missing_venues_report",
        })
    return seeds


LLM_SEED_PROMPT = """You are seeding a Bay Area event-venue discovery pipeline for an events aggregator.

Category: {category}. Find up to {n} real, currently-operating venues/presenters/series in the \
San Francisco Bay Area (SF, East Bay, Peninsula, South Bay, North Bay) that host their own public \
{category} events on a RECURRING basis (roughly monthly or more) AND publish an event calendar on \
their OWN website. Prioritize places a general aggregator would miss: community organizations, \
cultural centers, smaller presenters, university series - not just the famous halls.

EXCLUDE these domains already in our registry:
{domains}

Return ONLY a JSON array (no prose), each item:
{{"name": "...", "website": "example.com", "city": "Berkeley", "note": "<=12 words why it fits"}}

Rules: only venues you are confident actually exist with that website domain; never invent URLs; \
websites must be the venue's/presenter's own domain (not Ticketmaster/Eventbrite/Facebook)."""


def llm_seeds(category: str, idx: Dict[str, set], n: int = 10) -> List[Dict[str, Any]]:
    sample_domains = "\n".join(sorted(idx["domains"])[:120])
    raw = claude(LLM_SEED_PROMPT.format(category=category, n=n, domains=sample_domains))
    parsed = parse_json_block(raw)
    out: List[Dict[str, Any]] = []
    if isinstance(parsed, list):
        for item in parsed:
            if not isinstance(item, dict) or not item.get("name") or not item.get("website"):
                continue
            site = str(item["website"]).strip()
            if " " in site or "." not in site:
                continue
            if not site.startswith("http"):
                site = "https://" + site
            cat = str(item.get("category", category)).lower()
            out.append({
                "name": str(item["name"]).strip(),
                "website": site,
                "category": cat if cat in VALID_CATEGORIES else category,
                "city": str(item.get("city", "")).strip(),
                "note": str(item.get("note", "")).strip(),
                "origin": "llm_seed",
            })
    log(f"  LLM seeds for {category}: {len(out)}")
    return out


# --------------------------------------------------------------------------
# Stage 2: calendar discovery
# --------------------------------------------------------------------------

def score_link(href_lower: str) -> int:
    s = sum(3 for kw in EVENT_LINK_KEYWORDS if kw in href_lower)
    if href_lower.endswith(("/events", "/calendar", "/shows", "/events/", "/calendar/")):
        s += 5
    for bad in BAD_LINK_WORDS:
        if bad in href_lower:
            s -= 4
    return s


def find_calendar_urls(home_md: str, base_url: str, max_urls: int = 6) -> List[str]:
    links: Dict[str, int] = {}
    for m in re.finditer(r"\]\((https?://[^)\s]+)\)", home_md):
        u = m.group(1)
        p, du = urlparse(u), urlparse(base_url)
        if p.netloc.lower().replace("www.", "") != du.netloc.lower().replace("www.", ""):
            continue
        sc = score_link(u.lower())
        if sc > 0:
            links[u] = max(links.get(u, 0), sc)
    guesses = []
    for path in ["events", "calendar", "shows", "schedule", "whats-on", "tickets", "events/calendar", "calendar/latest.html", "events/upcoming"]:
        guesses.append(urljoin(base_url.rstrip("/") + "/", path))
    ranked = sorted(links.items(), key=lambda kv: kv[1], reverse=True)
    urls = [u for u, _ in ranked[:max_urls]]
    for g in guesses:
        if g not in urls:
            urls.append(g)
    return urls[: max_urls + len(guesses)]


def looks_like_archive(md: str) -> bool:
    low = md.lower()
    return ("archive" in low or "past events" in low) and low.count("2026") < 3


def page_is_soft_fail(md: str) -> bool:
    """True when Jina delivered an error/parked page rather than real content."""
    if not md:
        return True
    head = md[:600]
    low = md.lower()[:2500]
    if "warning: target url returned error" in low:
        return True
    if "http status: 4" in low and "markdown content:" not in low[low.find("http status"):low.find("http status") + 60]:
        return True
    if "is for sale" in low and ("make an offer" in low or "trustpilot" in low):
        return True
    if "domain name" in low and "make an offer" in low:
        return True
    del head
    return False


def pick_followup_link(md: str, base_url: str) -> Optional[str]:
    """On an archive/index page, find a 'latest'/'current'/current-year sub-link."""
    best, best_score = None, 0
    for m in re.finditer(r"\]\((https?://[^)\s]+)\)[^\n]*", md):
        u, ctx = m.group(1), m.group(0).lower()
        if urlparse(u).netloc.replace("www.", "") != urlparse(base_url).netloc.replace("www.", ""):
            continue
        sc = 0
        for kw in ["latest", "current", "this-month", "upcoming", "/2026", "2026.html", "now-playing"]:
            if kw in u.lower() or kw in ctx:
                sc += 5
        if sc > best_score:
            best, best_score = u, sc
    return best if best_score > 0 else None


# --------------------------------------------------------------------------
# Stage 3: extraction
# --------------------------------------------------------------------------

EXTRACT_PROMPT = """Below is the markdown rendering of a Bay Area venue's event calendar page.

Venue: {name} ({website})

Extract EVERY event listing that has a date visible on this page. Return ONLY JSON, no prose:
{{
  "city_guess": "<city or empty>",
  "page_kind": "upcoming_calendar | archive_index | single_event | unclear",
  "events": [
    {{"title": "...", "date": "YYYY-MM-DD or empty string if undated", "url": "<event link or empty>"}}
  ]
}}

Hard rules:
- Only events literally listed on THIS page. Never invent titles or dates.
- Skip nav links, rentals, classes-unless-public-events, blog posts.
- If dates carry no year, infer the nearest sensible year from context and keep going.
- If the page shows no dated listings at all, return events: [] and set page_kind accordingly.

PAGE MARKDOWN (truncated):
---
{markdown}
---"""


def extract_events(name: str, website: str, md: str) -> Dict[str, Any]:
    truncated = md[:16000]
    prompt = EXTRACT_PROMPT.format(name=name, website=website, markdown=truncated)
    parsed: Optional[Dict[str, Any]] = None
    raw = ""
    for attempt in range(2):  # one retry on transient empties
        raw = claude(prompt)
        parsed = parse_json_block(raw)
        if isinstance(parsed, list):
            # Bare events array without the wrapper object - accept it.
            return {"events": parsed}
        if isinstance(parsed, dict):
            return parsed
        if not raw:
            log("    empty LLM response - pausing 45s before retry")
            time.sleep(45)
        else:
            break  # non-empty but unparsable: retrying rarely helps
    # Distinguish "LLM lane unavailable" from "page truly has no listings".
    return {"_error": "empty_llm_response"} if not raw else {}


def estimate_volume(events: List[Dict[str, Any]]) -> tuple[float, int, int]:
    """Returns (events_per_month_estimate, future_count, span_months)."""
    today = date.today()
    dated = []
    for e in events:
        raw_d = str(e.get("date", "")).strip()
        m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", raw_d)
        if m:
            try:
                d = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
                dated.append(d)
            except ValueError:
                continue
    future = [d for d in dated if d >= today]
    if not future:
        return 0.0, 0, 0
    span_days = max(1, (max(future) - min(today, min(future))).days)
    span_months = max(1.0, round(span_days / 30.0))
    # Density of dated upcoming events over the window they cover, plus a
    # floor from undated-but-listed items being ignored (conservative).
    return round(len(future) / span_months, 1), len(future), int(span_months)


def geocode(name: str, city: str) -> tuple[Optional[float], Optional[float]]:
    q = f"{name}, {city}, California" if city else f"{name}, Bay Area, California"
    try:
        r = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": q, "format": "json", "limit": 1},
            headers={"User-Agent": USER_AGENT}, timeout=15,
        )
        time.sleep(1.1)
        if r.status_code == 200 and r.json():
            hit = r.json()[0]
            return float(hit["lat"]), float(hit["lon"])
    except (requests.RequestException, KeyError, ValueError):
        pass
    return None, None


# --------------------------------------------------------------------------
# Main pipeline
# --------------------------------------------------------------------------

def process_candidate(seed: Dict[str, Any], idx: Dict[str, set]) -> Dict[str, Any]:
    name = seed["name"]
    website = seed["website"]
    domain = normalize_domain(website)
    rec: Dict[str, Any] = {
        **seed, "domain": domain, "status": "pending",
        "recommendation": None, "reason": None, "calendar_url": None,
        "sample_events": [], "events_seen": 0, "events_per_month_est": 0.0,
        "lat": None, "lng": None, "evidence": [],
    }

    if is_duplicate({"domain": domain, "name": name}, idx):
        rec.update(recommendation="skip", status="done", reason="duplicate_existing")
        return rec

    # 2a. homepage
    home_md, home_status = jina_fetch(website)
    rec["evidence"].append(f"homepage_fetch={home_status}")
    if not home_md or page_is_soft_fail(home_md):
        rec.update(recommendation="investigate", status="done",
                   reason="dead_site",
                   notes=f"homepage HTTP {home_status} (soft-404/parked: {bool(home_md) and page_is_soft_fail(home_md)})")
        return rec

    # 2b. calendar URL hunt - keep trying until a REAL content page is found
    cal_candidates = find_calendar_urls(home_md, website)
    cal_md, cal_url = None, None
    tried = []
    for cu in cal_candidates[:9]:
        md, st = jina_fetch(cu)
        time.sleep(1.0)
        tried.append(cu)
        if md and len(md) > 300 and not page_is_soft_fail(md):
            cal_md, cal_url = md, cu
            rec["evidence"].append(f"calendar_fetch=200:{cu}")
            break
        rec["evidence"].append(f"calendar_miss({st}):{cu}")
    if not cal_md:
        rec.update(recommendation="investigate", status="done",
                   reason="no_structured_events",
                   notes="no reachable events/calendar page among candidates")
        return rec

    # 2c. archive-index rescue (one bounded follow)
    if looks_like_archive(cal_md):
        nxt = pick_followup_link(cal_md, cal_url)
        if nxt:
            md2, st2 = jina_fetch(nxt)
            time.sleep(1.0)
            if md2 and len(md2) > 400:
                cal_md, cal_url = md2, nxt
                rec["evidence"].append(f"archive_follow={st2}:{nxt}")

    # 3. extraction
    info = extract_events(name, website, cal_md)
    if info.get("_error") == "empty_llm_response":
        rec.update(recommendation="investigate", status="done",
                   reason="extraction_failed",
                   notes="LLM lane returned nothing (rate limit?) - retry later")
        return rec
    events = info.get("events", []) if isinstance(info, dict) else []
    events = [e for e in events if isinstance(e, dict) and e.get("title")]
    rec["calendar_url"] = cal_url
    rec["page_kind"] = info.get("page_kind", "unclear")
    rec["sample_events"] = events[:6]

    if not events:
        rec.update(recommendation="investigate", status="done",
                   reason="no_structured_events",
                   notes=f"page_kind={rec['page_kind']}; no dated listings found")
        return rec

    rate, future_n, span = estimate_volume(events)
    rec["events_seen"], rec["events_per_month_est"] = len(events), rate
    rec["future_events"], rec["span_months"] = future_n, span

    # geography sanity
    page_city = str(info.get("city_guess", "") or seed.get("city", "")).lower()
    if any(hint in (cal_md[:3000].lower()) for hint in NON_BAY_HINTS) and not any(c in page_city for c in BAY_AREA_CITIES):
        rec.update(recommendation="investigate", status="done",
                   reason="geographic_mismatch",
                   notes=f"non-Bay-Area signals; city_guess={info.get('city_guess','')}")
        return rec

    # 4. volume verdict
    if rate >= 3.0 and future_n >= 3:
        rec["recommendation"] = "add"
    elif future_n >= 2:
        rec["recommendation"] = "borderline"
    else:
        rec.update(recommendation="investigate", status="done",
                   reason="low_event_volume",
                   notes=f"{future_n} future events over ~{span}mo (rate {rate}/mo)")
        return rec
    rec["status"] = "done"

    # 6. geocode for proposed/borderline rows
    city = str(info.get("city_guess") or seed.get("city") or "").strip()
    rec["city"] = city.title() if city.islower() else city
    rec["lat"], rec["lng"] = geocode(name, rec.get("city", ""))

    dom = domain
    rec["registry_row_proposed"] = {
        "name": name,
        "domain": dom,
        "category": seed.get("category", "all"),
        "city": rec.get("city") or None,
        "state": "CA",
        "website": f"https://{dom}",
        "calendar_url": cal_url,
        "source": RUN_ID,
        "coordinates": {"lat": rec["lat"], "lng": rec["lng"]} if rec["lat"] else None,
        "lat": rec["lat"],
        "lng": rec["lng"],
    }
    return rec


def write_review_md(records: List[Dict[str, Any]], out_path: Path) -> None:
    order = {"add": 0, "borderline": 1, "investigate": 2, "skip": 3}
    recs = sorted(
        [r for r in records if r.get("status") == "done"],
        key=lambda r: order.get(r.get("recommendation"), 9),
    )
    counters = {"add": 0, "borderline": 0, "investigate": 0, "skip": 0}
    prefix = {"add": "A", "borderline": "B", "investigate": "I", "skip": "S"}
    ids: Dict[str, str] = {}
    for r in recs:
        verdict = r.get("recommendation", "?")
        counters[verdict] = counters.get(verdict, 0) + 1
        ids[r["name"] + r["domain"]] = prefix[verdict] + f"{counters[verdict]:02d}"

    lines: List[str] = [
        "# SVDA Local Discovery — Venue Approval Sheet",
        "",
        f"Run: `{RUN_ID}` · Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} · "
        f"Registry untouched. Approve individually by ID (e.g. \"approve A03, B02\").",
        "",
        "| ID | Verdict | Name | Category | City | Dated events seen | Est./mo | Calendar |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in recs:
        verdict = r.get("recommendation", "?")
        vid = ids[r["name"] + r["domain"]]
        cal = r.get("calendar_url") or ""
        cal_cell = f"[{cal[:55]}]({cal})" if cal else "—"
        lines.append(
            f"| {vid} | {verdict} | {r['name']} | {r.get('category','')} | {r.get('city') or '?'} "
            f"| {r.get('future_events', r.get('events_seen', 0))} | {r.get('events_per_month_est', '—')} "
            f"| {cal_cell} |"
        )

    def detail_block(verdict: str, title: str, show_samples: bool = True) -> None:
        group = [r for r in recs if r.get("recommendation") == verdict]
        if not group:
            return
        lines.extend(["", f"## {title}", ""])
        for r in group:
            vid = ids[r["name"] + r["domain"]]
            lines.append(f"### {vid} — {r['name']} ({r.get('category','')})")
            lines.append("")
            lines.append(f"- Website: {r['website']}")
            if r.get("calendar_url"):
                lines.append(f"- Calendar: {r['calendar_url']}")
            lines.append(f"- City: {r.get('city') or '?'} · Page kind: {r.get('page_kind', '—')} · "
                         f"Dated events seen: {r.get('future_events', 0)} · Rate est: {r.get('events_per_month_est', '—')}/mo")
            if r.get("note"):
                lines.append(f"- Note: {r['note']}")
            if r.get("reason"):
                lines.append(f"- Reason: {r['reason']}")
            if show_samples and r.get("sample_events"):
                lines.append("- Sample events:")
                for e in r["sample_events"][:4]:
                    dt = e.get("date") or "(no date)"
                    eu = e.get("url") or ""
                    link = f" ([link]({eu}))" if eu else ""
                    lines.append(f"  - {e.get('title','?')} — {dt}{link}")
            lines.append("")

    detail_block("add", "PROPOSED — meet the >=3 events/month cutoff (say \"approve A01\" etc.)")
    detail_block("borderline", "BORDERLINE — real listings but under the volume cutoff (your call)")
    detail_block("investigate", "INVESTIGATE — could not validate (fetch failed, no dated listings, geo mismatch)")
    detail_block("skip", "SKIPPED — already in registry", show_samples=False)
    lines.extend([
        "", "---", "",
        "Merge command per approved venue:",
        "```bash",
        "python3 add_venue_registry_strict.py --url \"<calendar_url>\" --category \"<category>\" \\",
        f'  --name "<name>" --city "<city>" --source "{RUN_ID}"',
        "```", "",
    ])
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser(description="SVDA v3 local venue discovery (read-only vs registry)")
    ap.add_argument("--categories", nargs="*", default=None,
                    help="LLM-seed these categories (default: all, extra effort on thin ones)")
    ap.add_argument("--no-report-file", action="store_true", help="skip parsing missing_venues_report.md")
    ap.add_argument("--no-llm-seed", action="store_true", help="skip LLM candidate generation")
    ap.add_argument("--limit", type=int, default=40, help="max candidates processed")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    registry = load_registry()
    idx = registry_index(registry)
    log(f"Registry loaded: {len(registry)} venues")

    # ---- seeds ----
    seeds: List[Dict[str, Any]] = [] if args.no_report_file else seeds_from_report()
    log(f"Seeds from missing_venues_report.md: {len(seeds)}")

    if not args.no_llm_seed:
        cats = args.categories or VALID_CATEGORIES
        for cat in sorted(cats):
            n = 14 if cat in THIN_CATEGORIES else 8
            for s in llm_seeds(cat, idx, n=n):
                seeds.append(s)
            time.sleep(1)

    # dedupe seeds (by domain/name, and vs registry)
    seen_keys: set = set()
    unique: List[Dict[str, Any]] = []
    for s in seeds:
        dom = normalize_domain(s["website"])
        key = dom or re.sub(r"[^a-z0-9]", "", s["name"].lower())
        if not key or key in seen_keys or is_duplicate({"domain": dom, "name": s["name"]}, idx):
            continue
        seen_keys.add(key)
        unique.append({**s, "domain": dom})
    log(f"Unique new-candidate seeds after dedup: {len(unique)}")

    ckpt_path = OUT_DIR / "checkpoints.jsonl"
    done_keys = set()
    records: List[Dict[str, Any]] = []
    if ckpt_path.exists():
        for line in ckpt_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                records.append(r)
                done_keys.add(r["domain"] or r["name"])
        log(f"Resuming: {len(records)} candidates already checkpointed")

    todo = [s for s in unique if (s.get("domain") or s["name"]) not in done_keys][: args.limit]
    log(f"To process this run: {len(todo)}")

    consecutive_llm_failures = 0
    for i, seed in enumerate(todo, 1):
        log(f"[{i}/{len(todo)}] {seed['name']} ({seed['domain']}) cat={seed['category']}")
        try:
            rec = process_candidate(seed, idx)
        except Exception as exc:  # never let one candidate kill the run
            rec = {**seed, "status": "done", "recommendation": "investigate",
                   "reason": "extraction_failed", "notes": f"exception: {exc}"}
        if rec.get("reason") == "extraction_failed" and "LLM lane" in str(rec.get("notes")):
            consecutive_llm_failures += 1
            time.sleep(20)
            if consecutive_llm_failures >= 3:
                log("ABORT: LLM lane failing repeatedly (rate limit?). "
                    f"{len(records)} candidates checkpointed; resume later - "
                    "the run picks up where it left off.")
                break
        else:
            consecutive_llm_failures = 0
            time.sleep(3)  # politeness throttle on the subscription lane
        rec["processed_at"] = datetime.now(timezone.utc).isoformat()
        records.append(rec)
        with ckpt_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        # atomic full-artifact rewrite (incremental persistence)
        tmp = OUT_DIR / "candidates.json.tmp"
        tmp.write_text(json.dumps({
            "schema_version": "3.0-local",
            "run_id": RUN_ID,
            "run_date": RUN_DATE,
            "runner": "scripts/svda/discover_local.py",
            "llm_lane": "claude CLI (subscription)",
            "geographic_scope": ["San Francisco Bay Area"],
            "registry_rows_written": 0,
            "counts": {
                "proposed": sum(1 for r in records if r.get("recommendation") == "add"),
                "borderline": sum(1 for r in records if r.get("recommendation") == "borderline"),
                "investigate": sum(1 for r in records if r.get("recommendation") == "investigate"),
                "skipped_existing": sum(1 for r in records if r.get("recommendation") == "skip"),
            },
            "candidates": records,
        }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        tmp.rename(OUT_DIR / "candidates.json")
        time.sleep(1.0)

    write_review_md(records, OUT_DIR / "review.md")
    counts = {k: sum(1 for r in records if r.get("recommendation") == k)
              for k in ["add", "borderline", "investigate", "skip"]}
    log(f"DONE. counts={counts}")
    log(f"Review sheet: {OUT_DIR / 'review.md'}")


if __name__ == "__main__":
    main()
