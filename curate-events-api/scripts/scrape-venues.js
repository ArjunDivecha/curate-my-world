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
const MAX_MARKDOWN_LENGTH = 15000; // Truncate long pages to save tokens

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
async function fetchViaJina(calendarUrl) {
  const jinaUrl = `${JINA_READER_BASE}/${calendarUrl}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

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
    if (markdown.length > MAX_MARKDOWN_LENGTH) {
      markdown = markdown.substring(0, MAX_MARKDOWN_LENGTH) + '\n\n[... truncated ...]';
    }
    return markdown;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
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
- "category": string (one of: music, theatre, comedy, movies, art, food, tech, lectures, kids)
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
function loadExistingCache() {
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

/**
 * Main scraping function
 */
async function main() {
  console.log('=== Venue Calendar Scraper ===');
  console.log(`Started: ${new Date().toISOString()}`);

  // Validate API key
  const apiKey = getAnthropicKey();
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY not found. Set it in .env or environment.');
    process.exit(1);
  }

  const anthropic = new Anthropic({ apiKey });

  // Load venue registry
  if (!fs.existsSync(VENUE_REGISTRY_PATH)) {
    console.error(`ERROR: venue-registry.json not found at ${VENUE_REGISTRY_PATH}`);
    process.exit(1);
  }

  const venues = JSON.parse(fs.readFileSync(VENUE_REGISTRY_PATH, 'utf-8'));
  console.log(`Loaded ${venues.length} venues from registry`);

  // Filter to venues with calendar URLs
  const scrapableVenues = venues.filter(v => v.calendar_url && v.calendar_url.startsWith('http'));
  console.log(`${scrapableVenues.length} venues have scrapable calendar URLs`);

  // Load existing cache for incremental update
  const cache = loadExistingCache();
  cache.lastUpdated = new Date().toISOString();
  cache.metadata = {
    totalVenues: scrapableVenues.length,
    scrapeStarted: new Date().toISOString(),
    scrapeCompleted: null
  };

  let totalEvents = 0;
  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < scrapableVenues.length; i++) {
    const venue = scrapableVenues[i];
    const progress = `[${i + 1}/${scrapableVenues.length}]`;

    console.log(`${progress} Scraping: ${venue.name} (${venue.calendar_url})`);

    try {
      // Fetch via Jina Reader
      const markdown = await fetchViaJina(venue.calendar_url);

      if (!markdown || markdown.length < 100) {
        console.log(`  Skipped: too little content (${markdown?.length || 0} chars)`);
        skippedCount++;
        cache.venues[venue.domain] = {
          venueName: venue.name,
          domain: venue.domain,
          category: venue.category,
          events: [],
          lastScraped: new Date().toISOString(),
          status: 'empty_page'
        };
        saveCache(cache);
        await sleep(JINA_DELAY_MS);
        continue;
      }

      // Extract events with Haiku
      const events = await extractEventsWithHaiku(
        anthropic,
        venue.name,
        venue.category || 'general',
        markdown
      );

      // Stamp each event with venue metadata
      const stampedEvents = events.map((event, idx) => ({
        ...event,
        id: `venue_${venue.domain.replace(/\./g, '_')}_${idx}_${Date.now()}`,
        venue: venue.name,
        venueDomain: venue.domain,
        location: [venue.city, venue.state].filter(Boolean).join(', ') || 'Bay Area, CA',
        source: 'venue_scraper',
        scrapedAt: new Date().toISOString()
      }));

      cache.venues[venue.domain] = {
        venueName: venue.name,
        domain: venue.domain,
        category: venue.category,
        city: venue.city,
        state: venue.state,
        events: stampedEvents,
        lastScraped: new Date().toISOString(),
        status: 'success',
        eventCount: stampedEvents.length
      };

      totalEvents += stampedEvents.length;
      successCount++;
      console.log(`  Found ${stampedEvents.length} events`);

      // Save incrementally
      saveCache(cache);

    } catch (error) {
      console.error(`  ERROR: ${error.message}`);
      failCount++;
      cache.venues[venue.domain] = {
        venueName: venue.name,
        domain: venue.domain,
        category: venue.category,
        events: [],
        lastScraped: new Date().toISOString(),
        status: 'error',
        error: error.message
      };
      saveCache(cache);
    }

    // Rate limit between Jina calls
    if (i < scrapableVenues.length - 1) {
      await sleep(JINA_DELAY_MS);
    }
  }

  // Final cache update
  cache.totalEvents = totalEvents;
  cache.metadata.scrapeCompleted = new Date().toISOString();
  cache.metadata.stats = {
    success: successCount,
    failed: failCount,
    skipped: skippedCount,
    totalEvents
  };
  saveCache(cache);

  console.log('\n=== Scrape Complete ===');
  console.log(`Success: ${successCount} | Failed: ${failCount} | Skipped: ${skippedCount}`);
  console.log(`Total events extracted: ${totalEvents}`);
  console.log(`Cache saved to: ${CACHE_PATH}`);
  console.log(`Finished: ${new Date().toISOString()}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
