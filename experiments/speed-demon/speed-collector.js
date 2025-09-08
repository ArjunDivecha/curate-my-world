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
    path.join(process.cwd(), '..', '..', 'curate-events-api', '.env'),
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
const EXA_ENABLED = !['0','false','no'].includes(String(process.env.EXA_ENABLED||'1').toLowerCase());
const VENUE_EXA_ENABLED = !['0','false','no'].includes(String(process.env.VENUE_EXA_ENABLED||'0').toLowerCase());
const SERPER_ENABLED = !['0','false','no'].includes(String(process.env.SERPER_ENABLED||'1').toLowerCase());
const LOCATION = process.env.LOCATION || 'San Francisco, CA';
const LIMIT_PER_CATEGORY = parseInt(process.env.LIMIT_PER_CATEGORY || '100', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '16', 10);
const EXA_COST_PER_CALL = Number(process.env.EXA_COST_PER_CALL_USD || 0.005);
const SERPER_COST_PER_CALL = Number(process.env.SERPER_COST_PER_CALL_USD || 0.002);
// Defaults tuned for coverage; adjust via env to manage spend
const EXA_RESULTS_PER_QUERY = parseInt(process.env.EXA_RESULTS_PER_QUERY || '100', 10);
const SERPER_RESULTS_PER_QUERY = parseInt(process.env.SERPER_RESULTS_PER_QUERY || '100', 10);
const EXA_INCLUDE_CONTENT = ['1','true','yes'].includes(String(process.env.EXA_INCLUDE_CONTENT||'0').toLowerCase());

const DEFAULT_CATEGORIES = [
  'music', 'theatre', 'art', 'food', 'tech', 'technology', 'education',
  'movies', 'finance', 'psychology', 'artificial-intelligence', 'business', 'science'
];
const CATEGORIES = (process.env.CATEGORIES || '').split(',').map(s=>s.trim()).filter(Boolean);
const categories = CATEGORIES.length ? CATEGORIES : DEFAULT_CATEGORIES;

const whitelistPath = path.join(process.cwd(), 'experiments', 'speed-demon', 'whitelist.json');
const whitelist = fs.existsSync(whitelistPath) ? JSON.parse(fs.readFileSync(whitelistPath, 'utf8')) : [];
const rulesPath = path.join(process.cwd(), 'experiments', 'speed-demon', 'rules.json');
const rulesRaw = fs.existsSync(rulesPath) ? JSON.parse(fs.readFileSync(rulesPath, 'utf8')) : { global: {}, domains: [] };

function compileRules(raw){
  const globalTokens = (raw.global?.blockPathTokens || []).map(t=> new RegExp(t, 'i'));
  const domains = (raw.domains || []).map(d=> ({
    domain: d.domain.toLowerCase(),
    allow: (d.allowPaths||[]).map(p=> new RegExp(p, 'i')),
    block: (d.blockPaths||[]).map(p=> new RegExp(p, 'i')),
    penalizeWords: (d.penalizeWords||[]).map(w=> new RegExp(w, 'i'))
  }));
  return { globalTokens, domains };
}

const compiledRules = compileRules(rulesRaw);

// Heuristics to improve venue extraction so the UI doesn't show "Venue TBD"
const HOST_VENUES = {
  'roxie.com': { venue: 'Roxie Theater', city: 'San Francisco' },
  'www.sfmoma.org': { venue: 'SFMOMA', city: 'San Francisco' },
  'sfmoma.org': { venue: 'SFMOMA', city: 'San Francisco' },
  'thegreekberkeley.com': { venue: 'Greek Theatre', city: 'Berkeley' },
  'www.sfsymphony.org': { venue: 'San Francisco Symphony', city: 'San Francisco' },
  'www.berkeleyrep.org': { venue: 'Berkeley Repertory Theatre', city: 'Berkeley' },
  'www.commonwealthclub.org': { venue: 'The Commonwealth Club', city: 'San Francisco' },
  'sfjazz.org': { venue: 'SFJAZZ Center', city: 'San Francisco' },
  'san-francisco.playhouse.co': { venue: 'San Francisco Playhouse', city: 'San Francisco' },
  'bampfa.org': { venue: 'BAMPFA', city: 'Berkeley' },
  'events.stanford.edu': { venue: 'Stanford University', city: 'Stanford' },
  'haas.berkeley.edu': { venue: 'Haas School of Business', city: 'Berkeley' },
  'shotgunplayers.org': { venue: 'Shotgun Players', city: 'Berkeley' },
  'thenewparkway.com': { venue: 'The New Parkway Theater', city: 'Oakland' },
  'thefreight.org': { venue: 'Freight & Salvage', city: 'Berkeley' }
};

function guessVenueFromHost(u){
  try {
    const h = new URL(u).hostname.toLowerCase();
    if (HOST_VENUES[h]) return HOST_VENUES[h];
  } catch {}
  return { venue: '', city: '' };
}

function extractVenueFromTitle(title=''){
  const t = String(title);
  // Patterns like "Event - Venue", "Event at Venue"
  let m = t.match(/\s+-\s+([^\-|•]+)$/);
  if (m && m[1] && m[1].trim().length > 2) return m[1].trim();
  m = t.match(/\bat\s+([^\-•|,]+)$/i);
  if (m && m[1] && m[1].trim().length > 2) return m[1].trim();
  return '';
}

