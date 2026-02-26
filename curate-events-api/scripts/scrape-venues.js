/**
 * =============================================================================
 * SCRIPT NAME: scrape-venues.js
 * =============================================================================
 *
 * INPUT FILES:
 * - data/venue-registry.json: 286 Bay Area venues with calendar URLs
 *
 * OUTPUT FILES:
 * - data/venue-events-cache.json: Extracted events from venue calendars
 *
 * VERSION: 1.0
 * LAST UPDATED: 2026-02-06
 * AUTHOR: Claude Code
 *
 * DESCRIPTION:
 * Daily scheduled job that scrapes venue calendars via Jina Reader,
 * then extracts structured events using Claude Haiku. Results are cached
 * in venue-events-cache.json for the VenueScraperClient to serve at
 * request time (no network calls during API requests).
 *
 * USAGE:
 * cd curate-events-api && npm run scrape:venues
 *
 * DEPENDENCIES:
 * - @anthropic-ai/sdk (Claude Haiku for event extraction)
 * - node-fetch (for Jina Reader HTTP calls)
 *
 * NOTES:
 * - Rate limiting: 1s between Jina calls to avoid 429s
 * - Incremental writes: saves after each venue (fault tolerant)
 * - Cost: ~$0.05 per full 286-venue run via Claude Haiku
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import {
  completeVenueScrapeRun,
  insertVenueScrapeRun,
  readVenueCacheFromDb,
  releaseVenueScrapeLock,
  tryAcquireVenueScrapeLock,
  upsertVenueCacheToDb,
} from '../src/utils/venueCacheDb.js';

// Load environment
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Also load from parent .env
try {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
} catch {}

const DATA_DIR = path.resolve(__dirname, '../../data');
const VENUE_REGISTRY_PATH = path.join(DATA_DIR, 'venue-registry.json');
const CACHE_PATH = path.join(DATA_DIR, 'venue-events-cache.json');
const JINA_READER_BASE = 'https://r.jina.ai';
const JINA_DELAY_MS = 1000; // 1 second between Jina calls
const DEFAULT_MAX_MARKDOWN_LENGTH = 15000; // Truncate long pages to save tokens
const MARKDOWN_LENGTH_OVERRIDES = {
  // These calendars front-load navigation and older events; we need deeper context
  // so the extractor can see current/future occurrences.
  'bampfa.org': 120000,
  'calperformances.org': 70000,
};
const TRIBE_FEED_OVERRIDES = {
  'fortmason.org': 'https://fortmason.org/wp-json/tribe/events/v1/events'
};
const TRIBE_LOOKAHEAD_DAYS = 180;
const TRIBE_PER_PAGE = 100;
const TRIBE_MAX_PAGES = 8;

// Get API key
function getAnthropicKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  // Fallback: read from shared env file
  try {
    const envPath = '/Users/arjundivecha/Dropbox/AAA Backup/.env.txt';
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/ANTHROPIC_API_KEY=(.+)/);
    if (match) return match[1].trim();
  } catch {}
  return null;
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch venue calendar page via Jina Reader
 */
function getMarkdownLimitForVenue(venue) {
  const domain = String(venue?.domain || '').toLowerCase();
  return MARKDOWN_LENGTH_OVERRIDES[domain] || DEFAULT_MAX_MARKDOWN_LENGTH;
}

async function fetchViaJina(calendarUrl, { maxMarkdownLength = DEFAULT_MAX_MARKDOWN_LENGTH } = {}) {
  const jinaUrl = `${JINA_READER_BASE}/${calendarUrl}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout (some JS-heavy sites need 30-45s)

  try {
    const response = await fetch(jinaUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/markdown',
        'User-Agent': 'CurateMyWorld/1.0'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Jina HTTP ${response.status}: ${response.statusText}`);
    }

    let markdown = await response.text();
    // Truncate long pages
    if (markdown.length > maxMarkdownLength) {
      markdown = markdown.substring(0, maxMarkdownLength) + '\n\n[... truncated ...]';
    }
    return markdown;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function isIcsFeedUrl(url) {
  const normalized = String(url || '').toLowerCase();
  return normalized.endsWith('.ics') || normalized.includes('.ics?') || /[?&]ical=1(?:&|$)/.test(normalized);
}

