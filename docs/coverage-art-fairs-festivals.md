# Coverage Check: Art Fairs + Festivals

Date: 2026-02-09

## What We Have (Registry)
A quick keyword scan of `/data/venue-registry.json` found **19** sources that are explicitly festival/fair/market-ish.
Examples include:
- `ybgfestival.org` (Yerba Buena Gardens Festival)
- `sterngrove.org` (Stern Grove Festival)
- `baybookfest.org` (Bay Area Book Festival)
- `365nightmarket.com` (365 Night Market)
- `lacocinasf.org`, `sfstreetfood.com` (SF Street Food Festival)
- `pistahan.net`, `nikkeimatsuri.org` (parade/festival)

## What We Have (In Cached Events)
Scanning `/data/venue-events-cache.json` for common fair/festival keywords found **44** matching events across these main sources:
- `goldengate.org`: 5 (parades + fairs)
- `theuctheatre.org`: 5 (Noise Pop Festival shows)
- `cafedunord.com`: 4 (Noise Pop Festival shows)
- `sfstation.com`: 3 (film festival listings)
- `sfarts.org`: 3 (festival-related listings)
- `365nightmarket.com`: 3 (Eventbrite-backed markets)
- `lacocinasf.org`: 3 (fest/market)
- `kqed.org`: 2 (festival-related listings)

This confirms the system already captures a meaningful slice of “festival/fair/market” style events today.

## Gaps / What’s Likely Missing
We have some “festival organizers” covered, but we are likely missing (or under-covered) recurring art/fair ecosystems such as:
- Open Studios programs (SF Open Studios, East Bay Open Studios)
- Major art fair organizers (if they have consistent calendars)
- Large recurring street fairs (neighborhood-specific)
- Maker/craft fairs (when they have a stable calendar page)

## Recommended Next Additions (Art Fairs / Festivals)
If you want noticeably better coverage, the most useful additions tend to be *organizers* with centralized calendars, not individual one-off pages.
Suggested targets to vet and add next:
- East Bay Open Studios (`eastbayopenstudios.com`) and/or Oakland Art Murmur pages that list studio weekends
- SF Open Studios (domain varies by current organizer/year)
- SF Art Week (`sfartweek.com`) is already present, but may need a better calendar URL if it isn’t yielding many events
- Fort Mason Night Market (`fortmason.org`) is present and is yielding at least one event; consider also Off The Grid (`offthegrid.com`) if not already fully covered

## Notes
- Current registry has **2 duplicate domains**: `sfmoma.org` and `deyoung.famsf.org`.
  - This doesn’t necessarily break anything, but it can create redundant scrapes and noise; we can safely dedupe later.
