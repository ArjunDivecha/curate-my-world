/**
 * =============================================================================
 * SCRIPT NAME: bakeoff-venue-extractors.js
 * =============================================================================
 *
 * DESCRIPTION:
 * Head-to-head comparison harness for the LLM that extracts events from venue
 * calendar pages. For each selected venue it fetches the calendar markdown ONCE
 * (via Jina Reader) and feeds the IDENTICAL prompt to every enabled model, so
 * the only variable is the model. It then scores each model's output on event
 * count, field coverage (title / startDate / direct URL / city), duplicate
 * rate, token usage, and estimated cost, and writes JSON + Markdown reports.
 *
 * Models are defined in MODEL_SPECS and toggled in the `models` array in main().
 * Currently enabled: Claude Haiku 4.5 (Anthropic) vs DeepSeek V4 Flash (OpenRouter).
 *
 * CLI FLAGS:
 *   --all                Run against EVERY venue in the registry (442).
 *   --domains=a.com,b.com Run only the listed venue domains.
 *   --sample-size=N      When no --domains/--all, cap the built-in sample to N.
 *   --limit=N            Cap the number of venues processed (applies after selection).
 *   --delay-ms=N         Delay between venues to be gentle on Jina (default 500).
 *
 * INPUT FILES:
 *   - /Users/arjundivecha/Dropbox/AAA Backup/A Working/Curate-My-World Squirtle/data/venue-registry.json
 *       Venue list with calendar URLs (read).
 *   - /Users/arjundivecha/Dropbox/AAA Backup/.env.txt
 *       Fallback source for ANTHROPIC_API_KEY (read) if not in process.env.
 *   - curate-events-api/.env and repo-root .env (read via dotenv) for OPENROUTER_API_KEY.
 *   - https://r.jina.ai/<calendar_url>  (network read, per venue)
 *   - https://openrouter.ai/api/v1/chat/completions  (network, DeepSeek calls)
 *   - https://api.anthropic.com  (network, Haiku calls)
 *
 * OUTPUT FILES (all under .../Curate-My-World Squirtle/data/reports/):
 *   - model-bakeoff-<timestamp>.json   Full per-venue + per-model results.
 *   - model-bakeoff-<timestamp>.md     Human-readable summary.
 *   - model-bakeoff-latest.json        Copy of the latest run (JSON).
 *   - model-bakeoff-latest.md          Copy of the latest run (Markdown).
 *   Results are written INCREMENTALLY after each venue (atomic temp+rename) so a
 *   crash mid-run does not lose completed work.
 *
 * USAGE:
 *   node curate-events-api/scripts/bakeoff-venue-extractors.js --all
 *
 * VERSION: 2.0
 * LAST UPDATED: 2026-06-09
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

try {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
} catch {}

try {
  dotenv.config({ path: path.resolve(ROOT_DIR, '.env') });
} catch {}

const DATA_DIR = path.join(ROOT_DIR, 'data');
const VENUE_REGISTRY_PATH = path.join(DATA_DIR, 'venue-registry.json');
const REPORT_DIR = path.join(DATA_DIR, 'reports');
const JINA_READER_BASE = 'https://r.jina.ai';
const DEFAULT_MAX_MARKDOWN_LENGTH = 15000;
const MARKDOWN_LENGTH_OVERRIDES = {
  'bampfa.org': 120000,
  'calperformances.org': 70000,
  'sf.funcheap.com': 120000,
};

const MODEL_SPECS = {
  haiku: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    inputPerMillion: 1.0,
    outputPerMillion: 5.0,
  },
  gpt4oMini: {
    provider: 'openrouter',
    model: 'openai/gpt-4o-mini',
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
  },
  geminiFlashLite: {
    provider: 'openrouter',
    model: 'google/gemini-2.5-flash-lite',
    inputPerMillion: 0.1,
    outputPerMillion: 0.4,
  },
  deepseekV4Flash: {
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    // OpenRouter pricing as of 2026-06-09: $0.0983/M input, $0.1966/M output
    inputPerMillion: 0.0983,
    outputPerMillion: 0.1966,
  },
  deepseekV4Pro: {
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-pro',
    // OpenRouter pricing as of 2026-06-20: $0.435/M input, $0.87/M output
    inputPerMillion: 0.435,
    outputPerMillion: 0.87,
  },
};

const DEFAULT_SAMPLE_DOMAINS = [
  'sfjazz.org',
  'oaklandmuseumca.org',
  'thelab.org',
  'deyoung.famsf.org',
  'sfmoma.org',
  'brava.org',
  'marsh.org',
  'themidwaysf.com',
  'cityboxoffice.com',
  'bampfa.org',
];

function getAnthropicKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const envPath = '/Users/arjundivecha/Dropbox/AAA Backup/.env.txt';
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/ANTHROPIC_API_KEY=(.+)/);
    if (match) return match[1].trim();
  } catch {}
  return null;
}

function getOpenRouterKey() {
  return process.env.OPENROUTER_API_KEY || null;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadVenueRegistry() {
  return JSON.parse(fs.readFileSync(VENUE_REGISTRY_PATH, 'utf-8'));
}

function getMarkdownLimitForVenue(venue) {
  const domain = String(venue?.domain || '').toLowerCase();
  return MARKDOWN_LENGTH_OVERRIDES[domain] || DEFAULT_MAX_MARKDOWN_LENGTH;
}

function parseArgs(argv) {
  const domains = argv
    .filter(arg => arg.startsWith('--domains='))
    .flatMap(arg => arg.slice('--domains='.length).split(','))
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);

  const sampleSize = Number(
    argv.find(arg => arg.startsWith('--sample-size='))?.slice('--sample-size='.length) || DEFAULT_SAMPLE_DOMAINS.length
  );

  const all = argv.includes('--all');
  const limitRaw = argv.find(arg => arg.startsWith('--limit='))?.slice('--limit='.length);
  const limit = limitRaw !== undefined ? Number(limitRaw) : null;
  const delayRaw = argv.find(arg => arg.startsWith('--delay-ms='))?.slice('--delay-ms='.length);
  const delayMs = delayRaw !== undefined ? Number(delayRaw) : 500;
  const concurrencyRaw = argv.find(arg => arg.startsWith('--concurrency='))?.slice('--concurrency='.length);
  const concurrency = concurrencyRaw !== undefined ? Number(concurrencyRaw) : 6;

  return {
    domains,
    all,
    limit: Number.isFinite(limit) ? limit : null,
    delayMs: Number.isFinite(delayMs) ? delayMs : 500,
    concurrency: Number.isFinite(concurrency) ? concurrency : 6,
    sampleSize: Number.isFinite(sampleSize) ? sampleSize : DEFAULT_SAMPLE_DOMAINS.length,
  };
}

async function fetchViaJina(calendarUrl, { maxMarkdownLength = DEFAULT_MAX_MARKDOWN_LENGTH } = {}) {
  const jinaUrl = `${JINA_READER_BASE}/${calendarUrl}`;
  const jinaKey = process.env.JINA_API_KEY || null; // optional; raises rate limits if present
  // Jina free tier rate-limits aggressively (HTTP 429). Retry with exponential backoff.
  const MAX_ATTEMPTS = 5;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    try {
      const headers = { Accept: 'text/markdown', 'User-Agent': 'CurateMyWorld/1.0' };
      if (jinaKey) headers.Authorization = `Bearer ${jinaKey}`;
      const response = await fetch(jinaUrl, { method: 'GET', headers, signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.status === 429 && attempt < MAX_ATTEMPTS) {
        const backoffMs = 4000 * Math.pow(2, attempt - 1); // 4s, 8s, 16s, 32s
        console.log(`    429 from Jina (attempt ${attempt}) — backing off ${backoffMs}ms`);
        await sleep(backoffMs);
        continue;
      }
      if (!response.ok) {
        throw new Error(`Jina HTTP ${response.status}: ${response.statusText}`);
      }

      let markdown = await response.text();
      if (markdown.length > maxMarkdownLength) {
        markdown = markdown.substring(0, maxMarkdownLength) + '\n\n[... truncated ...]';
      }
      return markdown;
    } catch (error) {
      clearTimeout(timeoutId);
      // Retry transient aborts/network errors too, except on the final attempt.
      if (attempt < MAX_ATTEMPTS) {
        const backoffMs = 4000 * Math.pow(2, attempt - 1);
        console.log(`    Jina error "${error.message}" (attempt ${attempt}) — retrying in ${backoffMs}ms`);
        await sleep(backoffMs);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Jina fetch exhausted retries');
}

function buildPrompt(venueName, venueCategory, calendarMarkdown) {
  const today = new Date().toISOString().split('T')[0];
  return `Extract upcoming events from this venue calendar page. Today is ${today}.

VENUE: ${venueName}
DEFAULT CATEGORY: ${venueCategory}

Return a JSON array of events. Each event must have:
- "title": string (specific event name, NOT the venue name)
- "startDate": ISO date string (YYYY-MM-DDTHH:mm:ss). If only a date is given, use 19:00 as default time.
- "endDate": ISO date string or null
- "description": string (1-2 sentences)
- "category": string (lowercase slug; use venue default when unsure)
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
${calendarMarkdown}`;
}

function extractJsonArray(text) {
  // Strip markdown code fences (```json ... ```) that some models emit.
  const cleaned = String(text || '').replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('[');
  if (start === -1) return [];
  const candidate = cleaned.slice(start);

  // Fast path: full array parses.
  const full = candidate.match(/\[[\s\S]*\]/);
  if (full) {
    try {
      const parsed = JSON.parse(full[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through to salvage */ }
  }

  // Salvage path: truncated array (no closing ]). Keep complete top-level objects.
  const objects = [];
  let depth = 0, objStart = -1, inStr = false, esc = false;
  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) objStart = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try { objects.push(JSON.parse(candidate.slice(objStart, i + 1))); } catch { /* skip */ }
        objStart = -1;
      }
    }
  }
  return objects;
}

