# Speed Demon Experiment

Standalone, high-concurrency fast collector to compare against the existing backend pipeline.

What it does
- Runs a fast venue/organizer pass using the existing Exa client (no backend changes).
- Queries a small curated venue whitelist and category-based fast queries.
- Deduplicates and measures:
  - Time: wall-clock ms
  - Coverage: unique events, unique domains
  - Cost: estimated by API call counts × configurable per-call rates
- Compares to the current backend `/api/events/all-categories` output.

How to run
```
BACKEND_URL=http://127.0.0.1:8765 \
LOCATION="San Francisco, CA" \
LIMIT=100 \
node experiments/speed-demon/run-comparison.js
```

Outputs
- `outputs/speed_demon_events_*.json` and `.csv`
- `outputs/comparison_summary_*.json`
- Console table with Time, Coverage, Cost for both schemas

Notes
- Uses your existing EXA_API_KEY from `.env`.
- Does not modify the backend; only adds files under `experiments/`.

