/**
 * =============================================================================
 * LISTS API ROUTES - Whitelist & Blacklist Management
 * =============================================================================
 * 
 * Endpoints:
 * GET  /api/lists                    - Get all lists and stats
 * POST /api/lists/whitelist          - Add to whitelist
 * DELETE /api/lists/whitelist        - Remove from whitelist
 * POST /api/lists/blacklist-site     - Add domain to blacklist
 * DELETE /api/lists/blacklist-site   - Remove domain from blacklist
 * POST /api/lists/blacklist-event    - Add event to blacklist
 * DELETE /api/lists/blacklist-event  - Remove event from blacklist
 * 
 * =============================================================================
 */

import express from 'express';
import {
  getWhitelistDomains,
  addToWhitelist,
  removeFromWhitelist,
  addToBlacklistSites,
  removeFromBlacklistSites,
  addToBlacklistEvents,
  removeFromBlacklistEvents,
  getListStats,
  getAllLists,
  forceReload,
} from '../utils/listManager.js';
import { createLogger } from '../utils/logger.js';

const router = express.Router();
const logger = createLogger('ListsAPI');
const listStorageMode = String(process.env.LIST_STORAGE_MODE || 'file').toLowerCase();

function areWritesBlockedInCurrentEnv() {
  const inProductionRuntime = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;
  return inProductionRuntime && listStorageMode !== 'db';
}

function buildWriteBlockedMessage() {
  if (listStorageMode === 'db') {
    return 'Writes are unexpectedly blocked. Verify LIST_STORAGE_MODE and runtime environment.';
  }
  return 'List editing is disabled in production unless LIST_STORAGE_MODE=db is enabled.';
}

function shouldRequireDbActive() {
  const inProductionRuntime = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;
  return inProductionRuntime && listStorageMode === 'db';
}

function hasActiveDbStorage() {
  try {
    const stats = getListStats();
    return stats.dbActive === true;
  } catch {
    return false;
  }
}

// =============================================================================
// GET ALL LISTS
// =============================================================================

/**
 * GET /api/lists
 * Get all lists and statistics
 */
