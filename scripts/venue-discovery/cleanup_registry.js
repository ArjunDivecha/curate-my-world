/**
 * Clean up venue registry - remove generic entries and duplicates
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

const registryPath = join(PROJECT_ROOT, 'data', 'venue-registry.json');
const venues = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));

console.log('Starting cleanup...');
console.log(`Input: ${venues.length} venues`);

// Generic names to filter out
const genericNames = [
  'events', 'calendar', 'calendar of events', 'events calendar',
  'upcoming events', 'event listing', 'event calendar', 'shows',
  'tickets', 'concerts', 'performances', 'schedule'
];

// Filter out generic entries
let cleaned = venues.filter(v => {
  const name = (v.name || '').toLowerCase().trim();
  if (genericNames.includes(name)) {
    console.log(`  Removed generic: "${v.name}"`);
    return false;
  }
  // Remove entries that are just aggregator pages
  if (name.includes('concerts in') || name.includes('events in') || name.includes('shows in')) {
    console.log(`  Removed aggregator: "${v.name}"`);
    return false;
  }
  return true;
});

console.log(`After generic filter: ${cleaned.length} venues`);

// Deduplicate by normalized name
const seen = new Map();
cleaned = cleaned.filter(v => {
  const key = (v.name || '').toLowerCase().trim()
    .replace(/^the\s+/, '')
    .replace(/\s+(sf|san francisco|oakland|berkeley)$/i, '')
    .replace(/\s+/g, ' ');

  if (seen.has(key)) {
    // Keep the one with more data
    const existing = seen.get(key);
    const existingScore = (existing.address ? 1 : 0) + (existing.lat ? 1 : 0) + (existing.city ? 1 : 0);
    const newScore = (v.address ? 1 : 0) + (v.lat ? 1 : 0) + (v.city ? 1 : 0);

    if (newScore > existingScore) {
      seen.set(key, v);
      console.log(`  Replaced duplicate: "${v.name}" (better data)`);
    } else {
      console.log(`  Removed duplicate: "${v.name}"`);
    }
    return false;
  }

  seen.set(key, v);
  return true;
});

// Get unique venues from the map
cleaned = Array.from(seen.values());

console.log(`After deduplication: ${cleaned.length} venues`);

// Sort by category then name
cleaned.sort((a, b) => {
  if (a.category !== b.category) return a.category.localeCompare(b.category);
  return a.name.localeCompare(b.name);
});

// Save cleaned registry
fs.writeFileSync(registryPath, JSON.stringify(cleaned, null, 2));
console.log(`\nSaved ${cleaned.length} cleaned venues to ${registryPath}`);

// Final stats
const cats = {};
cleaned.forEach(v => cats[v.category || 'unknown'] = (cats[v.category || 'unknown'] || 0) + 1);
console.log('\nFinal categories:');
Object.entries(cats).sort((a,b) => b[1]-a[1]).forEach(([c, n]) => console.log(`  ${c}: ${n}`));
