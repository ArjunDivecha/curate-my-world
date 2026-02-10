/**
 * Add missing venues to cache with error status so --retry-failed will pick them up
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_FILE = path.join(__dirname, '../../data/venue-events-cache.json');

// Venues to add
const MISSING_VENUES = [
  'tickets.marincenter.org',
  'sfwarmemorial.org',
  'ai-camp.org',
  'meetup.com',
  'hai.stanford.edu',
  'eecs.berkeley.edu',
  'cs.stanford.edu',
  'bakarinstitute.ucsf.edu',
  'hackerdojo.org',
  'noisebridge.net',
  'grayarea.org',
  'archive.org'
];

try {
  // Read cache
  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));

  let added = 0;
  let skipped = 0;

  MISSING_VENUES.forEach(domain => {
    if (cache.venues[domain]) {
      console.log(`⏭️  Skipped ${domain} (already in cache)`);
      skipped++;
    } else {
      cache.venues[domain] = {
        status: 'error',
        error: 'New venue - needs scraping',
        lastUpdated: new Date().toISOString(),
        events: []
      };
      console.log(`✅ Added ${domain} to cache`);
      added++;
    }
  });

  // Update lastUpdated
  cache.lastUpdated = new Date().toISOString();

  // Write cache
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));

  console.log(`\n✅ Done! Added ${added} venues, skipped ${skipped} existing venues`);
  console.log(`\nRun: npm run scrape:retry`);

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
