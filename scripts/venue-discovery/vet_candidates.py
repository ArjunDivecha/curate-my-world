#!/usr/bin/env python3
"""
Vet candidate venues before adding to data/venue-registry.json.

Inputs:
- data/venue-candidates-YYYY-MM-DD.csv (category,name,website,notes)
- data/venue-registry.json

Outputs:
- docs/venue-vetting/<date>-report.md (human review)
- data/venue-vetting/<date>-results.json (machine readable)

This does NOT modify venue-registry.json. Use add_venue_registry_strict.py to add
approved venues one-by-one (or extend later with batch-add once the workflow is proven).
"""

from __future__ import annotations

import csv
import json
import re
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_PATH = PROJECT_ROOT / "data" / "venue-registry.json"

DEFAULT_CANDIDATES = PROJECT_ROOT / "data" / "venue-candidates-2026-02-09.csv"
OUT_DIR_DOCS = PROJECT_ROOT / "docs" / "venue-vetting"
OUT_DIR_DATA = PROJECT_ROOT / "data" / "venue-vetting"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36"
)

# Common event-ish URL fragments we treat as good candidates for calendar_url.
EVENT_KEYWORDS = [
    "events",
    "calendar",
    "whats-on",
    "whatson",
    "shows",
    "schedule",
    "program",
    "programs",
    "tickets",
    "upcoming",
    "visit",
]


def normalize_domain(url: str) -> str:
    host = urlparse(url).netloc.lower().strip()
    if host.startswith("www."):
        host = host[4:]
    return host


