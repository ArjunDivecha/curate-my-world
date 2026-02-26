/**
 * =============================================================================
 * SCRIPT NAME: cache.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * In-memory caching system for API responses to improve performance.
 * Implements TTL-based caching with automatic cleanup.
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-01-29
 * AUTHOR: Claude Code
 * =============================================================================
 */

import { createLogger } from './logger.js';

const logger = createLogger('Cache');
const nodeEnv = process.env.NODE_ENV || 'development';

function parseBooleanEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return defaultValue;
}

class ResponseCache {
  constructor(defaultTTL = 300000, { disabled = false } = {}) { // 5 minutes default
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
    this.disabled = disabled;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
    
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
    
    logger.info('Response cache initialized', {
      defaultTTL: `${defaultTTL}ms`,
      cleanupInterval: '60s',
      disabled: this.disabled
    });
  }

  /**
   * Generate cache key from request parameters
   */
  generateKey(category, location, dateRange, options = {}, customPrompt = '') {
    const keyParts = [
      category.toLowerCase(),
      location.toLowerCase().replace(/[^a-z0-9]/g, ''),
      dateRange || 'default',
      options.limit || 50,
      options.minConfidence || 0.5,
      customPrompt ? customPrompt.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50) : 'default'
    ];
    
    return keyParts.join('|');
  }

  /**
   * Get cached response
   */
  get(key) {
    if (this.disabled) {
      this.stats.misses++;
      return null;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.stats.deletes++;
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.data;
  }

  /**
   * Set cached response
   */
  set(key, data, ttl = this.defaultTTL) {
    if (this.disabled) {
      return;
    }

    const safeTTL = Number.isFinite(ttl) && ttl > 0 ? ttl : this.defaultTTL;
    const expiry = Date.now() + safeTTL;
    
    this.cache.set(key, {
      data,
      expiry,
      created: Date.now()
    });
    
    this.stats.sets++;
    
    logger.debug('Cache set', { 
      key, 
      ttl: `${safeTTL}ms`,
      cacheSize: this.cache.size
    });
  }

  /**
   * Clear specific cache entry
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
    }
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    logger.info('Cache cleared', { entriesRemoved: size });
  }

  /**
   * Remove expired entries
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      logger.debug('Cache cleanup completed', { 
        entriesRemoved: removed,
        remainingEntries: this.cache.size
      });
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(1) + '%' : '0%',
      size: this.cache.size,
      disabled: this.disabled
    };
  }

  /**
   * Destroy cache instance
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
    logger.info('Cache destroyed');
  }
}

// Defaults:
// - production: enabled
// - development: disabled unless EVENT_CACHE_DISABLE_IN_DEV=false
const disableCacheEverywhere = parseBooleanEnv(process.env.EVENT_CACHE_DISABLE, false);
const disableCacheInDev = parseBooleanEnv(process.env.EVENT_CACHE_DISABLE_IN_DEV, true);
const cacheDisabled = disableCacheEverywhere || (nodeEnv === 'development' && disableCacheInDev);
const configuredDefaultTtlMs = Number(process.env.EVENT_CACHE_DEFAULT_TTL_MS || 300000);
const defaultTtlMs = Number.isFinite(configuredDefaultTtlMs) && configuredDefaultTtlMs > 0
  ? configuredDefaultTtlMs
  : 300000;

export const eventCache = new ResponseCache(defaultTtlMs, { disabled: cacheDisabled });

export default ResponseCache;
