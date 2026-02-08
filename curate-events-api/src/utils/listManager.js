/**
 * =============================================================================
 * LIST MANAGER - Whitelist & Blacklist Storage
 * =============================================================================
 * 
 * Storage modes:
 * - file (default): XLSX-backed lists in PROJECT_ROOT/data/
 * - db: PostgreSQL-backed lists via DATABASE_URL
 * 
 * Features:
 * - In-memory read path for fast filtering in request handlers
 * - Periodic refresh from active backing store
 * - Feature-flag migration path with fallback safety
 * 
 * =============================================================================
 */

import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createLogger } from './logger.js';

const logger = createLogger('ListManager');

// =============================================================================
// CONFIGURATION
// =============================================================================

// Get the directory of this module (curate-events-api/src/utils/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data directory is at PROJECT ROOT/data/ (go up THREE levels from src/utils/ to project root)
const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const FILES = {
  whitelist: path.join(DATA_DIR, 'whitelist.xlsx'),
  blacklistSites: path.join(DATA_DIR, 'blacklist-sites.xlsx'),
  blacklistEvents: path.join(DATA_DIR, 'blacklist-events.xlsx'),
};

const RELOAD_INTERVAL_MS = 30 * 1000; // 30 seconds
const STORAGE_MODE = String(process.env.LIST_STORAGE_MODE || 'file').toLowerCase();
const DATABASE_URL = process.env.DATABASE_URL || '';
const DB_SYNC_INTERVAL_MS = Number(process.env.LIST_DB_SYNC_INTERVAL_MS || RELOAD_INTERVAL_MS);

// =============================================================================
// STATE
// =============================================================================

let whitelist = [];
let blacklistSites = [];
let blacklistEvents = [];
let lastLoadTime = 0;
let lastLoadSource = 'file';

let dbPool = null;
let dbOperational = false;
let dbInitStarted = false;
let dbInitPromise = null;
let dbRefreshPromise = null;
let lastDbRefreshAt = 0;

logger.info(`ListManager initialized`, {
  mode: STORAGE_MODE,
  dataDirectory: DATA_DIR,
  dbConfigured: !!DATABASE_URL
});

// =============================================================================
// NORMALIZATION HELPERS
// =============================================================================

function todayDateString() {
  return new Date().toISOString().split('T')[0];
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

function isDbModeRequested() {
  return STORAGE_MODE === 'db';
}

function isDbActive() {
  return isDbModeRequested() && dbOperational && !!dbPool;
}

// =============================================================================
// FILE BACKING OPERATIONS
// =============================================================================

function loadXLSX(filepath) {
  try {
    if (!fs.existsSync(filepath)) {
      logger.warn(`File not found: ${filepath}`);
      return [];
    }
    const workbook = XLSX.readFile(filepath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet);
  } catch (error) {
    logger.error(`Failed to load ${filepath}:`, error.message);
    return [];
  }
}

function saveXLSX(filepath, data, sheetName = 'Sheet1') {
  try {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filepath);
    logger.info(`Saved ${filepath} with ${data.length} entries`);
    return true;
  } catch (error) {
    logger.error(`Failed to save ${filepath}:`, error.message);
    return false;
  }
}

function loadAllListsFromFiles() {
  whitelist = loadXLSX(FILES.whitelist).map(row => ({
    domain: normalizeDomain(row.domain),
    category: normalizeCategory(row.category),
    name: normalizeText(row.name),
    city: normalizeText(row.city),
  })).filter(r => r.domain);

  blacklistSites = loadXLSX(FILES.blacklistSites).map(row => ({
    domain: normalizeDomain(row.domain),
    reason: normalizeText(row.reason),
    date_added: row.date_added || todayDateString(),
  })).filter(r => r.domain && r.domain !== 'example-spam-site.com');

  blacklistEvents = loadXLSX(FILES.blacklistEvents).map(row => ({
    title: normalizeText(row.title),
    url: normalizeText(row.url),
    date_added: row.date_added || todayDateString(),
  })).filter(r => (r.title || r.url) && r.title !== 'Example Event to Block');

  lastLoadTime = Date.now();
  lastLoadSource = 'file';
  
  logger.info(`Loaded lists from files`, {
    whitelist: whitelist.length,
    blacklistSites: blacklistSites.length,
    blacklistEvents: blacklistEvents.length
  });
}

function maybeRefreshFromFile() {
  if (Date.now() - lastLoadTime > RELOAD_INTERVAL_MS) {
    loadAllListsFromFiles();
  }
}

// =============================================================================
// DB BACKING OPERATIONS
// =============================================================================

