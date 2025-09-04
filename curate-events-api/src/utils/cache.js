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

class ResponseCache {
  constructor(defaultTTL = 300000) { // 5 minutes default
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
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
      cleanupInterval: '60s'
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
   * Get cached response - DISABLED FOR DEVELOPMENT
   */
  get(key) {
    // Always return null to disable caching during development
    this.stats.misses++;
    logger.debug('Cache disabled - always miss', { key });
    return null;
  }

  /**
   * Set cached response
   */
  set(key, data, ttl = this.defaultTTL) {
    const expiry = Date.now() + ttl;
    
    this.cache.set(key, {
      data,
      expiry,
      created: Date.now()
    });
    
    this.stats.sets++;
    
    logger.debug('Cache set', { 
      key, 
      ttl: `${ttl}ms`,
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
      size: this.cache.size
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

// Create global cache instance - DISABLED FOR DEVELOPMENT
export const eventCache = new ResponseCache(0); // 0 TTL = disabled

export default ResponseCache;