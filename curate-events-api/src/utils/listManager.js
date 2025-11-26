/**
 * =============================================================================
 * LIST MANAGER - Whitelist & Blacklist XLSX Management
 * =============================================================================
 * 
 * Simple system for managing:
 * - whitelist.xlsx: Sites to always search for events
 * - blacklist-sites.xlsx: Domains to never show
 * - blacklist-events.xlsx: Specific events to hide
 * 
 * Features:
 * - Auto-reload files every 30 seconds
 * - Add/remove entries programmatically
 * - Query by category/location
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

logger.info(`ListManager data directory: ${DATA_DIR}`);

const RELOAD_INTERVAL_MS = 30 * 1000; // 30 seconds

// =============================================================================
// STATE
// =============================================================================

let whitelist = [];
let blacklistSites = [];
let blacklistEvents = [];
let lastLoadTime = 0;

// =============================================================================
// FILE OPERATIONS
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

function loadAllLists() {
  whitelist = loadXLSX(FILES.whitelist).map(row => ({
    domain: String(row.domain || '').toLowerCase().trim(),
    category: String(row.category || 'all').toLowerCase().trim(),
    name: String(row.name || '').trim(),
    city: String(row.city || '').trim(),
  })).filter(r => r.domain);

  blacklistSites = loadXLSX(FILES.blacklistSites).map(row => ({
    domain: String(row.domain || '').toLowerCase().trim(),
    reason: String(row.reason || '').trim(),
    date_added: row.date_added || new Date().toISOString().split('T')[0],
  })).filter(r => r.domain && r.domain !== 'example-spam-site.com');

  blacklistEvents = loadXLSX(FILES.blacklistEvents).map(row => ({
    title: String(row.title || '').trim(),
    url: String(row.url || '').trim(),
    date_added: row.date_added || new Date().toISOString().split('T')[0],
  })).filter(r => (r.title || r.url) && r.title !== 'Example Event to Block');

  lastLoadTime = Date.now();
  
  logger.info(`Loaded lists: ${whitelist.length} whitelist, ${blacklistSites.length} blacklist sites, ${blacklistEvents.length} blacklist events`);
}

function reloadIfStale() {
  if (Date.now() - lastLoadTime > RELOAD_INTERVAL_MS) {
    loadAllLists();
  }
}

// Initial load
loadAllLists();

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
  reloadIfStale();
  
  const normalizedCategory = (category || 'all').toLowerCase().trim();
  const normalizedLocation = (location || '').toLowerCase();
  
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
export function addToWhitelist(domain, category = 'all', name = '', city = '') {
  reloadIfStale();
  
  const normalizedDomain = domain.toLowerCase().trim().replace(/^www\./, '');
  
  // Check if already exists
  const exists = whitelist.some(e => e.domain === normalizedDomain);
  if (exists) {
    logger.info(`Domain ${normalizedDomain} already in whitelist`);
    return { success: true, message: 'Already in whitelist' };
  }
  
  // Add new entry
  whitelist.push({
    domain: normalizedDomain,
    category: category.toLowerCase().trim(),
    name: name || normalizedDomain,
    city: city || '',
  });
  
  // Save to file
  const saved = saveXLSX(FILES.whitelist, whitelist, 'Whitelist');
  return { success: saved, message: saved ? 'Added to whitelist' : 'Failed to save' };
}

/**
 * Remove a domain from the whitelist
 */
export function removeFromWhitelist(domain) {
  reloadIfStale();
  
  const normalizedDomain = domain.toLowerCase().trim().replace(/^www\./, '');
  const before = whitelist.length;
  whitelist = whitelist.filter(e => e.domain !== normalizedDomain);
  
  if (whitelist.length < before) {
    saveXLSX(FILES.whitelist, whitelist, 'Whitelist');
    return { success: true, message: 'Removed from whitelist' };
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
  reloadIfStale();
  
  const normalizedDomain = (domain || '').toLowerCase().trim().replace(/^www\./, '');
  return blacklistSites.some(e => 
    normalizedDomain === e.domain || 
    normalizedDomain.endsWith('.' + e.domain)
  );
}

/**
 * Add a domain to the blacklist
 */
export function addToBlacklistSites(domain, reason = '') {
  reloadIfStale();
  
  const normalizedDomain = domain.toLowerCase().trim().replace(/^www\./, '');
  
  // Check if already exists
  const exists = blacklistSites.some(e => e.domain === normalizedDomain);
  if (exists) {
    return { success: true, message: 'Already blacklisted' };
  }
  
  // Add new entry
  blacklistSites.push({
    domain: normalizedDomain,
    reason: reason || 'Added via GUI',
    date_added: new Date().toISOString().split('T')[0],
  });
  
  const saved = saveXLSX(FILES.blacklistSites, blacklistSites, 'Blacklist Sites');
  return { success: saved, message: saved ? 'Domain blacklisted' : 'Failed to save' };
}

/**
 * Remove a domain from the blacklist
 */
export function removeFromBlacklistSites(domain) {
  reloadIfStale();
  
  const normalizedDomain = domain.toLowerCase().trim().replace(/^www\./, '');
  const before = blacklistSites.length;
  blacklistSites = blacklistSites.filter(e => e.domain !== normalizedDomain);
  
  if (blacklistSites.length < before) {
    saveXLSX(FILES.blacklistSites, blacklistSites, 'Blacklist Sites');
    return { success: true, message: 'Removed from blacklist' };
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
  reloadIfStale();
  
  const normalizedTitle = (title || '').toLowerCase().trim();
  const normalizedUrl = (url || '').toLowerCase().trim();
  
  return blacklistEvents.some(e => {
    const titleMatch = e.title && normalizedTitle.includes(e.title.toLowerCase());
    const urlMatch = e.url && normalizedUrl === e.url.toLowerCase();
    return titleMatch || urlMatch;
  });
}

/**
 * Add an event to the blacklist
 */
export function addToBlacklistEvents(title, url) {
  reloadIfStale();
  
  // Check if already exists
  const exists = blacklistEvents.some(e => 
    (e.url && e.url.toLowerCase() === url?.toLowerCase()) ||
    (e.title && e.title.toLowerCase() === title?.toLowerCase())
  );
  if (exists) {
    return { success: true, message: 'Event already blacklisted' };
  }
  
  // Add new entry
  blacklistEvents.push({
    title: title || '',
    url: url || '',
    date_added: new Date().toISOString().split('T')[0],
  });
  
  const saved = saveXLSX(FILES.blacklistEvents, blacklistEvents, 'Blacklist Events');
  return { success: saved, message: saved ? 'Event blacklisted' : 'Failed to save' };
}

/**
 * Remove an event from the blacklist
 */
export function removeFromBlacklistEvents(title, url) {
  reloadIfStale();
  
  const before = blacklistEvents.length;
  blacklistEvents = blacklistEvents.filter(e => {
    const titleMatch = title && e.title?.toLowerCase() === title.toLowerCase();
    const urlMatch = url && e.url?.toLowerCase() === url.toLowerCase();
    return !(titleMatch || urlMatch);
  });
  
  if (blacklistEvents.length < before) {
    saveXLSX(FILES.blacklistEvents, blacklistEvents, 'Blacklist Events');
    return { success: true, message: 'Event removed from blacklist' };
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
  reloadIfStale();
  
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
  reloadIfStale();
  return {
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
  reloadIfStale();
  return {
    whitelist: [...whitelist],
    blacklistSites: [...blacklistSites],
    blacklistEvents: [...blacklistEvents],
  };
}

/**
 * Force reload all lists
 */
export function forceReload() {
  loadAllLists();
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

