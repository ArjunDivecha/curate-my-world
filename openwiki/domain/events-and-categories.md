# Events and Categories

This page describes the event model, category system, and filtering rules used by the backend and frontend.

## Canonical category model
`curate-events-api/src/utils/categoryMapping.js` is the single source of truth for categories.
It defines `CATEGORY_CONFIG`, supported categories, display names, provider-specific search hints, and keyword lists.

Current categories in the live config include:
- music
- theatre
- comedy
- movies
- art
- food
- tech
- lectures
- kids
- desi
- dance
- lgbtq

The file also explains which categories Ticketmaster supports directly and which ones are scraper-first.

## Provider mix
The active production providers are:

- **Ticketmaster**: structured backbone source for broad coverage
- **Venue scraper**: cache-backed source for venue calendars
- **Whitelist**: legacy source that searches approved domains

The backend still contains historical references to removed providers, but they are not part of the live pipeline.

## Event pipeline
The main route in `curate-events-api/src/routes/events.js` assembles events through a sequence of filters:

1. provider fetch
2. deduplication
3. shared rules filter
4. blacklist filtering
5. event validation
6. location filtering
7. date filtering
8. category filtering

This ordering matters. Several recent fixes were aimed at preventing duplicate category leakage, route shadowing, and invalid fallback behavior.

## Validation gate
`curate-events-api/src/utils/eventValidator.js` rejects events that look like listing pages or unusable placeholders.
It checks:

- missing or blank titles
- listing-page titles and URLs
- missing or invalid dates when a date is required
- placeholder venue names when a venue is required

This gate exists to keep list pages, calendars, and broad browse URLs from entering the event feed as if they were single events.

## Location and date filtering
The backend uses Bay Area-specific filters rather than generic broad searches:

- `curate-events-api/src/utils/locationFilter.js` holds city/region exclusion logic and Bay Area matching.
- `curate-events-api/src/utils/dateFilter.js` interprets ranges like today, this weekend, next 7 days, and next 30 days.
- `curate-events-api/src/utils/timeZoneDate.js` centralizes Pacific-time date math.

Timezone handling is especially important. Ticketmaster event times are venue-local, and the backend explicitly converts them through the events timezone so UTC hosts do not shift dates by several hours.

## Frontend category behavior
The frontend still keeps its own display ordering and label mapping, but it is driven by backend categories.
Important consumers:

- `src/hooks/useDashboardLogic.ts`
- `src/components/Dashboard.tsx`
- `src/components/EventCard.tsx`

`useDashboardLogic.ts` also special-cases category aliases such as `technology -> tech` and merges `tech` and `technology` buckets defensively.

## What to watch out for
- Add category changes in `categoryMapping.js` first.
- Verify `SUPPORTED_CATEGORIES` and any frontend ordering or display maps after category edits.
- Do not treat Ticketmaster's "Arts & Theatre" segment as visual art; the code explicitly avoids that shortcut.
- If a change affects `startDate` formats or timezone conversions, revisit `TicketmasterClient.js`, `dateFilter.js`, and the frontend date views together.
