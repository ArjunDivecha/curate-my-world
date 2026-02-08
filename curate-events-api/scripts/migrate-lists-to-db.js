#!/usr/bin/env node

/**
 * Migrate list files from data/*.xlsx into Postgres list_entries table.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/migrate-lists-to-db.js
 *   DATABASE_URL=... REPLACE=true node scripts/migrate-lists-to-db.js
 */

import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const REPLACE = ['1', 'true', 'yes'].includes(String(process.env.REPLACE || '').toLowerCase());
const DATABASE_URL = process.env.DATABASE_URL || '';

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

function normalizeDomain(domain) {
  return String(domain || '').toLowerCase().trim().replace(/^www\./, '');
}

function normalizeCategory(category) {
  return String(category || 'all').toLowerCase().trim() || 'all';
}

function normalizeText(value) {
  return String(value || '').trim();
}

function loadXlsxRows(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet);
}

async function run() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: DATABASE_URL });

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rootDir = path.resolve(__dirname, '..');
  const dataDir = path.resolve(rootDir, '../data');

  const files = {
    whitelist: path.join(dataDir, 'whitelist.xlsx'),
    blacklistSites: path.join(dataDir, 'blacklist-sites.xlsx'),
    blacklistEvents: path.join(dataDir, 'blacklist-events.xlsx'),
  };

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS list_entries (
        id BIGSERIAL PRIMARY KEY,
        list_type TEXT NOT NULL,
        domain TEXT,
        category TEXT,
        name TEXT,
        city TEXT,
        reason TEXT,
        title TEXT,
        url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_list_entries_type ON list_entries(list_type);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_list_entries_domain ON list_entries(domain);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_list_entries_url ON list_entries(url);`);

    if (REPLACE) {
      await pool.query(`DELETE FROM list_entries WHERE list_type IN ('whitelist','blacklist_site','blacklist_event');`);
    }

    const whitelistRows = loadXlsxRows(files.whitelist)
      .map((row) => ({
        domain: normalizeDomain(row.domain),
        category: normalizeCategory(row.category),
        name: normalizeText(row.name) || normalizeDomain(row.domain),
        city: normalizeText(row.city),
      }))
      .filter((row) => row.domain);

    const blacklistSiteRows = loadXlsxRows(files.blacklistSites)
      .map((row) => ({
        domain: normalizeDomain(row.domain),
        reason: normalizeText(row.reason),
      }))
      .filter((row) => row.domain && row.domain !== 'example-spam-site.com');

    const blacklistEventRows = loadXlsxRows(files.blacklistEvents)
      .map((row) => ({
        title: normalizeText(row.title),
        url: normalizeText(row.url),
      }))
      .filter((row) => (row.title || row.url) && row.title !== 'Example Event to Block');

    let insertedWhitelist = 0;
    for (const row of whitelistRows) {
      await pool.query(
        `INSERT INTO list_entries (list_type, domain, category, name, city, created_at, updated_at)
         VALUES ('whitelist', $1, $2, $3, $4, NOW(), NOW())`,
        [row.domain, row.category, row.name, row.city]
      );
      insertedWhitelist += 1;
    }

    let insertedBlacklistSites = 0;
    for (const row of blacklistSiteRows) {
      await pool.query(
        `INSERT INTO list_entries (list_type, domain, reason, created_at, updated_at)
         VALUES ('blacklist_site', $1, $2, NOW(), NOW())`,
        [row.domain, row.reason]
      );
      insertedBlacklistSites += 1;
    }

    let insertedBlacklistEvents = 0;
    for (const row of blacklistEventRows) {
      await pool.query(
        `INSERT INTO list_entries (list_type, title, url, created_at, updated_at)
         VALUES ('blacklist_event', $1, $2, NOW(), NOW())`,
        [row.title, row.url]
      );
      insertedBlacklistEvents += 1;
    }

    const totals = await pool.query(`
      SELECT list_type, COUNT(*)::int AS count
      FROM list_entries
      GROUP BY list_type
      ORDER BY list_type
    `);

    console.log('List migration complete');
    console.log({
      replaceMode: REPLACE,
      inserted: {
        whitelist: insertedWhitelist,
        blacklistSites: insertedBlacklistSites,
        blacklistEvents: insertedBlacklistEvents,
      },
      totals: totals.rows,
    });
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error('List migration failed:', error.message);
  process.exit(1);
});
