/**
 * =============================================================================
 * SCRIPT NAME: WhitelistManager.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Manages domain whitelist patterns for Exa and Serper clients.
 * Loads patterns from CSV files with category, scope, and precision filtering.
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-09-06
 * AUTHOR: Claude Code
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { createLogger } from './logger.js';

const logger = createLogger('WhitelistManager');

export class WhitelistManager {
  constructor() {
    this.patterns = null;
    this.lastLoadTime = 0;
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
  }

  /**
   * Load whitelist patterns from CSV file with caching
   * @returns {Array} Array of pattern objects
   */
  async loadPatterns() {
    const now = Date.now();
    if (this.patterns && (now - this.lastLoadTime) < this.cacheTimeout) {
      return this.patterns;
    }

    const whitelistPath = path.join(process.cwd(), 'whitelist.csv');
    const venuesIncludePath = path.join(process.cwd(), 'venues_include.csv');
    
    // Try whitelist.csv first, fallback to venues_include.csv
    const filePath = fs.existsSync(whitelistPath) ? whitelistPath : venuesIncludePath;
    
    if (!fs.existsSync(filePath)) {
      logger.warn('No whitelist CSV file found, using empty patterns');
      this.patterns = [];
      this.lastLoadTime = now;
      return this.patterns;
    }

    try {
      const csvContent = fs.readFileSync(filePath, 'utf-8');
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      this.patterns = records
        .filter(record => {
          // Check if enabled (default to true)
          const enabled = String(record.enabled || 'true').toLowerCase();
          return !['0', 'false', 'no', 'off'].includes(enabled);
        })
        .map(record => ({
          category: String(record.category || '').toLowerCase(),
          scope: String(record.scope || '').toLowerCase(),
          precision: String(record.precision || '').toLowerCase(),
          pattern: String(record.pattern || '').trim(),
          notes: record.notes || ''
        }))
        .filter(record => record.pattern); // Only keep records with patterns

      this.lastLoadTime = now;
      logger.info(`Loaded ${this.patterns.length} whitelist patterns from ${path.basename(filePath)}`);
      
      return this.patterns;
    } catch (error) {
      logger.error('Error loading whitelist patterns', { error: error.message, filePath });
      this.patterns = [];
      this.lastLoadTime = now;
      return this.patterns;
    }
  }

  /**
   * Get filtered patterns based on category, scope, and precision
   * @param {string} category - Event category (e.g., 'arts-culture', 'talks-ai')
   * @param {string} scope - Geographic scope ('berkeley', 'eastbay', 'bayarea')
   * @param {string} precision - Precision level ('official', 'broad')
   * @returns {Array} Filtered array of patterns
   */
  async getPatterns(category, scope = 'bayarea', precision = 'official') {
    const allPatterns = await this.loadPatterns();
    
    const filtered = allPatterns.filter(record => {
      return this.categoryMatches(record.category, category) &&
             this.scopeMatches(record.scope, scope) &&
             this.precisionMatches(record.precision, precision);
    });

    const patterns = filtered.map(record => record.pattern);
    
    logger.info(`Filtered patterns for ${category}/${scope}/${precision}`, { 
      totalPatterns: allPatterns.length,
      filteredPatterns: patterns.length
    });

    return patterns;
  }

  /**
   * Check if category matches (supports 'any' wildcard)
   * @param {string} recordCategory - Category from CSV record
   * @param {string} requestedCategory - Requested category
   * @returns {boolean} True if matches
   */
  categoryMatches(recordCategory, requestedCategory) {
    if (!recordCategory || ['any', '*'].includes(recordCategory)) {
      return true;
    }
    return recordCategory === requestedCategory.toLowerCase();
  }

  /**
   * Check if scope matches with hierarchy (berkeley ⊂ eastbay ⊂ bayarea)
   * @param {string} recordScope - Scope from CSV record
   * @param {string} requestedScope - Requested scope
   * @returns {boolean} True if matches
   */
  scopeMatches(recordScope, requestedScope) {
    if (!recordScope || ['any', 'all', '*'].includes(recordScope)) {
      return true;
    }

    const requested = requestedScope.toLowerCase();
    
    // Hierarchy: berkeley should get eastbay and bayarea patterns too
    if (requested === 'berkeley') {
      return ['berkeley', 'eastbay', 'bayarea'].includes(recordScope);
    }
    if (requested === 'eastbay') {
      return ['eastbay', 'bayarea'].includes(recordScope);
    }
    if (requested === 'bayarea') {
      return recordScope === 'bayarea';
    }
    
    return recordScope === requested;
  }

  /**
   * Check if precision matches (supports 'any' wildcard)
   * @param {string} recordPrecision - Precision from CSV record
   * @param {string} requestedPrecision - Requested precision
   * @returns {boolean} True if matches
   */
  precisionMatches(recordPrecision, requestedPrecision) {
    if (!recordPrecision || ['any', '*'].includes(recordPrecision)) {
      return true;
    }
    return recordPrecision === requestedPrecision.toLowerCase();
  }

  /**
   * Get statistics about loaded patterns
   * @returns {Object} Statistics object
   */
  async getStats() {
    const patterns = await this.loadPatterns();
    
    const stats = {
      totalPatterns: patterns.length,
      categories: {},
      scopes: {},
      precisions: {}
    };

    patterns.forEach(pattern => {
      // Count by category
      const cat = pattern.category || 'unknown';
      stats.categories[cat] = (stats.categories[cat] || 0) + 1;

      // Count by scope
      const scope = pattern.scope || 'unknown';
      stats.scopes[scope] = (stats.scopes[scope] || 0) + 1;

      // Count by precision
      const precision = pattern.precision || 'unknown';
      stats.precisions[precision] = (stats.precisions[precision] || 0) + 1;
    });

    return stats;
  }

  /**
   * Clear cache and force reload on next request
   */
  clearCache() {
    this.patterns = null;
    this.lastLoadTime = 0;
    logger.info('Whitelist patterns cache cleared');
  }
}

export default WhitelistManager;