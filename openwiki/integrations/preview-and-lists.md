# Preview and Lists

This page covers the user-facing integrations that sit beside the event feed: the preview proxy and the moderation list system.

## Preview proxy
`curate-events-api/src/routes/preview.js` serves two related behaviors:

1. a restricted server-side proxy that uses Jina Reader to render approved third-party event pages
2. a static event preview page that renders from query parameters when the source site itself is not previewable

Important details:
- only approved domains are allowed
- private/internal hosts are blocked
- fallback content is used when Jina Reader fails or the site blocks automation
- the route adds headers so the preview can be embedded safely

The frontend event card uses this for event-clickthrough behavior.

## Moderation lists
`curate-events-api/src/routes/lists.js` and `curate-events-api/src/utils/listManager.js` implement whitelist and blacklist storage.

List types include:
- whitelist domains
- blacklist sites/domains
- blacklist events

The list manager supports two storage modes:
- file-backed XLSX lists in `data/`
- Postgres-backed storage when `LIST_STORAGE_MODE=db`

Production writes are intentionally guarded. If the server is running in production without DB-backed list storage, write endpoints return a 403 rather than mutating local files.

## Frontend actions
`src/components/EventCard.tsx` gives the user action affordances for:

- opening the event page
- saving to calendar
- whitelisting a domain
- blacklisting a specific event
- blacklisting a whole domain

These actions call the backend APIs and depend on the event record exposing a usable URL.

## Why these integrations exist
The event feed is designed to be adjustable. Preview lets users inspect a source without leaving the app, while lists let users steer the feed away from noisy domains or specific bad entries.

## When changing this area
- Check SSRF and allowlist behavior in `preview.js` first.
- Check production write guards in `lists.js` before changing list storage.
- Check `EventCard.tsx` if you change button labels, URLs, or event action order.
