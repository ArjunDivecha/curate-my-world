#!/usr/bin/env python3
"""
Bridge wrapper to call Sonoma hybrid_event_search.HybridEventSearcher per category
and emit a compact JSON list of events to stdout.

Env:
  SONOMA_PATH (optional): path to hybrid_event_search.py
  EXA_API_KEY, SERPER_API_KEY: forwarded to subprocess

Args (CLI):
  --categories music,theatre,art
  --quick false|true  (default false for deep)
"""
import os, sys, json, argparse, importlib.util

DEFAULT_SONOMA = \
  "/Users/macbook2024/Library/CloudStorage/Dropbox/AAA Backup/A Working/Curate-my-world-exa/Sonoma/hybrid_event_search.py"

def load_module(path):
    spec = importlib.util.spec_from_file_location("sonoma_mod", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore
    return mod

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--categories', type=str, default='music,theatre,art')
    ap.add_argument('--quick', type=str, default='false')
    args = ap.parse_args()
    cat_list = [c.strip() for c in args.categories.split(',') if c.strip()]
    quick = args.quick.lower() in ('1','true','yes','y')

    sonoma_path = os.environ.get('SONOMA_PATH', DEFAULT_SONOMA)
    if not os.path.exists(sonoma_path):
        print(json.dumps({"success": False, "error": f"Sonoma script not found: {sonoma_path}"}))
        return 1

    mod = load_module(sonoma_path)
    searcher = mod.HybridEventSearcher(max_workers=20, use_cache=True)

    all_events = []
    total_cost = 0.0
    total_time = 0.0
    for cat in cat_list:
        # keep query simple to let Sonoma's own tuning do its work
        query = f"{cat} events"
        events, stats = searcher.sync_search(query, category=cat, days_ahead=30, quick_mode=quick)
        total_time += stats.get('duration', 0)
        total_cost += stats.get('estimated_cost', 0)
        for ev in events:
            all_events.append({
                "id": f"sonoma_{ev.fingerprint()}",
                "title": ev.title or "",
                "description": (ev.description or "")[:500],
                "category": cat,
                "venue": ev.venue or "",
                "address": "",
                "city": ev.search_location or "",
                "startDate": ev.date or "",
                "endDate": "",
                "eventUrl": ev.source_url or "",
                "ticketUrl": ev.source_url or "",
                "source": "sonoma"
            })

    print(json.dumps({
        "success": True,
        "count": len(all_events),
        "timing_ms": int(total_time * 1000),
        "cost_est_usd": round(total_cost, 4),
        "events": all_events
    }))
    return 0

if __name__ == '__main__':
    sys.exit(main())

