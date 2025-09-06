/**
 * =============================================================================
 * SCRIPT NAME: costTracking.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Cost calculation and tracking utilities for Exa and Serper API usage.
 * Tracks API costs, logs usage, and provides cost analytics.
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-09-06
 * AUTHOR: Claude Code
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { createLogger } from './logger.js';

const logger = createLogger('CostTracking');

/**
 * Exa API Cost Calculator
 * Pricing (2025): Neural/Auto: $5/1000 searches, Keyword/Fast: $2.50/1000, Content: $1/1000 pages
 */
export class ExaCostCalculator {
  static RATES = {
    NEURAL_PER_1000: 5.00,      // Neural and Auto search
    KEYWORD_PER_1000: 2.50,    // Keyword and Fast search  
    CONTENT_PER_1000: 1.00,    // Content retrieval
    LIVECRAWL_MULTIPLIER: 1.2  // Live crawl premium
  };

  /**
   * Calculate search cost
   * @param {string} searchType - 'neural', 'auto', 'keyword', 'fast'
   * @param {number} numResults - Number of search results
   * @returns {number} Cost in dollars
   */
  static calculateSearchCost(searchType, numResults) {
    const isNeural = ['neural', 'auto'].includes(searchType);
    const ratePerThousand = isNeural ? this.RATES.NEURAL_PER_1000 : this.RATES.KEYWORD_PER_1000;
    return (ratePerThousand / 1000) * numResults;
  }

  /**
   * Calculate content retrieval cost
   * @param {number} numPages - Number of pages retrieved
   * @param {boolean} hasLivecrawl - Whether livecrawl was used
   * @returns {number} Cost in dollars
   */
  static calculateContentCost(numPages, hasLivecrawl = false) {
    const baseCost = (this.RATES.CONTENT_PER_1000 / 1000) * numPages;
    return hasLivecrawl ? baseCost * this.RATES.LIVECRAWL_MULTIPLIER : baseCost;
  }

  /**
   * Calculate total Exa operation cost
   * @param {string} searchType - Search type
   * @param {number} numResults - Number of results
   * @param {number} numPages - Number of pages for content
   * @param {boolean} hasLivecrawl - Whether livecrawl was used
   * @returns {number} Total cost in dollars
   */
  static calculateTotalCost(searchType, numResults, numPages, hasLivecrawl = false) {
    const searchCost = this.calculateSearchCost(searchType, numResults);
    const contentCost = this.calculateContentCost(numPages, hasLivecrawl);
    return searchCost + contentCost;
  }
}

/**
 * Serper API Cost Calculator
 * Pricing (2025): ~$5 per 1000 requests
 */
export class SerperCostCalculator {
  static RATES = {
    REQUEST_PER_1000: 5.00  // Per 1000 requests
  };

  /**
   * Calculate Serper request cost
   * @param {number} numRequests - Number of API requests
   * @returns {number} Cost in dollars
   */
  static calculateRequestCost(numRequests) {
    return (this.RATES.REQUEST_PER_1000 / 1000) * numRequests;
  }
}

/**
 * Cost tracking and logging system
 */
export class CostTracker {
  constructor(logFilePath = 'cost_log.csv') {
    this.logFilePath = path.join(process.cwd(), logFilePath);
    this.ensureLogFile();
  }

  /**
   * Ensure cost log file exists with headers
   */
  ensureLogFile() {
    if (!fs.existsSync(this.logFilePath)) {
      const headers = 'timestamp,source,operation,search_type,num_results,num_pages,total_cost,query\n';
      fs.writeFileSync(this.logFilePath, headers, 'utf-8');
      logger.info(`Created cost log file: ${this.logFilePath}`);
    }
  }

  /**
   * Log Exa API cost
   * @param {Object} params - Cost parameters
   */
  async logExaCost({
    query,
    searchType,
    numResults,
    numPages = 0,
    hasLivecrawl = false,
    operation = 'search'
  }) {
    const totalCost = ExaCostCalculator.calculateTotalCost(
      searchType, 
      numResults, 
      numPages, 
      hasLivecrawl
    );

    await this.logCost({
      source: 'exa',
      operation,
      searchType,
      numResults,
      numPages,
      totalCost,
      query: query.slice(0, 100) // Truncate long queries
    });

    logger.info('Exa API cost logged', {
      searchType,
      numResults,
      numPages,
      totalCost: `$${totalCost.toFixed(6)}`,
      hasLivecrawl
    });

    return totalCost;
  }

