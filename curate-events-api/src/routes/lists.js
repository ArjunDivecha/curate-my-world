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
router.post('/reload', (req, res) => {
  try {
    forceReload();
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
router.post('/whitelist', (req, res) => {
  // Block saves in production (Railway) - changes would be lost on redeploy
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    return res.status(403).json({ 
      success: false, 
      error: 'Whitelist editing is disabled in production. Edit the XLSX file locally and push to git.' 
    });
  }
  
  try {
    const { domain, category, name, city } = req.body;
    
    if (!domain) {
      return res.status(400).json({ success: false, error: 'Domain is required' });
    }
    
    const result = addToWhitelist(domain, category, name, city);
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
router.delete('/whitelist', (req, res) => {
  // Block saves in production (Railway) - changes would be lost on redeploy
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    return res.status(403).json({ 
      success: false, 
      error: 'Whitelist editing is disabled in production. Edit the XLSX file locally and push to git.' 
    });
  }
  
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ success: false, error: 'Domain is required' });
    }
    
    const result = removeFromWhitelist(domain);
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
router.post('/blacklist-site', (req, res) => {
  // Block saves in production (Railway) - changes would be lost on redeploy
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    return res.status(403).json({ 
      success: false, 
      error: 'Blacklist editing is disabled in production. Edit the XLSX file locally and push to git.' 
    });
  }
  
  try {
    const { domain, reason } = req.body;
    
    if (!domain) {
      return res.status(400).json({ success: false, error: 'Domain is required' });
    }
    
    const result = addToBlacklistSites(domain, reason);
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
router.delete('/blacklist-site', (req, res) => {
  // Block saves in production (Railway) - changes would be lost on redeploy
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    return res.status(403).json({ 
      success: false, 
      error: 'Blacklist editing is disabled in production. Edit the XLSX file locally and push to git.' 
    });
  }
  
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ success: false, error: 'Domain is required' });
    }
    
    const result = removeFromBlacklistSites(domain);
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
router.post('/blacklist-event', (req, res) => {
  // Block saves in production (Railway) - changes would be lost on redeploy
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    return res.status(403).json({ 
      success: false, 
      error: 'Blacklist editing is disabled in production. Edit the XLSX file locally and push to git.' 
    });
  }
  
  try {
    const { title, url } = req.body;
    
    if (!title && !url) {
      return res.status(400).json({ success: false, error: 'Title or URL is required' });
    }
    
    const result = addToBlacklistEvents(title, url);
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
router.delete('/blacklist-event', (req, res) => {
  // Block saves in production (Railway) - changes would be lost on redeploy
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    return res.status(403).json({ 
      success: false, 
      error: 'Blacklist editing is disabled in production. Edit the XLSX file locally and push to git.' 
    });
  }
  
  try {
    const { title, url } = req.body;
    
    if (!title && !url) {
      return res.status(400).json({ success: false, error: 'Title or URL is required' });
    }
    
    const result = removeFromBlacklistEvents(title, url);
    logger.info(`Blacklist event remove: "${title || url}" - ${result.message}`);
    
    res.json(result);
  } catch (error) {
    logger.error('Failed to remove from blacklist events:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