function countApproxTokens(text) {
  return Math.ceil(String(text || '').length / 4);
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

function scoreEvents(events) {
  const list = Array.isArray(events) ? events : [];
  const titleCount = list.filter(event => typeof event?.title === 'string' && event.title.trim().length > 3).length;
  const startDateCount = list.filter(event => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(String(event?.startDate || ''))).length;
  const directUrlCount = list.filter(event => /^https?:\/\//i.test(String(event?.eventUrl || ''))).length;
  const cityCount = list.filter(event => typeof event?.city === 'string' && event.city.trim()).length;
  const duplicateCount = list.length - new Set(list.map(event => `${event?.title || ''}|${event?.startDate || ''}`)).size;

  return {
    eventCount: list.length,
    titleCoverage: list.length ? titleCount / list.length : 0,
    startDateCoverage: list.length ? startDateCount / list.length : 0,
    directUrlCoverage: list.length ? directUrlCount / list.length : 0,
    cityCoverage: list.length ? cityCount / list.length : 0,
    duplicateCount,
  };
}

// Output token ceiling. DeepSeek is verbose; 4096 truncated its JSON mid-array on
// busy venues (broken array -> parsed as 0 events). 16000 clears the observed cap.
const MAX_OUTPUT_TOKENS = 16000;

async function runAnthropicModel(client, model, prompt) {
  const response = await client.messages.create({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content?.[0]?.text || '[]';
  return {
    rawText: text,
    inputTokens: response.usage?.input_tokens ?? countApproxTokens(prompt),
    outputTokens: response.usage?.output_tokens ?? countApproxTokens(text),
  };
}

async function runOpenRouterModel(apiKey, model, prompt) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/ArjunDivecha/curate-my-world',
      'X-Title': 'Curate My World Venue Extractor Bakeoff',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`OpenRouter HTTP ${response.status}: ${await response.text()}`);
  }

  const json = await response.json();
  const text = json?.choices?.[0]?.message?.content || '[]';
  return {
    rawText: text,
    inputTokens: json?.usage?.prompt_tokens ?? countApproxTokens(prompt),
    outputTokens: json?.usage?.completion_tokens ?? countApproxTokens(text),
  };
}

function calculateCost(spec, inputTokens, outputTokens) {
  return ((inputTokens / 1_000_000) * spec.inputPerMillion) + ((outputTokens / 1_000_000) * spec.outputPerMillion);
}

function selectVenues(registry, { domains, all, sampleSize, limit }) {
  const byDomain = new Map(registry.map(venue => [String(venue.domain || '').toLowerCase(), venue]));

  let selected;
  if (all) {
    // Every venue in the registry that has a calendar URL to fetch.
    selected = registry.filter(venue => venue && venue.calendar_url);
  } else if (domains.length) {
    selected = domains.map(domain => byDomain.get(domain)).filter(Boolean);
  } else {
    selected = [];
    for (const domain of DEFAULT_SAMPLE_DOMAINS) {
      const venue = byDomain.get(domain);
      if (venue) selected.push(venue);
    }
    selected = selected.slice(0, sampleSize);
  }

  if (limit && limit > 0) selected = selected.slice(0, limit);
  return selected;
}

function formatMoney(value) {
  return `$${value.toFixed(4)}`;
}

function buildMarkdownReport(summary) {
  const lines = [];
  lines.push(`# Venue Extractor Bakeoff`);
  lines.push('');
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Venues tested: ${summary.venues.length}`);
  lines.push('');
  lines.push(`## Models`);
  lines.push('');

  for (const model of summary.models) {
    lines.push(`### ${model.label}`);
    lines.push(`- Model: \`${model.model}\``);
    lines.push(`- Total cost: ${formatMoney(model.totalCost)}`);
    lines.push(`- Total input tokens: ${model.totalInputTokens}`);
    lines.push(`- Total output tokens: ${model.totalOutputTokens}`);
    lines.push(`- Total events extracted: ${model.totalEvents}`);
    lines.push(`- Valid runs: ${model.successCount}/${summary.venues.length}`);
    lines.push(`- Avg events per venue: ${model.avgEventsPerVenue.toFixed(2)}`);
    lines.push(`- Avg title coverage: ${(model.avgTitleCoverage * 100).toFixed(1)}%`);
    lines.push(`- Avg startDate coverage: ${(model.avgStartDateCoverage * 100).toFixed(1)}%`);
    lines.push(`- Avg direct URL coverage: ${(model.avgDirectUrlCoverage * 100).toFixed(1)}%`);
    lines.push(`- Avg city coverage: ${(model.avgCityCoverage * 100).toFixed(1)}%`);
    lines.push('');
  }

  lines.push(`## Venue Results`);
  lines.push('');
  for (const venue of summary.venues) {
    lines.push(`### ${venue.name} (\`${venue.domain}\`)`);
    lines.push(`- Calendar: ${venue.calendarUrl}`);
    lines.push(`- Markdown chars: ${venue.markdownChars}`);
    for (const run of venue.runs) {
      lines.push(`- ${run.label}: events=${run.eventCount}, cost=${formatMoney(run.cost)}, title=${(run.titleCoverage * 100).toFixed(0)}%, dates=${(run.startDateCoverage * 100).toFixed(0)}%, urls=${(run.directUrlCoverage * 100).toFixed(0)}%, city=${(run.cityCoverage * 100).toFixed(0)}%${run.error ? `, error=${run.error}` : ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function buildSummary(generatedAt, venueResults, models) {
  const modelSummaries = models.map(model => {
    const runs = venueResults.map(venue => (venue.runs || []).find(run => run.key === model.key)).filter(Boolean);
    const validRuns = runs.filter(run => !run.error && !run.skipped);
    const totalCost = validRuns.reduce((sum, run) => sum + (run.cost || 0), 0);
    const totalInputTokens = validRuns.reduce((sum, run) => sum + (run.inputTokens || 0), 0);
    const totalOutputTokens = validRuns.reduce((sum, run) => sum + (run.outputTokens || 0), 0);
    const totalEvents = validRuns.reduce((sum, run) => sum + (run.eventCount || 0), 0);
    const avg = (field) => validRuns.length
      ? validRuns.reduce((sum, run) => sum + (run[field] || 0), 0) / validRuns.length
      : 0;

    return {
      key: model.key,
      label: model.label,
      model: MODEL_SPECS[model.key].model,
      successCount: validRuns.length,
      totalCost,
      totalInputTokens,
      totalOutputTokens,
      totalEvents,
      avgEventsPerVenue: validRuns.length ? totalEvents / validRuns.length : 0,
      avgTitleCoverage: avg('titleCoverage'),
      avgStartDateCoverage: avg('startDateCoverage'),
      avgDirectUrlCoverage: avg('directUrlCoverage'),
      avgCityCoverage: avg('cityCoverage'),
    };
  });

  return { generatedAt, venues: venueResults, models: modelSummaries };
}

// Atomic write: temp file + rename, so an interrupted write never corrupts the report.
function atomicWrite(filePath, contents) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, filePath);
}

function writeReports({ generatedAt, venues, models }) {
  const summary = buildSummary(generatedAt, venues, models);
  const stamp = generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(REPORT_DIR, `model-bakeoff-${stamp}.json`);
  const markdownPath = path.join(REPORT_DIR, `model-bakeoff-${stamp}.md`);
  const latestJsonPath = path.join(REPORT_DIR, 'model-bakeoff-latest.json');
  const latestMarkdownPath = path.join(REPORT_DIR, 'model-bakeoff-latest.md');

  const json = JSON.stringify(summary, null, 2);
  const md = buildMarkdownReport(summary);
  atomicWrite(jsonPath, json);
  atomicWrite(markdownPath, md);
  atomicWrite(latestJsonPath, json);
  atomicWrite(latestMarkdownPath, md);
  return { jsonPath, markdownPath };
}

// Run one model against an already-fetched prompt; never throws (returns a run record).
async function runModelOnPrompt(model, prompt, { anthropic, openRouterKey, domain }) {
  if (!model.enabled) {
    return {
      key: model.key, label: model.label, model: MODEL_SPECS[model.key].model,
      skipped: true,
      error: model.key === 'haiku' ? 'ANTHROPIC_API_KEY missing' : 'OPENROUTER_API_KEY missing',
      eventCount: 0, cost: 0, titleCoverage: 0, startDateCoverage: 0, directUrlCoverage: 0, cityCoverage: 0,
    };
  }
  try {
    const spec = MODEL_SPECS[model.key];
    const result = spec.provider === 'anthropic'
      ? await runAnthropicModel(anthropic, spec.model, prompt)
      : await runOpenRouterModel(openRouterKey, spec.model, prompt);
    const events = extractJsonArray(result.rawText);
    const score = scoreEvents(events);
    console.log(`    ${model.label} on ${domain}: ${score.eventCount} events`);
    return {
      key: model.key, label: model.label, model: spec.model, skipped: false,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      cost: calculateCost(spec, result.inputTokens, result.outputTokens),
      rawTextPreview: String(result.rawText || '').slice(0, 500),
      ...score,
    };
  } catch (error) {
    console.log(`    ${model.label} on ${domain} FAILED: ${error.message}`);
    return {
      key: model.key, label: model.label, model: MODEL_SPECS[model.key].model, skipped: false,
      error: error.message,
      eventCount: 0, cost: 0, titleCoverage: 0, startDateCoverage: 0, directUrlCoverage: 0, cityCoverage: 0,
    };
  }
}

// Fetch one venue's markdown, then run all models on it IN PARALLEL. Never throws.
async function processVenue(venue, { models, anthropic, openRouterKey }) {
  const base = {
    name: venue.name,
    domain: venue.domain,
    category: venue.category || null,
    calendarUrl: venue.calendar_url,
  };

  let markdown;
  try {
    markdown = await fetchViaJina(venue.calendar_url, { maxMarkdownLength: getMarkdownLimitForVenue(venue) });
  } catch (error) {
    console.log(`  Jina fetch FAILED for ${venue.domain}: ${error.message} — skipping`);
    return { ...base, markdownChars: 0, fetchError: error.message, runs: [] };
  }

  const prompt = buildPrompt(venue.name, venue.category || 'general', markdown);
  const runs = await Promise.all(
    models.map(model => runModelOnPrompt(model, prompt, { anthropic, openRouterKey, domain: venue.domain }))
  );
  return { ...base, markdownChars: markdown.length, runs };
}

// Bounded-concurrency map: process `items` with at most `concurrency` in flight.
// Calls onResult(result, item) as each completes (used for incremental writes + progress).
async function mapWithConcurrency(items, concurrency, worker, onResult) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;

  async function runner() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      const result = await worker(items[i], i);
      results[i] = result;
      done += 1;
      if (onResult) onResult(result, items[i], done, results);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => runner());
  await Promise.all(runners);
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const registry = loadVenueRegistry();
  const venues = selectVenues(registry, args);

  if (!venues.length) {
    throw new Error('No venues selected for bakeoff');
  }

  const anthropicKey = getAnthropicKey();
  const openRouterKey = getOpenRouterKey();
  const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;

  // Head-to-head: Claude Haiku 4.5 vs DeepSeek V4 Flash vs DeepSeek V4 Pro.
  const models = [
    { key: 'haiku', label: 'Claude Haiku 4.5', enabled: !!anthropic },
    { key: 'deepseekV4Flash', label: 'DeepSeek V4 Flash', enabled: !!openRouterKey },
    { key: 'deepseekV4Pro', label: 'DeepSeek V4 Pro', enabled: !!openRouterKey },
  ];

  ensureDir(REPORT_DIR);
  const generatedAt = new Date().toISOString();
  const totalVenues = venues.length;
  const concurrency = Math.max(1, args.concurrency || 6);
  console.log(`Bakeoff over ${totalVenues} venue(s): ${models.filter(m => m.enabled).map(m => m.label).join(' vs ')} | concurrency=${concurrency}`);

  // Process venues with bounded concurrency. Both models run in parallel per venue.
  // Results are written incrementally as each venue completes (fault tolerance).
  const venueResults = await mapWithConcurrency(
    venues,
    concurrency,
    (venue) => processVenue(venue, { models, anthropic, openRouterKey }),
    (result, venue, done, resultsSoFar) => {
      const tag = result.fetchError ? 'fetch-error' : `${(result.runs || []).map(r => r.eventCount ?? 'x').join('/')} events`;
      console.log(`[${done}/${totalVenues}] ${result.domain}: ${tag}`);
      // Incremental snapshot from results filled so far (fault tolerance).
      writeReports({ generatedAt, venues: resultsSoFar.filter(Boolean), models });
    }
  );
  // After completion, write the final, fully-ordered report.
  const { jsonPath, markdownPath } = writeReports({ generatedAt, venues: venueResults.filter(Boolean), models });

  console.log(`Wrote JSON report: ${jsonPath}`);
  console.log(`Wrote Markdown report: ${markdownPath}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
