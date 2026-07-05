# Venue Discovery and SVDA

Squirtle has a separate venue-discovery workflow that proposes new venue sources for the registry. The goal is to find Bay Area venues with structured event calendars that can feed the scraper pipeline.

## Main artifacts
- `data/venue-registry.json` — production venue registry and the source of truth for what the scraper targets.
- `data/venue-events-cache.json` — scraped venue event cache consumed by the API.
- `data/venue-candidates/` — audit trail for managed-agent discovery runs.
- `docs/svda/` — operational documentation for the managed-agent setup.
- `scripts/svda/run_managed_agent.py` — runner that starts Anthropic Managed Agents sessions.
- `curate-events-api/scripts/scrape-venues.js` — the scraper that fetches and extracts venue calendars.

## Scraper pipeline
`scrape-venues.js` is the production scrape job. Its current behavior is intentionally cautious:

- loads the venue registry
- fetches venue calendar pages through Jina Reader
- extracts structured events with an LLM
- uses DeepSeek V4 Flash as the primary extractor and Claude Haiku as a fallback
- persists results to the venue cache
- writes scrape run history into the database when available

The scraper is cache-first and incremental. It saves after each venue so partial progress survives failures.

## Candidate artifacts
`data/venue-candidates/schema.json` defines the structure of weekly SVDA run output.
`data/venue-candidates/README.md` explains that candidate JSON is an audit trail rather than the production source of truth.

The schema expects fields such as:
- run metadata
- geographic scope
- proposed candidates
- rejected candidates
- sample events
- scoring and dedup status

## Managed-agent workflow
`docs/svda/PROMPT.md` and `docs/svda/MANAGED_AGENT_CONFIG.md` describe the intended Anthropic Managed Agents setup.
The workflow is designed to:

1. inspect the registry and category mapping
2. search for a small number of candidate Bay Area venues
3. fetch and verify each candidate page in-session
4. write a dated candidate artifact
5. propose registry rows only for qualified novel venues
6. open a PR rather than writing directly to `main`

The agent runner in `scripts/svda/run_managed_agent.py` handles the Anthropic API calls, vault setup, GitHub MCP wiring, and smoke testing.

## Why this exists
Venue discovery was split out because the core app needs a high-signal registry of working calendar URLs. The weekly discovery process is meant to improve coverage without letting unreviewed sources silently enter production.

## Things to watch when editing
- Keep the registry shape stable; the scraper and preview allowlist both read it.
- Do not invent sample events or candidate URLs in documentation or code.
- Preserve the fallback behavior if the primary extraction model fails.
- Check `docs/svda/` before changing the runner or schedule.
