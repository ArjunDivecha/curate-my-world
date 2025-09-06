/**
 * =============================================================================
 * SCRIPT NAME: BlacklistManager.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Manages domain blacklist patterns for filtering out low-quality domains.
 * Supports both CSV and TXT format blacklist files with fnmatch patterns.
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-09-06
 * AUTHOR: Claude Code
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { minimatch } from 'minimatch';
import { createLogger } from './logger.js';

const logger = createLogger('BlacklistManager');

export class BlacklistManager {
  constructor() {
    this.patterns = null;
    this.lastLoadTime = 0;
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
  }

  /**
   * Load blacklist patterns from CSV or TXT file with caching
   * @returns {Array} Array of pattern strings
   */
  async loadPatterns() {
    const now = Date.now();
    if (this.patterns && (now - this.lastLoadTime) < this.cacheTimeout) {
      return this.patterns;
    }

    const csvPath = path.join(process.cwd(), 'blacklist.csv');
    const txtPath = path.join(process.cwd(), 'blacklist.txt');

    try {
      let patterns = [];

      // Try CSV format first
      if (fs.existsSync(csvPath)) {
        patterns = await this.loadFromCSV(csvPath);
      }
      // Fallback to TXT format
      else if (fs.existsSync(txtPath)) {
        patterns = await this.loadFromTXT(txtPath);
      }
      else {
        logger.warn('No blacklist file found (blacklist.csv or blacklist.txt)');
        patterns = [];
      }

      this.patterns = patterns;
      this.lastLoadTime = now;
      
      logger.info(`Loaded ${patterns.length} blacklist patterns`);
      return this.patterns;

    } catch (error) {
      logger.error('Error loading blacklist patterns', { error: error.message });
      this.patterns = [];
      this.lastLoadTime = now;
      return this.patterns;
    }
  }

  /**
   * Load patterns from CSV file
   * @param {string} filePath - Path to CSV file
   * @returns {Array} Array of patterns
   */
  async loadFromCSV(filePath) {
    const csvContent = fs.readFileSync(filePath, 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    return records
      .filter(record => {
        // Check if enabled (default to true)
        const enabled = String(record.enabled || 'true').toLowerCase();
        return !['0', 'false', 'no', 'off'].includes(enabled);
      })
      .map(record => String(record.pattern || '').trim())
      .filter(pattern => pattern.length > 0);
  }

  /**
   * Load patterns from TXT file (one pattern per line)
   * @param {string} filePath - Path to TXT file
   * @returns {Array} Array of patterns
   */
  async loadFromTXT(filePath) {
    const txtContent = fs.readFileSync(filePath, 'utf-8');
    return txtContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#')) // Skip empty lines and comments
      .filter(line => line.length > 0);
  }

  /**
   * Check if a URL matches any blacklist pattern
   * @param {string} url - URL to check
   * @returns {boolean} True if URL should be blacklisted
   */
  async isBlacklisted(url) {
    if (!url) return false;

    const patterns = await this.loadPatterns();
    if (!patterns.length) return false;

    try {
      // Clean URL for matching (remove protocol)
      const cleanUrl = url.startsWith('http://') || url.startsWith('https://') 
        ? url.split('://', 2)[1] 
        : url;

      // Check against all patterns
      for (const pattern of patterns) {
        // Convert single * to ** for deeper path matching (like Python fnmatch)
        const adjustedPattern = pattern.includes('/**') ? pattern : pattern.replace(/\/\*$/, '/**');
        
        // Use minimatch for fnmatch-style pattern matching
        if (minimatch(cleanUrl, adjustedPattern) || minimatch(url, adjustedPattern)) {
          logger.debug(`URL blacklisted: ${url} matches pattern: ${pattern} (adjusted: ${adjustedPattern})`);
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Error checking blacklist', { url, error: error.message });
      return false; // Don't blacklist on error
    }
  }

  /**
   * Bulk check multiple URLs against blacklist
   * @param {Array} urls - Array of URLs to check
   * @returns {Object} Object with allowed and blocked URLs
   */
  async filterUrls(urls) {
    const results = {
      allowed: [],
      blocked: [],
      total: urls.length
    };

    for (const url of urls) {
      if (await this.isBlacklisted(url)) {
        results.blocked.push(url);
      } else {
        results.allowed.push(url);
      }
    }

    logger.info(`Blacklist filtering completed`, {
      total: results.total,
      allowed: results.allowed.length,
      blocked: results.blocked.length
    });

    return results;
  }

  /**
   * Add pattern to blacklist (runtime addition)
   * @param {string} pattern - Pattern to add
   */
  async addPattern(pattern) {
    const patterns = await this.loadPatterns();
    if (!patterns.includes(pattern)) {
      patterns.push(pattern);
      logger.info(`Added pattern to blacklist: ${pattern}`);
    }
  }

  /**
   * Remove pattern from blacklist (runtime removal)
   * @param {string} pattern - Pattern to remove
   */
  async removePattern(pattern) {
    const patterns = await this.loadPatterns();
    const index = patterns.indexOf(pattern);
    if (index > -1) {
      patterns.splice(index, 1);
      logger.info(`Removed pattern from blacklist: ${pattern}`);
    }
  }

  /**
   * Get statistics about loaded patterns
   * @returns {Object} Statistics object
   */
  async getStats() {
    const patterns = await this.loadPatterns();
    
    const stats = {
      totalPatterns: patterns.length,
      domainPatterns: 0,
      pathPatterns: 0,
      wildcardPatterns: 0,
      examples: patterns.slice(0, 5) // First 5 patterns as examples
    };

    patterns.forEach(pattern => {
      if (pattern.includes('*')) {
        stats.wildcardPatterns++;
      }
      if (pattern.includes('/')) {
        stats.pathPatterns++;
      } else {
        stats.domainPatterns++;
      }
    });

    return stats;
  }

  /**
   * Clear cache and force reload on next request
   */
  clearCache() {
    this.patterns = null;
    this.lastLoadTime = 0;
    logger.info('Blacklist patterns cache cleared');
  }
}

export default BlacklistManager;