/**
 * Validate venue registry data quality
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

const registryPath = join(PROJECT_ROOT, 'data', 'venue-registry.json');
const venues = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));

console.log('='.repeat(60));
console.log('VENUE REGISTRY VALIDATION');
console.log('='.repeat(60));
console.log('\nTotal venues:', venues.length);

// Check field coverage
const fields = ['name', 'website', 'address', 'city', 'state', 'category', 'lat', 'lng', 'domain'];
console.log('\nField coverage:');
fields.forEach(f => {
  const has = venues.filter(v => v[f] && v[f] !== null).length;
  console.log(`  ${f}: ${has} (${Math.round(has/venues.length*100)}%)`);
});

// Category breakdown
const cats = {};
venues.forEach(v => cats[v.category || 'unknown'] = (cats[v.category || 'unknown'] || 0) + 1);
console.log('\nCategories:');
Object.entries(cats).sort((a,b) => b[1]-a[1]).forEach(([c, n]) => console.log(`  ${c}: ${n}`));

// Sources
const sources = {};
venues.forEach(v => sources[v.source || 'unknown'] = (sources[v.source || 'unknown'] || 0) + 1);
console.log('\nSources:');
Object.entries(sources).sort((a,b) => b[1]-a[1]).forEach(([s, c]) => console.log(`  ${s}: ${c}`));

// Sample venues with websites
console.log('\nSample venues with websites:');
venues.filter(v => v.website).slice(0, 15).forEach(v => {
  console.log(`  ${v.name} - ${v.website}`);
});

// Check for duplicates by name
const names = {};
venues.forEach(v => {
  const key = (v.name || '').toLowerCase().trim();
  names[key] = (names[key] || 0) + 1;
});
const dupes = Object.entries(names).filter(([k, v]) => v > 1);
if (dupes.length > 0) {
  console.log('\nPotential duplicates by name:');
  dupes.slice(0, 10).forEach(([name, count]) => console.log(`  "${name}": ${count} times`));
}

console.log('\n' + '='.repeat(60));
console.log('Validation complete');
