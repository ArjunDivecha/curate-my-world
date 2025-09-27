/**
 * =============================================================================
 * SCRIPT NAME: PerplexitySearchClient.js
 * =============================================================================
 *
 * INPUT FILES:
 * - None (calls Perplexity Search API directly)
 *
 * OUTPUT FILES:
 * - Returns standardized event objects based on Perplexity search results
 *
 * DESCRIPTION:
 * Lightweight wrapper around the Perplexity Search API (September 2025) that
 * converts web search results into the event schema used by the pipeline.
 *
 * VERSION: 1.0
 * LAST UPDATED: 2025-09-26
 * AUTHOR: Codex (GPT-5)
 * =============================================================================
 */

import config from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PerplexitySearchClient');

export class PerplexitySearchClient {
  constructor() {
    this.apiKey = config.perplexityApiKey;
    this.baseUrl = 'https://api.perplexity.ai/search';
    this.timeout = 30000; // 30 seconds
  }

  /**
   * Search for events using Perplexity's dedicated search endpoint.
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Normalized response
   */
  async searchEvents({ category, location, limit = 20 }) {
    const startTime = Date.now();
    const effectiveLimit = Math.max(1, Math.min(Number(limit) || 20, 120));

    if (!this.apiKey) {
      const processingTime = Date.now() - startTime;
      logger.warn('Perplexity Search API key missing');
      return {
        success: false,
        error: 'Perplexity Search API key not configured',
        events: [],
        count: 0,
        processingTime,
        source: 'pplx_search',
        cost: 0
      };
    }

    const queries = this.buildQueries(category, location);
    const aggregated = [];
    const seen = new Set();
    const errors = [];
    let queriesExecuted = 0;

    for (const query of queries) {
      if (aggregated.length >= effectiveLimit) break;

      const remaining = effectiveLimit - aggregated.length;
      const payload = this.buildPayload([query], remaining);
      const queryStart = Date.now();
      queriesExecuted += 1;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'CurateMyWorld/1.0'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        const rawResults = Array.isArray(data?.results) ? data.results : [];
        const transformed = rawResults
          .map(result => this.transformResult(result, category, location))
          .filter(Boolean);

        transformed.forEach(event => {
          if (aggregated.length >= effectiveLimit) return;
          const dedupeKey = event.eventUrl || event.id;
          if (dedupeKey && seen.has(dedupeKey)) return;
          if (dedupeKey) seen.add(dedupeKey);
          aggregated.push(event);
        });

        const duration = Date.now() - queryStart;
        logger.info('Perplexity query success', {
          query,
          rawResults: rawResults.length,
          kept: transformed.length,
          runningTotal: aggregated.length,
          duration: `${duration}ms`
        });

      } catch (error) {
        const duration = Date.now() - queryStart;
        errors.push(error.message);
        logger.warn('Perplexity query failed', {
          query,
          error: error.message,
          duration: `${duration}ms`
        });
      }
    }

    const processingTime = Date.now() - startTime;

    if (aggregated.length === 0) {
      return {
        success: false,
        error: errors[0] || 'Perplexity returned no events',
        events: [],
        count: 0,
        processingTime,
        source: 'pplx_search',
        cost: 0,
        queriesExecuted
      };
    }

    const estimatedCost = queriesExecuted * 0.005;

    return {
      success: true,
      events: aggregated.slice(0, effectiveLimit),
      count: Math.min(aggregated.length, effectiveLimit),
      processingTime,
      source: 'pplx_search',
      cost: Number(estimatedCost.toFixed(3)),
      queriesExecuted,
      queryErrors: errors
    };
  }

  /**
   * Build a set of queries to increase coverage for a category/location.
   */
  buildQueries(category, location) {
    const cat = String(category || 'events');
    const loc = String(location || 'San Francisco, CA');
    const base = `${cat} ${loc}`;

    return [
      `${base} events tickets`,
      `${base} conferences schedule`,
      `${base} things to do`,
      `${base} meetup calendar`,
      `${base} festival 2025`
    ];
  }

  /**
   * Build request payload for Perplexity Search API
   */
  buildPayload(queries, limit) {
    const perQuery = Math.ceil(limit / Math.max(1, queries.length));
    const maxResults = Math.max(1, Math.min(20, perQuery));

    if (queries.length === 1) {
      return {
        query: queries[0],
        max_results: maxResults,
        max_tokens_per_page: 1536,
        country: 'US'
      };
    }

    return {
      query: queries,
      max_results: maxResults,
      max_tokens_per_page: 1024,
      country: 'US'
    };
  }

  /**
   * Transform a Perplexity search result into our canonical event shape
   */
  transformResult(result, category, location) {
    try {
      const url = result?.url;
      const title = result?.title || result?.snippet || '';
      if (!url || !title) {
        return null;
      }

      const description = result?.snippet || '';
      const domain = this.extractDomain(url);

      return {
        id: `pplx_${Buffer.from(url).toString('base64').slice(0, 12)}`,
        title,
        description,
        category,
        venue: 'See Event Page',
        location: location || 'San Francisco, CA',
        startDate: null,
        endDate: null,
        eventUrl: url,
        ticketUrl: url,
        externalUrl: url,
        source: 'pplx_search',
        confidence: 0.6,
        aiReasoning: description,
        tags: domain ? [domain] : []
      };
    } catch (error) {
      logger.warn('Failed to transform Perplexity result', { error: error.message, resultTitle: result?.title });
      return null;
    }
  }

  extractDomain(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }
}

export default PerplexitySearchClient;
