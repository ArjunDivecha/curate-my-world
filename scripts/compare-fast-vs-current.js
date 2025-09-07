// Compare fast-finder CSV with current exported events CSV
// Usage:
//   node scripts/compare-fast-vs-current.js <fast_csv> <current_csv>

import fs from 'fs';
import path from 'path';

function parseCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    // naive CSV parse that handles quoted fields
    const cols = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQ = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === ',') {
          cols.push(cur);
          cur = '';
        } else if (ch === '"') {
          inQ = true;
        } else {
          cur += ch;
        }
      }
    }
    cols.push(cur);
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = cols[idx] ?? ''));
    return obj;
  });
  return { headers, rows };
}

function normalizeUrl(u) {
  if (!u) return '';
  try {
    const url = new URL(u);
    let p = url.pathname.replace(/\/$/, '');
    return `${url.hostname.toLowerCase()}${p.toLowerCase()}`;
  } catch {
    return '';
  }
}

function normalizeTitle(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildKeysetFromCurrent(rows) {
  const urlKeys = new Set();
  const titleKeys = new Set();
  for (const r of rows) {
    const urls = [r.eventUrl, r.ticketUrl, r.externalUrl, r.source_url].filter(Boolean);
    for (const u of urls) {
      const k = normalizeUrl(u);
      if (k) urlKeys.add(k);
    }
    const t = normalizeTitle(r.title);
    if (t) titleKeys.add(t);
  }
  return { urlKeys, titleKeys };
}

function main() {
  const fastCsv = process.argv[2];
  const currentCsv = process.argv[3];
  if (!fastCsv || !currentCsv) {
    console.error('Usage: node scripts/compare-fast-vs-current.js <fast_csv> <current_csv>');
    process.exit(1);
  }
  const fast = parseCsv(fastCsv);
  const current = parseCsv(currentCsv);

  // Map current headers into known field names if necessary
  // Our current CSV headers are known; keep as is.

  const currentKeyset = buildKeysetFromCurrent(current.rows);

  let urlMatches = 0;
  let titleMatches = 0;
  const uniques = [];
  for (const r of fast.rows) {
    const urlKey = normalizeUrl(r.source_url || r.eventUrl || r.externalUrl);
    const titleKey = normalizeTitle(r.title);
    const hasUrl = urlKey && currentKeyset.urlKeys.has(urlKey);
    const hasTitle = !hasUrl && titleKey && currentKeyset.titleKeys.has(titleKey);
    if (hasUrl) urlMatches++;
    else if (hasTitle) titleMatches++;
    else uniques.push(r);
  }

  const summary = {
    fast_count: fast.rows.length,
    current_count: current.rows.length,
    overlap_url: urlMatches,
    overlap_title: titleMatches,
    fast_only: uniques.length,
  };

  console.log(JSON.stringify(summary, null, 2));

  // Print sample of uniques for inspection
  const sample = uniques.slice(0, 20).map((r) => ({ title: r.title, url: r.source_url || r.eventUrl }));
  console.log('\nFast-only sample (up to 20):');
  for (const s of sample) {
    console.log(`- ${s.title} | ${s.url}`);
  }
}

main();

