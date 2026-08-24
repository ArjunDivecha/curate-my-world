# SVDA Local Discovery — Venue Approval Sheet

Run: `svda-local-2026-08-24` · Generated 2026-08-24 20:14 UTC · Registry untouched. Approve individually by ID (e.g. "approve A03, B02").

| ID | Verdict | Name | Category | City | Dated events seen | Est./mo | Calendar |
|---|---|---|---|---|---|---|---|
| I01 | investigate | Elbo Room | all | San Francisco | 0 | 0.0 | [https://elbo.com/events](https://elbo.com/events) |
| I02 | investigate | The Golden Bull | all | Oakland | 0 | 0.0 | [https://thegoldenbullbar.com/events](https://thegoldenbullbar.com/events) |
| I03 | investigate | Eli's Mile High Club | all | Oakland | 0 | 0.0 | — |

## INVESTIGATE — could not validate (fetch failed, no dated listings, geo mismatch)

### I01 — Elbo Room (all)

- Website: https://elbo.com
- Calendar: https://elbo.com/events
- City: San Francisco · Page kind: unclear · Dated events seen: 0 · Rate est: 0.0/mo
- Reason: no_structured_events

### I02 — The Golden Bull (all)

- Website: https://thegoldenbullbar.com
- Calendar: https://thegoldenbullbar.com/events
- City: Oakland · Page kind: unclear · Dated events seen: 0 · Rate est: 0.0/mo
- Reason: no_structured_events

### I03 — Eli's Mile High Club (all)

- Website: https://elismilehigh.com
- City: Oakland · Page kind: — · Dated events seen: 0 · Rate est: 0.0/mo
- Reason: no_structured_events


---

Merge command per approved venue:
```bash
python3 add_venue_registry_strict.py --url "<calendar_url>" --category "<category>" \
  --name "<name>" --city "<city>" --source "svda-local-2026-08-24"
```

