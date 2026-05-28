---
name: venue-discovery
description: Weekly Squirtle venue discovery rules for the svda-weekly Claude Managed Agent. Use when proposing new Bay Area venue registry rows from web research.
---

# Squirtle Venue Discovery

## Purpose

Run weekly inside the `svda-weekly-managed` Claude Managed Agent to propose new Bay Area venues for Squirtle. The agent must create a PR, not push to `main`.

## Required Context

Before researching candidates:

1. Read `curate-events-api/src/utils/categoryMapping.js`.
2. Read `data/venue-registry.json`.
3. Read `data/venue-candidates/schema.json`.

Use `categoryMapping.js` as the live source of truth for registry category keys. For Phase 1, the discovery theme is `Desi`; registry rows for South Asian diaspora sources should normally use the canonical lower-case `desi` category when that category exists in `CATEGORY_CONFIG`.

## Geographic Scope

Accept only venues in:

- San Francisco
- Oakland
- Berkeley
- Peninsula: San Mateo, Burlingame, Redwood City, Palo Alto, Menlo Park
- South Bay: San Jose, Mountain View, Cupertino, Santa Clara, Sunnyvale
- Marin: Mill Valley, San Rafael, Sausalito

Reject Sacramento, Los Angeles, San Diego, locations outside California, and uncertain locations.

## Phase 1 Discovery Theme

Desi means events oriented toward South Asian or Indian diaspora audiences, including:

- Carnatic, Hindustani, bhajan, qawwali, and other classical or devotional music
- Diwali, Holi, Navratri, Onam, Vaisakhi, garba, dandiya, and similar festivals
- Bollywood and regional Indian film screenings
- Bharatanatyam, Kathak, bhangra, folk dance, and cultural performances
- Temple, gurdwara, mosque, and cultural-center events serving South Asian communities
- South Asian food festivals, comedy, theatre, and talks

## Candidate Requirements

A candidate may be proposed only if all are true:

- Its event page was fetched in this session.
- It has at least one real upcoming event with title, date, and URL.
- It is not an aggregator category page, broad Meetup listing, Facebook-only page, or Ticketmaster-heavy source.
- It is within the geographic scope.
- It is not already present in `data/venue-registry.json`.

Prefer sources with at least 3 events per month. Borderline candidates belong in the JSON sidecar only, not in the registry diff.

## Dedup Logic

Check duplicates in this order:

1. URL/domain match: compare canonicalized `website`, `calendar_url`, `url`, and `domain` values after stripping protocol, `www.`, trailing slash, query string, and fragment.
2. Name match: compare lowercased punctuation-stripped candidate names against existing names and aliases. Use token-set style matching when available.

Set `dedup_status`:

- `duplicate_existing`: exact URL/domain match or name similarity >= 0.95.
- `likely_duplicate`: 0.85 <= name similarity < 0.95.
- `novel`: no strong match.

## Scoring

Use scores from 0 to 1.

`extraction_score`:

- 1.0: clean event list with title, ISO-like date, URL, and optional time.
- 0.7: events are extractable with light reasoning.
- 0.4: events exist but layout is messy or ambiguous.
- 0.0: no structured events.

`agent_confidence`:

Judge site legitimacy, event freshness, monthly event volume, geographic match, category match, and whether Squirtle would gain unique coverage.

## Registry Row Cutoff

Set `registry_row_proposed: true` and append a registry row to the PR only when all are true:

- `agent_confidence >= 0.70`
- `extraction_score >= 0.70`
- `dedup_status` is `novel`
- `monthly_event_estimate >= 3`

Rows not meeting the cutoff remain in `data/venue-candidates/YYYY-MM-DD_candidates.json` with `registry_row_proposed: false`.

## Registry Row Shape

Match the existing registry schema. For a new row, include at least:

- `name`
- `domain`
- `category`
- `city`
- `state`
- `website`
- `calendar_url`
- `source`
- `discovered_at`

Use `source: "svda_weekly"`. Use ISO timestamp strings for `discovered_at`. Do not invent coordinates.

## Rejection Reasons

Use only these strings:

- `no_structured_events`
- `geographic_mismatch`
- `category_mismatch`
- `duplicate_existing`
- `dead_site`
- `extraction_failed`
- `low_event_volume`

## Output And PR

Write the full run record to `data/venue-candidates/YYYY-MM-DD_candidates.json` and validate it against `data/venue-candidates/schema.json` before committing.

If validation or registry re-read checks fail, do not open a normal candidate PR. Instead write `data/venue-candidates/YYYY-MM-DD_ERROR.md` explaining the failure.

Create a branch named `claude/svda-YYYY-MM-DD`. Open a PR titled:

`SVDA weekly run YYYY-MM-DD: N candidates (K registry rows proposed)`

The PR body must include proposed count, registry rows proposed, rejected count by reason, total cost if available, session duration if available, and a table of registry rows proposed.
