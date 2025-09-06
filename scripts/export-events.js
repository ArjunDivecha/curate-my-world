// Export all events to a standalone file (JSON and CSV)
// Usage:
//   BACKEND_URL=http://127.0.0.1:8765 LOCATION="San Francisco, CA" LIMIT=100 node scripts/export-events.js
// Defaults:
//   BACKEND_URL=http://127.0.0.1:8765
//   LOCATION=San Francisco, CA
//   LIMIT=100

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8765';
const LOCATION = process.env.LOCATION || 'San Francisco, CA';
const LIMIT = Number(process.env.LIMIT || 100);
const DATE_RANGE = process.env.DATE_RANGE || 'next 30 days';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function toCsvRow(fields) {
  return fields
    .map((v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    })
    .join(',');
}

function toCsv(events) {
  const headers = [
    'id',
    'title',
    'category',
    'startDate',
    'endDate',
    'venue_name',
    'venue_address',
    'city',
    'price_minmax',
    'eventUrl',
    'ticketUrl',
    'source'
  ];
  const rows = [headers.join(',')];
  for (const e of events) {
    const price = e.price?.amount || (e.priceRange ? `${e.priceRange.min ?? ''}-${e.priceRange.max ?? ''}` : '');
    rows.push(
      toCsvRow([
        e.id,
        e.title,
        Array.isArray(e.categories) ? e.categories.join('|') : (e.category || ''),
        e.startDate || e.date || '',
        e.endDate || '',
        e.venue?.name || e.venue || '',
        e.venue?.address || e.address || '',
        e.city || '',
        price,
        e.eventUrl || e.source_url || e.externalUrl || '',
        e.ticketUrl || '',
        e.source || ''
      ])
    );
  }
  return rows.join('\n');
}

async function main() {
  const url = new URL(`/api/events/all-categories`, BACKEND_URL);
  url.searchParams.set('location', LOCATION);
  url.searchParams.set('date_range', DATE_RANGE);
  url.searchParams.set('limit', String(LIMIT));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  const data = await res.json();

  // Flatten events
  const events = Object.values(data.eventsByCategory || {}).flat();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(process.cwd(), 'exports');
  ensureDir(outDir);

  const base = `events_${timestamp}`;
  const jsonPath = path.join(outDir, `${base}.json`);
  const csvPath = path.join(outDir, `${base}.csv`);

  fs.writeFileSync(jsonPath, JSON.stringify({
    location: LOCATION,
    date_range: DATE_RANGE,
    total: events.length,
    providerStats: data.providerStats || {},
    events
  }, null, 2));

  fs.writeFileSync(csvPath, toCsv(events));

  console.log(`Exported ${events.length} events`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`CSV:  ${csvPath}`);
}

main().catch((e) => {
  console.error('Export failed:', e.message);
  process.exit(1);
});

