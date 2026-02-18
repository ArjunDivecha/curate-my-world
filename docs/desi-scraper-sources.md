# Desi Scraper Source Matrix

Last verified: 2026-02-18

## Active (seeded in `data/venue-registry.json`)

| Source | Domain | Calendar URL | Category | Notes |
|---|---|---|---|---|
| Sulekha Bay Area Indian Events | `events.sulekha.com` | `https://events.sulekha.com/san-francisco-bay-area` | `desi` | Reachable listing page. |
| Eventmozo Bay Area Bollywood Events | `eventmozo.com` | `https://eventmozo.com/Bay_Area/Bollywood` | `desi` | Reachable listing page. |
| ePadosi Bay Area Indian Events | `epadosi.com` | `https://www.epadosi.com/bay-area/indian-events` | `desi` | Reachable listing page with Bay Area event listings. |
| SimplyDesi Events | `simplydesi.us` | `https://www.simplydesi.us/events` | `desi` | Reachable listing page; includes Bay Area + national listings. |

## Partner/Legal Review Before Scraping

| Source | Domain | URL Checked | Reason |
|---|---|---|---|
| SFIndian | `sfindian.com` | `https://www.sfindian.com/robots.txt` | `User-agent: * Disallow: /` (blocked for generic crawlers). |
| DesiEventsOnline | `desieventsonline.com` | `https://www.desieventsonline.com/robots.txt` | `User-agent: * Disallow: /` (blocked for generic crawlers). |

## Not Seeded Yet

| Source | Domain | URL Checked | Reason |
|---|---|---|---|
| India Community Center | `indiacc.org` | `https://www.indiacc.org/events/` | Current URL returns page-not-found; needs validated event feed URL. |

## Implementation Notes

- `desi` is implemented as scraper-first category (not Ticketmaster classification driven).
- Classifier includes boundary-safe desi signals (`desi`, `bollywood`, `bhangra`, `garba`, etc.) and excludes obvious Native American context (`american indian`, `indigenous`).
- For new domains, add only when listing URL is reachable and robots/ToS permit automated fetching.
