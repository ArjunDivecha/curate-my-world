#!/usr/bin/env node

/**
 * Lightweight API smoke checks for local/staging/prod.
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:8765 node scripts/smoke-api.js
 *   BASE_URL=https://your-api.example.com FULL_CHECK=true node scripts/smoke-api.js
 */

const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');
const fullCheck = ['1', 'true', 'yes'].includes(String(process.env.FULL_CHECK || '').toLowerCase());

function fail(message) {
  throw new Error(message);
}

async function requestJson(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    ...options
  });

  const bodyText = await response.text();
  let bodyJson = null;
  try {
    bodyJson = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    // Keep raw text for diagnostics.
  }

  return { url, response, bodyText, bodyJson };
}

function expect(condition, message) {
  if (!condition) fail(message);
}

async function run() {
  console.log(`Running API smoke checks against ${baseUrl}`);
  console.log(`Full checks: ${fullCheck ? 'enabled' : 'disabled'}`);

  // 1) Health
  {
    const { url, response, bodyJson, bodyText } = await requestJson('/api/health');
    expect(response.ok, `Health check failed (${response.status}) at ${url}`);
    expect(bodyJson && typeof bodyJson === 'object', `Health response is not JSON: ${bodyText.slice(0, 160)}`);
    expect(
      ['healthy', 'degraded', 'unhealthy'].includes(String(bodyJson.status)),
      `Unexpected health status: ${bodyJson.status}`
    );
  }

  // 2) Categories
  {
    const { url, response, bodyJson, bodyText } = await requestJson('/api/events');
    expect(response.ok, `Categories check failed (${response.status}) at ${url}`);
    expect(bodyJson && bodyJson.success === true, `Categories response success != true: ${bodyText.slice(0, 200)}`);
    expect(Array.isArray(bodyJson.categories), 'Categories response is missing categories array');
    expect(typeof bodyJson.count === 'number', 'Categories response is missing numeric count');
  }

  // 3) Lists
  {
    const { url, response, bodyJson, bodyText } = await requestJson('/api/lists');
    expect(response.ok, `Lists check failed (${response.status}) at ${url}`);
    expect(bodyJson && bodyJson.success === true, `Lists response success != true: ${bodyText.slice(0, 200)}`);
    expect(typeof bodyJson.lists === 'object', 'Lists response missing lists object');
  }

  // Optional heavier checks for staging/prod verification.
  if (fullCheck) {
    {
      const { url, response, bodyJson, bodyText } = await requestJson(
        '/api/events/all-categories?location=San%20Francisco,%20CA&limit=5'
      );
      expect(response.ok, `All-categories check failed (${response.status}) at ${url}`);
      expect(bodyJson && typeof bodyJson.success === 'boolean', `Invalid all-categories response: ${bodyText.slice(0, 240)}`);
      expect(typeof bodyJson.eventsByCategory === 'object', 'all-categories missing eventsByCategory');
    }

    {
      const { url, response, bodyJson, bodyText } = await requestJson(
        '/api/events/music?location=San%20Francisco,%20CA&limit=5'
      );
      expect(response.ok, `Category events check failed (${response.status}) at ${url}`);
      expect(bodyJson && typeof bodyJson.success === 'boolean', `Invalid category response: ${bodyText.slice(0, 240)}`);
      expect(Array.isArray(bodyJson.events), 'Category response missing events array');
    }
  }

  console.log('Smoke checks passed.');
}

run().catch((error) => {
  console.error(`Smoke checks failed: ${error.message}`);
  process.exit(1);
});
