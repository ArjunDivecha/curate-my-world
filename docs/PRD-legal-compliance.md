# PRD: Legal Compliance for Commercialization

**Project:** Curate-My-World Squirtle  
**Date:** 2026-02-25  
**Priority:** Must-have before any monetization  
**Codebase Root:** `/Users/arjundivecha/Dropbox/AAA Backup/A Working/Curate-My-World Squirtle`

---

## Context

The system scrapes ~100+ Bay Area venue websites every 6 hours using three methods (JSON-LD, iCal, generic DOM scraping via Playwright). It currently copies full event descriptions and image URLs, uses a spoofed browser user agent, ignores robots.txt, and provides no attribution. These practices create copyright, contract, and state-law exposure that blocks commercialization. The changes below are ordered by legal impact and implementation effort.

---

## Change 1: Honest User Agent String

**Risk addressed:** Spoofed user agent is evidence of bad faith in any litigation. Courts have cited deceptive bot identification as a negative factor (Air Canada v. Seats.aero).

**Current code:** `backend/src/scrapers/base-scraper.ts` line in constructor:
```ts
userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
```

**Change:** Replace with an honest bot identifier:
```ts
userAgent: 'CurateMyWorldBot/1.0 (+https://squirtle-eta.vercel.app/bot-info; contact@curatemyworld.com)',
```

**Also:** Add a new static page at the frontend route `/bot-info` (just a simple page in `src/pages/`) explaining:
- What the bot does (indexes publicly available event information)
- Scraping frequency (every 6 hours)  
- Contact email for opt-out requests
- Statement that the bot respects robots.txt (after Change 2 is implemented)

**Files to modify:**
- `backend/src/scrapers/base-scraper.ts` — default `userAgent` in constructor
- `src/pages/BotInfo.tsx` — new page (create)
- `src/App.tsx` — add route for `/bot-info`

**Effort:** ~30 min

---

## Change 2: Robots.txt Compliance

