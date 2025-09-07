// Standalone high-concurrency collector using Exa and Serper
// Env:
//   EXA_API_KEY, SERPER_API_KEY
//   LOCATION (default: San Francisco, CA)
//   LIMIT_PER_CATEGORY (default: 100)
//   CATEGORIES (csv) default common list
//   CONCURRENCY (default: 16)
//   EXA_COST_PER_CALL_USD (default: 0.005)
//   SERPER_COST_PER_CALL_USD (default: 0.002)

import fs from 'fs';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';

function loadEnvFallback() {
  const candidates = [
    path.join(process.cwd(), 'curate-events-api', '.env'),
    path.join(process.cwd(), '.env')
  ];
  const map = {};
  for (const fp of candidates) {
    try {
      if (!fs.existsSync(fp)) continue;
      const text = fs.readFileSync(fp, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m) continue;
        const key = m[1];
        let val = m[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        map[key] = val;
      }
    } catch {}
  }
  return map;
}

const ENV = loadEnvFallback();
const EXA_API_KEY = process.env.EXA_API_KEY || process.env.EXA_KEY || ENV.EXA_API_KEY || ENV.EXA_KEY || '';
const SERPER_API_KEY = process.env.SERPER_API_KEY || ENV.SERPER_API_KEY || '';
const LOCATION = process.env.LOCATION || 'San Francisco, CA';
const LIMIT_PER_CATEGORY = parseInt(process.env.LIMIT_PER_CATEGORY || '100', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '16', 10);
const EXA_COST_PER_CALL = Number(process.env.EXA_COST_PER_CALL_USD || 0.005);
const SERPER_COST_PER_CALL = Number(process.env.SERPER_COST_PER_CALL_USD || 0.002);

const DEFAULT_CATEGORIES = [
  'music', 'theatre', 'art', 'food', 'tech', 'technology', 'education',
  'movies', 'finance', 'psychology', 'artificial-intelligence', 'business', 'science'
];
const CATEGORIES = (process.env.CATEGORIES || '').split(',').map(s=>s.trim()).filter(Boolean);
const categories = CATEGORIES.length ? CATEGORIES : DEFAULT_CATEGORIES;

const whitelistPath = path.join(process.cwd(), 'experiments', 'speed-demon', 'whitelist.json');
const whitelist = fs.existsSync(whitelistPath) ? JSON.parse(fs.readFileSync(whitelistPath, 'utf8')) : [];

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

function host(u){ try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } }
function normUrl(u){ try { const url=new URL(u); return url.hostname.toLowerCase()+url.pathname.toLowerCase().replace(/\/$/,''); } catch { return ''; } }
function normTitle(t){ return String(t||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim(); }

function toCsvRow(fields){
  return fields.map(v=>{
    if(v===null||v===undefined) return '';
    const s=String(v);
    if(/[",\n]/.test(s)) return '"'+s.replace(/"/g,'""')+'"';
    return s;
  }).join(',');
}

async function exaSearch(query, numResults=20){
  const payload = {
    query,
    type: 'fast',
    livecrawl: 'never',
    numResults,
    contents: {
      text: { maxCharacters: 2000, includeHtmlTags: false },
      summary: { query: 'Extract event name, exact venue/location, full date and time, ticket/registration URL, event description.', maxCharacters: 600 }
    }
  };
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST', headers: {
      'x-api-key': EXA_API_KEY,
      'Content-Type': 'application/json', 'User-Agent': 'SpeedDemon/1.0'
    }, body: JSON.stringify(payload)
  });
  if(!res.ok){ const t=await res.text(); throw new Error(`EXA ${res.status}: ${t}`); }
  const data = await res.json();
  return data.results || [];
}

async function serperSearch(query, num=20){
  const payload = { q: query, gl: 'us', hl: 'en', num };
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST', headers: {
      'X-API-KEY': SERPER_API_KEY,
      'Content-Type': 'application/json'
    }, body: JSON.stringify(payload)
  });
  if(!res.ok){ const t=await res.text(); throw new Error(`SERPER ${res.status}: ${t}`); }
  const data = await res.json();
  const items = [...(data.organic||[]), ...(data.news||[]), ...(data.tops||[])]
    .map(o=>({ title:o.title, url:o.link || o.url, snippet:o.snippet||o.description }))
    .filter(x=>x.url);
  return items;
}