function setListsFromDbRows(rows = []) {
  const nextWhitelist = [];
  const nextBlacklistSites = [];
  const nextBlacklistEvents = [];

  rows.forEach((row) => {
    const listType = String(row.list_type || '').toLowerCase();
    if (listType === 'whitelist') {
      const domain = normalizeDomain(row.domain);
      if (!domain) return;
      nextWhitelist.push({
        domain,
        category: normalizeCategory(row.category),
        name: normalizeText(row.name) || domain,
        city: normalizeText(row.city),
      });
      return;
    }

    if (listType === 'blacklist_site') {
      const domain = normalizeDomain(row.domain);
      if (!domain) return;
      nextBlacklistSites.push({
        domain,
        reason: normalizeText(row.reason),
        date_added: row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : todayDateString(),
      });
      return;
    }

    if (listType === 'blacklist_event') {
      const title = normalizeText(row.title);
      const url = normalizeText(row.url);
      if (!title && !url) return;
      nextBlacklistEvents.push({
        title,
        url,
        date_added: row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : todayDateString(),
      });
    }
  });

  whitelist = nextWhitelist;
  blacklistSites = nextBlacklistSites;
  blacklistEvents = nextBlacklistEvents;
  lastLoadTime = Date.now();
  lastLoadSource = 'db';
}

async function createDbSchema() {
  if (!dbPool) return;

  await dbPool.query(`
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

  await dbPool.query(`CREATE INDEX IF NOT EXISTS idx_list_entries_type ON list_entries(list_type);`);
  await dbPool.query(`CREATE INDEX IF NOT EXISTS idx_list_entries_domain ON list_entries(domain);`);
  await dbPool.query(`CREATE INDEX IF NOT EXISTS idx_list_entries_url ON list_entries(url);`);
}

async function refreshFromDb({ force = false } = {}) {
  if (!dbPool) return false;

  if (!force && (Date.now() - lastDbRefreshAt < DB_SYNC_INTERVAL_MS)) {
    return true;
  }

  if (dbRefreshPromise) {
    return dbRefreshPromise;
  }

  dbRefreshPromise = (async () => {
    const result = await dbPool.query(`
      SELECT list_type, domain, category, name, city, reason, title, url, created_at
      FROM list_entries
    `);

    setListsFromDbRows(result.rows || []);
    lastDbRefreshAt = Date.now();

    logger.info('Loaded lists from database', {
      whitelist: whitelist.length,
      blacklistSites: blacklistSites.length,
      blacklistEvents: blacklistEvents.length
    });

    return true;
  })();

  try {
    return await dbRefreshPromise;
  } finally {
    dbRefreshPromise = null;
  }
}

async function ensureDbInitialized() {
  if (!isDbModeRequested()) return false;
  if (dbOperational) return true;
  if (dbInitStarted) return dbInitPromise;

  dbInitStarted = true;
  dbInitPromise = (async () => {
    if (!DATABASE_URL) {
      logger.warn('LIST_STORAGE_MODE=db requested but DATABASE_URL is missing. Falling back to file storage.');
      return false;
    }

    let PoolCtor;
    try {
      ({ Pool: PoolCtor } = await import('pg'));
    } catch (error) {
      logger.warn('pg package is unavailable. Falling back to file storage.', { error: error.message });
      return false;
    }

    try {
      dbPool = new PoolCtor({
        connectionString: DATABASE_URL,
      });

      await createDbSchema();
      await refreshFromDb({ force: true });
      dbOperational = true;

      logger.info('Database list storage is active');
      return true;
    } catch (error) {
      logger.error('Failed to initialize database list storage; using file fallback', {
        error: error.message
      });
      dbOperational = false;
      return false;
    }
  })();

  return dbInitPromise;
}

function refreshIfStale() {
  if (isDbModeRequested()) {
    if (!dbInitStarted) {
      void ensureDbInitialized();
      maybeRefreshFromFile();
      return;
    }

    if (!dbOperational) {
      maybeRefreshFromFile();
      return;
    }

    if (Date.now() - lastDbRefreshAt > DB_SYNC_INTERVAL_MS) {
      void refreshFromDb().catch((error) => {
        logger.error('DB list refresh failed', { error: error.message });
      });
    }
    return;
  }

  maybeRefreshFromFile();
}

async function persistAddWhitelist(entry) {
  if (isDbActive()) {
    await dbPool.query(
      `INSERT INTO list_entries (list_type, domain, category, name, city, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      ['whitelist', entry.domain, entry.category, entry.name, entry.city]
    );
    return true;
  }

  return saveXLSX(FILES.whitelist, whitelist, 'Whitelist');
}

