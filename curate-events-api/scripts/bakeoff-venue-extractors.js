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

  return {
    domains,
    sampleSize: Number.isFinite(sampleSize) ? sampleSize : DEFAULT_SAMPLE_DOMAINS.length,
  };
}

async function fetchViaJina(calendarUrl, { maxMarkdownLength = DEFAULT_MAX_MARKDOWN_LENGTH } = {}) {
  const jinaUrl = `${JINA_READER_BASE}/${calendarUrl}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(jinaUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/markdown',
        'User-Agent': 'CurateMyWorld/1.0',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

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
    throw error;
  }
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
  const match = String(text || '').match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

async function runAnthropicModel(client, model, prompt) {
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
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
      max_tokens: 4096,
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

function selectVenues(registry, domains, sampleSize) {
  const byDomain = new Map(registry.map(venue => [String(venue.domain || '').toLowerCase(), venue]));
  if (domains.length) {
    return domains.map(domain => byDomain.get(domain)).filter(Boolean);
  }

  const selected = [];
  for (const domain of DEFAULT_SAMPLE_DOMAINS) {
    const venue = byDomain.get(domain);
    if (venue) selected.push(venue);
  }

  return selected.slice(0, sampleSize);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const registry = loadVenueRegistry();
  const venues = selectVenues(registry, args.domains, args.sampleSize);

  if (!venues.length) {
    throw new Error('No venues selected for bakeoff');
  }

  const anthropicKey = getAnthropicKey();
  const openRouterKey = getOpenRouterKey();
  const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;

  const models = [
    { key: 'haiku', label: 'Claude Haiku 4.5', enabled: !!anthropic },
    { key: 'gpt4oMini', label: 'GPT-4o mini', enabled: !!openRouterKey },
    { key: 'geminiFlashLite', label: 'Gemini 2.5 Flash Lite', enabled: !!openRouterKey },
  ];

  ensureDir(REPORT_DIR);
  const generatedAt = new Date().toISOString();
  const venueResults = [];

  for (const venue of venues) {
    console.log(`Fetching markdown for ${venue.name} (${venue.domain})`);
    const markdown = await fetchViaJina(venue.calendar_url, {
      maxMarkdownLength: getMarkdownLimitForVenue(venue),
    });
    const prompt = buildPrompt(venue.name, venue.category || 'general', markdown);
    const runs = [];

    for (const model of models) {
      if (!model.enabled) {
        runs.push({
          key: model.key,
          label: model.label,
          model: MODEL_SPECS[model.key].model,
          skipped: true,
          error: model.key === 'haiku' ? 'ANTHROPIC_API_KEY missing' : 'OPENROUTER_API_KEY missing',
          eventCount: 0,
          cost: 0,
          titleCoverage: 0,
          startDateCoverage: 0,
          directUrlCoverage: 0,
          cityCoverage: 0,
        });
        continue;
      }

      try {
        const spec = MODEL_SPECS[model.key];
        console.log(`Running ${model.label} on ${venue.domain}`);
        const result = spec.provider === 'anthropic'
          ? await runAnthropicModel(anthropic, spec.model, prompt)
          : await runOpenRouterModel(openRouterKey, spec.model, prompt);

        const events = extractJsonArray(result.rawText);
        const score = scoreEvents(events);
        runs.push({
          key: model.key,
          label: model.label,
          model: spec.model,
          skipped: false,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          cost: calculateCost(spec, result.inputTokens, result.outputTokens),
          rawTextPreview: String(result.rawText || '').slice(0, 500),
          ...score,
        });
        console.log(`Completed ${model.label} on ${venue.domain}: ${score.eventCount} events`);
      } catch (error) {
        runs.push({
          key: model.key,
          label: model.label,
          model: MODEL_SPECS[model.key].model,
          skipped: false,
          error: error.message,
          eventCount: 0,
          cost: 0,
          titleCoverage: 0,
          startDateCoverage: 0,
          directUrlCoverage: 0,
          cityCoverage: 0,
        });
        console.log(`Failed ${model.label} on ${venue.domain}: ${error.message}`);
      }
    }

    venueResults.push({
      name: venue.name,
      domain: venue.domain,
      category: venue.category || null,
      calendarUrl: venue.calendar_url,
      markdownChars: markdown.length,
      runs,
    });
  }

  const modelSummaries = models.map(model => {
    const runs = venueResults.map(venue => venue.runs.find(run => run.key === model.key)).filter(Boolean);
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

  const summary = {
    generatedAt,
    venues: venueResults,
    models: modelSummaries,
  };

  const stamp = generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(REPORT_DIR, `model-bakeoff-${stamp}.json`);
  const markdownPath = path.join(REPORT_DIR, `model-bakeoff-${stamp}.md`);
  const latestJsonPath = path.join(REPORT_DIR, 'model-bakeoff-latest.json');
  const latestMarkdownPath = path.join(REPORT_DIR, 'model-bakeoff-latest.md');

  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  fs.writeFileSync(markdownPath, buildMarkdownReport(summary));
  fs.writeFileSync(latestJsonPath, JSON.stringify(summary, null, 2));
  fs.writeFileSync(latestMarkdownPath, buildMarkdownReport(summary));

  console.log(`Wrote JSON report: ${jsonPath}`);
  console.log(`Wrote Markdown report: ${markdownPath}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
