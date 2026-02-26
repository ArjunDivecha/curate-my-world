#!/usr/bin/env node

/**
 * Reusable API load test runner (autocannon-backed).
 *
 * Examples:
 *   npm run load:test
 *   BASE_URL=https://squirtle-api-staging.up.railway.app npm run load:test
 *   npm run load:test -- --scenario=all-categories --connections=20 --duration=30
 *   npm run load:test:stress
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8765';
const DEFAULT_PROFILE = 'baseline';
const DEFAULT_SCENARIO = 'all';

const PROFILE_PRESETS = {
  baseline: {
    health: { duration: 20, connections: 5, pipelining: 1 },
    allCategories: { duration: 20, connections: 6, pipelining: 1 },
    category: { duration: 20, connections: 4, pipelining: 1 },
  },
  stress: {
    health: { duration: 20, connections: 50, pipelining: 10 },
    allCategories: { duration: 20, connections: 25, pipelining: 4 },
    category: { duration: 20, connections: 20, pipelining: 2 },
  },
};

const SCENARIOS = {
  health: {
    key: 'health',
    path: '/api/health',
  },
  'all-categories': {
    key: 'allCategories',
    path: '/api/events/all-categories?location=San%20Francisco,%20CA&date_range=next%2030%20days&limit=500',
  },
  category: {
    key: 'category',
    path: '/api/events/music?location=San%20Francisco,%20CA&date_range=next%2030%20days&limit=100',
  },
};

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function parseArgs(argv) {
  const options = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const noPrefix = token.slice(2);
    const [rawKey, inlineValue] = noPrefix.split('=');
    const key = rawKey.trim();

    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = 'true';
    }
  }

  return options;
}

function resolveAutocannonRunner() {
  const localBin = path.resolve(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'autocannon.cmd' : 'autocannon');
  if (fs.existsSync(localBin)) {
    return { cmd: localBin, prefixArgs: [] };
  }

  const globalProbe = spawnSync('autocannon', ['--help'], { stdio: 'ignore' });
  if (globalProbe.status === 0) {
    return { cmd: 'autocannon', prefixArgs: [] };
  }

  return { cmd: 'npx', prefixArgs: ['--yes', 'autocannon'] };
}

function tryParseJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    // Some shells can prepend logs; try to parse the JSON object segment.
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const sliced = trimmed.slice(start, end + 1);
      try {
        return JSON.parse(sliced);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function scenarioListFromSelection(selection) {
  if (!selection || selection === 'all') {
    return ['health', 'all-categories', 'category'];
  }
  if (!SCENARIOS[selection]) {
    throw new Error(`Unknown scenario "${selection}". Valid values: all, health, all-categories, category`);
  }
  return [selection];
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function runScenario({ runner, baseUrl, strict, profile, scenarioName, overrides }) {
  const scenario = SCENARIOS[scenarioName];
  const preset = PROFILE_PRESETS[profile]?.[scenario.key];
  if (!preset) {
    throw new Error(`Profile "${profile}" does not define scenario "${scenarioName}"`);
  }

  const duration = parsePositiveInteger(overrides.duration, preset.duration);
  const connections = parsePositiveInteger(overrides.connections, preset.connections);
  const pipelining = parsePositiveInteger(overrides.pipelining, preset.pipelining);
  const url = `${baseUrl}${scenario.path}`;

  const args = [
    ...runner.prefixArgs,
    '-j',
    '-m', 'GET',
    '-d', String(duration),
    '-c', String(connections),
    '-p', String(pipelining),
    '--timeout', '20',
    '-H', 'accept=application/json',
    url,
  ];

  console.log(`\n=== ${scenarioName.toUpperCase()} ===`);
  console.log(`URL: ${url}`);
  console.log(`duration=${duration}s connections=${connections} pipelining=${pipelining}`);
  console.log(`runner: ${runner.cmd} ${args.join(' ')}`);

  const proc = spawnSync(runner.cmd, args, { encoding: 'utf8' });
  const parsed = tryParseJson(proc.stdout);

  if (proc.status !== 0) {
    const stderr = (proc.stderr || '').trim();
    const stdout = (proc.stdout || '').trim();
    throw new Error(
      `autocannon failed for ${scenarioName}\n` +
      `${stderr || stdout || 'No output received.'}`
    );
  }

  if (!parsed) {
    throw new Error(`Could not parse autocannon JSON output for scenario "${scenarioName}"`);
  }

  const summary = {
    scenario: scenarioName,
    reqPerSecAvg: parsed.requests?.average ?? null,
    reqPerSecP97_5: parsed.requests?.p97_5 ?? null,
    totalRequests: parsed.requests?.total ?? null,
    latencyAvgMs: parsed.latency?.average ?? null,
    latencyP99Ms: parsed.latency?.p99 ?? null,
    non2xx: Number(parsed.non2xx || 0),
    errors: Number(parsed.errors || 0),
    timeouts: Number(parsed.timeouts || 0),
  };

  const hadTransportFailures = summary.errors > 0 || summary.timeouts > 0;
  const hadHttpFailures = summary.non2xx > 0;
  const hasFailure = strict ? (hadTransportFailures || hadHttpFailures) : hadTransportFailures;

  console.log(
    `result: req/s(avg)=${formatNumber(summary.reqPerSecAvg)} ` +
    `latency(avg)=${formatNumber(summary.latencyAvgMs)}ms ` +
    `latency(p99)=${formatNumber(summary.latencyP99Ms)}ms ` +
    `non2xx=${summary.non2xx} errors=${summary.errors} timeouts=${summary.timeouts}`
  );

  return { summary, hasFailure };
}

function printUsage() {
  console.log(`
Usage:
  npm run load:test
  BASE_URL=https://api.example.com npm run load:test
  npm run load:test -- --scenario=all-categories --connections=20 --duration=30

Options:
  --profile=baseline|stress   (default: baseline)
  --scenario=all|health|all-categories|category (default: all)
  --duration=<seconds>        (override scenario duration)
  --connections=<count>       (override scenario connections)
  --pipelining=<count>        (override scenario pipelining)
  --strict=true|false         (strict marks non2xx as failure; default false)

Environment equivalents:
  PROFILE, SCENARIO, DURATION, CONNECTIONS, PIPELINING, STRICT, BASE_URL
  `);
}

function main() {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help || cli.h || cli.usage) {
    printUsage();
    return;
  }

  const profile = String(cli.profile || process.env.PROFILE || DEFAULT_PROFILE).toLowerCase();
  if (!PROFILE_PRESETS[profile]) {
    throw new Error(`Unknown profile "${profile}". Valid profiles: ${Object.keys(PROFILE_PRESETS).join(', ')}`);
  }

  const scenarioSelection = String(cli.scenario || process.env.SCENARIO || DEFAULT_SCENARIO).toLowerCase();
  const baseUrl = normalizeBaseUrl(cli.baseUrl || process.env.BASE_URL || DEFAULT_BASE_URL);
  const strict = parseBoolean(cli.strict ?? process.env.STRICT, false);

  const overrides = {
    duration: cli.duration ?? process.env.DURATION,
    connections: cli.connections ?? process.env.CONNECTIONS,
    pipelining: cli.pipelining ?? process.env.PIPELINING,
  };

  const scenarios = scenarioListFromSelection(scenarioSelection);
  const runner = resolveAutocannonRunner();

  console.log(`Load test target: ${baseUrl}`);
  console.log(`profile=${profile} strict=${strict} scenarios=${scenarios.join(', ')}`);

  const summaries = [];
  let failed = false;

  for (const scenarioName of scenarios) {
    const { summary, hasFailure } = runScenario({
      runner,
      baseUrl,
      strict,
      profile,
      scenarioName,
      overrides,
    });
    summaries.push(summary);
    if (hasFailure) failed = true;
  }

  console.log('\n=== SUMMARY ===');
  for (const s of summaries) {
    console.log(
      `${s.scenario.padEnd(14)} req/s(avg)=${formatNumber(s.reqPerSecAvg).padStart(8)} ` +
      `lat(avg)=${`${formatNumber(s.latencyAvgMs)}ms`.padStart(10)} ` +
      `lat(p99)=${`${formatNumber(s.latencyP99Ms)}ms`.padStart(10)} ` +
      `non2xx=${String(s.non2xx).padStart(6)} errors=${String(s.errors).padStart(4)} timeouts=${String(s.timeouts).padStart(4)}`
    );
  }

  if (failed) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(`Load test failed: ${error.message}`);
  process.exit(1);
}

