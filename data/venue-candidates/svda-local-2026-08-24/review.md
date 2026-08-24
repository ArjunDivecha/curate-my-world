# SVDA Local Discovery — Venue Approval Sheet

Run: `svda-local-2026-08-24` · Generated 2026-08-24 20:22 UTC · Registry untouched. Approve individually by ID (e.g. "approve A03, B02").

| ID | Verdict | Name | Category | City | Dated events seen | Est./mo | Calendar |
|---|---|---|---|---|---|---|---|
| A01 | add | Orpheum Theatre | all | San Francisco | 20 | 6.7 | [https://orpheum-sf.com/whats-on/san-francisco/events/](https://orpheum-sf.com/whats-on/san-francisco/events/) |
| I01 | investigate | Elbo Room | music | San Francisco | 0 | 0.0 | — |
| I02 | investigate | The Golden Bull | music | Oakland | 0 | 0.0 | — |
| I03 | investigate | Eli's Mile High Club | music | Oakland | 0 | 0.0 | — |
| I04 | investigate | The Caravan Lounge | music | San Jose | 0 | 0.0 | — |
| I05 | investigate | The Ritz | music | San Jose | 0 | 0.0 | — |
| I06 | investigate | Back Bar Sofa | music | San Jose | 0 | 0.0 | — |
| I07 | investigate | Curran Theatre | all | San Francisco | 0 | 0.0 | — |
| I08 | investigate | Nourse Theatre | all | San Francisco | 0 | 0.0 | — |
| I09 | investigate | Aurora Theatre Company | all | Berkeley | 0 | 0.0 | [https://auroratheatre.org/index.php/shows-events](https://auroratheatre.org/index.php/shows-events) |
| I10 | investigate | Southern Exposure | museums | San Francisco | 0 | 0.0 | [https://soex.org/calendar-month](https://soex.org/calendar-month) |
| I11 | investigate | Rooster T. Feathers | comedy | Sunnyvale | 0 | 0.0 | [https://roostertfeathers.com/events](https://roostertfeathers.com/events) |
| I12 | investigate | Pier 27 | tech | San Francisco | 0 | 0.0 | — |

## PROPOSED — meet the >=3 events/month cutoff (say "approve A01" etc.)

### A01 — Orpheum Theatre (all)

- Website: https://orpheum-sf.com
- Calendar: https://orpheum-sf.com/whats-on/san-francisco/events/
- City: San Francisco · Page kind: upcoming_calendar · Dated events seen: 20 · Rate est: 6.7/mo
- Sample events:
  - Chelsea Wolfe — 2026-09-16 ([link](https://orpheum-sf.com/events/chelsea-wolfe/curran-theater/))
  - My Hero Academia In Concert — 2026-09-17 ([link](https://orpheum-sf.com/events/my-hero-academia/golden-gate-theatre/))
  - Laurie Anderson — 2026-09-25 ([link](https://orpheum-sf.com/events/laurie-anderson/curran-theater/))
  - Bluey's Big Play — 2026-09-26 ([link](https://orpheum-sf.com/events/blueys-big-play/orpheum-theatre/))


## INVESTIGATE — could not validate (fetch failed, no dated listings, geo mismatch)

### I01 — Elbo Room (music)

- Website: https://elbo.com
- City: San Francisco · Page kind: — · Dated events seen: 0 · Rate est: 0.0/mo
- Reason: dead_site

### I02 — The Golden Bull (music)

- Website: https://thegoldenbullbar.com
- City: Oakland · Page kind: — · Dated events seen: 0 · Rate est: 0.0/mo
- Reason: no_structured_events

### I03 — Eli's Mile High Club (music)

- Website: https://elismilehigh.com
- City: Oakland · Page kind: — · Dated events seen: 0 · Rate est: 0.0/mo
- Reason: dead_site

### I04 — The Caravan Lounge (music)

- Website: https://thecaravanlounge.com
- City: San Jose · Page kind: — · Dated events seen: 0 · Rate est: 0.0/mo
- Reason: dead_site

### I05 — The Ritz (music)

- Website: https://theritzsj.com
- City: San Jose · Page kind: — · Dated events seen: 0 · Rate est: 0.0/mo
- Reason: dead_site

### I06 — Back Bar Sofa (music)

- Website: https://backbarsofa.com
- City: San Jose · Page kind: — · Dated events seen: 0 · Rate est: 0.0/mo
- Reason: dead_site

### I07 — Curran Theatre (all)

- Website: https://curran.com
- City: San Francisco · Page kind: — · Dated events seen: 0 · Rate est: 0.0/mo
- Reason: dead_site

### I08 — Nourse Theatre (all)

- Website: https://noursetheatre.com
- City: San Francisco · Page kind: — · Dated events seen: 0 · Rate est: 0.0/mo
- Reason: dead_site

### I09 — Aurora Theatre Company (all)

- Website: https://auroratheatre.org
- Calendar: https://auroratheatre.org/index.php/shows-events
- City: Berkeley · Page kind: archive_index · Dated events seen: 0 · Rate est: 0.0/mo
- Reason: no_structured_events

### I10 — Southern Exposure (museums)

- Website: https://soex.org
- Calendar: https://soex.org/calendar-month
- City: San Francisco · Page kind: upcoming_calendar · Dated events seen: 0 · Rate est: 0.0/mo
- Reason: low_event_volume
- Sample events:
  - Reach Out, Protect Your Time — 2026-07-17 ([link](https://soex.org/artists-education-project/reach-out-protect-your-time))
  - Lexica — 2026-08-15 ([link](https://soex.org/projects-exhibitions/lexica))
  - Opening Reception | Lexica — 2026-08-15 ([link](https://soex.org/events/opening-reception-lexica))

### I11 — Rooster T. Feathers (comedy)

- Website: https://roostertfeathers.com
- Calendar: https://roostertfeathers.com/events
- City: Sunnyvale · Page kind: unclear · Dated events seen: 0 · Rate est: 0.0/mo
- Reason: no_structured_events

### I12 — Pier 27 (tech)

- Website: https://pier27sanfrancisco.com
- City: San Francisco · Page kind: — · Dated events seen: 0 · Rate est: 0.0/mo
- Reason: dead_site


---

Merge command per approved venue:
```bash
python3 add_venue_registry_strict.py --url "<calendar_url>" --category "<category>" \
  --name "<name>" --city "<city>" --source "svda-local-2026-08-24"
```