router.get('/', (req, res) => {
  try {
    const stats = getListStats();
    const lists = getAllLists();
    
    res.json({
      success: true,
      stats,
      lists,
    });
  } catch (error) {
    logger.error('Failed to get lists:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/lists/reload
 * Force reload all lists from disk
 */
router.post('/reload', async (req, res) => {
  try {
    await forceReload();
    const stats = getListStats();
    res.json({ success: true, message: 'Lists reloaded', stats });
  } catch (error) {
    logger.error('Failed to reload lists:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// WHITELIST ENDPOINTS
// =============================================================================

/**
 * GET /api/lists/whitelist
 * Get whitelist entries, optionally filtered by category
 */
router.get('/whitelist', (req, res) => {
  try {
    const { category, location } = req.query;
    const entries = getWhitelistDomains(category, location);
    
    res.json({
      success: true,
      count: entries.length,
      entries,
    });
  } catch (error) {
    logger.error('Failed to get whitelist:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/lists/whitelist
 * Add a domain to the whitelist
 * Body: { domain, category?, name?, city? }
 */
router.post('/whitelist', async (req, res) => {
  // Writes are only allowed in production when DB-backed storage is enabled.
  if (areWritesBlockedInCurrentEnv()) {
    return res.status(403).json({ 
      success: false, 
      error: buildWriteBlockedMessage(),
    });
  }
  if (shouldRequireDbActive() && !hasActiveDbStorage()) {
    return res.status(503).json({ success: false, error: 'DB storage is not active; refusing write in production.' });
  }
  
  try {
    const { domain, category, name, city } = req.body;
    
    if (!domain) {
      return res.status(400).json({ success: false, error: 'Domain is required' });
    }
    
    const result = await addToWhitelist(domain, category, name, city);
    logger.info(`Whitelist add: ${domain} (${category || 'all'}) - ${result.message}`);
    
    res.json(result);
  } catch (error) {
    logger.error('Failed to add to whitelist:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/lists/whitelist
 * Remove a domain from the whitelist
 * Body: { domain }
 */
router.delete('/whitelist', async (req, res) => {
  // Writes are only allowed in production when DB-backed storage is enabled.
  if (areWritesBlockedInCurrentEnv()) {
    return res.status(403).json({ 
      success: false, 
      error: buildWriteBlockedMessage(),
    });
  }
  if (shouldRequireDbActive() && !hasActiveDbStorage()) {
    return res.status(503).json({ success: false, error: 'DB storage is not active; refusing write in production.' });
  }
  
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ success: false, error: 'Domain is required' });
    }
    
    const result = await removeFromWhitelist(domain);
    logger.info(`Whitelist remove: ${domain} - ${result.message}`);
    
    res.json(result);
  } catch (error) {
    logger.error('Failed to remove from whitelist:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// BLACKLIST SITES ENDPOINTS
// =============================================================================

/**
 * POST /api/lists/blacklist-site
 * Add a domain to the site blacklist
 * Body: { domain, reason? }
 */
router.post('/blacklist-site', async (req, res) => {
  // Writes are only allowed in production when DB-backed storage is enabled.
  if (areWritesBlockedInCurrentEnv()) {
    return res.status(403).json({ 
      success: false, 
      error: buildWriteBlockedMessage(),
    });
  }
  if (shouldRequireDbActive() && !hasActiveDbStorage()) {
    return res.status(503).json({ success: false, error: 'DB storage is not active; refusing write in production.' });
  }
  
  try {
    const { domain, reason } = req.body;
    
    if (!domain) {
      return res.status(400).json({ success: false, error: 'Domain is required' });
    }
    
    const result = await addToBlacklistSites(domain, reason);
    logger.info(`Blacklist site add: ${domain} - ${result.message}`);
    
    res.json(result);
  } catch (error) {
    logger.error('Failed to add to blacklist sites:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/lists/blacklist-site
 * Remove a domain from the site blacklist
 * Body: { domain }
 */
router.delete('/blacklist-site', async (req, res) => {
  // Writes are only allowed in production when DB-backed storage is enabled.
  if (areWritesBlockedInCurrentEnv()) {
    return res.status(403).json({ 
      success: false, 
      error: buildWriteBlockedMessage(),
    });
  }
  if (shouldRequireDbActive() && !hasActiveDbStorage()) {
    return res.status(503).json({ success: false, error: 'DB storage is not active; refusing write in production.' });
  }
  
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ success: false, error: 'Domain is required' });
    }
    
    const result = await removeFromBlacklistSites(domain);
    logger.info(`Blacklist site remove: ${domain} - ${result.message}`);
    
    res.json(result);
  } catch (error) {
    logger.error('Failed to remove from blacklist sites:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// BLACKLIST EVENTS ENDPOINTS
// =============================================================================

/**
 * POST /api/lists/blacklist-event
 * Add an event to the event blacklist
 * Body: { title?, url? } (at least one required)
 */
router.post('/blacklist-event', async (req, res) => {
  // Writes are only allowed in production when DB-backed storage is enabled.
  if (areWritesBlockedInCurrentEnv()) {
    return res.status(403).json({ 
      success: false, 
      error: buildWriteBlockedMessage(),
    });
  }
  if (shouldRequireDbActive() && !hasActiveDbStorage()) {
    return res.status(503).json({ success: false, error: 'DB storage is not active; refusing write in production.' });
  }
  
  try {
    const { title, url } = req.body;
    
    if (!title && !url) {
      return res.status(400).json({ success: false, error: 'Title or URL is required' });
    }
    
    const result = await addToBlacklistEvents(title, url);
    logger.info(`Blacklist event add: "${title || url}" - ${result.message}`);
    
    res.json(result);
  } catch (error) {
    logger.error('Failed to add to blacklist events:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/lists/blacklist-event
 * Remove an event from the event blacklist
 * Body: { title?, url? }
 */
router.delete('/blacklist-event', async (req, res) => {
  // Writes are only allowed in production when DB-backed storage is enabled.
  if (areWritesBlockedInCurrentEnv()) {
    return res.status(403).json({ 
      success: false, 
      error: buildWriteBlockedMessage(),
    });
  }
  if (shouldRequireDbActive() && !hasActiveDbStorage()) {
    return res.status(503).json({ success: false, error: 'DB storage is not active; refusing write in production.' });
  }
  
  try {
    const { title, url } = req.body;
    
    if (!title && !url) {
      return res.status(400).json({ success: false, error: 'Title or URL is required' });
    }
    
    const result = await removeFromBlacklistEvents(title, url);
    logger.info(`Blacklist event remove: "${title || url}" - ${result.message}`);
    
    res.json(result);
  } catch (error) {
    logger.error('Failed to remove from blacklist events:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
