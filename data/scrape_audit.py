#!/usr/bin/env python3
"""
Read-only scrape coverage auditor.

What it does:
- Reads venue registry + venue cache
- Fetches source pages (raw + r.jina.ai snapshot)
- Extracts event-like source URLs / ICS events
- Compares source vs cache using normalized keys
- Writes JSON + Markdown report

What it does NOT do:
- No changes to registry/cache/code
- No git operations
"""

from __future__ import annotations

import argparse
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_REGISTRY_PATH = PROJECT_ROOT / "data" / "venue-registry.json"
DEFAULT_CACHE_PATH = PROJECT_ROOT / "data" / "venue-events-cache.json"
DEFAULT_OUTPUT_JSON = PROJECT_ROOT / "data" / "scrape-audit-report.json"
DEFAULT_OUTPUT_MD = PROJECT_ROOT / "data" / "scrape-audit-summary.md"

USER_AGENT = "CurateMyWorldAudit/2.0"
DEFAULT_TIMEOUT_SECONDS = 20.0
DEFAULT_DELAY_SECONDS = 0.15

EVENT_INCLUDE_PATTERNS = [
    re.compile(r"/event/", re.I),
    re.compile(r"/events/", re.I),
    re.compile(r"/show/", re.I),
    re.compile(r"/shows/", re.I),
    re.compile(r"/ticket", re.I),
    re.compile(r"/buy-tickets", re.I),
    re.compile(r"/tm-event/", re.I),
    re.compile(r"/programs?/", re.I),
]

EVENT_EXCLUDE_PATTERNS = [
    re.compile(r"/events?$", re.I),
    re.compile(r"/events/page/\d+/?$", re.I),
    re.compile(r"/events/(feed|month|list|map|day|week|calendar)/?", re.I),
    re.compile(r"/events/(category|tag|venue|organizer)/", re.I),
    re.compile(r"/events/v\d+/?$", re.I),
    re.compile(r"/wp-json", re.I),
    re.compile(r"/api/", re.I),
    re.compile(r"/rss", re.I),
    re.compile(r"/search", re.I),
    re.compile(r"/cart", re.I),
    re.compile(r"/checkout", re.I),
    re.compile(r"/login", re.I),
    re.compile(r"/signup", re.I),
]

GENERIC_TITLE_PATTERNS = [
    re.compile(r"^event$", re.I),
    re.compile(r"^tbd$", re.I),
    re.compile(r"^tba$", re.I),
    re.compile(r"^coming soon$", re.I),
    re.compile(r"^untitled$", re.I),
]


def build_ssl_context(insecure: bool) -> ssl.SSLContext | None:
    if not insecure:
        return None
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        f.write(text)


def normalize_host(host: str | None) -> str:
    if not host:
        return ""
    normalized = host.strip().lower()
    if normalized.startswith("www."):
        normalized = normalized[4:]
    return normalized


def canonicalize_url(candidate: str, base_url: str | None = None) -> str | None:
    if not candidate:
        return None

    raw = candidate.strip()
    if not raw:
        return None

    lowered = raw.lower()
    if lowered.startswith(("mailto:", "tel:", "javascript:", "#")):
        return None

    if raw.startswith("//"):
        raw = "https:" + raw

    try:
        joined = urllib.parse.urljoin(base_url or "", raw)
        parsed = urllib.parse.urlsplit(joined)
    except Exception:
        return None

    if parsed.scheme.lower() not in {"http", "https"}:
        return None

    host = normalize_host(parsed.hostname)
    if not host:
        return None

    netloc = host
    if parsed.port:
        netloc = f"{host}:{parsed.port}"

    path = re.sub(r"/{2,}", "/", parsed.path or "/")
    if path != "/":
        path = path.rstrip("/")

    return urllib.parse.urlunsplit((parsed.scheme.lower(), netloc, path, "", ""))


def is_same_site(url: str, domain: str) -> bool:
    try:
        host = normalize_host(urllib.parse.urlsplit(url).hostname)
    except Exception:
        return False
    target = normalize_host(domain)
    if not host or not target:
        return False
    return host == target or host.endswith("." + target) or target.endswith("." + host)