function extractFromExa(result, category){
  const content = result.summary || result.text || '';
  const url = result.url;
  return {
    id: `exa_${result.id}`,
    title: result.title || '(untitled)',
    description: content || '',
    category,
    venue: '',
    address: '',
    city: '',
    startDate: null,
    endDate: null,
    eventUrl: url,
    ticketUrl: url,
    source: 'exa_fast'
  };
}

function extractFromSerper(item, category){
  return {
    id: `serper_${normUrl(item.url)}`,
    title: item.title || '(untitled)',
    description: item.snippet || '',
    category,
    venue: '',
    address: '',
    city: '',
    startDate: null,
    endDate: null,
    eventUrl: item.url,
    ticketUrl: item.url,
    source: 'serper'
  };
}

function deduplicate(events){
  const seen = new Map();
  const unique = [];
  for(const e of events){
    const key = normUrl(e.eventUrl||e.ticketUrl) || normTitle(e.title);
    if(!key) continue;
    if(!seen.has(key)){
      seen.set(key, e);
      unique.push(e);
    }
  }
  return unique;
}

async function withConcurrency(items, limit, worker){
  const results=[]; let i=0; let active=0; let idx=0; let errs=0;
  return await new Promise(resolve=>{
    const next=()=>{
      while(active<limit && idx<items.length){
        const cur=items[idx++]; active++;
        Promise.resolve().then(()=>worker(cur)).then(r=>{ results.push({ok:true,val:r,item:cur}); })
          .catch(e=>{ errs++; results.push({ok:false,err:e,item:cur}); })
          .finally(()=>{ active--; if(results.length===items.length) resolve(results); else next(); });
      }
    };
    next();
  });
}

export async function runSpeedDemon({ location=LOCATION, limitPerCategory=LIMIT_PER_CATEGORY }){
  const t0=Date.now();
  let callsExa=0, callsSerper=0;
  const all=[];

  // Build work items: venue queries + category queries
  const venueQueries=[];
  for(const v of whitelist){
    const base = `site:${v.domain} (events OR calendar OR tickets) ${location}`;
    venueQueries.push({ kind:'exa', q: base, num: 15, categoryHint: (v.categories||[])[0]||'general' });
    venueQueries.push({ kind:'serper', q: base, num: 20, categoryHint: (v.categories||[])[0]||'general' });
  }
  const catQueries=[];
  for(const cat of categories){
    const q1 = `${cat} events ${location} 2025 tickets registration eventbrite meetup lu.ma`;
    catQueries.push({ kind:'exa', q:q1, num: 20, categoryHint: cat });
    catQueries.push({ kind:'serper', q:q1, num: 20, categoryHint: cat });
  }
  const work=[...venueQueries, ...catQueries];

  const results = await withConcurrency(work, CONCURRENCY, async (w)=>{
    if(w.kind==='exa'){
      if(!EXA_API_KEY) return [];
      const res = await exaSearch(w.q, w.num); callsExa++;
      return res.map(r=>extractFromExa(r, w.categoryHint));
    }
    if(w.kind==='serper'){
      if(!SERPER_API_KEY) return [];
      const res = await serperSearch(w.q, w.num); callsSerper++;
      return res.map(r=>extractFromSerper(r, w.categoryHint));
    }
    return [];
  });

  for(const r of results){ if(r.ok && Array.isArray(r.val)) all.push(...r.val); }
  const unique = deduplicate(all);

  const t1=Date.now();
  const ms = t1-t0;
  const domains = new Set(unique.map(e=>host(e.eventUrl||e.ticketUrl)).filter(Boolean));
  const cost = callsExa*EXA_COST_PER_CALL + callsSerper*SERPER_COST_PER_CALL;

  return {
    success: true,
    timing_ms: ms,
    events: unique.slice(0, limitPerCategory*categories.length),
    count: unique.length,
    unique_domains: domains.size,
    calls: { exa: callsExa, serper: callsSerper },
    cost_est_usd: Number(cost.toFixed(4)),
    meta: { location, categories, concurrency: CONCURRENCY }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSpeedDemon({}).then(r=>{
    const outDir=path.join(process.cwd(),'outputs');
    if(!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive:true });
    const ts=new Date().toISOString().replace(/[:.]/g,'-');
    const fp=path.join(outDir, `speed_demon_events_${ts}.json`);
    fs.writeFileSync(fp, JSON.stringify(r, null, 2));
    console.log(JSON.stringify({ saved: fp, count: r.count, timing_ms: r.timing_ms, cost_est_usd: r.cost_est_usd }, null, 2));
  }).catch(e=>{ console.error('SpeedDemon failed:', e.message); process.exit(1); });
}
