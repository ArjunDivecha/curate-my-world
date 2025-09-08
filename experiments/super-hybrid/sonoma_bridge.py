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
import os, sys, json, argparse, importlib.util, re
import io
import contextlib

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

    # Ensure provider API keys are available by loading from known .env files if missing
    def load_env_fallback():
        candidates = [
            os.path.join(os.getcwd(), 'curate-events-api', '.env'),
            os.path.join(os.getcwd(), '.env')
        ]
        env_map = {}
        for fp in candidates:
            try:
                if not os.path.exists(fp):
                    continue
                with open(fp, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith('#'):
                            continue
                        if '=' not in line:
                            continue
                        k, v = line.split('=', 1)
                        k = k.strip()
                        v = v.strip()
                        if v.startswith('"') and v.endswith('"'):
                            v = v[1:-1]
                        env_map[k] = v
            except Exception:
                pass
        # Apply keys (override to ensure correct account)
        for k in ('EXA_API_KEY', 'SERPER_API_KEY'):
            if env_map.get(k):
                os.environ[k] = env_map[k]

    load_env_fallback()

    sonoma_path = os.environ.get('SONOMA_PATH', DEFAULT_SONOMA)
    if not os.path.exists(sonoma_path):
        print(json.dumps({"success": False, "error": f"Sonoma script not found: {sonoma_path}"}))
        return 1

    # Load rules for path-level filtering
    rules_path = os.path.join(os.getcwd(), 'experiments', 'speed-demon', 'rules.json')
    try:
        with open(rules_path, 'r') as f:
            rules = json.load(f)
    except Exception:
        rules = {"global": {"blockPathTokens": []}, "domains": []}

    def compile_domain(d):
        return {
            'domain': d.get('domain','').lower(),
            'allow': [re.compile(p, re.I) for p in d.get('allowPaths', [])],
            'block': [re.compile(p, re.I) for p in d.get('blockPaths', [])]
        }
    domains = [compile_domain(d) for d in rules.get('domains', [])]
    global_tokens = [re.compile(t, re.I) for t in rules.get('global', {}).get('blockPathTokens', [])]

    def find_rule(host):
        for d in domains:
            if host == d['domain']:
                return d
        return None

    def drop_by_rules(url):
        try:
            from urllib.parse import urlparse
            u = urlparse(url)
            host = (u.hostname or '').lower()
            path = (u.path or '').lower()
            dr = find_rule(host)
            allow_hit = False
            score = 0
            for r in global_tokens:
                if r.search(path):
                    score -= 0.5
            if dr:
                for r in dr['block']:
                    if r.search(path):
                        score -= 0.7
                for r in dr['allow']:
                    if r.search(path):
                        score += 0.6
                        allow_hit = True
            return (score < -0.5) and (not allow_hit)
        except Exception:
            return False

    # Load Sonoma module and instantiate searcher while silencing any prints to stdout
    stray_import = io.StringIO()
    with contextlib.redirect_stdout(stray_import):
        mod = load_module(sonoma_path)
        searcher = mod.HybridEventSearcher(max_workers=20, use_cache=True)
    imp_txt = stray_import.getvalue()
    if imp_txt.strip():
        print(imp_txt, file=sys.stderr, end="")

    all_events = []
    total_cost = 0.0
    total_time = 0.0
    for cat in cat_list:
        # keep query simple to let Sonoma's own tuning do its work
        query = f"{cat} events"
        # Capture any stray prints from Sonoma module to avoid polluting stdout JSON
        stray_buf = io.StringIO()
        with contextlib.redirect_stdout(stray_buf):
            events, stats = searcher.sync_search(query, category=cat, days_ahead=30, quick_mode=quick)
        stray = stray_buf.getvalue()
        if stray.strip():
            print(stray, file=sys.stderr, end="")
        total_time += stats.get('duration', 0)
        total_cost += stats.get('estimated_cost', 0)
        for ev in events:
            # attempt venue enrichment from URL or title/description
            venue = (ev.venue or '').strip()
            try:
                from urllib.parse import urlparse
                host = urlparse(ev.source_url or '').hostname or ''
            except Exception:
                host = ''
            host = host.lower()
            HOST_VENUES = {
                'roxie.com': ('Roxie Theater','San Francisco'),
                'www.sfmoma.org': ('SFMOMA','San Francisco'),
                'sfmoma.org': ('SFMOMA','San Francisco'),
                'thegreekberkeley.com': ('Greek Theatre','Berkeley'),
                'www.sfsymphony.org': ('San Francisco Symphony','San Francisco'),
                'www.berkeleyrep.org': ('Berkeley Repertory Theatre','Berkeley'),
                'www.commonwealthclub.org': ('The Commonwealth Club','San Francisco'),
                'sfjazz.org': ('SFJAZZ Center','San Francisco'),
                'bampfa.org': ('BAMPFA','Berkeley'),
                'events.stanford.edu': ('Stanford University','Stanford'),
                'haas.berkeley.edu': ('Haas School of Business','Berkeley'),
                'shotgunplayers.org': ('Shotgun Players','Berkeley'),
                'thenewparkway.com': ('The New Parkway Theater','Oakland'),
                'thefreight.org': ('Freight & Salvage','Berkeley')
            }
            if not venue and host in HOST_VENUES:
                venue, _city = HOST_VENUES[host]
            if not venue:
                m = re.search(r"\bat\s+([^\-•|,]+)$", ev.title or '', re.I)
                if m:
                    venue = m.group(1).strip()
            if drop_by_rules(ev.source_url or ''):
                continue
            all_events.append({
                "id": f"sonoma_{ev.fingerprint()}",
                "title": ev.title or "",
                "description": (ev.description or "")[:500],
                "category": cat,
                "venue": venue or "",
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
