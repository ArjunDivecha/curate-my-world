/**
 * Standalone Ticketmaster Discovery API smoke test.
 * Loads credentials from curate-events-api/.env and
 * makes a direct REST call without Supabase Edge functions.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  const envPath = path.resolve(__dirname, 'curate-events-api/.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnv();

const API_KEY = process.env.TICKETMASTER_CONSUMER_KEY;
const API_SECRET = process.env.TICKETMASTER_CONSUMER_SECRET; // Not used for Discovery but confirmed for completeness.

if (!API_KEY) {
  console.error('❌ Missing TICKETMASTER_CONSUMER_KEY in environment.');
  process.exit(1);
}

console.log('🔍 Ticketmaster API smoke test');
console.log('   Using consumer key:', `${API_KEY.slice(0, 6)}…`);
if (API_SECRET) {
  console.log('   Consumer secret present.');
}

const now = new Date();
const startDateTime = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24h ahead for upcoming events
  .toISOString()
  .replace(/\.\d{3}Z$/, 'Z');

const params = new URLSearchParams({
  apikey: API_KEY,
  city: 'San Francisco',
  countryCode: 'US',
  classificationName: 'music',
  startDateTime,
  size: '25',
  sort: 'date,asc'
});

const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`;

async function run() {
  try {
    console.log('🌐 Requesting:', url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body}`);
    }

    const data = await response.json();
    const events = data?._embedded?.events ?? [];

    console.log(`✅ Received ${events.length} events`);
    if (events.length > 0) {
      const sample = events.slice(0, 5).map(evt => ({
        name: evt.name,
        id: evt.id,
        url: evt.url,
        startDate: evt.dates?.start?.dateTime,
        venue: evt._embedded?.venues?.[0]?.name
      }));
      console.log('📋 Sample events:', JSON.stringify(sample, null, 2));
    }
  } catch (error) {
    console.error('❌ Ticketmaster request failed:', error.message);
  }
}

run();