  /**
   * Log Serper API cost
   * @param {Object} params - Cost parameters
   */
  async logSerperCost({
    query,
    numRequests,
    operation = 'search'
  }) {
    const totalCost = SerperCostCalculator.calculateRequestCost(numRequests);

    await this.logCost({
      source: 'serper',
      operation,
      searchType: 'events',
      numResults: numRequests,
      numPages: 0,
      totalCost,
      query: query.slice(0, 100)
    });

    logger.info('Serper API cost logged', {
      numRequests,
      totalCost: `$${totalCost.toFixed(6)}`
    });

    return totalCost;
  }

  /**
   * Log cost entry to CSV file
   * @param {Object} entry - Cost entry data
   */
  async logCost(entry) {
    try {
      const timestamp = new Date().toISOString();
      const csvLine = [
        timestamp,
        entry.source || '',
        entry.operation || '',
        entry.searchType || '',
        entry.numResults || 0,
        entry.numPages || 0,
        entry.totalCost.toFixed(6),
        `"${(entry.query || '').replace(/"/g, '""')}"` // Escape quotes in query
      ].join(',') + '\n';

      fs.appendFileSync(this.logFilePath, csvLine, 'utf-8');
    } catch (error) {
      logger.error('Error writing to cost log', { error: error.message });
    }
  }

  /**
   * Get cost analytics for a time period
   * @param {number} hours - Hours to look back (default: 24)
   * @returns {Object} Cost analytics
   */
  async getCostAnalytics(hours = 24) {
    try {
      if (!fs.existsSync(this.logFilePath)) {
        return { totalCost: 0, breakdown: {}, requestCount: 0 };
      }

      const csvContent = fs.readFileSync(this.logFilePath, 'utf-8');
      const lines = csvContent.split('\n').slice(1); // Skip header
      
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
      const analytics = {
        totalCost: 0,
        breakdown: { exa: 0, serper: 0 },
        requestCount: 0,
        operations: {},
        timeRange: `${hours}h`
      };

      for (const line of lines) {
        if (!line.trim()) continue;
        
        const parts = line.split(',');
        if (parts.length < 7) continue;

        const timestamp = new Date(parts[0]);
        if (timestamp < cutoffTime) continue;

        const source = parts[1];
        const operation = parts[2];
        const cost = parseFloat(parts[6]);

        analytics.totalCost += cost;
        analytics.breakdown[source] = (analytics.breakdown[source] || 0) + cost;
        analytics.operations[operation] = (analytics.operations[operation] || 0) + cost;
        analytics.requestCount++;
      }

      // Round totals
      analytics.totalCost = Math.round(analytics.totalCost * 1000000) / 1000000; // 6 decimal places
      Object.keys(analytics.breakdown).forEach(key => {
        analytics.breakdown[key] = Math.round(analytics.breakdown[key] * 1000000) / 1000000;
      });

      return analytics;
    } catch (error) {
      logger.error('Error calculating cost analytics', { error: error.message });
      return { totalCost: 0, breakdown: {}, requestCount: 0, error: error.message };
    }
  }

  /**
   * Get daily cost summary for the last N days
   * @param {number} days - Number of days to analyze (default: 7)
   * @returns {Array} Array of daily cost summaries
   */
  async getDailyCostSummary(days = 7) {
    try {
      const analytics = await this.getCostAnalytics(days * 24);
      const summary = {
        totalDays: days,
        totalCost: analytics.totalCost,
        averageDailyCost: analytics.totalCost / days,
        breakdown: analytics.breakdown,
        projectedMonthlyCost: (analytics.totalCost / days) * 30
      };

      return summary;
    } catch (error) {
      logger.error('Error calculating daily cost summary', { error: error.message });
      return { error: error.message };
    }
  }
}

export default { ExaCostCalculator, SerperCostCalculator, CostTracker };