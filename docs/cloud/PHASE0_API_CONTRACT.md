# Phase 0 API Contract (v1)

This document defines the stable API surface for:
- macOS web browser usage
- iOS native app usage

It is based on current backend behavior in `curate-events-api/server.js` and route handlers under `curate-events-api/src/routes/`.

## Contract Rules

- Base URL is environment-specific, API prefix is always `/api`.
- JSON responses only.
- Timestamps use ISO-8601 when provided.
- Do not break these fields without a version bump.

## Canonical Endpoints (Stable)

### Health

- `GET /api/health`
- `GET /api/health/deep`

Minimal expected fields:
- `status`: `healthy` or `degraded` or `unhealthy`
- `timestamp`: string

### Categories

- `GET /api/events`

Minimal expected fields:
- `success`: boolean
- `categories`: array
- `count`: number

### Event Feed (All Categories)

- `GET /api/events/all-categories`

Query params:
- `location` (optional, default `San Francisco, CA`)
- `date_range` (optional, default backend behavior)
- `limit` (optional)
- `providers` (optional CSV from `ticketmaster,venue_scraper,whitelist`)

Minimal expected fields:
- `success`: boolean
- `eventsByCategory`: object keyed by category
- `categoryStats`: object
- `totalEvents`: number
- `processingTime`: number
- `providerDetails`: array

### Event Feed (Single Category)

- `GET /api/events/:category`

Query params:
- `location` (required)
- `date_range` (optional)
- `limit` (optional)

Minimal expected fields:
- `success`: boolean
- `events`: array
- `count`: number
- `metadata`: object

### Lists (Read APIs)

- `GET /api/lists`
- `GET /api/lists/whitelist`

Minimal expected fields:
- `success`: boolean

## Event Object Contract (Client-Facing)

The app should tolerate missing optional fields. Required client-safe fields:
- `id`: string
- `title`: string
- `startDate`: string (ISO preferred)
- `category`: string
- `source`: string

Optional fields:
- `description`
- `endDate`
- `venue` object with `name`, `address`, `city`
- `eventUrl`
- `ticketUrl`
- `price`
- `image`

## Error Envelope (Contract Target)

Current routes vary in error shape. Contract target for mobile/web clients:

```json
{
  "success": false,
  "error": "Human-readable summary",
  "message": "Optional detail",
  "requestId": "optional-id",
  "timestamp": "2026-02-08T00:00:00.000Z"
}
```

## Non-Canonical/Legacy Endpoints

These exist but are not part of the iOS/web stable contract:
- `/api/personalization/*`
- `/api/rules/*`
- `/api/preview/*`
- diagnostic provider endpoints under `/api/events/:category/*`

Clients should avoid tight coupling to these while cloud and iOS migration is in progress.