def likely_event_url(url: str) -> bool:
    path = urllib.parse.urlsplit(url).path.lower()

    for pat in EVENT_EXCLUDE_PATTERNS:
        if pat.search(path):
            return False

    if re.search(r"/\d{4}-\d{2}-\d{2}(?:/\d+)?/?$", path):
        return True

    for pat in EVENT_INCLUDE_PATTERNS:
        if pat.search(path):
            return True

    return False


def fetch_text(url: str, *, timeout: float, ssl_context: ssl.SSLContext | None) -> tuple[str | None, str | None]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,text/plain,*/*;q=0.8",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ssl_context) as resp:
            raw = resp.read()
            text = raw.decode("utf-8", errors="ignore")
            return text, None
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}"
    except urllib.error.URLError as e:
        return None, f"URL error: {e.reason}"
    except Exception as e:
        return None, f"Fetch error: {e}"


def fetch_source(calendar_url: str, *, timeout: float, delay: float, ssl_context: ssl.SSLContext | None) -> dict[str, Any]:
    jina_url = f"https://r.jina.ai/{calendar_url}"

    jina_text, jina_error = fetch_text(jina_url, timeout=timeout, ssl_context=ssl_context)
    if delay > 0:
        time.sleep(delay)

    raw_text, raw_error = fetch_text(calendar_url, timeout=timeout, ssl_context=ssl_context)
    if delay > 0:
        time.sleep(delay)

    return {
        "jina_text": jina_text or "",
        "raw_text": raw_text or "",
        "jina_error": jina_error,
        "raw_error": raw_error,
    }


def detect_source_type(calendar_url: str, jina_text: str, raw_text: str) -> str:
    normalized_url = (calendar_url or "").lower()
    if ".ics" in normalized_url or "ical=1" in normalized_url:
        return "ICS"

    for body in (jina_text, raw_text):
        snippet = body.strip().upper()
        if snippet.startswith("BEGIN:VCALENDAR"):
            return "ICS"

    return "HTML"


def unfold_ics_lines(ics_text: str) -> list[str]:
    lines = ics_text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    unfolded: list[str] = []
    for line in lines:
        if (line.startswith(" ") or line.startswith("\t")) and unfolded:
            unfolded[-1] += line[1:]
        else:
            unfolded.append(line)
    return unfolded


def decode_ics_value(value: str) -> str:
    return (
        value.replace("\\n", " ")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
        .strip()
    )


def parse_ics_datetime(raw: str) -> str | None:
    value = (raw or "").strip()

    m_date = re.fullmatch(r"(\d{4})(\d{2})(\d{2})", value)
    if m_date:
        y, mo, d = m_date.groups()
        return f"{y}-{mo}-{d}T00:00:00"

    m_dt = re.fullmatch(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?Z?", value)
    if m_dt:
        y, mo, d, hh, mm, ss = m_dt.groups()
        return f"{y}-{mo}-{d}T{hh}:{mm}:{ss or '00'}"

    return None


def normalize_title_for_key(title: str | None) -> str:
    if not title:
        return ""
    text = title.lower().strip()
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    return text.strip()


def normalize_date_for_key(value: str | None) -> str:
    if not value:
        return ""
    raw = value.strip()
    m = re.match(r"(\d{4}-\d{2}-\d{2})", raw)
    if m:
        return m.group(1)
    m2 = re.match(r"(\d{8})", raw)
    if m2:
        digits = m2.group(1)
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"
    return raw.lower()


def infer_title_from_url(url: str) -> str:
    path_parts = [part for part in urllib.parse.urlsplit(url).path.split("/") if part]
    if not path_parts:
        return ""

    tail = path_parts[-1]
    if re.fullmatch(r"\d+", tail) or re.fullmatch(r"\d{4}-\d{2}-\d{2}", tail):
        if len(path_parts) > 1:
            tail = path_parts[-2]

    if not tail:
        return ""

    cleaned = tail.replace("-", " ").strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.title()


def infer_start_date_from_url(url: str) -> str | None:
    m = re.search(r"/(\d{4})-(\d{2})-(\d{2})(?:/\d+)?/?$", urllib.parse.urlsplit(url).path)
    if not m:
        return None
    y, mo, d = m.groups()
    return f"{y}-{mo}-{d}T19:00:00"


def make_event_key(event_url: str | None, title: str | None, start_date: str | None, base_url: str | None = None) -> str:
    canonical_url = canonicalize_url(event_url or "", base_url=base_url)
    if canonical_url:
        return f"url::{canonical_url}"

    title_part = normalize_title_for_key(title)
    date_part = normalize_date_for_key(start_date)
    return f"title::{title_part}::date::{date_part}"


def parse_ics_events(ics_text: str, *, calendar_url: str, domain: str) -> list[dict[str, Any]]:
    lines = unfold_ics_lines(ics_text)
    current: dict[str, str] | None = None
    parsed: list[dict[str, str]] = []

    for line in lines:
        if line == "BEGIN:VEVENT":
            current = {}
            continue
        if line == "END:VEVENT":
            if current is not None:
                parsed.append(current)
            current = None
            continue
        if current is None or ":" not in line:
            continue

        left, value = line.split(":", 1)
        field = left.split(";", 1)[0].upper()
        current[field] = value

    out: list[dict[str, Any]] = []
    seen_keys: set[str] = set()

    for event in parsed:
        status = (event.get("STATUS") or "").strip().upper()
        if status == "CANCELLED":
            continue

        title = decode_ics_value(event.get("SUMMARY", ""))
        start_date = parse_ics_datetime(event.get("DTSTART", ""))
        raw_url = decode_ics_value(event.get("URL", ""))
        event_url = canonicalize_url(raw_url, base_url=calendar_url)

        if event_url and not is_same_site(event_url, domain):
            # Keep external URLs only if no same-site URL exists in the event payload.
            # For coverage comparisons we bias toward same-site event identifiers.
            event_url = None

        if not title and not event_url:
            continue

        key = make_event_key(event_url, title, start_date, base_url=calendar_url)
        if key in seen_keys:
            continue
        seen_keys.add(key)

        out.append(
            {
                "key": key,
                "eventUrl": event_url,
                "title": title,
                "startDate": start_date,
            }
        )

    return out


def extract_html_hrefs(html_text: str) -> list[str]:
    return [m.group(1).strip() for m in re.finditer(r"href\s*=\s*['\"]([^'\"]+)['\"]", html_text, re.I)]


def extract_markdown_links(md_text: str) -> list[tuple[str, str]]:
    links: list[tuple[str, str]] = []
    for m in re.finditer(r"\[([^\]]*)\]\(([^)]+)\)", md_text):
        title = m.group(1).strip()
        url = m.group(2).strip()
        links.append((title, url))
    return links


def extract_bare_urls(text: str) -> list[str]:
    urls = []
    for m in re.finditer(r"https?://[^\s)\]>\"']+", text):
        candidate = m.group(0).rstrip(".,;)")
        urls.append(candidate)
    return urls


def parse_html_events(*, calendar_url: str, domain: str, raw_text: str, jina_text: str) -> list[dict[str, Any]]:
    candidates: list[tuple[str | None, str]] = []

    for href in extract_html_hrefs(raw_text):
        candidates.append((None, href))

    for title, link in extract_markdown_links(jina_text):
        candidates.append((title or None, link))

    for bare in extract_bare_urls(jina_text):
        candidates.append((None, bare))

    out: list[dict[str, Any]] = []
    seen_keys: set[str] = set()

    for title, url_candidate in candidates:
        canonical = canonicalize_url(url_candidate, base_url=calendar_url)
        if not canonical:
            continue
        if not is_same_site(canonical, domain):
            continue
        if not likely_event_url(canonical):
            continue

        inferred_title = title if title else infer_title_from_url(canonical)
        start_date = infer_start_date_from_url(canonical)
        key = make_event_key(canonical, inferred_title, start_date, base_url=calendar_url)

        if key in seen_keys:
            continue
        seen_keys.add(key)

        out.append(
            {
                "key": key,
                "eventUrl": canonical,
                "title": inferred_title,
                "startDate": start_date,
            }
        )

    return out


def get_cache_venue(cache: dict[str, Any], domain: str) -> dict[str, Any]:
    venues = cache.get("venues", {})
    if domain in venues:
        return venues[domain] or {}

    normalized_target = normalize_host(domain)
    for key, value in venues.items():
        if normalize_host(key) == normalized_target:
            return value or {}

    return {}


def parse_cache_events(cache_events: list[dict[str, Any]], *, calendar_url: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for event in cache_events:
        event_url = event.get("eventUrl")
        title = event.get("title")
        start_date = event.get("startDate")
        key = make_event_key(event_url, title, start_date, base_url=calendar_url)
        out.append(
            {
                "key": key,
                "eventUrl": canonicalize_url(event_url or "", base_url=calendar_url),
                "title": title,
                "startDate": start_date,
            }
        )
    return out


def count_duplicate_urls(events: list[dict[str, Any]]) -> int:
    seen: set[str] = set()
    duplicates = 0
    for event in events:
        url = event.get("eventUrl")
        if not url:
            continue
        if url in seen:
            duplicates += 1
        else:
            seen.add(url)
    return duplicates


def looks_generic_title(title: str | None) -> bool:
    if not title:
        return True
    text = title.strip()
    if len(text) < 5:
        return True
    lowered = text.lower()
    return any(pat.match(lowered) for pat in GENERIC_TITLE_PATTERNS)


def is_invalid_date(start_date: Any) -> bool:
    if start_date is None:
        return False
    if not isinstance(start_date, str):
        return True
    raw = start_date.strip()
    if not raw:
        return True
    if re.match(r"^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?", raw):
        return False
    if re.match(r"^\d{8}(?:T\d{4,6}Z?)?$", raw):
        return False
    return True


def calculate_quality_flags(
    *,
    cache_events_parsed: list[dict[str, Any]],
    cache_raw_events: list[dict[str, Any]],
    registry_venue: dict[str, Any],
    cache_venue: dict[str, Any],
) -> dict[str, Any]:
    missing_url_count = sum(1 for e in cache_events_parsed if not e.get("eventUrl"))
    duplicate_url_count = count_duplicate_urls(cache_events_parsed)
    invalid_dates_count = sum(1 for e in cache_raw_events if is_invalid_date(e.get("startDate")))
    generic_title_count = sum(1 for e in cache_raw_events if looks_generic_title(e.get("title")))

    stale_metadata = False
    if cache_venue:
        venue_name_cache = (cache_venue.get("venueName") or "").strip()
        category_cache = (cache_venue.get("category") or "").strip()
        city_cache = (cache_venue.get("city") or "").strip()

        venue_name_reg = (registry_venue.get("name") or "").strip()
        category_reg = (registry_venue.get("category") or "").strip()
        city_reg = (registry_venue.get("city") or "").strip()

        if venue_name_cache != venue_name_reg or category_cache != category_reg or city_cache != city_reg:
            stale_metadata = True

    return {
        "invalid_dates_count": invalid_dates_count,
        "duplicate_url_count": duplicate_url_count,
        "missing_url_count": missing_url_count,
        "generic_title_count": generic_title_count,
        "stale_metadata": stale_metadata,
    }


def key_to_display(key: str) -> str:
    if key.startswith("url::"):
        return key[len("url::") :]
    return key


def classify_confidence(
    *,
    source_event_count: int,
    missing_count: int,
    fetch_error: bool,
    cache_event_count: int,
    missing_url_count: int,
) -> str:
    if missing_count == 0:
        return "none"
    if source_event_count == 0:
        return "unknown"
    if fetch_error:
        return "low"
    if cache_event_count > 0 and missing_url_count == cache_event_count:
        return "medium"
    return "high"


def audit_venue(
    venue: dict[str, Any],
    cache: dict[str, Any],
    *,
    timeout: float,
    delay: float,
    ssl_context: ssl.SSLContext | None,
) -> dict[str, Any]:
    domain = (venue.get("domain") or "").strip()
    calendar_url = (venue.get("calendar_url") or "").strip()

    fetched = fetch_source(calendar_url, timeout=timeout, delay=delay, ssl_context=ssl_context)
    source_type = detect_source_type(calendar_url, fetched["jina_text"], fetched["raw_text"])

    if source_type == "ICS":
        source_events = parse_ics_events(
            fetched["jina_text"] if fetched["jina_text"] else fetched["raw_text"],
            calendar_url=calendar_url,
            domain=domain,
        )
    else:
        source_events = parse_html_events(
            calendar_url=calendar_url,
            domain=domain,
            raw_text=fetched["raw_text"],
            jina_text=fetched["jina_text"],
        )

    source_keys = {e["key"] for e in source_events}

    cache_venue = get_cache_venue(cache, domain)
    cache_raw_events = cache_venue.get("events") if isinstance(cache_venue.get("events"), list) else []
    cache_events = parse_cache_events(cache_raw_events, calendar_url=calendar_url)
    cache_keys = {e["key"] for e in cache_events}

    missing = sorted(source_keys - cache_keys)
    extra = sorted(cache_keys - source_keys)
    intersection_count = len(source_keys & cache_keys)

    source_count = len(source_keys)
    coverage_ratio = round(intersection_count / source_count, 4) if source_count > 0 else None

    quality_flags = calculate_quality_flags(
        cache_events_parsed=cache_events,
        cache_raw_events=cache_raw_events,
        registry_venue=venue,
        cache_venue=cache_venue,
    )

    fetch_error = bool(fetched["jina_error"] or fetched["raw_error"])

    return {
        "domain": domain,
        "venue_name_registry": venue.get("name") or "",
        "calendar_url": calendar_url,
        "source_type": source_type,
        "source_event_count": source_count,
        "cache_event_count": len(cache_keys),
        "coverage_ratio": coverage_ratio,
        "missing_count": len(missing),
        "extra_count": len(extra),
        "intersection_count": intersection_count,
        "missing_examples": [key_to_display(k) for k in missing[:20]],
        "extra_examples": [key_to_display(k) for k in extra[:20]],
        "quality_flags": quality_flags,
        "fetch_errors": {
            "jina_error": bool(fetched["jina_error"]),
            "raw_error": bool(fetched["raw_error"]),
            "jina_error_detail": fetched["jina_error"],
            "raw_error_detail": fetched["raw_error"],
        },
        "confidence": classify_confidence(
            source_event_count=source_count,
            missing_count=len(missing),
            fetch_error=fetch_error,
            cache_event_count=len(cache_keys),
            missing_url_count=quality_flags["missing_url_count"],
        ),
    }


def unique_venues_by_domain_calendar(venues: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    seen: set[tuple[str, str]] = set()
    unique: list[dict[str, Any]] = []
    duplicates = 0

    for venue in venues:
        domain = normalize_host(venue.get("domain"))
        calendar_url = (venue.get("calendar_url") or "").strip().rstrip("/")
        key = (domain, calendar_url)
        if key in seen:
            duplicates += 1
            continue
        seen.add(key)
        unique.append(venue)

    return unique, duplicates


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total_rows = len(rows)
    venues_with_gaps = sum(1 for r in rows if r.get("missing_count", 0) > 0)
    rows_with_source = [r for r in rows if (r.get("source_event_count") or 0) > 0]
    rows_without_source = [r for r in rows if (r.get("source_event_count") or 0) == 0]

    total_missing_events = sum(r.get("missing_count", 0) for r in rows_with_source)

    avg_coverage_with_source = None
    if rows_with_source:
        avg_coverage_with_source = round(
            sum((r.get("coverage_ratio") or 0.0) for r in rows_with_source) / len(rows_with_source), 4
        )

    coverage_buckets = {
        "zero": 0,
        "one_to_25": 0,
        "twenty6_to_50": 0,
        "fifty1_to_75": 0,
        "seventy6_to_99": 0,
        "hundred": 0,
    }

    for row in rows_with_source:
        c = row.get("coverage_ratio") or 0.0
        if c == 0:
            coverage_buckets["zero"] += 1
        elif c <= 0.25:
            coverage_buckets["one_to_25"] += 1
        elif c <= 0.5:
            coverage_buckets["twenty6_to_50"] += 1
        elif c <= 0.75:
            coverage_buckets["fifty1_to_75"] += 1
        elif c < 1:
            coverage_buckets["seventy6_to_99"] += 1
        else:
            coverage_buckets["hundred"] += 1

    fetch_error_count = sum(1 for r in rows if r["fetch_errors"]["jina_error"] or r["fetch_errors"]["raw_error"])
    stale_metadata_count = sum(1 for r in rows if r["quality_flags"].get("stale_metadata"))

    high_confidence_gap_count = sum(
        1
        for r in rows
        if r.get("confidence") == "high" and (r.get("missing_count") or 0) > 0
    )

    return {
        "total_venues_checked": total_rows,
        "venues_with_gaps_count": venues_with_gaps,
        "rows_with_source_count": len(rows_with_source),
        "rows_without_source_count": len(rows_without_source),
        "total_missing_events": total_missing_events,
        "average_coverage_with_source": avg_coverage_with_source,
        "coverage_distribution_with_source": coverage_buckets,
        "fetch_error_count": fetch_error_count,
        "stale_metadata_count": stale_metadata_count,
        "high_confidence_gap_count": high_confidence_gap_count,
    }


def render_markdown(report: dict[str, Any]) -> str:
    rows = report["rows"]
    summary = report["summary"]

    lines: list[str] = []
    lines.append("# Scrape Coverage Audit")
    lines.append("")
    lines.append(f"Generated: {report['generated_at_utc']}")
    lines.append(f"Total venues checked: {summary['total_venues_checked']}")
    lines.append(f"Venues with gaps: {summary['venues_with_gaps_count']}")
    lines.append(f"Rows with source events: {summary['rows_with_source_count']}")
    lines.append(f"Rows without source events: {summary['rows_without_source_count']}")
    lines.append(f"Total missing events (rows with source): {summary['total_missing_events']}")
    lines.append(f"Average coverage (rows with source): {summary['average_coverage_with_source']}")
    lines.append("")

    lines.append("## Coverage Distribution (Rows with Source)")
    dist = summary["coverage_distribution_with_source"]
    lines.append(f"- 0%: {dist['zero']}")
    lines.append(f"- 1-25%: {dist['one_to_25']}")
    lines.append(f"- 26-50%: {dist['twenty6_to_50']}")
    lines.append(f"- 51-75%: {dist['fifty1_to_75']}")
    lines.append(f"- 76-99%: {dist['seventy6_to_99']}")
    lines.append(f"- 100%: {dist['hundred']}")
    lines.append("")

    lines.append("## Top 25 Gaps")
    lines.append("")
    lines.append("| Rank | Domain | Source | Cache | Missing | Coverage | Confidence | Fetch Error |")
    lines.append("| --- | --- | ---: | ---: | ---: | ---: | --- | --- |")

    gaps = [r for r in rows if (r.get("missing_count") or 0) > 0]
    for i, row in enumerate(gaps[:25], start=1):
        cov = row.get("coverage_ratio")
        cov_str = "n/a" if cov is None else f"{cov*100:.1f}%"
        fetch_error = row["fetch_errors"]["jina_error"] or row["fetch_errors"]["raw_error"]
        lines.append(
            f"| {i} | {row['domain']} | {row['source_event_count']} | {row['cache_event_count']} | {row['missing_count']} | {cov_str} | {row['confidence']} | {'yes' if fetch_error else 'no'} |"
        )

    lines.append("")
    lines.append("## High-Confidence Gap Details")
    lines.append("")

    high_conf = [r for r in gaps if r.get("confidence") == "high"]
    for row in high_conf[:25]:
        cov = row.get("coverage_ratio")
        cov_str = "n/a" if cov is None else f"{cov*100:.1f}%"
        lines.append(f"### {row['domain']}")
        lines.append(f"- Venue: {row.get('venue_name_registry')}")
        lines.append(f"- Calendar URL: {row.get('calendar_url')}")
        lines.append(f"- Missing: {row.get('missing_count')}")
        lines.append(f"- Coverage: {cov_str}")
        lines.append(f"- Source type: {row.get('source_type')}")
        lines.append("- Missing examples:")
        for example in row.get("missing_examples", [])[:10]:
            lines.append(f"  - `{example}`")
        lines.append("")

    lines.append("## Notes")
    lines.append("- Report is read-only and may include fetch/noise limits on JS-heavy sites.")
    lines.append("- Confidence is heuristic: high/medium/low/unknown.")
    lines.append("")

    return "\n".join(lines)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Read-only scrape coverage auditor")
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY_PATH)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE_PATH)
    parser.add_argument("--output-json", type=Path, default=DEFAULT_OUTPUT_JSON)
    parser.add_argument("--output-md", type=Path, default=DEFAULT_OUTPUT_MD)
    parser.add_argument("--start", type=int, default=1, help="1-indexed start venue")
    parser.add_argument("--end", type=int, default=None, help="1-indexed inclusive end venue")
    parser.add_argument("--max-venues", type=int, default=None)
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY_SECONDS)
    parser.add_argument("--insecure", action="store_true", help="Disable TLS verification")
    parser.add_argument("--quiet", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    if not args.registry.exists():
        print(f"Registry file not found: {args.registry}", file=sys.stderr)
        return 1
    if not args.cache.exists():
        print(f"Cache file not found: {args.cache}", file=sys.stderr)
        return 1

    registry = load_json(args.registry)
    cache = load_json(args.cache)

    venues = [v for v in registry if str(v.get("calendar_url", "")).startswith("http")]
    venues, dropped_dupes = unique_venues_by_domain_calendar(venues)

    start_idx = max(1, args.start)
    end_idx = args.end if args.end is not None else len(venues)
    end_idx = min(end_idx, len(venues))

    if start_idx > end_idx:
        print("Invalid range: start > end", file=sys.stderr)
        return 1

    selected = venues[start_idx - 1 : end_idx]
    if args.max_venues is not None:
        selected = selected[: max(0, args.max_venues)]

    ssl_context = build_ssl_context(args.insecure)

    rows: list[dict[str, Any]] = []
    total_selected = len(selected)

    for i, venue in enumerate(selected, start=1):
        if not args.quiet:
            print(f"[{i}/{total_selected}] Auditing {venue.get('domain')} ...")
        try:
            row = audit_venue(
                venue,
                cache,
                timeout=args.timeout,
                delay=args.delay,
                ssl_context=ssl_context,
            )
            rows.append(row)
        except Exception as e:
            rows.append(
                {
                    "domain": venue.get("domain", ""),
                    "venue_name_registry": venue.get("name", ""),
                    "calendar_url": venue.get("calendar_url", ""),
                    "source_type": "unknown",
                    "source_event_count": 0,
                    "cache_event_count": 0,
                    "coverage_ratio": None,
                    "missing_count": 0,
                    "extra_count": 0,
                    "intersection_count": 0,
                    "missing_examples": [],
                    "extra_examples": [],
                    "quality_flags": {
                        "invalid_dates_count": 0,
                        "duplicate_url_count": 0,
                        "missing_url_count": 0,
                        "generic_title_count": 0,
                        "stale_metadata": False,
                    },
                    "fetch_errors": {
                        "jina_error": True,
                        "raw_error": True,
                        "jina_error_detail": str(e),
                        "raw_error_detail": str(e),
                    },
                    "confidence": "unknown",
                }
            )

    rows.sort(
        key=lambda r: (
            -(r.get("missing_count") or 0),
            (r.get("coverage_ratio") if r.get("coverage_ratio") is not None else 1.0),
            -(r.get("source_event_count") or 0),
            r.get("domain") or "",
        )
    )

    summary = summarize(rows)

    report = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "inputs": {
            "registry": str(args.registry),
            "cache": str(args.cache),
            "start": start_idx,
            "end": end_idx,
            "max_venues": args.max_venues,
            "timeout": args.timeout,
            "delay": args.delay,
            "insecure": args.insecure,
        },
        "dedupe": {
            "dropped_duplicate_registry_rows": dropped_dupes,
        },
        "summary": summary,
        "rows": rows,
    }

    write_json(args.output_json, report)
    write_text(args.output_md, render_markdown(report))

    if not args.quiet:
        print(f"Wrote JSON: {args.output_json}")
        print(f"Wrote Markdown: {args.output_md}")
        print(json.dumps(summary, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
