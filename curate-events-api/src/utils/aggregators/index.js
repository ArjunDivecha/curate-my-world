import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('AggregatorExtractor');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../');
const whitelistPath = path.resolve(rootDir, 'experiments/speed-demon/whitelist.json');

let whitelist = [];
try {
  const raw = fs.readFileSync(whitelistPath, 'utf-8');
  whitelist = JSON.parse(raw);
} catch (error) {
  logger.warn('Unable to read whitelist for aggregator extraction', { error: error.message, whitelistPath });
}

const aggregatorMap = new Map();
whitelist.forEach(entry => {
  if (!entry?.domain) return;
  const domain = entry.domain.toLowerCase().replace(/^www\./, '');
  aggregatorMap.set(domain, entry);
});

const htmlCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheKey(url) {
  return url.split('#')[0];
}

function setCache(url, value) {
  htmlCache.set(cacheKey(url), { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function getCache(url) {
  const entry = htmlCache.get(cacheKey(url));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    htmlCache.delete(cacheKey(url));
    return null;
  }
  return entry.value;
}

export function isAggregatorDomain(domain) {
  if (!domain) return false;
  const normalized = domain.toLowerCase().replace(/^www\./, '');
  return aggregatorMap.has(normalized);
}

function extractJsonLd(html) {
  const scripts = [];
  const regex = /<script[^>]+type=\"application\/ld\+json\"[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html))) {
    const raw = match[1].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      scripts.push(parsed);
    } catch (error) {
      const fixed = raw
        .replace(/}\s*{/, '},{')
        .replace(/}\s*]\s*{/, '}],{');
      try {
        const parsed = JSON.parse(`[${fixed}]`);
        scripts.push(...parsed);
      } catch (innerError) {
        logger.debug('Failed parsing JSON-LD block', { error: innerError.message });
      }
    }
  }
  return scripts;
}

function flattenJsonLd(nodes) {
  const flat = [];
  const queue = Array.isArray(nodes) ? [...nodes] : [nodes];
  while (queue.length) {
    const node = queue.shift();
    if (!node) continue;
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    flat.push(node);
    const graph = node['@graph'] || node.graph;
    if (graph) queue.push(...graph);
  }
  return flat;
}

function parseJsonLdEvents(nodes) {
  const flat = flattenJsonLd(nodes);
  const events = flat.filter(item => {
    const type = item['@type'];
    if (!type) return false;
    if (typeof type === 'string') return type.toLowerCase() === 'event';
    if (Array.isArray(type)) return type.some(t => typeof t === 'string' && t.toLowerCase() === 'event');
    return false;
  });
  return events;
}

function normalizeDate(value) {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

function pickLocation(event, fallbackLocation) {
  const location = event.location || event['@location'];
  if (!location) return fallbackLocation;
  if (typeof location === 'string') return location;
  const name = location.name || '';
  const address = location.address || location.streetAddress || location.addressLocality;
  if (typeof address === 'string') {
    return address;
  }
  if (address && typeof address === 'object') {
    const parts = [address.streetAddress, address.addressLocality, address.addressRegion, address.postalCode]
      .filter(Boolean)
      .join(', ');
    return parts || name || fallbackLocation;
  }
  return name || fallbackLocation;
}

function normalizeAggregatorEvent(event, meta, fallbackCategory, providerSource) {
  const startDate = normalizeDate(event.startDate || event.start_time || event.start);
  const endDate = normalizeDate(event.endDate || event.end_time || event.end);
  const url = event.url || event['@id'] || meta?.url;
  const title = event.name || event.headline || event.title;

  if (!title || !url) {
    return null;
  }

  const categories = new Set();
  if (fallbackCategory) categories.add(fallbackCategory);
  if (meta?.categories) meta.categories.forEach(c => categories.add(c.toLowerCase()));
  const eventType = event.eventType || event.event_type;
  if (eventType) {
    if (Array.isArray(eventType)) eventType.forEach(c => categories.add(String(c).toLowerCase()));
    else categories.add(String(eventType).toLowerCase());
  }

  return {
    id: `agg_${Buffer.from(`${url}`).toString('base64').slice(0, 12)}`,
    title,
    description: event.description || meta?.name || 'See event page for details.',
    category: fallbackCategory,
    categories: Array.from(categories).filter(Boolean),
    venue: event.location?.name || 'See Event Page',
    location: pickLocation(event, meta?.name),
    startDate,
    endDate: endDate || startDate,
    eventUrl: url,
    ticketUrl: event.offers?.url || url,
    externalUrl: url,
    source: providerSource,
    aggregatorSource: meta?.domain || null,
    confidence: 0.7,
    aiReasoning: 'Extracted from venue calendar page'
  };
}

async function fetchHtml(url) {
  const cached = getCache(url);
  if (cached) return cached;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CurateMyWorld/1.0 (AggregatorExtractor)'
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const html = await response.text();
    setCache(url, html);
    return html;
  } catch (error) {
    logger.warn('Aggregator fetch failed', { url, error: error.message });
    return null;
  }
}

export async function expandAggregatorUrl({ url, category, provider }) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }

  const domain = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const meta = aggregatorMap.get(domain);
  if (!meta) return [];

  const html = await fetchHtml(url);
  if (!html) return [];

  const jsonLdBlocks = extractJsonLd(html);
  const jsonLdEvents = parseJsonLdEvents(jsonLdBlocks);
  const normalized = jsonLdEvents
    .map(event => normalizeAggregatorEvent(event, { ...meta, url, domain }, category, provider))
    .filter(Boolean);

  if (normalized.length === 0) {
    logger.info('Aggregator JSON-LD parsing yielded no events', { url, domain });
  } else {
    logger.info('Aggregator expanded events', { url, domain, count: normalized.length });
  }

  return normalized;
}

export function listAggregatorDomains() {
  return Array.from(aggregatorMap.keys());
}