async function persistRemoveWhitelist(domain) {
  if (isDbActive()) {
    await dbPool.query(
      `DELETE FROM list_entries WHERE list_type = 'whitelist' AND LOWER(COALESCE(domain, '')) = $1`,
      [domain]
    );
    return true;
  }

  return saveXLSX(FILES.whitelist, whitelist, 'Whitelist');
}

async function persistAddBlacklistSite(entry) {
  if (isDbActive()) {
    await dbPool.query(
      `INSERT INTO list_entries (list_type, domain, reason, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      ['blacklist_site', entry.domain, entry.reason]
    );
    return true;
  }

  return saveXLSX(FILES.blacklistSites, blacklistSites, 'Blacklist Sites');
}

async function persistRemoveBlacklistSite(domain) {
  if (isDbActive()) {
    await dbPool.query(
      `DELETE FROM list_entries WHERE list_type = 'blacklist_site' AND LOWER(COALESCE(domain, '')) = $1`,
      [domain]
    );
    return true;
  }

  return saveXLSX(FILES.blacklistSites, blacklistSites, 'Blacklist Sites');
}

async function persistAddBlacklistEvent(entry) {
  if (isDbActive()) {
    await dbPool.query(
      `INSERT INTO list_entries (list_type, title, url, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      ['blacklist_event', entry.title, entry.url]
    );
    return true;
  }

  return saveXLSX(FILES.blacklistEvents, blacklistEvents, 'Blacklist Events');
}

async function persistRemoveBlacklistEvent(title, url) {
  if (isDbActive()) {
    if (title && url) {
      await dbPool.query(
        `DELETE FROM list_entries
         WHERE list_type = 'blacklist_event'
           AND LOWER(COALESCE(title, '')) = $1
           AND LOWER(COALESCE(url, '')) = $2`,
        [title.toLowerCase(), url.toLowerCase()]
      );
      return true;
    }

    if (title) {
      await dbPool.query(
        `DELETE FROM list_entries
         WHERE list_type = 'blacklist_event'
           AND LOWER(COALESCE(title, '')) = $1`,
        [title.toLowerCase()]
      );
      return true;
    }

    if (url) {
      await dbPool.query(
        `DELETE FROM list_entries
         WHERE list_type = 'blacklist_event'
           AND LOWER(COALESCE(url, '')) = $1`,
        [url.toLowerCase()]
      );
      return true;
    }

    return false;
  }

  return saveXLSX(FILES.blacklistEvents, blacklistEvents, 'Blacklist Events');
}

// Initial load always starts from file for safe fallback.
loadAllListsFromFiles();
if (isDbModeRequested()) {
  void ensureDbInitialized();
}

// =============================================================================
// WHITELIST OPERATIONS
// =============================================================================

/**
 * Get whitelist domains for a category and location
 * @param {string} category - Event category (music, theatre, etc.) or 'all'
 * @param {string} location - Location string (optional)
 * @returns {Array} Array of { domain, name, category }
 */
export function getWhitelistDomains(category = 'all', location = '') {
  refreshIfStale();
  
  const normalizedCategory = normalizeCategory(category);
  const normalizedLocation = String(location || '').toLowerCase();
  
  return whitelist.filter(entry => {
    // Category match: 
    // - If requesting 'all', return everything
    // - Otherwise, entry must be 'all' OR match requested category
    const categoryMatch = normalizedCategory === 'all' || 
                          entry.category === 'all' || 
                          entry.category === normalizedCategory;
    
    // Location match: if location provided, check city
    const locationMatch = !normalizedLocation || 
      normalizedLocation.includes(entry.city.toLowerCase()) ||
      entry.city.toLowerCase().includes(normalizedLocation.split(',')[0].trim());
    
    return categoryMatch && locationMatch;
  });
}

/**
 * Add a domain to the whitelist
 */
export async function addToWhitelist(domain, category = 'all', name = '', city = '') {
  refreshIfStale();
  
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) {
    return { success: false, message: 'Domain is required' };
  }
  
  // Check if already exists
  const exists = whitelist.some(e => e.domain === normalizedDomain);
  if (exists) {
    logger.info(`Domain ${normalizedDomain} already in whitelist`);
    return { success: true, message: 'Already in whitelist' };
  }
  
  // Add new entry
  const nextEntry = {
    domain: normalizedDomain,
    category: normalizeCategory(category),
    name: normalizeText(name) || normalizedDomain,
    city: normalizeText(city),
  };
  whitelist.push(nextEntry);
  
  try {
    const saved = await persistAddWhitelist(nextEntry);
    return {
      success: saved,
      message: saved ? 'Added to whitelist' : 'Failed to save',
      storage: isDbActive() ? 'db' : 'file'
    };
  } catch (error) {
    whitelist = whitelist.filter(e => e.domain !== normalizedDomain);
    logger.error('Failed to persist whitelist entry', { error: error.message, domain: normalizedDomain });
    return { success: false, message: 'Failed to save' };
  }
}

