/**
 * Targeted museum discovery for Bay Area
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

// Load backend .env
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

const MUSEUM_QUERIES = [
  'art museum San Francisco exhibitions events calendar',
  'science museum Bay Area exhibits tickets',
  'history museum San Francisco Oakland Berkeley events',
  'children museum Bay Area family events',
  'natural history museum California Academy Sciences',
  'technology museum Silicon Valley exhibits',
  'SFMOMA San Francisco Museum of Modern Art',
  'de Young museum San Francisco events',
  'Exploratorium San Francisco science museum',
  'Asian Art Museum San Francisco exhibitions',
  'Oakland Museum California events calendar',
  'Berkeley Art Museum Pacific Film Archive'
];

async function searchExa(query) {
  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'x-api-key': EXA_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      type: 'auto',
      numResults: 10,
      contents: { text: { maxCharacters: 300 } }
    })
  });
  
  if (!response.ok) return [];
  const data = await response.json();
  return data.results || [];
}

async function discover() {
  console.log('Discovering museums...\n');
  
  const seenDomains = new Set();
  const museums = [];
  
  // Skip aggregator domains
  const skip = ['eventbrite.com', 'facebook.com', 'yelp.com', 'tripadvisor.com', 
                'wikipedia.org', 'google.com', 'artsy.net', 'timeout.com'];
  
  for (const query of MUSEUM_QUERIES) {
    console.log(`Query: ${query.substring(0, 50)}...`);
    const results = await searchExa(query);
    
    for (const r of results) {
      let domain = '';
      try { domain = new URL(r.url).hostname.replace('www.', ''); } catch {}
      
      if (!domain || seenDomains.has(domain)) continue;
      if (skip.some(s => domain.includes(s))) continue;
      
      seenDomains.add(domain);
      
      let name = r.title || '';
      name = name.replace(/\s*[-|–—].*$/i, '').trim();
      if (name.length < 3) name = domain.split('.')[0];
      
      museums.push({
        name,
        website: r.url,
        domain,
        category: 'museums',
        city: 'San Francisco',
        state: 'CA',
        calendar_url: `https://${domain}/events`,
        source: 'exa_museum_discovery',
        discovered_at: new Date().toISOString(),
        description: (r.text || '').substring(0, 200)
      });
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\nFound ${museums.length} unique museum domains`);
  
  // Load existing registry and add museums
  const registryPath = join(PROJECT_ROOT, 'data', 'venue-registry.json');
  const existing = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  
  // Add museums not already in registry
  const existingDomains = new Set(existing.map(v => v.domain));
  let added = 0;
  
  for (const m of museums) {
    if (!existingDomains.has(m.domain)) {
      existing.push(m);
      added++;
      console.log(`  Added: ${m.name}`);
    }
  }
  
  fs.writeFileSync(registryPath, JSON.stringify(existing, null, 2));
  console.log(`\nAdded ${added} new museums. Total venues: ${existing.length}`);
}

discover().catch(console.error);
