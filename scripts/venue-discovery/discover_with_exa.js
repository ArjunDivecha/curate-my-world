/**
 * =============================================================================
 * SCRIPT NAME: discover_with_exa.js
 * =============================================================================
 *
 * Uses Exa API to discover Bay Area venues.
 *
 * USAGE: node scripts/venue-discovery/discover_with_exa.js
 * =============================================================================
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

// Load backend .env manually
const envPath = join(PROJECT_ROOT, 'curate-events-api', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
    const [key, ...valueParts] = trimmed.split('=');
    process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
  }
});

const EXA_API_KEY = process.env.EXA_API_KEY;
if (!EXA_API_KEY) {
  console.error('❌ EXA_API_KEY not found');
  process.exit(1);
}

console.log(`✅ Loaded Exa API key: ${EXA_API_KEY.substring(0, 10)}...`);

const CATEGORIES = [
  { name: 'music', queries: [
    'live music venue San Francisco Bay Area events calendar',
    'concert hall venue Oakland Berkeley events schedule',
    'jazz club San Francisco upcoming shows',
    'rock venue Bay Area tickets concerts'
  ]},
  { name: 'theatre', queries: [
    'theater venue San Francisco Bay Area performances',
    'performing arts center Oakland shows tickets',
    'playhouse San Francisco upcoming productions'
  ]},
  { name: 'comedy', queries: [
    'comedy club San Francisco stand-up shows',
    'improv theater Bay Area performances',
    'comedy venue Oakland tickets'
  ]},
  { name: 'art', queries: [
    'art museum San Francisco exhibitions events',
    'gallery San Francisco Bay Area shows openings',
    'cultural center Oakland events calendar'
  ]},
  { name: 'movies', queries: [
    'independent cinema San Francisco film screenings',
    'repertory theater Bay Area movies schedule',
    'arthouse cinema Oakland Berkeley films'
  ]},
  { name: 'lectures', queries: [
    'lecture hall San Francisco talks events',
    'bookstore author events Bay Area readings',
    'library events San Francisco speakers'
  ]},
  { name: 'food', queries: [
    'food festival San Francisco Bay Area events',
    'wine tasting events Napa Sonoma calendar',
    'culinary events San Francisco tickets'
  ]},
  { name: 'tech', queries: [
    'tech conference San Francisco Bay Area events',
    'startup meetup San Francisco calendar',
    'developer events Bay Area hackathon'
  ]}
];

async function searchExa(query, numResults = 15) {
  const url = 'https://api.exa.ai/search';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': EXA_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        type: 'auto',
        numResults,
        contents: {
          text: { maxCharacters: 300 }
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`  Exa API error: ${response.status} - ${error.substring(0, 200)}`);
      return [];
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error(`  Exa fetch error: ${error.message}`);
    return [];
  }
}

function extractVenueInfo(result) {
  const url = result.url || '';
  let domain = '';
  try {
    domain = new URL(url).hostname.replace('www.', '');
  } catch {}

  // Extract venue name from title
  let name = result.title || '';
  name = name
    .replace(/\s*[-|–—]\s*.*(events|calendar|tickets|shows|schedule|home).*/i, '')
    .replace(/\s*\|\s*.*$/i, '')
    .trim();

  if (!name || name.length < 3) {
    name = domain.split('.')[0];
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }

  return {
    name,
    website: url,
    domain,
    description: (result.text || '').substring(0, 200)
  };
}

async function discoverVenues() {
  console.log('='.repeat(60));
  console.log('EXA VENUE DISCOVERY');
  console.log('='.repeat(60));

  const allVenues = [];
  const seenDomains = new Set();

  for (const category of CATEGORIES) {
    console.log(`\nDiscovering ${category.name} venues...`);

    for (const query of category.queries) {
      const results = await searchExa(query, 20);

      for (const result of results) {
        const venue = extractVenueInfo(result);

        // Skip if no domain or already seen
        if (!venue.domain || seenDomains.has(venue.domain)) continue;

        // Skip aggregator domains
        const aggregators = ['eventbrite.com', 'facebook.com', 'meetup.com', 'yelp.com',
                           'tripadvisor.com', 'google.com', 'wikipedia.org'];
        if (aggregators.some(a => venue.domain.includes(a))) continue;

        seenDomains.add(venue.domain);
        allVenues.push({
          ...venue,
          category: category.name,
          city: 'San Francisco', // Will be geocoded later
          state: 'CA',
          calendar_url: `https://${venue.domain}/events`,
          source: 'exa_discovery',
          discovered_at: new Date().toISOString()
        });
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`  Total unique venues so far: ${allVenues.length}`);
  }

  // Load existing registry and merge
  const registryPath = join(PROJECT_ROOT, 'data', 'venue-registry.json');
  let existing = [];

  if (fs.existsSync(registryPath)) {
    existing = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    console.log(`\nLoaded ${existing.length} existing venues`);

    // Add existing venues not in new list
    for (const v of existing) {
      const domain = v.domain || '';
      if (domain && !seenDomains.has(domain)) {
        seenDomains.add(domain);
        allVenues.push(v);
      }
    }
  }

  // Save merged results
  fs.writeFileSync(registryPath, JSON.stringify(allVenues, null, 2));
  console.log(`\n✅ Saved ${allVenues.length} venues to ${registryPath}`);

  // Summary by category
  const byCat = {};
  allVenues.forEach(v => {
    byCat[v.category] = (byCat[v.category] || 0) + 1;
  });

  console.log('\nVenues by category:');
  Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => console.log(`  ${cat}: ${count}`));

  return allVenues;
}

discoverVenues().catch(console.error);