/**
 * Remove a domain from the whitelist
 */
export async function removeFromWhitelist(domain) {
  refreshIfStale();
  
  const normalizedDomain = normalizeDomain(domain);
  const before = whitelist.length;
  const previous = [...whitelist];
  whitelist = whitelist.filter(e => e.domain !== normalizedDomain);
  
  if (whitelist.length < before) {
    try {
      await persistRemoveWhitelist(normalizedDomain);
      return {
        success: true,
        message: 'Removed from whitelist',
        storage: isDbActive() ? 'db' : 'file'
      };
    } catch (error) {
      whitelist = previous;
      logger.error('Failed to remove whitelist entry', { error: error.message, domain: normalizedDomain });
      return { success: false, message: 'Failed to save' };
    }
  }
  return { success: false, message: 'Domain not found in whitelist' };
}

// =============================================================================
// BLACKLIST SITES OPERATIONS
// =============================================================================

/**
 * Check if a domain is blacklisted
 */
export function isDomainBlacklisted(domain) {
  refreshIfStale();
  
  const normalizedDomain = normalizeDomain(domain);
  return blacklistSites.some(e => 
    normalizedDomain === e.domain || 
    normalizedDomain.endsWith('.' + e.domain)
  );
}

/**
 * Add a domain to the blacklist
 */
export async function addToBlacklistSites(domain, reason = '') {
  refreshIfStale();
  
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) {
    return { success: false, message: 'Domain is required' };
  }
  
  // Check if already exists
  const exists = blacklistSites.some(e => e.domain === normalizedDomain);
  if (exists) {
    return { success: true, message: 'Already blacklisted' };
  }
  
  // Add new entry
  const nextEntry = {
    domain: normalizedDomain,
    reason: normalizeText(reason) || 'Added via GUI',
    date_added: todayDateString(),
  };
  blacklistSites.push(nextEntry);
  
  try {
    const saved = await persistAddBlacklistSite(nextEntry);
    return {
      success: saved,
      message: saved ? 'Domain blacklisted' : 'Failed to save',
      storage: isDbActive() ? 'db' : 'file'
    };
  } catch (error) {
    blacklistSites = blacklistSites.filter(e => e.domain !== normalizedDomain);
    logger.error('Failed to persist blacklist site', { error: error.message, domain: normalizedDomain });
    return { success: false, message: 'Failed to save' };
  }
}

/**
 * Remove a domain from the blacklist
 */
export async function removeFromBlacklistSites(domain) {
  refreshIfStale();
  
  const normalizedDomain = normalizeDomain(domain);
  const before = blacklistSites.length;
  const previous = [...blacklistSites];
  blacklistSites = blacklistSites.filter(e => e.domain !== normalizedDomain);
  
  if (blacklistSites.length < before) {
    try {
      await persistRemoveBlacklistSite(normalizedDomain);
      return {
        success: true,
        message: 'Removed from blacklist',
        storage: isDbActive() ? 'db' : 'file'
      };
    } catch (error) {
      blacklistSites = previous;
      logger.error('Failed to remove blacklist site', { error: error.message, domain: normalizedDomain });
      return { success: false, message: 'Failed to save' };
    }
  }
  return { success: false, message: 'Domain not found in blacklist' };
}

// =============================================================================
// BLACKLIST EVENTS OPERATIONS
// =============================================================================

/**
 * Check if an event is blacklisted (by title or URL)
 */
export function isEventBlacklisted(title, url) {
  refreshIfStale();
  
  const normalizedTitle = String(title || '').toLowerCase().trim();
  const normalizedUrl = String(url || '').toLowerCase().trim();
  
  return blacklistEvents.some(e => {
    const titleMatch = e.title && normalizedTitle.includes(e.title.toLowerCase());
    const urlMatch = e.url && normalizedUrl === e.url.toLowerCase();
    return titleMatch || urlMatch;
  });
}

/**
 * Add an event to the blacklist
 */
