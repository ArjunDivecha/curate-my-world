#!/usr/bin/env node
/**
 * Mine aggregator-derived events to:
 * 1) identify possible missing events for venues already in registry
 * 2) derive candidate venue domains/names for registry enrichment
 *
 * Usage:
 *   node scripts/venue-discovery/mine_aggregator_gaps.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const CACHE_PATH = path.join(DATA_DIR, 'venue-events-cache.json');
const REGISTRY_PATH = path.join(DATA_DIR, 'venue-registry.json');
const DEFAULT_REPORTS_DIR = path.join(PROJECT_ROOT, 'curate-events-api', 'data', 'reports');
const DEFAULT_VETTING_DIR = path.join(DATA_DIR, 'venue-vetting');

const AGGREGATOR_DOMAINS = new Set([
  'meetup.com',
  'eventbrite.com',
  'eventbrite.hk',
  'feverup.com',
  'dice.fm',
  'ra.co',
  'bandsintown.com',
  'songkick.com',
  'timeout.com',
  'allevents.in',
  'lu.ma',
  'luma.com',
  'dothebay.com',
  'ticketmaster.com',
  'partiful.com',
  'events.sulekha.com',
  'eventmozo.com',
  'epadosi.com',
  'simplydesi.us',
  'agendahero.com',
  'techmeme.com',
  'dev.events',
  'hackathon.com',
]);

const NON_VENUE_DOMAINS = new Set([
  'google.com',
  'maps.google.com',
  'googleusercontent.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'x.com',
  'twitter.com',
  'youtube.com',
  'youtu.be',
  't.co',
  'tinyurl.com',
  'bit.ly',
  'mailchi.mp',
  'zoom.us',
]);

const GENERIC_VENUE_LABELS = new Set([
  'meetup',
  'eventbrite',
  'events',
  'calendar',
  'discover',
  'sulekha bay area indian events',
  'music in the bay area today',
  'san francisco',
  'bay area',
]);

const VENUE_STOP_WORDS = new Set([
  'the', 'and', 'at', 'in', 'of', 'for', 'center', 'centre', 'hall', 'theater', 'theatre',
  'club', 'venue', 'auditorium', 'pavilion', 'stage', 'sf', 'bay', 'area', 'san', 'francisco',
]);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function normalizeDomain(value) {
  const domain = String(value || '').toLowerCase().trim();
  if (!domain) return '';
  return domain.replace(/^www\./, '');
}

function safeUrl(value) {
  try {
    return new URL(String(value || '').trim());
  } catch {
    return null;
  }
}

function domainFromUrl(value) {
  const parsed = safeUrl(value);
  return parsed ? normalizeDomain(parsed.hostname) : '';
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(value) {
  return normalizeText(value).replace(/[\s-]+/g, '');
}

function dateKey(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function normalizeVenueName(value) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  return normalized
    .split(' ')
    .filter(Boolean)
    .filter(token => !VENUE_STOP_WORDS.has(token))
    .join(' ');
}

function tokenizeVenue(value) {
  return new Set(
    normalizeVenueName(value)
      .split(' ')
      .filter(Boolean)
  );
}

function tokenSimilarity(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection += 1;
  }
  const denom = Math.min(setA.size, setB.size);
  return denom > 0 ? intersection / denom : 0;
}

function titlesSimilar(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 8 && (left.includes(right) || right.includes(left))) return true;
  return compactText(left) === compactText(right);
}

function extractUrlsFromText(value) {
  const text = String(value || '');
  const matches = text.match(/https?:\/\/[^\s)]+/gi) || [];
  return matches.map(v => v.replace(/[),.;]+$/, ''));
}

function extractEmbeddedUrlsFromUrl(urlValue) {
  const parsed = safeUrl(urlValue);
  if (!parsed) return [];

  const out = new Set([parsed.toString()]);

  const extractCandidatesFromString = (candidate) => {
    const value = String(candidate || '').trim();
    if (!value) return;
    const decoded = [value];
    try { decoded.push(decodeURIComponent(value)); } catch {}
    for (const piece of decoded) {
      for (const found of extractUrlsFromText(piece)) out.add(found);
    }
  };

  parsed.searchParams.forEach((value) => {
    extractCandidatesFromString(value);
  });

  extractCandidatesFromString(parsed.pathname);
  return Array.from(out);
}

function flattenEvents(cache) {
  const rows = [];
  const venues = cache?.venues || {};
  for (const [cacheDomainRaw, payload] of Object.entries(venues)) {
    const cacheDomain = normalizeDomain(cacheDomainRaw);
    const events = Array.isArray(payload?.events) ? payload.events : [];
    for (const event of events) {
      rows.push({
        ...event,
        cacheDomain,
      });
    }
  }
  return rows;
}

function parseArgs(argv) {
  const args = {
    top: 200,
    minCandidateCount: 2,
    reportDir: '',
    vettingDir: '',
    stamp: '',
  };
  for (const arg of argv) {
    if (arg.startsWith('--top=')) {
      const n = Number(arg.slice('--top='.length));
      if (Number.isFinite(n) && n > 0) args.top = n;
    } else if (arg.startsWith('--min-candidate-count=')) {
      const n = Number(arg.slice('--min-candidate-count='.length));
      if (Number.isFinite(n) && n > 0) args.minCandidateCount = n;
    } else if (arg.startsWith('--report-dir=')) {
      args.reportDir = arg.slice('--report-dir='.length).trim();
    } else if (arg.startsWith('--vetting-dir=')) {
      args.vettingDir = arg.slice('--vetting-dir='.length).trim();
    } else if (arg.startsWith('--stamp=')) {
      args.stamp = arg.slice('--stamp='.length).trim();
    }
  }
  return args;
}

function toCsv(rows, headers) {
  const escapeCell = (value) => {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escapeCell(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const reportDir = args.reportDir ? path.resolve(args.reportDir) : DEFAULT_REPORTS_DIR;
  const vettingDir = args.vettingDir ? path.resolve(args.vettingDir) : DEFAULT_VETTING_DIR;
  const stamp = args.stamp || new Date().toISOString().slice(0, 10);
  const cache = readJson(CACHE_PATH, {});
  const registry = readJson(REGISTRY_PATH, []);

  if (!cache || typeof cache !== 'object') {
    throw new Error(`Unable to read cache: ${CACHE_PATH}`);
  }
  if (!Array.isArray(registry)) {
    throw new Error(`Unable to read registry: ${REGISTRY_PATH}`);
  }

  const registryDomains = new Set(registry.map(v => normalizeDomain(v?.domain)).filter(Boolean));
  const registryByName = new Map();
  const registryRows = registry.map((venue) => {
    const venueName = String(venue?.name || '');
    const row = {
      domain: normalizeDomain(venue?.domain),
      name: venueName,
      city: String(venue?.city || ''),
      category: String(venue?.category || ''),
      nameKey: normalizeVenueName(venueName),
      tokens: tokenizeVenue(venueName),
    };
    if (row.nameKey) {
      if (!registryByName.has(row.nameKey)) registryByName.set(row.nameKey, []);
      registryByName.get(row.nameKey).push(row);
    }
    return row;
  });

  const events = flattenEvents(cache);
  const isAggregatorEvent = (event) => {
    const domains = new Set([
      normalizeDomain(event.cacheDomain),
      normalizeDomain(event.venueDomain),
      domainFromUrl(event.eventUrl),
      domainFromUrl(event.ticketUrl),
      domainFromUrl(event.externalUrl),
    ].filter(Boolean));
    for (const domain of domains) {
      if (AGGREGATOR_DOMAINS.has(domain)) return true;
    }
    return false;
  };

  const aggregatorEvents = events.filter(isAggregatorEvent);
  const directEvents = events.filter(event => !isAggregatorEvent(event));

  const directByDomain = new Map();
  for (const event of directEvents) {
    const domain = normalizeDomain(event.cacheDomain || event.venueDomain || domainFromUrl(event.eventUrl));
    if (!domain) continue;
    if (!directByDomain.has(domain)) directByDomain.set(domain, []);
    directByDomain.get(domain).push(event);
  }

  const domainCandidates = new Map();
  const unmatchedVenueCandidates = new Map();
  const coverageGaps = [];
  const coverageByVenue = new Map();

  const pushDomainCandidate = ({ domain, event, sourceAggregator, reason }) => {
    const normalized = normalizeDomain(domain);
    if (!normalized) return;
    if (AGGREGATOR_DOMAINS.has(normalized)) return;
    if (NON_VENUE_DOMAINS.has(normalized)) return;
    if (registryDomains.has(normalized)) return;
    if (normalized.endsWith('.google.com')) return;

    if (!domainCandidates.has(normalized)) {
      domainCandidates.set(normalized, {
        domain: normalized,
        count: 0,
        reasons: new Set(),
        sourceAggregators: new Set(),
        sampleEvents: [],
      });
    }
    const item = domainCandidates.get(normalized);
    item.count += 1;
    item.reasons.add(reason);
    if (sourceAggregator) item.sourceAggregators.add(sourceAggregator);
    if (item.sampleEvents.length < 5) {
      item.sampleEvents.push({
        title: event.title || '',
        startDate: event.startDate || '',
        venue: event.venue || '',
        location: event.location || '',
        eventUrl: event.eventUrl || '',
      });
    }
  };

  const findRegistryMatchesByVenueName = (venueName, cityHint) => {
    const key = normalizeVenueName(venueName);
    if (!key) return [];

    const exact = registryByName.get(key) || [];
    if (exact.length > 0) return exact;

    const candidateTokens = tokenizeVenue(venueName);
    if (candidateTokens.size === 0) return [];

    const scored = [];
    for (const row of registryRows) {
      const score = tokenSimilarity(candidateTokens, row.tokens);
      if (score < 0.7) continue;
      if (cityHint && row.city && normalizeText(row.city) !== normalizeText(cityHint) && score < 0.9) {
        continue;
      }
      scored.push({ row, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 3).map(v => v.row);
  };

  const addUnmatchedVenueCandidate = (event, sourceAggregator) => {
    const venue = String(event.venue || '').trim();
    if (!venue) return;
    const venueKey = normalizeVenueName(venue);
    if (!venueKey) return;
    if (GENERIC_VENUE_LABELS.has(venueKey)) return;
    if (!unmatchedVenueCandidates.has(venueKey)) {
      unmatchedVenueCandidates.set(venueKey, {
        venueName: venue,
        city: event.city || '',
        location: event.location || '',
        count: 0,
        sourceAggregators: new Set(),
        sampleEvents: [],
      });
    }
    const item = unmatchedVenueCandidates.get(venueKey);
    item.count += 1;
    if (sourceAggregator) item.sourceAggregators.add(sourceAggregator);
    if (item.sampleEvents.length < 5) {
      item.sampleEvents.push({
        title: event.title || '',
        startDate: event.startDate || '',
        eventUrl: event.eventUrl || '',
      });
    }
  };

  for (const event of aggregatorEvents) {
    const sourceAggregator = normalizeDomain(
      event.cacheDomain || event.venueDomain || domainFromUrl(event.eventUrl)
    );

    const urls = [
      event.eventUrl,
      event.ticketUrl,
      event.externalUrl,
      ...(extractUrlsFromText(event.description)),
    ].filter(Boolean);
    for (const url of urls) {
      for (const embedded of extractEmbeddedUrlsFromUrl(url)) {
        const domain = domainFromUrl(embedded);
        if (domain) {
          pushDomainCandidate({
            domain,
            event,
            sourceAggregator,
            reason: embedded === url ? 'direct_url_domain' : 'embedded_url_domain',
          });
        }
      }
    }

    const matchedRegistryRows = findRegistryMatchesByVenueName(event.venue, event.city);
    if (matchedRegistryRows.length === 0) {
      addUnmatchedVenueCandidate(event, sourceAggregator);
      continue;
    }

    const directDomains = matchedRegistryRows
      .map(v => v.domain)
      .filter(Boolean)
      .filter(domain => directByDomain.has(domain));

    const coverageKey = normalizeVenueName(event.venue) || normalizeText(event.venue);
    if (!coverageByVenue.has(coverageKey)) {
      coverageByVenue.set(coverageKey, {
        venue: event.venue || '',
        matchedRegistry: matchedRegistryRows.map(v => ({
          domain: v.domain,
          name: v.name,
          city: v.city,
        })),
        totalAggregatorEvents: 0,
        matchedDirectEvents: 0,
      });
    }
    const coverage = coverageByVenue.get(coverageKey);
    coverage.totalAggregatorEvents += 1;

    let foundMatch = false;
    const aggTitle = event.title || '';
    const aggDate = dateKey(event.startDate);
    for (const domain of directDomains) {
      const directDomainEvents = directByDomain.get(domain) || [];
      for (const directEvent of directDomainEvents) {
        const directDate = dateKey(directEvent.startDate);
        if (aggDate && directDate && aggDate !== directDate) continue;
        if (titlesSimilar(aggTitle, directEvent.title || '')) {
          foundMatch = true;
          break;
        }
      }
      if (foundMatch) break;
    }

    if (foundMatch) {
      coverage.matchedDirectEvents += 1;
    } else {
      coverageGaps.push({
        aggregatorSource: sourceAggregator,
        venue: event.venue || '',
        venueLocation: event.location || event.city || '',
        eventTitle: event.title || '',
        startDate: event.startDate || '',
        eventUrl: event.eventUrl || event.ticketUrl || '',
        matchedRegistryDomains: matchedRegistryRows.map(v => v.domain).filter(Boolean),
      });
    }
  }

  const domainCandidatesList = Array.from(domainCandidates.values())
    .filter(v => v.count >= args.minCandidateCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, args.top)
    .map(v => ({
      domain: v.domain,
      count: v.count,
      reasons: Array.from(v.reasons),
      sourceAggregators: Array.from(v.sourceAggregators),
      sampleEvents: v.sampleEvents,
    }));

  const unmatchedVenueCandidatesList = Array.from(unmatchedVenueCandidates.values())
    .filter(v => v.count >= args.minCandidateCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, args.top)
    .map(v => ({
      venueName: v.venueName,
      city: v.city,
      location: v.location,
      count: v.count,
      sourceAggregators: Array.from(v.sourceAggregators),
      sampleEvents: v.sampleEvents,
    }));

  const coverageByVenueList = Array.from(coverageByVenue.values())
    .sort((a, b) => {
      const ratioA = a.totalAggregatorEvents ? a.matchedDirectEvents / a.totalAggregatorEvents : 0;
      const ratioB = b.totalAggregatorEvents ? b.matchedDirectEvents / b.totalAggregatorEvents : 0;
      if (ratioA !== ratioB) return ratioA - ratioB;
      return b.totalAggregatorEvents - a.totalAggregatorEvents;
    })
    .slice(0, args.top)
    .map(v => ({
      ...v,
      coverageRatio: v.totalAggregatorEvents
        ? Number((v.matchedDirectEvents / v.totalAggregatorEvents).toFixed(3))
        : 0,
    }));

  const summary = {
    runAt: new Date().toISOString(),
    totalEventsInCache: events.length,
    aggregatorEvents: aggregatorEvents.length,
    directEvents: directEvents.length,
    registryVenueCount: registry.length,
    candidateDomainCount: domainCandidatesList.length,
    unmatchedVenueCandidateCount: unmatchedVenueCandidatesList.length,
    coverageGapCount: coverageGaps.length,
  };

  const payload = {
    summary,
    candidateDomains: domainCandidatesList,
    unmatchedVenueCandidates: unmatchedVenueCandidatesList,
    coverageGapsForExistingVenues: coverageGaps.slice(0, args.top),
    coverageByVenue: coverageByVenueList,
  };

  ensureDir(reportDir);
  ensureDir(vettingDir);
  const jsonOut = path.join(reportDir, `aggregator-intel-${stamp}.json`);
  const mdOut = path.join(reportDir, `aggregator-intel-${stamp}.md`);
  const csvOut = path.join(vettingDir, `aggregator-candidates-${stamp}.csv`);
  const latestJsonOut = path.join(reportDir, 'aggregator-intel-latest.json');
  const latestMdOut = path.join(reportDir, 'aggregator-intel-latest.md');
  const latestCsvOut = path.join(vettingDir, 'aggregator-candidates-latest.csv');

  fs.writeFileSync(jsonOut, JSON.stringify(payload, null, 2));
  fs.writeFileSync(latestJsonOut, JSON.stringify(payload, null, 2));

  const mdLines = [
    '# Aggregator Intelligence Report',
    '',
    `- Run At: ${summary.runAt}`,
    `- Total Cache Events: ${summary.totalEventsInCache}`,
    `- Aggregator Events: ${summary.aggregatorEvents}`,
    `- Direct Venue Events: ${summary.directEvents}`,
    `- Registry Venues: ${summary.registryVenueCount}`,
    `- Candidate Domains: ${summary.candidateDomainCount}`,
    `- Unmatched Venue Candidates: ${summary.unmatchedVenueCandidateCount}`,
    `- Coverage Gaps For Existing Venues: ${summary.coverageGapCount}`,
    '',
    '## Top Candidate Domains',
    ...domainCandidatesList.slice(0, 25).map((row, i) =>
      `${i + 1}. ${row.domain} (${row.count}) via ${row.sourceAggregators.join(', ')}`
    ),
    '',
    '## Top Coverage Gaps',
    ...coverageGaps.slice(0, 25).map((row, i) =>
      `${i + 1}. ${row.eventTitle} | ${row.venue} | ${row.startDate || 'no-date'} | ${row.aggregatorSource}`
    ),
    '',
  ];
  fs.writeFileSync(mdOut, `${mdLines.join('\n')}\n`);
  fs.writeFileSync(latestMdOut, `${mdLines.join('\n')}\n`);

  const csvRows = [
    ...domainCandidatesList.map(row => ({
      candidate_type: 'domain',
      domain: row.domain,
      venue_name: '',
      city: '',
      count: row.count,
      source_aggregators: row.sourceAggregators.join('|'),
      sample_event_title: row.sampleEvents[0]?.title || '',
      sample_event_url: row.sampleEvents[0]?.eventUrl || '',
    })),
    ...unmatchedVenueCandidatesList.map(row => ({
      candidate_type: 'venue_name',
      domain: '',
      venue_name: row.venueName,
      city: row.city || row.location || '',
      count: row.count,
      source_aggregators: row.sourceAggregators.join('|'),
      sample_event_title: row.sampleEvents[0]?.title || '',
      sample_event_url: row.sampleEvents[0]?.eventUrl || '',
    })),
  ];
  fs.writeFileSync(
    csvOut,
    toCsv(csvRows, [
      'candidate_type',
      'domain',
      'venue_name',
      'city',
      'count',
      'source_aggregators',
      'sample_event_title',
      'sample_event_url',
    ])
  );
  fs.writeFileSync(
    latestCsvOut,
    toCsv(csvRows, [
      'candidate_type',
      'domain',
      'venue_name',
      'city',
      'count',
      'source_aggregators',
      'sample_event_title',
      'sample_event_url',
    ])
  );

  console.log('Aggregator mining complete');
  console.log(JSON.stringify({
    summary,
    outputs: {
      json: jsonOut,
      latestJson: latestJsonOut,
      markdown: mdOut,
      latestMarkdown: latestMdOut,
      csv: csvOut,
      latestCsv: latestCsvOut,
    },
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error('Aggregator mining failed:', error.message);
  process.exitCode = 1;
}
