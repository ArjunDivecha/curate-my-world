/**
 * =============================================================================
 * SCRIPT NAME: rulesFilter.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Loads and applies whitelist/blacklist rules from the shared rules.json file.
 * This ensures the main backend API respects the same rules as Super-Hybrid.
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-11-25
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { createLogger } from './logger.js';

const logger = createLogger('RulesFilter');

// Path to shared rules file (used by both Super-Hybrid and main backend)
const RULES_PATH = path.join(process.cwd(), 'experiments', 'speed-demon', 'rules.json');

let compiledRules = null;
let lastLoadTime = 0;
const RELOAD_INTERVAL_MS = 30000; // Reload rules every 30 seconds

/**
 * Load and compile rules from disk
 */
function loadRules() {
  try {
    if (!fs.existsSync(RULES_PATH)) {
      logger.debug('Rules file not found, using empty rules', { path: RULES_PATH });
      return { globalTokens: [], domains: [] };
    }

    const raw = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
    
    // Compile global block tokens
    const globalTokens = (raw.global?.blockPathTokens || []).map(t => {
      try { return new RegExp(t, 'i'); } catch { return null; }
    }).filter(Boolean);

    // Compile domain-specific rules
    const domains = (raw.domains || []).map(d => ({
      domain: d.domain.toLowerCase(),
      allow: (d.allowPaths || []).map(p => {
        try { return new RegExp(p, 'i'); } catch { return null; }
      }).filter(Boolean),
      block: (d.blockPaths || []).map(p => {
        try { return new RegExp(p, 'i'); } catch { return null; }
      }).filter(Boolean),
      penalizeWords: (d.penalizeWords || []).map(w => {
        try { return new RegExp(w, 'i'); } catch { return null; }
      }).filter(Boolean)
    }));

    logger.info('Rules loaded successfully', { 
      globalTokens: globalTokens.length, 
      domains: domains.length 
    });

    return { globalTokens, domains };
  } catch (error) {
    logger.error('Failed to load rules', { error: error.message });
    return { globalTokens: [], domains: [] };
  }
}

/**
 * Get compiled rules, reloading if stale
 */
function getRules() {
  const now = Date.now();
  if (!compiledRules || (now - lastLoadTime) > RELOAD_INTERVAL_MS) {
    compiledRules = loadRules();
    lastLoadTime = now;
  }
  return compiledRules;
}

/**
 * Find domain-specific rules for a hostname
 */
function findDomainRule(host) {
  const rules = getRules();
  const h = (host || '').toLowerCase().replace(/^www\./, '');
  return rules.domains.find(d => {
    const domainNorm = d.domain.replace(/^www\./, '');
    return h === domainNorm || h === d.domain;
  });
}

/**
 * Check if a URL should be blocked based on rules
 * @param {string} url - The URL to check
 * @param {string} title - Optional title for additional checks
 * @param {string} description - Optional description for additional checks
 * @returns {Object} { blocked: boolean, reason: string, score: number }
 */
export function checkUrl(url, title = '', description = '') {
  const rules = getRules();
  let score = 0;
  let reasons = [];
  let blocked = false;
  let allowHit = false;

  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const pathName = (u.pathname || '').toLowerCase();

    // Check global block tokens
    for (const re of rules.globalTokens) {
      if (re.test(pathName)) {
        score -= 0.5;
        reasons.push(`global-block:${re.source}`);
      }
    }

    // Check domain-specific rules
    const dr = findDomainRule(host);
    if (dr) {
      // Block path rules
      for (const re of dr.block) {
        if (re.test(pathName)) {
          score -= 0.7;
          reasons.push(`domain-block:${re.source}`);
        }
      }

      // Allow path rules (whitelist patterns)
      for (const re of dr.allow) {
        if (re.test(pathName)) {
          score += 0.6;
          allowHit = true;
          reasons.push(`domain-allow:${re.source}`);
        }
      }

      // Penalize words in content
      const text = `${title} ${description}`.toLowerCase();
      for (const re of dr.penalizeWords || []) {
        if (re.test(text)) {
          score -= 0.3;
          reasons.push(`penalize:${re.source}`);
        }
      }
    }

    // Positive signals
    const text = `${title} ${description}`.toLowerCase();
    if (/(tickets|rsvp|register|showtimes|buy\s+tickets)/i.test(text)) {
      score += 0.3;
      reasons.push('has-ticket-signal');
    }

    // Date pattern analysis
    const dateMatches = text.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}/gi) || [];
    if (dateMatches.length === 1) {
      score += 0.2;
      reasons.push('single-date');
    } else if (dateMatches.length >= 3) {
      score -= 0.3;
      reasons.push('multi-date-listing');
    }

    // Final decision: block if score is very negative and no allow rule matched
    blocked = (score < -1.0) && !allowHit;

    return {
      blocked,
      reason: reasons.join(', ') || 'no-rules-matched',
      score,
      allowHit
    };
  } catch (error) {
    // Invalid URL - don't block
    return { blocked: false, reason: 'invalid-url', score: 0, allowHit: false };
  }
}

/**
 * Filter an array of events based on rules
 * @param {Array} events - Array of event objects
 * @returns {Array} Filtered events with blocked ones removed
 */
export function filterEvents(events) {
  if (!Array.isArray(events)) return events;

  const beforeCount = events.length;
  const filtered = events.filter(event => {
    const url = event.eventUrl || event.ticketUrl || event.externalUrl;
    if (!url) return true; // Keep events without URLs

    const result = checkUrl(url, event.title || '', event.description || '');
    
    if (result.blocked) {
      logger.debug('Event blocked by rules', {
        title: event.title?.substring(0, 50),
        url: url?.substring(0, 80),
        reason: result.reason,
        score: result.score
      });
    }

    return !result.blocked;
  });

  const blockedCount = beforeCount - filtered.length;
  if (blockedCount > 0) {
    logger.info('Events filtered by rules', { 
      before: beforeCount, 
      after: filtered.length, 
      blocked: blockedCount 
    });
  }

  return filtered;
}

/**
 * Check if a domain is whitelisted (has allow rules defined)
 * @param {string} domain - The domain to check
 * @returns {boolean}
 */
export function isDomainWhitelisted(domain) {
  const dr = findDomainRule(domain);
  return dr && dr.allow && dr.allow.length > 0;
}

/**
 * Get all whitelisted domains
 * @returns {Array<string>}
 */
export function getWhitelistedDomains() {
  const rules = getRules();
  return rules.domains
    .filter(d => d.allow && d.allow.length > 0)
    .map(d => d.domain);
}

/**
 * Force reload rules from disk
 */
export function reloadRules() {
  compiledRules = loadRules();
  lastLoadTime = Date.now();
  return compiledRules;
}

export default {
  checkUrl,
  filterEvents,
  isDomainWhitelisted,
  getWhitelistedDomains,
  reloadRules
};