**Risk addressed:** Not checking robots.txt forfeits an implied-license defense where robots.txt is permissive, and creates negative evidence where it would have blocked access. Courts have cited robots.txt non-compliance in trespass-to-chattels claims (eBay v. Bidder's Edge).

**Current code:** `base-scraper.ts` `navigateTo()` method goes directly to the URL with no robots.txt check.

**Change:** Create a new utility `backend/src/utils/robots-checker.ts` that:
1. Fetches `{origin}/robots.txt` before the first scrape of any venue
2. Parses it for `Disallow` directives matching the bot's user agent and `*`
3. Caches the result per domain (in-memory Map with 24h TTL — no need for DB)
4. Returns `{ allowed: boolean }` for a given URL

**Integration:** In `base-scraper.ts`, call the checker in the `scrape()` method before `navigateTo()`. If disallowed, return a `ScraperResult` with `status: 'skipped'` and `error: 'Blocked by robots.txt'`.

Use the npm package `robots-parser` (already well-maintained, small footprint) rather than writing a custom parser.

**Files to modify/create:**
- `backend/src/utils/robots-checker.ts` — new file
- `backend/src/scrapers/base-scraper.ts` — add check in `scrape()` before navigation
- `backend/package.json` — add `robots-parser` dependency

**Effort:** ~1-2 hours

---

## Change 3: Stop Storing Full Descriptions

**Risk addressed:** Event descriptions are copyrightable creative content. Copying them wholesale is the single highest copyright infringement risk. Under AP v. Meltwater, even opening paragraphs of promotional text clear the originality bar.

**Current code:** 
- `base-scraper.ts` `processRawEvent()` passes `raw.description` through `cleanText()` (whitespace cleanup only) and stores it as `description` in `EventInput`
- `event-service.ts` `create()` stores `description` as `TEXT` column in the `events` table
- `jsonld-scraper.ts` copies `item.description` directly from JSON-LD
- `generic-scraper.ts` copies description via CSS selector
- `ical-scraper.ts` copies `DESCRIPTION` field from iCal

**Change:** Replace full descriptions with a short auto-generated snippet (max 160 chars) derived from the title + venue + date/time. Do NOT store the original description.

Specifically, in `base-scraper.ts` `processRawEvent()`, replace:
```ts
description: raw.description ? this.cleanText(raw.description) : undefined,
```
with:
```ts
description: this.generateSnippet(raw, this.venue),
```

Add a new method to `BaseScraper`:
```ts
protected generateSnippet(raw: RawEvent, venue: Venue): string {
  // Generate a factual-only snippet from uncopyrightable data
  const parts: string[] = [];
  if (raw.isFree) parts.push('Free');
  if (raw.price) parts.push(raw.price);
  parts.push(`at ${venue.name}`);
  if (venue.city) parts.push(`in ${venue.city}`);
  return parts.join(' · ').substring(0, 160);
}
```

Also **stop storing `raw_data`** (the full JSON-LD or DOM content) by setting it to `null` instead of `JSON.stringify(input.rawData)` in `event-service.ts`. The `raw_data JSONB` column in the events table is a liability — it contains the complete copyrighted source material.

**DB migration:** Run `UPDATE events SET description = NULL, raw_data = NULL;` to purge existing copied descriptions. (The `description` column stays in the schema for the generated snippets going forward.)

**Frontend impact:** Event detail views should link to the source URL for full details instead of showing a description block. Update any component that renders `event.description` to show the snippet + a "View full details →" link to `event.url`.

**Files to modify:**
- `backend/src/scrapers/base-scraper.ts` — replace description handling, add `generateSnippet()`
- `backend/src/services/event-service.ts` — set `raw_data` to `null` in `create()` and `update()`
- `backend/src/types/event.ts` — no schema change needed, `description` stays optional
- Frontend event detail component — show snippet + source link instead of full description
- One-time migration SQL to purge existing data

**Effort:** ~2-3 hours

---

## Change 4: Stop Rehosting Images — Link to Source

**Risk addressed:** Downloading and serving venue promotional photos/artwork is copyright infringement. Even hot-linking has mixed case law (Perfect 10 v. Amazon supports it; Goldman v. Breitbart questions it outside search context).

**Current code:** 
- `image_url VARCHAR(1000)` column stores the URL from the source site
- `jsonld-scraper.ts` `extractImage()` extracts image URLs from JSON-LD
- `generic-scraper.ts` extracts `src` from `<img>` elements

**Check first:** Verify whether the frontend is hot-linking to source URLs (acceptable) or downloading/proxying images through the backend (not acceptable). If images are served directly from `image_url` values as `<img src={event.imageUrl}>`, this is hot-linking and is the lower-risk approach.

**Change if images are proxied/downloaded:** Remove any image download/proxy logic and serve only the source URL in `<img>` tags.

**Change regardless:** Add `rel="noopener noreferrer"` to image links. Consider adding a fallback placeholder image (a generic category-based illustration, not scraped content) for when source images 404.

**Also consider:** For the safest approach, don't display source images at all — use category-based placeholder graphics (music note for concerts, palette for art, etc.) and link to the source page. This eliminates image copyright risk entirely.

**Files to modify:**
- Frontend event card/detail components — audit image rendering
- `public/` — add category placeholder images if going the no-source-image route

**Effort:** ~1-2 hours

---

## Change 5: Add Source Attribution

**Risk addressed:** Lack of attribution eliminates potential fair use arguments and makes the site look like it's passing off venue content as original. Attribution is the single cheapest legal goodwill measure.

**Current code:** The `events` table has `url VARCHAR(1000)` and `ticket_url VARCHAR(1000)` columns. The `venues` table has `website VARCHAR(500)`. This data exists but may not be prominently displayed.

**Change:** Every event displayed on the site must show:
1. **Source attribution line:** "Event info from [Venue Name]" with `venue.website` linked
2. **Direct link to source event page:** "View on [domain]" linking to `event.url`
3. **Ticket link preserved:** "Get tickets" linking to `event.ticketUrl` (this is in the venue's interest — driving ticket sales)

Add a standardized `<EventAttribution>` component used in both the event card (list view) and event detail view.

**Also:** Add a footer line on the site: "Event information is sourced from venue websites. Venue operators: contact [email] for corrections or removal."

**Files to modify:**
- `src/components/EventAttribution.tsx` — new component
- Event card component — integrate `<EventAttribution>`
- Event detail page — integrate `<EventAttribution>`
- Site footer component — add venue contact line

**Effort:** ~1-2 hours

---

## Change 6: Venue Opt-Out API Endpoint

**Risk addressed:** Receiving a cease-and-desist letter and continuing to scrape dramatically worsens legal position under both CFAA and California § 502. A self-service opt-out mechanism demonstrates good faith and prevents the most dangerous scenario (scraping after notice).

**Current code:** `venues` table has `status venue_status` enum with values `'active' | 'inactive' | 'pending' | 'error'`. The `venue-service.ts` `getActiveForScraping()` only returns venues with `status = 'active'`.

**Change:** 
1. Add a new status value `'opted_out'` to the `venue_status` enum
2. Create a new API endpoint `POST /api/venues/opt-out` that accepts `{ domain: string, email: string, reason?: string }` and:
   - Finds venues matching the domain
   - Sets their status to `'opted_out'`
   - Deletes all events from those venues (`DELETE FROM events WHERE venue_id = $1`)
   - Logs the opt-out request to a new `opt_out_requests` table
   - Sends a confirmation (or just logs it for now)
3. The existing `getActiveForScraping()` query already filters on `status = 'active'`, so opted-out venues are automatically excluded

**DB migration:**
```sql
ALTER TYPE venue_status ADD VALUE 'opted_out';

CREATE TABLE opt_out_requests (
    id SERIAL PRIMARY KEY,
    venue_id INTEGER REFERENCES venues(id),
    domain VARCHAR(500),
    requester_email VARCHAR(255),
    reason TEXT,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Also:** Add a simple opt-out form page at `/opt-out` on the frontend (name, email, domain, reason textarea, submit button).

**Files to modify/create:**
- `backend/src/db/schema.sql` — add enum value + new table (for reference)
- DB migration script — new file
- `backend/src/routes/venues.ts` — add `POST /opt-out` endpoint
- `backend/src/services/venue-service.ts` — add `optOut(domain)` method
- `src/pages/OptOut.tsx` — new page
- `src/App.tsx` — add route

**Effort:** ~2-3 hours

---

## Change 7: Scraper Method Priority System

**Risk addressed:** iCal feeds and JSON-LD are legally safer than DOM scraping. The system should prefer safer methods and only fall back to DOM scraping when no structured data is available.

**Current code:** `runner.ts` `getScraperForVenue()` picks scraper based on `venue.scraperId` field defaulting to `'jsonld'`:
```ts
private getScraperForVenue(venue: Venue): BaseScraper | null {
    const scraperId = venue.scraperId || 'jsonld';
    const ScraperClass = SCRAPERS[scraperId];
    if (ScraperClass) {
      return new ScraperClass(venue, venue.scraperConfig);
    }
    if (venue.scraperConfig?.icalUrl) {
      return new ICalScraper(venue, venue.scraperConfig.icalUrl);
    }
    return new JsonLdScraper(venue);
}
```

**Change:** Implement a cascading scraper strategy. For each venue, try methods in order of legal safety:

```ts
private getScraperForVenue(venue: Venue): BaseScraper | null {
    // Priority 1: iCal feed (safest — standard designed for data exchange)
    if (venue.scraperConfig?.icalUrl) {
      return new ICalScraper(venue, venue.scraperConfig.icalUrl);
    }

    // Priority 2: JSON-LD extraction (safe — structured data published for machines)
    // This is the default for all venues
    if (!venue.scraperId || venue.scraperId === 'jsonld') {
      return new JsonLdScraper(venue);
    }

    // Priority 3: Generic DOM scraping (highest risk — use only when configured explicitly)
    if (venue.scraperId === 'generic') {
      const ScraperClass = SCRAPERS['generic'];
      return new ScraperClass(venue, venue.scraperConfig);
    }

    return null;
}
```

**Also:** Add a `scraper_method` column to `scrape_logs` to track which method was used, so you can audit how many venues rely on DOM scraping and work to migrate them to structured data sources.

**Files to modify:**
- `backend/src/scrapers/runner.ts` — rewrite `getScraperForVenue()`
- `backend/src/db/schema.sql` — add column to `scrape_logs` (for reference)
- DB migration — `ALTER TABLE scrape_logs ADD COLUMN scraper_method VARCHAR(50);`

**Effort:** ~1 hour

---

## Change 8: Rate Limiting Improvements

**Risk addressed:** While the current system has a 2-second delay between batches (in `runner.ts`), Ticketmaster's ToS specifies no more than 1 request per 3 seconds. More conservative rate limiting reduces trespass-to-chattels and server-burden arguments.

**Current code:** `runner.ts` has `await this.sleep(2000)` between batches of `config.scrapeConcurrency` (default 3) venues.

**Change:** 
1. Reduce `SCRAPE_CONCURRENCY` default from `3` to `1` in `config.ts`
2. Increase inter-request delay from 2000ms to 5000ms in `runner.ts`
3. Add per-domain rate limiting: no more than 1 request per 10 seconds to the same domain. Store last-request timestamps per domain in an in-memory Map.
4. Add a `Referer` header set to the site URL, and a `From` header set to the contact email — both are HTTP standards for polite crawling

**Files to modify:**
- `backend/src/utils/config.ts` — change default concurrency
- `backend/src/scrapers/runner.ts` — increase delay, add per-domain throttling
- `backend/src/scrapers/base-scraper.ts` — add `Referer` and `From` headers in `initBrowser()`

**Effort:** ~1 hour

---

## Implementation Order

| Order | Change | Effort | Legal Impact |
|-------|--------|--------|-------------|
| 1 | Honest User Agent | 30 min | High — eliminates bad faith evidence |
| 2 | Stop Storing Descriptions | 2-3 hrs | Critical — removes #1 copyright risk |
| 3 | Source Attribution | 1-2 hrs | High — creates goodwill, supports fair use |
| 4 | Robots.txt Compliance | 1-2 hrs | High — preserves implied license defense |
| 5 | Image Handling | 1-2 hrs | High — removes #2 copyright risk |
| 6 | Opt-Out Mechanism | 2-3 hrs | High — prevents worst-case C&D scenario |
| 7 | Scraper Priority | 1 hr | Medium — reduces DOM scraping surface |
| 8 | Rate Limiting | 1 hr | Medium — reduces trespass arguments |

**Total estimated effort: ~10-15 hours**

---

## Out of Scope (Future Considerations)

- **Ticketmaster Discovery API integration** — free tier available, would replace scraping for ~40% of venues. Requires API key application and affiliate agreement.
- **Eventbrite API integration** — free for public events, covers many community venues
- **SeatGeek API integration** — open platform with revenue share model
- **Google Events API** — structured event data without scraping individual sites
- **Legal review** — these changes reduce risk substantially but do not eliminate it. Before monetizing, get a 1-hour consultation with an IP attorney familiar with web scraping case law in the Ninth Circuit.
