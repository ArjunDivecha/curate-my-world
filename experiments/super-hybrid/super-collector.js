// Combine speed-demon (Exa+Serper) with Sonoma deep collector
// No premium providers. Outputs unified normalized events + metrics.

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { runSpeedDemon } from '../speed-demon/speed-collector.js';

const LOCATION = process.env.LOCATION || 'San Francisco, CA';
const LIMIT_PER_CATEGORY = parseInt(process.env.LIMIT_PER_CATEGORY || '100', 10);
const CATEGORIES = (process.env.CATEGORIES || '').split(',').map(s=>s.trim()).filter(Boolean);
const DEFAULT_CATEGORIES = [
  'music', 'theatre', 'art', 'food', 'tech', 'technology', 'education',
  'movies', 'finance', 'psychology', 'artificial-intelligence', 'business', 'science'
];
const categories = CATEGORIES.length ? CATEGORIES : DEFAULT_CATEGORIES;

function host(u){ try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } }
function normUrl(u){ try { const url=new URL(u); return url.hostname.toLowerCase()+url.pathname.toLowerCase().replace(/\/$/,''); } catch { return ''; } }
function normTitle(t){ return String(t||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim(); }

function deduplicate(events){
  const seen = new Map();
  const unique = [];
  for(const e of events){
    const key = normUrl(e.eventUrl||e.ticketUrl) || (normTitle(e.title)+'|'+(e.startDate||''));
    if(!key) continue;
    if(!seen.has(key)){
      seen.set(key, e);
      unique.push(e);
    }
  }
  return unique;
}

function runSonomaBridge({ categories, quick=false }){
  return new Promise((resolve, reject)=>{
    const py = spawn('python3', [path.join('experiments','super-hybrid','sonoma_bridge.py'), '--categories', categories.join(','), '--quick', String(quick)], {
      env: { ...process.env },
      stdio: ['ignore','pipe','pipe']
    });
    let out=''; let err='';
    py.stdout.on('data', d=> out+=d.toString());
    py.stderr.on('data', d=> err+=d.toString());
    py.on('close', code=>{
      if(code!==0){ return reject(new Error(`sonoma_bridge exit ${code}: ${err}`)); }
      try{ const json = JSON.parse(out); return resolve(json); } catch(e){ return reject(new Error(`sonoma_bridge parse error: ${e.message}\n${out}`)); }
    });
  });
}

export async function runSuperHybrid({ location=LOCATION, limitPerCategory=LIMIT_PER_CATEGORY }){
  const t0 = Date.now();

  // Turbo track
  const turbo = await runSpeedDemon({ location, limitPerCategory });

  // Deep track (Sonoma)
  const deep = await runSonomaBridge({ categories, quick:false });

  // Merge + dedup
  const merged = deduplicate([...(turbo.events||[]), ...(deep.events||[])]);
  const domains = new Set(merged.map(e=>host(e.eventUrl||e.ticketUrl)).filter(Boolean));

  const t1 = Date.now();
  return {
    success: true,
    timing_ms: t1 - t0,
    count: merged.length,
    unique_domains: domains.size,
    cost_est_usd: Number(((turbo.cost_est_usd||0) + (deep.cost_est_usd||0)).toFixed(4)),
    calls: { ...turbo.calls, sonoma: 'internal' },
    events: merged,
    meta: { location, categories, turbo: { timing_ms: turbo.timing_ms, count: turbo.count }, deep: { timing_ms: deep.timing_ms, count: deep.count } }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSuperHybrid({}).then(r=>{
    const outDir=path.join(process.cwd(),'outputs');
    if(!fs.existsSync(outDir)) fs.mkdirSync(outDir,{recursive:true});
    const ts=new Date().toISOString().replace(/[:.]/g,'-');
    fs.writeFileSync(path.join(outDir,`super_hybrid_events_${ts}.json`), JSON.stringify(r,null,2));
    console.log(JSON.stringify({ saved: `outputs/super_hybrid_events_${ts}.json`, count: r.count, domains: r.unique_domains, ms: r.timing_ms, cost: r.cost_est_usd }, null, 2));
  }).catch(e=>{ console.error('SuperHybrid failed:', e.message); process.exit(1); });
}

