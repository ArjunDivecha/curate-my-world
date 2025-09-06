// Unified provider benchmarking script
// Measures time and (when available) cost/usage for each provider
// Outputs CSV at bench/provider_bench.csv

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

// Best-effort env loader: root .env and curate-events-api/.env
function loadDotenv(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!(key in process.env) && key) {
        process.env[key] = val;
      }
    }
  } catch {}
}

loadDotenv(path.join(process.cwd(), '.env'));
loadDotenv(path.join(process.cwd(), 'curate-events-api', '.env'));

const OUT_DIR = path.join(process.cwd(), 'bench');
const OUT_CSV = path.join(OUT_DIR, 'provider_bench.csv');

function nowIso() { return new Date().toISOString(); }

async function safeJson(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

async function withTiming(fn) {
  const start = Date.now();
  try {
    const data = await fn();
    const duration_ms = Date.now() - start;
    return { ok: true, duration_ms, data };
  } catch (error) {
    const duration_ms = Date.now() - start;
    return { ok: false, duration_ms, error: error?.message || String(error) };
  }
}

function ensureCsvHeader() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!fs.existsSync(OUT_CSV)) {
    fs.writeFileSync(
      OUT_CSV,
      [
        'timestamp',
        'provider',
        'success',
        'duration_ms',
        'events_count',
        'requests_count',
        'cost_usd',
        'usage_json',
        'note_or_error',
      ].join(',') + '\n',
      'utf8'
    );
  }
}

function appendCsv(row) {
  ensureCsvHeader();
  const line = [
    row.timestamp || nowIso(),
    row.provider,
    row.success ? '1' : '0',
    row.duration_ms ?? '',
    row.events_count ?? '',
    row.requests_count ?? '',
    row.cost_usd ?? '',
    row.usage_json ? JSON.stringify(row.usage_json).replaceAll(',', ';') : '',
    (row.note_or_error || '').replaceAll('\n', ' '),
  ].join(',');
  fs.appendFileSync(OUT_CSV, line + '\n', 'utf8');
}

// Provider benches

async function benchEventbrite() {
  const token = process.env.EVENTBRITE_TOKEN || process.env.EVENTBRITE_API_TOKEN || 'QTQLJLTFNS74VHZHBR6B';
  if (!token) return { skipped: true, note: 'EVENTBRITE_TOKEN missing' };
  const url = new URL('https://www.eventbriteapi.com/v3/events/search/');
  const params = new URLSearchParams({
    token,
    'location.address': process.env.BENCH_LOCATION || 'San Francisco, CA',
    'location.within': '25mi',
    'start_date.range_start': new Date().toISOString(),
    'start_date.range_end': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    page: '1',
    expand: 'venue,category,subcategory,ticket_availability,logo',
    status: 'live',
    order_by: 'start_asc',
  });
  url.search = params.toString();
  const run = await withTiming(async () => {
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json', 'User-Agent': 'CMWBench/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return safeJson(res);
  });
  if (!run.ok) return { error: run.error, duration_ms: run.duration_ms };
  const events = run.data?.events || [];
  return { duration_ms: run.duration_ms, events_count: events.length };
}

async function benchTicketmaster() {
  const key = process.env.TICKETMASTER_API_KEY || process.env.TICKETMASTER_CONSUMER_KEY;
  if (!key) return { skipped: true, note: 'TICKETMASTER_API_KEY missing' };
  const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
  const params = new URLSearchParams({
    apikey: key,
    city: (process.env.BENCH_CITY || 'San Francisco'),
    stateCode: 'CA',
    countryCode: 'US',
    size: '25',
    sort: 'date,asc',
    classificationName: process.env.BENCH_TM_CLASS || 'Music',
  });
  url.search = params.toString();
  const run = await withTiming(async () => {
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json', 'User-Agent': 'CMWBench/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return safeJson(res);
  });
  if (!run.ok) return { error: run.error, duration_ms: run.duration_ms };
  const events = run.data?._embedded?.events || [];
  return { duration_ms: run.duration_ms, events_count: events.length };
}

async function benchPredictHQ() {
  const key = process.env.PREDICTHQ_API_KEY;
  if (!key) return { skipped: true, note: 'PREDICTHQ_API_KEY missing' };
  const base = 'https://api.predicthq.com/v1/events';
  const params = new URLSearchParams({
    category: process.env.BENCH_PHQ_CATEGORY || 'performing-arts',
    'location.within': process.env.BENCH_PHQ_WITHIN || '10km@37.7749,-122.4194',
    'start.gte': new Date().toISOString().split('T')[0],
    'start.lt': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    limit: '50',
    sort: 'start',
  });
  const run = await withTiming(async () => {
    const res = await fetch(`${base}?${params}`, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return safeJson(res);
  });
  if (!run.ok) return { error: run.error, duration_ms: run.duration_ms };
  const events = run.data?.results || [];
  return { duration_ms: run.duration_ms, events_count: events.length };
}

async function benchExaFastAPI() {
  const url = process.env.EXA_SERVICE_URL || 'http://127.0.0.1:8080/events/search';
  const body = {
    query: process.env.BENCH_EXA_QUERY || 'Bay Area concerts and film screenings calendar',
    scope: process.env.BENCH_EXA_SCOPE || 'bayarea',
    topic_profile: process.env.BENCH_EXA_PROFILE || 'arts-culture',
    precision: process.env.BENCH_EXA_PRECISION || 'official',
    horizon_days: Number(process.env.BENCH_EXA_HORIZON || 30),
    published_window_days: Number(process.env.BENCH_EXA_PUBWIN || 45),
    mode: process.env.BENCH_EXA_MODE || 'auto',
    num_results: Number(process.env.BENCH_EXA_NUM || 40),
    subpages: Number(process.env.BENCH_EXA_SUBPAGES || 1),
  };
  const run = await withTiming(async () => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return safeJson(res);
  });
  if (!run.ok) return { error: run.error, duration_ms: run.duration_ms };
  const events = run.data?.events || [];
  const cost = run.data?.cost_dollars;
  return { duration_ms: run.duration_ms, events_count: events.length, cost_usd: cost };
}