function extractVenueFromText(text=''){
  const s = String(text);
  // Common labels in content
  let m = s.match(/(?:Venue|Location)[:\s]+([^\n,|]+?)(?:,|\n|$)/i);
  if (m && m[1] && m[1].trim().length > 2) return m[1].trim();
  m = s.match(/\bat\s+([A-Z][A-Za-z0-9&' .-]{3,60})/);
  if (m && m[1]) return m[1].trim();
  return '';
}

function findDomainRule(host){
  const h = (host||'').toLowerCase();
  return compiledRules.domains.find(d => h === d.domain);
}

function scoreAndFilter(url, title, snippet){
  let score = 0;
  let reasons = [];
  let allowHit = false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const pathName = (u.pathname||'').toLowerCase();
    const dr = findDomainRule(host);
    // Global token penalty
    for(const re of compiledRules.globalTokens){
      if (re.test(pathName)) { score -= 0.5; reasons.push(`global:${re}`); }
    }
    if (dr){
      // Block path rules
      for(const re of dr.block){ if (re.test(pathName)) { score -= 0.7; reasons.push(`block:${re}`); } }
      // Allow path rules
      for(const re of dr.allow){ if (re.test(pathName)) { score += 0.6; allowHit = true; reasons.push(`allow:${re}`);} }
      // Penalize words in title/snippet
      for(const re of dr.penalizeWords||[]){ if (re.test(title||'') || re.test(snippet||'')) { score -= 0.3; reasons.push(`penalize:${re}`);} }
    }
    // Content hints
    const txt = `${title||''} ${snippet||''}`.toLowerCase();
    if (/(tickets|rsvp|register|showtimes)/i.test(txt)) { score += 0.3; reasons.push('tickets'); }
    const dateMatches = txt.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/gi) || [];
    if (dateMatches.length === 1) { score += 0.3; reasons.push('one-date'); }
    if (dateMatches.length >= 3) { score -= 0.4; reasons.push('multi-date'); }
    // Final drop decision
    // Be much less aggressive to avoid empty result sets; rely on dedup/ranking later
    const drop = (score < -2.0) && !allowHit;
    return { drop, score, reasons };
  } catch {
    return { drop: false, score: 0, reasons: [] };
  }
}

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
  if (!EXA_ENABLED || !EXA_API_KEY) return [];
  // Guardrail: most plans cap numResults at <= 100
  const safeNum = Math.max(1, Math.min(Number(numResults)||20, 100));
  const payload = {
    query,
    type: 'fast',
    livecrawl: 'never',
    numResults: safeNum
  };
  if (EXA_INCLUDE_CONTENT) {
    payload.contents = {
      text: { maxCharacters: 1500, includeHtmlTags: false },
      summary: { query: 'Extract event name, venue, date/time, ticket URL, description.', maxCharacters: 400 }
    };
  }
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
  const hv = guessVenueFromHost(url);
  const vFromTitle = extractVenueFromTitle(result.title || '');
  const vFromText = extractVenueFromText(content || '');
  return {
    id: `exa_${result.id}`,
    title: result.title || '(untitled)',
    description: content || '',
    category,
    venue: hv.venue || vFromTitle || vFromText || '',
    address: '',
    city: hv.city || '',
    startDate: null,
    endDate: null,
    eventUrl: url,
    ticketUrl: url,
    source: 'exa_fast'
  };
}

function extractFromSerper(item, category){
  const hv = guessVenueFromHost(item.url || '');
  const vFromTitle = extractVenueFromTitle(item.title || '');
  const vFromText = extractVenueFromText(item.snippet || '');
  return {
    id: `serper_${normUrl(item.url)}`,
    title: item.title || '(untitled)',
    description: item.snippet || '',
    category,
    venue: hv.venue || vFromTitle || vFromText || '',
    address: '',
    city: hv.city || '',
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
    // Use domain-based search if available, otherwise use venue name
    let base;
    if (v.domain) {
      base = `site:${v.domain} (events OR calendar OR tickets) ${location}`;
    } else {
      base = `"${v.name}" events tickets ${location} 2025`;
    }
    if (VENUE_EXA_ENABLED) venueQueries.push({ kind:'exa', q: base, num: EXA_RESULTS_PER_QUERY, categoryHint: (v.categories||[])[0]||'general' });
    if (SERPER_ENABLED) venueQueries.push({ kind:'serper', q: base, num: SERPER_RESULTS_PER_QUERY, categoryHint: (v.categories||[])[0]||'general' });
  }
  const catQueries=[];
  for(const cat of categories){
    const q1 = `${cat} events ${location} 2025 tickets registration eventbrite meetup lu.ma`;
    if (EXA_ENABLED) catQueries.push({ kind:'exa', q:q1, num: EXA_RESULTS_PER_QUERY, categoryHint: cat });
    if (SERPER_ENABLED) catQueries.push({ kind:'serper', q:q1, num: SERPER_RESULTS_PER_QUERY, categoryHint: cat });
  }
  const work=[...venueQueries, ...catQueries];

  const results = await withConcurrency(work, CONCURRENCY, async (w)=>{
    if(w.kind==='exa'){
      if(!EXA_ENABLED || !EXA_API_KEY) return [];
      const res = await exaSearch(w.q, w.num); callsExa++;
      const extracted = res.map(r=>extractFromExa(r, w.categoryHint));
      const filtered = extracted.filter(ev => {
        const s = scoreAndFilter(ev.eventUrl, ev.title, ev.description);
        return !s.drop;
      });
      return filtered;
    }
    if(w.kind==='serper'){
      if(!SERPER_ENABLED || !SERPER_API_KEY) return [];
      const res = await serperSearch(w.q, w.num); callsSerper++;
      const extracted = res.map(r=>extractFromSerper(r, w.categoryHint));
      const filtered = extracted.filter(ev => {
        const s = scoreAndFilter(ev.eventUrl, ev.title, ev.description);
        return !s.drop;
      });
      return filtered;
    }
    return [];
  });

  for(const r of results){ 
    if(r.ok && Array.isArray(r.val)) {
      all.push(...r.val);
    }
  }
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
