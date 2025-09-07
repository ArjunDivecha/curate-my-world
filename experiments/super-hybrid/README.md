# Super-Hybrid Experiment (Exa + Serper + Sonoma)

A standalone, swappable collector that fuses:
- Turbo track: Exa (fast) + Serper (high-concurrency)
- Deep track: Sonoma hybrid_event_search.py (comprehensive)

No premium providers (Apyflux, PredictHQ) are used.

Run comparison vs current backend
```
BACKEND_URL=http://127.0.0.1:8765 \
LOCATION="San Francisco, CA" \
LIMIT=100 \
node experiments/super-hybrid/run-comparison.js
```

Requirements
- Python 3.9+
- Sonoma script present at:
  /Users/macbook2024/Library/CloudStorage/Dropbox/AAA Backup/A Working/Curate-my-world-exa/Sonoma/hybrid_event_search.py
- EXA_API_KEY and SERPER_API_KEY available (curate-events-api/.env or process env)

Outputs
- outputs/super_hybrid_events_*.json and .csv
- outputs/comparison_super_hybrid_*.json
- Console table with time, coverage, and cost

Nothing in the runtime backend is modified; all code lives under experiments/.