async function benchPerplexity() {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return { skipped: true, note: 'PERPLEXITY_API_KEY missing' };
  const url = 'https://api.perplexity.ai/chat/completions';
  const prompt = process.env.BENCH_PPLX_PROMPT || 'List 30 Bay Area arts & culture events in the next 30 days as JSON array with title, date, venue, city, url.';
  const payload = {
    model: process.env.BENCH_PPLX_MODEL || 'sonar-pro',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: Number(process.env.BENCH_PPLX_MAXTOK || 4000),
    temperature: Number(process.env.BENCH_PPLX_TEMP || 0.1),
  };
  const run = await withTiming(async () => {
    const res = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return safeJson(res);
  });
  if (!run.ok) return { error: run.error, duration_ms: run.duration_ms };
  const usage = run.data?.usage || null;
  // Optional rough cost estimate if provided via env
  const inCost = Number(process.env.PPLX_COST_IN_PER_1K || 0);
  const outCost = Number(process.env.PPLX_COST_OUT_PER_1K || 0);
  let cost_usd = undefined;
  if (usage && (inCost || outCost)) {
    const inTokens = usage?.prompt_tokens || usage?.input_tokens || 0;
    const outTokens = usage?.completion_tokens || usage?.output_tokens || 0;
    cost_usd = (inTokens / 1000) * inCost + (outTokens / 1000) * outCost;
  }
  // Try to detect count if the model returned valid JSON array
  let events_count;
  try {
    const content = run.data?.choices?.[0]?.message?.content || '';
    const match = content.match(/\[[\s\S]*\]/);
    if (match) {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr)) events_count = arr.length;
    }
  } catch {}
  return { duration_ms: run.duration_ms, events_count, usage_json: usage, cost_usd };
}

async function benchSerper() {
  const key = process.env.SERPER_API_KEY;
  if (!key) return { skipped: true, note: 'SERPER_API_KEY missing' };
  const url = 'https://google.serper.dev/search';
  const query = process.env.BENCH_SERPER_Q || 'site:sfmoma.org/calendar OR site:bampfa.org/calendar';
  const run = await withTiming(async () => {
    const res = await fetch(url, { method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ q: query }) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return safeJson(res);
  });
  if (!run.ok) return { error: run.error, duration_ms: run.duration_ms };
  const organic = run.data?.organic || [];
  return { duration_ms: run.duration_ms, events_count: organic.length };
}

async function main() {
  const rows = [];
  const tasks = [
    { name: 'eventbrite', fn: benchEventbrite },
    { name: 'ticketmaster', fn: benchTicketmaster },
    { name: 'predicthq', fn: benchPredictHQ },
    { name: 'exa_fastapi', fn: benchExaFastAPI },
    { name: 'perplexity', fn: benchPerplexity },
    { name: 'serper', fn: benchSerper },
  ];

  for (const t of tasks) {
    try {
      const r = await t.fn();
      if (r?.skipped) {
        console.log(`SKIP ${t.name}: ${r.note}`);
        appendCsv({ provider: t.name, success: false, note_or_error: `skipped: ${r.note}` });
        continue;
      }
      if (r?.error) {
        console.log(`FAIL ${t.name}: ${r.error}`);
        appendCsv({ provider: t.name, success: false, duration_ms: r.duration_ms, note_or_error: r.error });
      } else {
        console.log(`OK   ${t.name}: ${r.duration_ms} ms, events=${r.events_count ?? 'n/a'}${r.cost_usd ? `, cost=$${r.cost_usd.toFixed(4)}` : ''}`);
        appendCsv({ provider: t.name, success: true, duration_ms: r.duration_ms, events_count: r.events_count, cost_usd: r.cost_usd, usage_json: r.usage_json });
      }
      rows.push({ provider: t.name, ...r });
    } catch (e) {
      console.log(`ERR  ${t.name}: ${e.message}`);
      appendCsv({ provider: t.name, success: false, note_or_error: e.message });
    }
  }

  console.log(`\nCSV log written to: ${OUT_CSV}`);
}

main().catch(err => { console.error(err); process.exit(1); });