export async function addToBlacklistEvents(title, url) {
  refreshIfStale();
  const cleanTitle = normalizeText(title);
  const cleanUrl = normalizeText(url);
  if (!cleanTitle && !cleanUrl) {
    return { success: false, message: 'Title or URL is required' };
  }
  
  // Check if already exists
  const exists = blacklistEvents.some(e => 
    (e.url && e.url.toLowerCase() === cleanUrl.toLowerCase()) ||
    (e.title && e.title.toLowerCase() === cleanTitle.toLowerCase())
  );
  if (exists) {
    return { success: true, message: 'Event already blacklisted' };
  }
  
  // Add new entry
  const nextEntry = {
    title: cleanTitle,
    url: cleanUrl,
    date_added: todayDateString(),
  };
  blacklistEvents.push(nextEntry);
  
  try {
    const saved = await persistAddBlacklistEvent(nextEntry);
    return {
      success: saved,
      message: saved ? 'Event blacklisted' : 'Failed to save',
      storage: isDbActive() ? 'db' : 'file'
    };
  } catch (error) {
    blacklistEvents = blacklistEvents.filter(e => !(e.title === nextEntry.title && e.url === nextEntry.url));
    logger.error('Failed to persist blacklist event', { error: error.message });
    return { success: false, message: 'Failed to save' };
  }
}

/**
 * Remove an event from the blacklist
 */
export async function removeFromBlacklistEvents(title, url) {
  refreshIfStale();
  const cleanTitle = normalizeText(title);
  const cleanUrl = normalizeText(url);
  
  const before = blacklistEvents.length;
  const previous = [...blacklistEvents];
  blacklistEvents = blacklistEvents.filter(e => {
    const titleMatch = cleanTitle && e.title?.toLowerCase() === cleanTitle.toLowerCase();
    const urlMatch = cleanUrl && e.url?.toLowerCase() === cleanUrl.toLowerCase();
    return !(titleMatch || urlMatch);
  });
  
  if (blacklistEvents.length < before) {
    try {
      await persistRemoveBlacklistEvent(cleanTitle, cleanUrl);
      return {
        success: true,
        message: 'Event removed from blacklist',
        storage: isDbActive() ? 'db' : 'file'
      };
    } catch (error) {
      blacklistEvents = previous;
      logger.error('Failed to remove blacklist event', { error: error.message });
      return { success: false, message: 'Failed to save' };
    }
  }
  return { success: false, message: 'Event not found in blacklist' };
}

// =============================================================================
// FILTERING HELPER
// =============================================================================

/**
 * Filter events array, removing blacklisted sites and events
 * @param {Array} events - Array of event objects
 * @returns {Array} Filtered events
 */
export function filterBlacklistedEvents(events) {
  refreshIfStale();
  
  if (!Array.isArray(events)) return events;
  
  const before = events.length;
  const filtered = events.filter(event => {
    // Get domain from event URL
    const url = event.eventUrl || event.ticketUrl || event.externalUrl || event.url || '';
    let domain = '';
    try {
      domain = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {}
    
    // Check blacklists
    const domainBlocked = domain && isDomainBlacklisted(domain);
    const eventBlocked = isEventBlacklisted(event.title, url);
    
    return !domainBlocked && !eventBlocked;
  });
  
  const removed = before - filtered.length;
  if (removed > 0) {
    logger.info(`Filtered ${removed} blacklisted events`);
  }
  
  return filtered;
}

// =============================================================================
// STATS
// =============================================================================

/**
 * Get list statistics
 */
export function getListStats() {
  refreshIfStale();
  return {
    storageMode: STORAGE_MODE,
    storageSource: lastLoadSource,
    dbActive: isDbActive(),
    whitelist: whitelist.length,
    blacklistSites: blacklistSites.length,
    blacklistEvents: blacklistEvents.length,
    lastReload: new Date(lastLoadTime).toISOString(),
  };
}

/**
 * Get all list contents (for admin display)
 */
export function getAllLists() {
  refreshIfStale();
  return {
    whitelist: [...whitelist],
    blacklistSites: [...blacklistSites],
    blacklistEvents: [...blacklistEvents],
  };
}

/**
 * Force reload all lists
 */
export async function forceReload() {
  if (isDbModeRequested()) {
    await ensureDbInitialized();
    if (isDbActive()) {
      await refreshFromDb({ force: true });
      return;
    }
  }
  loadAllListsFromFiles();
}

export default {
  getWhitelistDomains,
  addToWhitelist,
  removeFromWhitelist,
  isDomainBlacklisted,
  addToBlacklistSites,
  removeFromBlacklistSites,
  isEventBlacklisted,
  addToBlacklistEvents,
  removeFromBlacklistEvents,
  filterBlacklistedEvents,
  getListStats,
  getAllLists,
  forceReload,
};