def load_registry_domains(path: Path) -> Tuple[set[str], Dict[str, Dict[str, Any]]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    by_domain: Dict[str, Dict[str, Any]] = {}
    domains: set[str] = set()
    for row in data:
        d = str(row.get("domain", "")).lower().strip()
        if d:
            domains.add(d)
            if d not in by_domain:
                by_domain[d] = row
    return domains, by_domain


def fetch(url: str, timeout: int = 12) -> requests.Response:
  return requests.get(
        url,
        timeout=timeout,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
        allow_redirects=True,
    )


def score_event_url(href: str) -> int:
    """Heuristic: higher score means more likely to be an events/calendar page."""
    href_l = href.lower()
    score = 0
    for kw in EVENT_KEYWORDS:
        if kw in href_l:
            score += 3
    if re.search(r"/events?(/|$)", href_l):
        score += 5
    if "calendar" in href_l:
        score += 4
    if "tickets" in href_l:
        score += 1
    # Avoid obvious non-event paths
    for bad in ["privacy", "terms", "contact", "about", "donate", "membership", "login"]:
        if bad in href_l:
            score -= 2
    return score


def extract_event_links(base_url: str, html: str, max_links: int = 8) -> List[str]:
    soup = BeautifulSoup(html, "html.parser")
    links: List[Tuple[int, str]] = []
    for a in soup.find_all("a", href=True):
        href = str(a["href"]).strip()
        if not href or href.startswith("#"):
            continue
        if href.startswith("mailto:") or href.startswith("tel:"):
            continue
        abs_url = urljoin(base_url, href)
        if urlparse(abs_url).scheme not in {"http", "https"}:
            continue
        s = score_event_url(abs_url)
        if s <= 0:
            continue
        links.append((s, abs_url))

    # De-dupe preserving best score per URL
    best: Dict[str, int] = {}
    for s, u in links:
        if u not in best or s > best[u]:
            best[u] = s
    ranked = sorted(best.items(), key=lambda x: x[1], reverse=True)
    return [u for u, _ in ranked[:max_links]]


@dataclass
class CandidateResult:
    category: str
    name: str
    website: str
    notes: str
    domain: str
    in_registry: bool
    status: str  # ok | http_error | parse_error
    final_url: Optional[str] = None
    http_status: Optional[int] = None
    suggested_calendar_urls: Optional[List[str]] = None
    recommendation: Optional[str] = None  # add | skip | investigate
    reason: Optional[str] = None


def vet_candidate(row: Dict[str, str], registry_domains: set[str]) -> CandidateResult:
    website = row["website"].strip()
    domain = normalize_domain(website)
    in_registry = domain in registry_domains

    r = CandidateResult(
        category=row.get("category", "").strip() or "all",
        name=row.get("name", "").strip(),
        website=website,
        notes=row.get("notes", "").strip(),
        domain=domain,
        in_registry=in_registry,
        status="ok",
        suggested_calendar_urls=[],
    )

    if in_registry:
        r.recommendation = "skip"
        r.reason = "Domain already in venue-registry.json"
        return r

    try:
        resp = fetch(website)
        r.http_status = resp.status_code
        r.final_url = resp.url
        if resp.status_code >= 400:
            r.status = "http_error"
            r.recommendation = "investigate"
            r.reason = f"HTTP {resp.status_code} on website"
            return r

        html = resp.text or ""
        if not html.strip():
            r.status = "parse_error"
            r.recommendation = "investigate"
            r.reason = "Empty HTML response"
            return r

        # Extract likely events pages from homepage.
        links = extract_event_links(resp.url, html)

        # Always include some common guesses.
        guesses = []
        for p in ["/events", "/calendar", "/shows", "/schedule", "/whats-on", "/tickets"]:
            guesses.append(urljoin(resp.url.rstrip("/") + "/", p.lstrip("/")))

        # Merge, keep same-domain only, de-dupe.
        all_urls = []
        seen = set()
        for u in links + guesses:
            ud = normalize_domain(u)
            if ud != normalize_domain(resp.url):
                continue
            if u in seen:
                continue
            seen.add(u)
            all_urls.append(u)

        # Light validation: HEAD/GET first 2 candidate URLs to ensure they exist.
        verified = []
        for u in all_urls[:6]:
            try:
                h = requests.head(u, timeout=8, allow_redirects=True, headers={"User-Agent": USER_AGENT})
                if h.status_code < 400:
                    verified.append(u)
                    continue
                # Some sites block HEAD; fallback to GET with small timeout.
                g = fetch(u, timeout=10)
                if g.status_code < 400:
                    verified.append(g.url)
            except requests.RequestException:
                continue

        r.suggested_calendar_urls = verified[:8]
        if r.suggested_calendar_urls:
            r.recommendation = "add"
            r.reason = "Website reachable; found plausible events/calendar URLs"
        else:
            r.recommendation = "investigate"
            r.reason = "Website reachable, but could not confidently detect an events/calendar URL"

        return r

    except requests.RequestException as exc:
        r.status = "http_error"
        r.recommendation = "investigate"
        r.reason = f"Request failed: {exc}"
        return r
    except Exception as exc:
        r.status = "parse_error"
        r.recommendation = "investigate"
        r.reason = f"Unexpected error: {exc}"
        return r


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Vet venue candidates (no registry mutation).")
    parser.add_argument("--candidates", default=str(DEFAULT_CANDIDATES), help="Path to candidates CSV")
    parser.add_argument("--limit", type=int, default=25, help="Max candidates to vet (for iterative review)")
    parser.add_argument("--sleep", type=float, default=0.2, help="Politeness delay between candidates")
    args = parser.parse_args()

    candidates_path = Path(args.candidates)
    run_date = datetime.now(timezone.utc).date().isoformat()

    registry_domains, _ = load_registry_domains(REGISTRY_PATH)

    rows: List[Dict[str, str]] = []
    with candidates_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row.get("website") or not row.get("name"):
                continue
            rows.append(row)

    OUT_DIR_DOCS.mkdir(parents=True, exist_ok=True)
    OUT_DIR_DATA.mkdir(parents=True, exist_ok=True)

    results: List[CandidateResult] = []
    total = min(len(rows), max(0, int(args.limit)))
    for idx, row in enumerate(rows[:total]):
        # Be kind to sites.
        time.sleep(max(0.0, float(args.sleep)))
        print(f"[{idx+1}/{total}] Vetting: {row.get('name','').strip()} ({row.get('website','').strip()})", flush=True)
        results.append(vet_candidate(row, registry_domains))

    out_json = OUT_DIR_DATA / f"{run_date}-results.json"
    out_md = OUT_DIR_DOCS / f"{run_date}-report.md"

    out_json.write_text(
        json.dumps([asdict(r) for r in results], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    def md_link(u: str) -> str:
        return f"[link]({u})"

    add = [r for r in results if r.recommendation == "add"]
    skip = [r for r in results if r.recommendation == "skip"]
    inv = [r for r in results if r.recommendation == "investigate"]

    lines: List[str] = []
    lines.append(f"# Venue Vetting Report ({run_date})")
    lines.append("")
    lines.append(f"- Candidates: {len(results)}")
    lines.append(f"- Recommend add: {len(add)}")
    lines.append(f"- Skip (already in registry): {len(skip)}")
    lines.append(f"- Investigate: {len(inv)}")
    lines.append("")
    lines.append("## Recommend Add (Has Candidate Calendar URLs)")
    lines.append("")
    lines.append("| Category | Venue | Domain | Suggested calendar/events URLs | Notes |")
    lines.append("|---|---|---|---|---|")
    for r in add:
        urls = "<br/>".join(md_link(u) for u in (r.suggested_calendar_urls or [])[:3])
        lines.append(f"| {r.category} | {r.name} | `{r.domain}` | {urls} | {r.notes} |")
    lines.append("")
    lines.append("## Investigate (Needs Manual Check)")
    lines.append("")
    lines.append("| Category | Venue | Domain | Website | Reason |")
    lines.append("|---|---|---|---|---|")
    for r in inv:
        lines.append(f"| {r.category} | {r.name} | `{r.domain}` | {md_link(r.website)} | {r.reason or ''} |")
    lines.append("")
    lines.append("## Skipped (Already In Registry)")
    lines.append("")
    lines.append("| Category | Venue | Domain | Website |")
    lines.append("|---|---|---|---|")
    for r in skip:
        lines.append(f"| {r.category} | {r.name} | `{r.domain}` | {md_link(r.website)} |")
    lines.append("")
    lines.append("## Next Step")
    lines.append("")
    lines.append("For each approved venue, add it with:")
    lines.append("")
    lines.append("```bash")
    lines.append("python add_venue_registry_strict.py --url \"<calendar_or_events_url>\" --category \"<category>\"")
    lines.append("```")
    lines.append("")

    out_md.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Wrote: {out_md}")
    print(f"Wrote: {out_json}")


if __name__ == "__main__":
    main()