async function fetchRawText(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/calendar,text/plain;q=0.9,*/*;q=0.8',
        'User-Agent': 'CurateMyWorld/1.0'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function decodeIcsText(value) {
  return String(value || '')
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#039;/gi, '\'')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#([0-9]+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#039;/gi, '\'')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&mdash;/gi, '-')
    .replace(/&ndash;/gi, '-')
    .replace(/&rsquo;|&lsquo;/gi, '\'')
    .replace(/&rdquo;|&ldquo;/gi, '"')
    .replace(/&hellip;/gi, '...')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unfoldIcsLines(icsText) {
  const lines = String(icsText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const unfolded = [];

  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }

  return unfolded;
}

function parseIcsDate(value, { isEnd = false } = {}) {
  const raw = String(value || '').trim();

  // Date only (YYYYMMDD); DTEND is exclusive in ICS, so subtract one day.
  const dateOnly = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    if (!isEnd) return `${y}-${m}-${d}T00:00:00`;

    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    dt.setDate(dt.getDate() - 1);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}T23:59:59`;
  }

  // Date-time (YYYYMMDDTHHMMSS or YYYYMMDDTHHMM)
  const dateTime = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?Z?$/);
  if (dateTime) {
    const [, y, m, d, hh, mm, ss] = dateTime;
    if (raw.endsWith('Z')) {
      const utc = new Date(Date.UTC(
        Number(y),
        Number(m) - 1,
        Number(d),
        Number(hh),
        Number(mm),
        Number(ss || '0')
      ));
      return utc.toISOString().slice(0, 19) + 'Z';
    }
    return `${y}-${m}-${d}T${hh}:${mm}:${ss || '00'}`;
  }

  return null;
}

function extractCityFromLocation(location, fallbackCity = null) {
  const text = String(location || '');
  if (!text) return fallbackCity || null;

  const cityMatch = text.match(
    /\b(San Francisco|Oakland|Berkeley|San Jose|Palo Alto|Mountain View|Sunnyvale|Santa Clara|Redwood City|San Mateo|Sausalito|Mill Valley|San Rafael|Fremont|Alameda)\b/i
  );
  if (cityMatch) {
    const city = cityMatch[1].toLowerCase();
    return city
      .split(' ')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  return fallbackCity || null;
}

function categorizeIcsEvent({ summary, description, categories, fallbackCategory }) {
  const text = `${summary || ''} ${description || ''} ${categories || ''}`.toLowerCase();
  const likelyNativeAmericanContext = /\b(american indian|native american|indigenous|tribal)\b/.test(text);
  const desiSignals = /\b(desi|bollywood|bhangra|garba|dandiya|holi|diwali|south asian|punjabi|gujarati|tamil|telugu|hindi|urdu|kathak|bharatanatyam|kollywood|tollywood)\b/.test(text);
  const indianSignal = /\bindian\b/.test(text);

  if (!likelyNativeAmericanContext && (desiSignals || indianSignal)) return 'desi';

  if (/(stand-up|stand up|comedy|improv|laugh)/.test(text)) return 'comedy';
  if (/(concert|music|musical|jazz|dj)/.test(text)) return 'music';
  if (/(film|movie|cinema)/.test(text)) return 'movies';
  if (/(food|culinary|wine|farmers market|night market)/.test(text)) return 'food';
  if (/(lecture|talk|panel|conference|tour|workshop|class|literary)/.test(text)) return 'lectures';
  if (/(theater|theatre|ballet|dance|performance|opera)/.test(text)) return 'theatre';
  if (/(tech|startup|developer|software|hackathon|artificial intelligence|\bai\b)/.test(text)) return 'tech';
  if (/(kids|children|family)/.test(text)) return 'kids';
  if (/(art|exhibit|gallery|visual|photography|fort mason art)/.test(text)) return 'art';

  return fallbackCategory || 'all';
}

function canonicalizeIcsEventUrl(url) {
  const input = String(url || '').trim();
  if (!input) return null;

  try {
    const parsed = new URL(input);
    parsed.hash = '';
    parsed.search = '';
    // The Events Calendar recurring instances commonly append /YYYY-MM-DD[/N]/.
    parsed.pathname = parsed.pathname.replace(/\/\d{4}-\d{2}-\d{2}(?:\/\d+)?\/?$/, '/');
    return parsed.toString();
  } catch {
    return input.replace(/\/\d{4}-\d{2}-\d{2}(?:\/\d+)?\/?$/, '/');
  }
}

function parseIcsEvents(icsText, { fallbackCategory = 'all', fallbackCity = null } = {}) {
  const lines = unfoldIcsLines(icsText);
  const parsed = [];
  let current = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) parsed.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const idx = line.indexOf(':');
    if (idx < 0) continue;

    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [nameRaw] = left.split(';');
    const name = nameRaw.toUpperCase();

    if (name === 'SUMMARY') current.title = decodeIcsText(value);
    if (name === 'DESCRIPTION') current.description = decodeIcsText(value);
    if (name === 'URL') current.eventUrl = value.trim();
    if (name === 'LOCATION') current.location = decodeIcsText(value);
    if (name === 'CATEGORIES') current.categories = decodeIcsText(value);
    if (name === 'STATUS') current.status = String(value || '').trim().toUpperCase();
    if (name === 'DTSTART') current.startDate = parseIcsDate(value, { isEnd: false });
    if (name === 'DTEND') current.endDate = parseIcsDate(value, { isEnd: true });
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const deduped = new Map();

  for (const event of parsed) {
    if (!event.title || !event.startDate) continue;
    if (event.status === 'CANCELLED') continue;

    const eventDate = new Date(event.startDate);
    if (Number.isNaN(eventDate.getTime()) || eventDate < startOfToday) continue;

    const normalized = {
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate || null,
      description: event.description || '',
      category: categorizeIcsEvent({
        summary: event.title,
        description: event.description,
        categories: event.categories,
        fallbackCategory
      }),
      price: null,
      eventUrl: canonicalizeIcsEventUrl(event.eventUrl),
      city: extractCityFromLocation(event.location, fallbackCity)
    };

    // Keep each occurrence date for recurring events.
    const key = `${normalized.title}|${normalized.startDate}`;
    deduped.set(key, normalized);
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const aTime = new Date(a.startDate).getTime();
    const bTime = new Date(b.startDate).getTime();
    return aTime - bTime;
  });
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeEventUrl(url) {
  const input = String(url || '').trim();
  if (!input) return '';
  try {
    const parsed = new URL(input);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/+$/, '/');
  } catch {
    return input.replace(/[?#].*$/, '').replace(/\/+$/, '/');
  }
}

function parseSqlDateTime(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  // "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DDTHH:mm:ss"
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    return text.replace(' ', 'T');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return `${text}T00:00:00`;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  const iso = parsed.toISOString();
  return iso.slice(0, 19);
}

function getDomainFiltersFromArgs(args) {
  return args
    .filter(arg => arg.startsWith('--domain='))
    .flatMap(arg => arg.slice('--domain='.length).split(','))
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);
}

function getRunTypeFromArgs(args) {
  const value = args
    .find(arg => arg.startsWith('--run-type='))
    ?.slice('--run-type='.length)
    .trim()
    .toLowerCase();
  if (!value) return null;
  if (['daily_full', 'daily_retry', 'manual_full', 'manual_partial'].includes(value)) return value;
  return 'unknown';
}

function buildTribeFeedUrl(venue) {
  const domain = String(venue?.domain || '').toLowerCase();
  if (TRIBE_FEED_OVERRIDES[domain]) return TRIBE_FEED_OVERRIDES[domain];

  const calendarUrl = String(venue?.calendar_url || '');
  if (/\/wp-json\/tribe\/events\/v1\/events/i.test(calendarUrl)) {
    return calendarUrl;
  }

  return null;
}

async function fetchTribeEvents(venue) {
  const feedUrl = buildTribeFeedUrl(venue);
  if (!feedUrl) return [];

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + TRIBE_LOOKAHEAD_DAYS);
  const toDateString = (date) => date.toISOString().slice(0, 10);
  const start = toDateString(startDate);
  const end = toDateString(endDate);

  const deduped = new Map();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  for (let page = 1; page <= TRIBE_MAX_PAGES; page++) {
    const url = new URL(feedUrl);
    url.searchParams.set('status', 'publish');
    url.searchParams.set('start_date', start);
    url.searchParams.set('end_date', end);
    url.searchParams.set('per_page', String(TRIBE_PER_PAGE));
    url.searchParams.set('page', String(page));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'CurateMyWorld/1.0'
        },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`Tribe HTTP ${response.status}: ${response.statusText}`);
    }

    const payload = await response.json();
    const items = Array.isArray(payload?.events) ? payload.events : [];
    if (!items.length) break;

    for (const item of items) {
      if (item?.status && String(item.status).toLowerCase() !== 'publish') continue;
      if (item?.hide_from_listings) continue;

      const title = decodeHtmlEntities(item?.title || '').trim();
      const startDateTime = parseSqlDateTime(item?.start_date || item?.utc_start_date);
      const endDateTime = parseSqlDateTime(item?.end_date || item?.utc_end_date);
      const eventUrl = normalizeEventUrl(item?.url || '');
      if (!title || !startDateTime) continue;

      const startDateObj = new Date(startDateTime);
      if (Number.isNaN(startDateObj.getTime()) || startDateObj < startOfToday) continue;

      const categoryNames = (Array.isArray(item?.categories) ? item.categories : [])
        .map(cat => decodeHtmlEntities(cat?.name || ''))
        .filter(Boolean)
        .join(' ');

      const descriptionSource = stripHtml(item?.excerpt || item?.description || '');
      const description = decodeHtmlEntities(descriptionSource).slice(0, 500);

      const normalized = {
        title,
        startDate: startDateTime,
        endDate: endDateTime,
        description,
        category: categorizeIcsEvent({
          summary: title,
          description,
          categories: categoryNames,
          fallbackCategory: venue.category || 'all'
        }),
        price: item?.cost ? decodeHtmlEntities(String(item.cost).trim()) : null,
        eventUrl: eventUrl || null,
        city: venue.city || null
      };

      const key = `${normalized.title}|${normalized.startDate}`;
      deduped.set(key, normalized);
    }

    const totalPages = Number(payload?.total_pages);
    if (Number.isFinite(totalPages) && page >= totalPages) break;
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const aTime = new Date(a.startDate).getTime();
    const bTime = new Date(b.startDate).getTime();
    return aTime - bTime;
  });
}

function extractEventUrlsFromMarkdown(markdown, domain) {
  if (!markdown || !domain) return [];
  const escapedDomain = escapeRegex(domain.replace(/^www\./i, ''));
  const pattern = new RegExp(`https?:\\/\\/(?:www\\.)?${escapedDomain}\\/event\\/[^\\s)\\]]+`, 'gi');
  const urls = new Set();

  let match;
  while ((match = pattern.exec(markdown)) !== null) {
    const cleaned = match[0].replace(/[),.;]+$/, '').trim();
    if (cleaned) urls.add(cleaned);
  }

  return Array.from(urls);
}

function inferStartDateFromEventUrl(url) {
  const dateMatch = String(url || '').match(/\/(\d{4})-(\d{2})-(\d{2})(?:\/\d+)?\/?$/);
  if (!dateMatch) return null;
  const [, y, m, d] = dateMatch;
  return `${y}-${m}-${d}T19:00:00`;
}

function titleFromEventUrl(url) {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, '');
    const parts = pathname.split('/').filter(Boolean);
    if (!parts.length) return 'Event';

    // /event/<slug>/<optional-date>/<optional-instance>
    let slug = parts[parts.length - 1];
    if (/^\d+$/.test(slug) || /^\d{4}-\d{2}-\d{2}$/.test(slug)) {
      slug = parts[parts.length - 2] || slug;
    }
    if (slug === 'event' && parts.length >= 2) slug = parts[parts.length - 2];
    slug = slug.replace(/^\d{4}-\d{2}-\d{2}$/, '');
    if (!slug) return 'Event';

    return slug
      .split('-')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  } catch {
    return 'Event';
  }
}

function addFallbackEventsFromCalendarUrls(events, markdown, venue) {
  const discoveredUrls = extractEventUrlsFromMarkdown(markdown, venue.domain);
  if (!discoveredUrls.length) return events;

  const existing = new Set(
    events
      .map(event => normalizeEventUrl(event?.eventUrl))
      .filter(Boolean)
  );

  const additions = [];
  for (const url of discoveredUrls) {
    const normalizedUrl = normalizeEventUrl(url);
    if (!normalizedUrl || existing.has(normalizedUrl)) continue;

    // Guardrail: only synthesize when the URL contains a concrete occurrence date.
    const startDate = inferStartDateFromEventUrl(normalizedUrl);
    if (!startDate) continue;

    additions.push({
      title: titleFromEventUrl(normalizedUrl),
      startDate,
      endDate: null,
      description: 'Discovered from calendar listing URL; details inferred from link.',
      category: venue.category || 'all',
      price: null,
      eventUrl: normalizedUrl,
      city: venue.city || null
    });
    existing.add(normalizedUrl);
  }

  return additions.length ? [...events, ...additions] : events;
}

function extractFamsfVenueHints(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const hints = new Map();
  const famsfExhibitionUrlRegex = /https?:\/\/(?:www\.)?famsf\.org\/exhibitions\/[^\s)\]]+/gi;

  const normalizeHint = (text) => {
    const lower = String(text || '').toLowerCase();
    const hasDeYoung = lower.includes('de young');
    const hasLegion = lower.includes('legion of honor');
    if (hasDeYoung && hasLegion) return 'both';
    if (hasDeYoung) return 'deyoung';
    if (hasLegion) return 'legion';
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    const matches = Array.from(line.matchAll(famsfExhibitionUrlRegex))
      .map(match => String(match[0] || '').replace(/[),.;]+$/, '').trim())
      .filter(Boolean);
    if (matches.length === 0) continue;

    // Look at the current line + nearby lines where the museum label usually appears.
    const context = lines.slice(i, Math.min(lines.length, i + 7)).join(' ');
    const hint = normalizeHint(context);
    if (!hint) continue;

    for (const url of matches) {
      const normalizedUrl = normalizeEventUrl(url);
      if (normalizedUrl && !hints.has(normalizedUrl)) {
        hints.set(normalizedUrl, hint);
      }
    }
  }

  return hints;
}

function applyFamsfVenueHints(events, markdown, venue) {
  const domain = String(venue?.domain || '').toLowerCase();
  const famsfDomains = new Set(['famsf.org', 'deyoung.famsf.org', 'legionofhonor.famsf.org']);
  if (!famsfDomains.has(domain)) return events;
  if (!Array.isArray(events) || events.length === 0) return events;

  const hints = extractFamsfVenueHints(markdown);
  if (hints.size === 0) return events;

  return events.map(event => {
    const normalizedUrl = normalizeEventUrl(event?.eventUrl);
    if (!normalizedUrl) return event;
    const hint = hints.get(normalizedUrl);
    if (!hint) return event;

    if (hint === 'deyoung') {
      return { ...event, venue: 'de Young Museum', venueDomain: 'deyoung.famsf.org' };
    }
    if (hint === 'legion') {
      return { ...event, venue: 'Legion of Honor', venueDomain: 'legionofhonor.famsf.org' };
    }
    return { ...event, venue: 'de Young Museum / Legion of Honor', venueDomain: 'famsf.org' };
  });
}

function safeDecodeUrlParam(value) {
  if (value === null || value === undefined) return '';
  try {
    return decodeURIComponent(String(value).replace(/\+/g, ' ')).trim();
  } catch {
    return String(value).trim();
  }
}

function parseGoogleCalendarDate(value) {
  const raw = String(value || '').trim();
  const dateTime = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/);
  if (dateTime) {
    const [, y, m, d, hh, mm, ss] = dateTime;
    return `${y}-${m}-${d}T${hh}:${mm}:${ss || '00'}`;
  }

  const dateOnly = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return `${y}-${m}-${d}T19:00:00`;
  }

  return null;
}

function extractEventsFromGoogleCalendarLinks(markdown, venue) {
  if (!markdown) return [];

  const linkPattern = /\[Google Calendar\]\((https?:\/\/calendar\.google\.com\/calendar\/r\/eventedit\?[^)\s]+)\)/gi;
  const deduped = new Map();

  let match;
  while ((match = linkPattern.exec(markdown)) !== null) {
    const calendarLink = match[1];
    let parsedUrl;
    try {
      parsedUrl = new URL(calendarLink);
    } catch {
      continue;
    }

    const title = safeDecodeUrlParam(parsedUrl.searchParams.get('text'));
    const datesRaw = safeDecodeUrlParam(parsedUrl.searchParams.get('dates'));
    const detailsRaw = safeDecodeUrlParam(parsedUrl.searchParams.get('details'));
    const [startRaw, endRaw] = datesRaw.split('/');
    const startDate = parseGoogleCalendarDate(startRaw);
    const endDate = parseGoogleCalendarDate(endRaw);
    if (!title || !startDate) continue;

    let eventUrl = null;
    const detailsUrlMatch = detailsRaw.match(/https?:\/\/[^\s)]+/i);
    if (detailsUrlMatch) {
      eventUrl = normalizeEventUrl(detailsUrlMatch[0]);
    }

    const key = `${title}|${startDate}`;
    if (deduped.has(key)) continue;

    deduped.set(key, {
      title,
      startDate,
      endDate,
      description: detailsRaw || null,
      category: venue.category || 'all',
      price: null,
      eventUrl,
      city: venue.city || null
    });
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const aTime = new Date(a.startDate).getTime();
    const bTime = new Date(b.startDate).getTime();
    return aTime - bTime;
  });
}

/**
 * Extract events from markdown using Claude Haiku
 */
async function extractEventsWithHaiku(anthropic, venueName, venueCategory, calendarMarkdown) {
  const today = new Date().toISOString().split('T')[0];

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Extract upcoming events from this venue calendar page. Today is ${today}.

VENUE: ${venueName}
DEFAULT CATEGORY: ${venueCategory}

Return a JSON array of events. Each event must have:
- "title": string (specific event name, NOT the venue name)
- "startDate": ISO date string (YYYY-MM-DDTHH:mm:ss). If only a date is given, use 19:00 as default time.
- "endDate": ISO date string or null
- "description": string (1-2 sentences)
- "category": string (one of: music, theatre, comedy, movies, art, food, tech, lectures, kids, desi)
- "price": string or null (e.g. "$25", "$15-$45", "Free")
- "eventUrl": string or null (direct link to event page)
- "city": string or null (the city where the event takes place, e.g. "San Francisco", "Oakland", "London", "Istanbul")

RULES:
- Only include events on or after ${today}
- Skip generic "view calendar" or "upcoming events" links - only real specific events
- Skip if there's no specific event title (just venue name is not an event)
- If you can't find any specific events, return an empty array []
- Extract the actual city where each event takes place from the page content. If the page lists events in multiple cities worldwide, include the city for each one.
- Return ONLY the JSON array, no other text

CALENDAR CONTENT:
${calendarMarkdown}`
    }]
  });

  // Parse the response
  const text = response.content[0]?.text || '[]';
  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const events = JSON.parse(jsonMatch[0]);
    return Array.isArray(events) ? events : [];
  } catch {
    console.error(`  Failed to parse Haiku response for ${venueName}`);
    return [];
  }
}

/**
 * Load existing cache for incremental updates
 */
async function loadExistingCache({ preferDb = false } = {}) {
  if (preferDb) {
    try {
      const dbCache = await readVenueCacheFromDb();
      if (dbCache && typeof dbCache === 'object') {
        return dbCache;
      }
    } catch {}
  }

  try {
    if (fs.existsSync(CACHE_PATH)) {
      const raw = fs.readFileSync(CACHE_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {}
  return {
    lastUpdated: null,
    venues: {},
    totalEvents: 0,
    metadata: {}
  };
}

/**
 * Save cache incrementally (atomic write)
 */
function saveCache(cache) {
  const tmpPath = CACHE_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(cache, null, 2));
  fs.renameSync(tmpPath, CACHE_PATH);
}

async function persistCache(cache, { writeDb } = {}) {
  saveCache(cache);
  if (!writeDb) return;
  // Best-effort DB persistence; never fail the scrape if DB is unavailable.
  await upsertVenueCacheToDb(cache);
}

/**
 * Main scraping function
 */
async function main() {
  console.log('=== Venue Calendar Scraper ===');
  console.log(`Started: ${new Date().toISOString()}`);
  if (process.argv.length > 2) {
    console.log(`CLI args: ${process.argv.slice(2).join(' ')}`);
  }

  const writeDb =
    process.argv.includes('--write-db') ||
    (process.env.VENUE_CACHE_STORAGE_MODE || '').toLowerCase().trim() === 'db' ||
    (process.env.NODE_ENV === 'production' && !!process.env.DATABASE_URL);
  const allowPartialDbWrite = process.argv.includes('--allow-partial-db-write');
  const runType = getRunTypeFromArgs(process.argv);
  const strictDbPersistence = (runType || '').startsWith('daily_');

  let dbLockAcquired = false;
  let scrapeRunId = null;
  let scrapeRunCompleted = false;

  if (writeDb) {
    const lock = await tryAcquireVenueScrapeLock();
    if (!lock.ok) {
      if (lock.reason === 'locked') {
        console.log('Another venue scrape is already running (DB lock held). Exiting.');
        process.exitCode = 2;
        return;
      }
      if (strictDbPersistence) {
        throw new Error(`DB lock unavailable in strict mode (${lock.reason || 'unknown'})`);
      }
      console.log('DB lock unavailable; continuing without DB persistence.');
    } else {
      dbLockAcquired = true;
      scrapeRunId = await insertVenueScrapeRun();
    }
  }

  try {
    // Validate API key
    const apiKey = getAnthropicKey();
    if (!apiKey) {
      console.error('ERROR: ANTHROPIC_API_KEY not found. Set it in .env or environment.');
      if (scrapeRunId) {
        await completeVenueScrapeRun(scrapeRunId, { status: 'error', error: 'ANTHROPIC_API_KEY missing' });
        scrapeRunCompleted = true;
      }
      throw new Error('ANTHROPIC_API_KEY missing');
    }

    const anthropic = new Anthropic({ apiKey });

    // Load venue registry
    if (!fs.existsSync(VENUE_REGISTRY_PATH)) {
      console.error(`ERROR: venue-registry.json not found at ${VENUE_REGISTRY_PATH}`);
      if (scrapeRunId) {
        await completeVenueScrapeRun(scrapeRunId, { status: 'error', error: 'venue-registry.json missing' });
        scrapeRunCompleted = true;
      }
      throw new Error('venue-registry.json missing');
    }

    const venues = JSON.parse(fs.readFileSync(VENUE_REGISTRY_PATH, 'utf-8'));
    console.log(`Loaded ${venues.length} venues from registry`);

    // Filter to venues with calendar URLs
    let scrapableVenues = venues.filter(v => v.calendar_url && v.calendar_url.startsWith('http'));
    console.log(`${scrapableVenues.length} venues have scrapable calendar URLs`);

    const domainFilters = getDomainFiltersFromArgs(process.argv);
    if (domainFilters.length > 0) {
      const domainSet = new Set(domainFilters);
      scrapableVenues = scrapableVenues.filter(v => domainSet.has(String(v.domain || '').toLowerCase()));
      console.log(`--domain filter active: ${scrapableVenues.length} venue(s) matched`);
    }

    // Load existing cache for incremental update. In DB mode, DB is source of truth.
    const cache = await loadExistingCache({ preferDb: writeDb });
    const previousLastUpdated = cache.lastUpdated || null;
    const previousTotalEvents = Number.isFinite(Number(cache.totalEvents)) ? Number(cache.totalEvents) : 0;

    // --retry-failed: only re-scrape venues that previously errored
    const retryFailed = process.argv.includes('--retry-failed');
    if (retryFailed) {
      const failedDomains = new Set(
        Object.entries(cache.venues || {})
          .filter(([, v]) => v.status === 'error')
          .map(([domain]) => domain)
      );
      scrapableVenues = scrapableVenues.filter(v => failedDomains.has(v.domain));
      console.log(`--retry-failed: retrying ${scrapableVenues.length} previously failed venues`);
    }

    const isPartialRun = retryFailed || domainFilters.length > 0;
    const writeDbForThisRun = dbLockAcquired && (!isPartialRun || allowPartialDbWrite);
    const runStartedAt = new Date().toISOString();
    console.log(`Run type: ${runType || (isPartialRun ? 'manual_partial' : 'manual_full')}`);
    if (isPartialRun && dbLockAcquired && !allowPartialDbWrite) {
      console.log('Partial run detected: DB persistence disabled unless --allow-partial-db-write is provided.');
    }
    if (!cache.metadata || typeof cache.metadata !== 'object') {
      cache.metadata = {};
    }
    if (!isPartialRun) {
      cache.metadata.totalVenues = scrapableVenues.length;
      cache.metadata.scrapeStarted = runStartedAt;
      cache.metadata.scrapeCompleted = null;
      cache.metadata.runScope = 'full';
      cache.metadata.runType = runType || 'manual_full';
    } else {
      cache.metadata.lastPartialRun = {
        startedAt: runStartedAt,
        totalVenues: scrapableVenues.length,
        retryFailed,
        domainFilters,
        runType: runType || 'manual_partial'
      };
      cache.metadata.runScope = 'partial';
      console.log('Partial run detected; global cache freshness timestamp will not be updated.');
    }

    let totalEvents = 0;
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < scrapableVenues.length; i++) {
      const venue = scrapableVenues[i];
      const progress = `[${i + 1}/${scrapableVenues.length}]`;
      const attemptedAt = new Date().toISOString();

      console.log(`${progress} Scraping: ${venue.name} (${venue.calendar_url})`);

      try {
        let events = [];

        if (isIcsFeedUrl(venue.calendar_url)) {
          const icsText = await fetchRawText(venue.calendar_url);
          if (!icsText || icsText.length < 100) {
            console.log(`  Skipped: too little ICS content (${icsText?.length || 0} chars)`);
            skippedCount++;

            // Preserve previously-scraped events if we have them (avoid clobbering cache on transient failures).
            const prev = cache.venues?.[venue.domain] || {};
            const preservedEvents = Array.isArray(prev?.events) ? prev.events : [];
            const priorFreshAt = prev.dataFreshAt || prev.lastScraped || null;

            cache.venues[venue.domain] = {
              venueName: venue.name,
              domain: venue.domain,
              category: venue.category,
              city: venue.city,
              state: venue.state,
              events: preservedEvents,
              lastAttemptedAt: attemptedAt,
              lastScraped: priorFreshAt,
              dataFreshAt: priorFreshAt,
              status: preservedEvents.length > 0 ? 'empty_page_preserved' : 'empty_page',
              eventCount: preservedEvents.length
            };
            await persistCache(cache, { writeDb: writeDbForThisRun });
            await sleep(JINA_DELAY_MS);
            continue;
          }

          events = parseIcsEvents(icsText, {
            fallbackCategory: venue.category || 'all',
            fallbackCity: venue.city || null
          });
          console.log(`  Parsed ${events.length} events from ICS feed`);
        } else {
          const tribeEvents = await fetchTribeEvents(venue);
          if (tribeEvents.length > 0) {
            events = tribeEvents;
            console.log(`  Parsed ${events.length} events from Tribe JSON feed`);
          } else {
          // Fetch via Jina Reader
            const markdown = await fetchViaJina(venue.calendar_url, {
              maxMarkdownLength: getMarkdownLimitForVenue(venue)
            });

            if (!markdown || markdown.length < 100) {
              console.log(`  Skipped: too little content (${markdown?.length || 0} chars)`);
              skippedCount++;

              // Preserve previously-scraped events if we have them (avoid clobbering cache on transient failures).
              const prev = cache.venues?.[venue.domain] || {};
              const preservedEvents = Array.isArray(prev?.events) ? prev.events : [];
              const priorFreshAt = prev.dataFreshAt || prev.lastScraped || null;

              cache.venues[venue.domain] = {
                venueName: venue.name,
                domain: venue.domain,
                category: venue.category,
                city: venue.city,
                state: venue.state,
                events: preservedEvents,
                lastAttemptedAt: attemptedAt,
                lastScraped: priorFreshAt,
                dataFreshAt: priorFreshAt,
                status: preservedEvents.length > 0 ? 'empty_page_preserved' : 'empty_page',
                eventCount: preservedEvents.length
              };
              await persistCache(cache, { writeDb: writeDbForThisRun });
              await sleep(JINA_DELAY_MS);
              continue;
            }

            // Extract events with Haiku
            const extractedEvents = await extractEventsWithHaiku(
              anthropic,
              venue.name,
              venue.category || 'general',
              markdown
            );
            events = addFallbackEventsFromCalendarUrls(extractedEvents, markdown, venue);
            events = applyFamsfVenueHints(events, markdown, venue);
            const addedByUrlScan = events.length - extractedEvents.length;
            if (addedByUrlScan > 0) {
              console.log(`  Added ${addedByUrlScan} events from calendar URL scan`);
            }
            if (events.length === 0) {
              const calendarLinkEvents = extractEventsFromGoogleCalendarLinks(markdown, venue);
              if (calendarLinkEvents.length > 0) {
                events = calendarLinkEvents;
                console.log(`  Parsed ${events.length} events from Google Calendar link fallback`);
              }
            }
          }
        }

        // Stamp each event with venue metadata
        const stampedEvents = events.map((event, idx) => ({
          ...event,
          id: `venue_${venue.domain.replace(/\./g, '_')}_${idx}_${Date.now()}`,
          venue: event.venue || venue.name,
          venueDomain: event.venueDomain || venue.domain,
          location: event.location || [venue.city, venue.state].filter(Boolean).join(', ') || 'Bay Area, CA',
          source: 'venue_scraper',
          scrapedAt: attemptedAt
        }));

        cache.venues[venue.domain] = {
          venueName: venue.name,
          domain: venue.domain,
          category: venue.category,
          city: venue.city,
          state: venue.state,
          events: stampedEvents,
          lastAttemptedAt: attemptedAt,
          lastScraped: attemptedAt,
          dataFreshAt: attemptedAt,
          status: 'success',
          eventCount: stampedEvents.length
        };

        totalEvents += stampedEvents.length;
        successCount++;
        console.log(`  Found ${stampedEvents.length} events`);

        // Save incrementally
        await persistCache(cache, { writeDb: writeDbForThisRun });

      } catch (error) {
        console.error(`  ERROR: ${error.message}`);
        failCount++;

        // Preserve previously-scraped events if we have them (avoid wiping cache on systemic failures).
        const prev = cache.venues?.[venue.domain] || {};
        const preservedEvents = Array.isArray(prev?.events) ? prev.events : [];
        const priorFreshAt = prev.dataFreshAt || prev.lastScraped || null;

        cache.venues[venue.domain] = {
          venueName: venue.name,
          domain: venue.domain,
          category: venue.category,
          city: venue.city,
          state: venue.state,
          events: preservedEvents,
          lastAttemptedAt: attemptedAt,
          lastScraped: priorFreshAt,
          dataFreshAt: priorFreshAt,
          status: 'error',
          error: error.message,
          eventCount: preservedEvents.length,
          preservedEvents: preservedEvents.length
        };
        await persistCache(cache, { writeDb: writeDbForThisRun });
      }

      // Rate limit between Jina calls
      if (i < scrapableVenues.length - 1) {
        await sleep(JINA_DELAY_MS);
      }
    }

    // Final cache update — recount all events across the full cache (covers retry mode)
    let grandTotal = 0;
    for (const v of Object.values(cache.venues)) {
      grandTotal += (v.events || []).length;
    }
    cache.totalEvents = grandTotal;
    const runSucceeded = successCount > 0;

    // Only bump cache freshness if we actually fetched something successfully.
    // If the run was a systemic failure (0 successes), keep the previous lastUpdated so the API can
    // retry later and we don't pretend the cache is "fresh but empty".
    if (runSucceeded && !isPartialRun) {
      cache.lastUpdated = new Date().toISOString();
    } else {
      cache.lastUpdated = previousLastUpdated;
    }
    const runStats = {
      success: successCount,
      failed: failCount,
      skipped: skippedCount,
      totalEvents: grandTotal,
      thisRunEvents: totalEvents,
      previousTotalEvents
    };
    if (!isPartialRun) {
      cache.metadata.scrapeCompleted = new Date().toISOString();
      cache.metadata.stats = runStats;
    } else {
      cache.metadata.lastPartialRun = {
        ...(cache.metadata.lastPartialRun || {}),
        completedAt: new Date().toISOString(),
        stats: runStats
      };
    }
    await persistCache(cache, { writeDb: writeDbForThisRun });

    if (scrapeRunId) {
      await completeVenueScrapeRun(scrapeRunId, {
        status: runSucceeded ? 'success' : 'error',
        error: runSucceeded ? null : 'No venues scraped successfully (cache preserved; lastUpdated not bumped)',
        stats: { ...runStats, totalVenues: scrapableVenues.length, runScope: isPartialRun ? 'partial' : 'full' },
        cacheLastUpdated: cache.lastUpdated
      });
      scrapeRunCompleted = true;
    }

    console.log('\n=== Scrape Complete ===');
    console.log(`Success: ${successCount} | Failed: ${failCount} | Skipped: ${skippedCount}`);
    console.log(`Total events extracted: ${totalEvents}`);
    console.log(`Cache saved to: ${CACHE_PATH}`);
    console.log(`Finished: ${new Date().toISOString()}`);
  } catch (error) {
    if (scrapeRunId && !scrapeRunCompleted) {
      await completeVenueScrapeRun(scrapeRunId, { status: 'error', error: error.message });
    }
    throw error;
  } finally {
    if (dbLockAcquired) {
      await releaseVenueScrapeLock();
    }
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  // Do not throw from here; exit non-zero so schedulers / logs catch it.
  process.exit(1);
});
