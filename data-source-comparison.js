#!/usr/bin/env node

/**
 * =============================================================================
 * SCRIPT NAME: data-source-comparison.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Comprehensive test program to compare all event data sources:
 * - Perplexity AI (via our API)
 * - Apyflux API (via our API)
 * - PredictHQ API (direct)
 * - Combined/deduplicated results (via our API)
 * 
 * USAGE:
 * node data-source-comparison.js [category] [location]
 * 
 * EXAMPLES:
 * node data-source-comparison.js theatre "San Francisco, CA"
 * node data-source-comparison.js music "New York, NY"
 * node data-source-comparison.js comedy "Los Angeles, CA"
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-01-30
 * AUTHOR: Claude Code
 * =============================================================================
 */

import fetch from 'node-fetch';
import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import { fileURLToPath } from 'url';

// Configuration
const CONFIG = {
  API_BASE_URL: 'http://127.0.0.1:3001/api',
  PREDICTHQ_API_KEY: '8K2-8oWxCmuJ09HuFBwafivPpoK3Dqmab0qpmEkR',
  PREDICTHQ_BASE_URL: 'https://api.predicthq.com/v1',
  DEFAULT_LIMIT: 5,
  DEFAULT_LOCATION: 'San Francisco, CA',
  DEFAULT_CATEGORY: 'theatre'
};

// Color codes for console output
const COLORS = {
  RESET: '\x1b[0m',
  BRIGHT: '\x1b[1m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m'
};

// Utility functions
const colorize = (text, color) => `${color}${text}${COLORS.RESET}`;
const title = (text) => colorize(`\n${'='.repeat(80)}\n${text}\n${'='.repeat(80)}`, COLORS.BRIGHT + COLORS.CYAN);
const header = (text) => colorize(`\n${'-'.repeat(50)}\n${text}\n${'-'.repeat(50)}`, COLORS.YELLOW);
const success = (text) => colorize(text, COLORS.GREEN);
const error = (text) => colorize(text, COLORS.RED);
const info = (text) => colorize(text, COLORS.BLUE);
const highlight = (text) => colorize(text, COLORS.BRIGHT + COLORS.WHITE);

/**
 * Test Perplexity API via our event pipeline
 */
async function testPerplexityAPI(category, location) {
  try {
    console.log(header('🧠 PERPLEXITY AI (via our API pipeline)'));
    
    const startTime = Date.now();
    const url = `${CONFIG.API_BASE_URL}/events/${category}?location=${encodeURIComponent(location)}&limit=${CONFIG.DEFAULT_LIMIT}`;
    
    console.log(info(`URL: ${url}`));
    
    const response = await fetch(url);
    const data = await response.json();
    const duration = Date.now() - startTime;
    
    if (data.success) {
      console.log(success(`✅ Success: ${data.count} events found in ${duration}ms`));
      
      if (data.events && data.events.length > 0) {
        console.log(highlight('\nSample Events:'));
        data.events.slice(0, 3).forEach((event, i) => {
          console.log(`  ${i + 1}. ${event.title || 'Untitled Event'}`);
          console.log(`     Venue: ${event.venue || 'Unknown'}`);
          console.log(`     Date: ${event.date || event.startDate || 'TBD'}`);
          console.log(`     Source: ${event.source || 'perplexity_ai'}`);
          console.log(`     Confidence: ${event.confidence || 'N/A'}`);
        });
      }
      
      return {
        source: 'perplexity',
        success: true,
        count: data.count,
        events: data.events || [],
        duration,
        processingTime: data.processingTime
      };
    } else {
      console.log(error(`❌ Error: ${data.error}`));
      return { source: 'perplexity', success: false, error: data.error, count: 0, events: [] };
    }
  } catch (err) {
    console.log(error(`❌ Exception: ${err.message}`));
    return { source: 'perplexity', success: false, error: err.message, count: 0, events: [] };
  }
}

/**
 * Test Apyflux API via our integration
 */
async function testApyfluxAPI(category, location) {
  try {
    console.log(header('🎯 APYFLUX API (via our integration)'));
    
    const startTime = Date.now();
    
    // Use our Node.js ApyfluxClient directly
    const { ApyfluxClient } = await import('./curate-events-api/src/clients/ApyfluxClient.js');
    const client = new ApyfluxClient();
    
    console.log(info(`Testing Apyflux with category: ${category}, location: ${location}`));
    
    const result = await client.searchEvents({
      query: client.buildSearchQuery(category, location),
      location,
      category,
      dateRange: 'next 30 days',
      limit: CONFIG.DEFAULT_LIMIT
    });
    
    const duration = Date.now() - startTime;
    
    if (result.success) {
      console.log(success(`✅ Success: ${result.count} events found in ${duration}ms`));
      
      if (result.events && result.events.length > 0) {
        console.log(highlight('\nSample Events:'));
        result.events.slice(0, 3).forEach((event, i) => {
          const transformed = client.transformEvent(event, category);
          console.log(`  ${i + 1}. ${event.name || 'Untitled Event'}`);
          console.log(`     Venue: ${event.venue?.name || 'Unknown'}`);
          console.log(`     Date: ${event.date_human_readable || event.start_time || 'TBD'}`);
          console.log(`     Tickets: ${event.ticket_links?.length || 0} sources`);
          console.log(`     Rating: ${event.venue?.rating || 'N/A'}`);
        });
      }
      
      return {
        source: 'apyflux',
        success: true,
        count: result.count,
        events: result.events || [],
        duration,
        processingTime: result.processingTime
      };
    } else {
      console.log(error(`❌ Error: ${result.error}`));
      return { source: 'apyflux', success: false, error: result.error, count: 0, events: [] };
    }
  } catch (err) {
    console.log(error(`❌ Exception: ${err.message}`));
    return { source: 'apyflux', success: false, error: err.message, count: 0, events: [] };
  }
}

/**
 * Test PredictHQ API directly
 */
async function testPredictHQAPI(category, location) {
  try {
    console.log(header('📊 PREDICTHQ API (direct)'));
    
    const startTime = Date.now();
    
    // Map our categories to PredictHQ categories
    const categoryMapping = {
      'theatre': 'performing-arts',
      'theater': 'performing-arts', 
      'music': 'concerts',
      'concerts': 'concerts',
      'comedy': 'performing-arts',
      'sports': 'sports',
      'food': 'festivals',
      'art': 'expos',
      'lectures': 'conferences'
    };
    
    const phqCategory = categoryMapping[category.toLowerCase()] || 'performing-arts';
    const locationQuery = location.includes(',') ? location.split(',')[0].trim() : location;
    
    const url = `${CONFIG.PREDICTHQ_BASE_URL}/events?` + new URLSearchParams({
      category: phqCategory,
      'place.scope': locationQuery,
      limit: CONFIG.DEFAULT_LIMIT,
      sort: 'start'
    });
    
    console.log(info(`URL: ${url.replace(CONFIG.PREDICTHQ_API_KEY, '[API_KEY]')}`));
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${CONFIG.PREDICTHQ_API_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    const data = await response.json();
    const duration = Date.now() - startTime;
    
    if (response.ok && data.results) {
      console.log(success(`✅ Success: ${data.results.length} events found in ${duration}ms`));
      console.log(info(`Total available: ${data.count} (showing ${data.results.length})`));
      
      if (data.results.length > 0) {
        console.log(highlight('\nSample Events:'));
        data.results.slice(0, 3).forEach((event, i) => {
          console.log(`  ${i + 1}. ${event.title || 'Untitled Event'}`);
          console.log(`     Category: ${event.category}`);
          console.log(`     Date: ${event.start_local || event.start || 'TBD'}`);
          console.log(`     Attendance: ${event.phq_attendance || 'N/A'}`);
          console.log(`     Rank: ${event.rank} (local: ${event.local_rank})`);
          console.log(`     Location: ${event.geo?.address?.locality || 'Unknown'}`);
        });
      }
      
      return {
        source: 'predicthq',
        success: true,
        count: data.results.length,
        totalAvailable: data.count,
        events: data.results || [],
        duration
      };
    } else {
      const errorMsg = data.error || data.message || 'Unknown error';
      console.log(error(`❌ Error: ${errorMsg}`));
      return { source: 'predicthq', success: false, error: errorMsg, count: 0, events: [] };
    }
  } catch (err) {
    console.log(error(`❌ Exception: ${err.message}`));
    return { source: 'predicthq', success: false, error: err.message, count: 0, events: [] };
  }
}

/**
 * Test Combined API with deduplication
 */
async function testCombinedAPI(category, location) {
  try {
    console.log(header('🔀 COMBINED API (Perplexity + Apyflux with deduplication)'));
    
    const startTime = Date.now();
    const url = `${CONFIG.API_BASE_URL}/events/${category}/combined?location=${encodeURIComponent(location)}&limit=${CONFIG.DEFAULT_LIMIT}`;
    
    console.log(info(`URL: ${url}`));
    
    const response = await fetch(url);
    const data = await response.json();
    const duration = Date.now() - startTime;
    
    if (data.success) {
      console.log(success(`✅ Success: ${data.count} unique events in ${duration}ms`));
      
      // Show deduplication stats
      if (data.deduplication) {
        const dedup = data.deduplication;
        console.log(info(`📊 Deduplication Stats:`));
        console.log(`   Total processed: ${dedup.totalProcessed}`);
        console.log(`   Duplicates removed: ${dedup.duplicatesRemoved}`);
        console.log(`   Duplicate groups: ${dedup.duplicateGroups}`);
        console.log(`   Sources: ${dedup.sources}`);
      }
      
      // Show source breakdown
      if (data.sources) {
        console.log(info(`📈 Source Breakdown:`));
        console.log(`   Perplexity: ${data.sources.perplexity.count} events (${data.sources.perplexity.success ? 'success' : 'failed'})`);
        console.log(`   Apyflux: ${data.sources.apyflux.count} events (${data.sources.apyflux.success ? 'success' : 'failed'})`);
      }
      
      if (data.events && data.events.length > 0) {
        console.log(highlight('\nSample Deduplicated Events:'));
        data.events.slice(0, 3).forEach((event, i) => {
          console.log(`  ${i + 1}. ${event.title || 'Untitled Event'}`);
          console.log(`     Venue: ${event.venue || 'Unknown'}`);
          console.log(`     Date: ${event.dateHuman || event.startDate || 'TBD'}`);
          console.log(`     Source: ${event.source || event._originalSource || 'unknown'}`);
          console.log(`     Confidence: ${event.confidence || 'N/A'}`);
          if (event._duplicateCount > 1) {
            console.log(`     🔗 Merged from ${event._duplicateCount} sources`);
          }
        });
      }
      
      return {
        source: 'combined',
        success: true,
        count: data.count,
        events: data.events || [],
        duration,
        deduplication: data.deduplication,
        sources: data.sources
      };
    } else {
      console.log(error(`❌ Error: ${data.error}`));
      return { source: 'combined', success: false, error: data.error, count: 0, events: [] };
    }
  } catch (err) {
    console.log(error(`❌ Exception: ${err.message}`));
    return { source: 'combined', success: false, error: err.message, count: 0, events: [] };
  }
}

/**
 * Generate comparison summary
 */
function generateSummary(results, category, location) {
  console.log(title('📊 COMPARISON SUMMARY'));
  
  console.log(highlight(`Category: ${category}`));
  console.log(highlight(`Location: ${location}`));
  console.log(highlight(`Limit: ${CONFIG.DEFAULT_LIMIT} events per source\n`));
  
  // Create summary table
  console.log(colorize('Source'.padEnd(15) + 'Status'.padEnd(10) + 'Count'.padEnd(8) + 'Time'.padEnd(10) + 'Notes', COLORS.BRIGHT));
  console.log('-'.repeat(70));
  
  results.forEach(result => {
    const status = result.success ? success('✅ OK') : error('❌ FAIL');
    const count = result.count.toString().padEnd(7);
    const time = result.duration ? `${result.duration}ms`.padEnd(9) : 'N/A'.padEnd(9);
    const sourceName = result.source.toUpperCase().padEnd(14);
    
    let notes = '';
    if (result.source === 'combined' && result.deduplication) {
      notes = `${result.deduplication.duplicatesRemoved} dupes removed`;
    } else if (result.source === 'predicthq' && result.totalAvailable) {
      notes = `${result.totalAvailable} total available`;
    } else if (!result.success) {
      notes = result.error ? result.error.substring(0, 30) + '...' : 'Unknown error';
    }
    
    console.log(`${sourceName} ${status} ${count} ${time} ${notes}`);
  });
  
  // Best performers
  const successful = results.filter(r => r.success);
  if (successful.length > 0) {
    const mostEvents = successful.reduce((max, r) => r.count > max.count ? r : max);
    const fastest = successful.reduce((min, r) => r.duration < min.duration ? r : min);
    
    console.log(highlight(`\n🏆 Most events: ${mostEvents.source.toUpperCase()} (${mostEvents.count} events)`));
    console.log(highlight(`⚡ Fastest: ${fastest.source.toUpperCase()} (${fastest.duration}ms)`));
  }
  
  // Recommendations
  console.log(info('\n💡 Recommendations:'));
  const totalUnique = results.find(r => r.source === 'combined')?.count || 0;
  const totalAll = results.filter(r => r.source !== 'combined').reduce((sum, r) => sum + (r.count || 0), 0);
  
  if (totalUnique > 0) {
    console.log(`   • Combined API provides ${totalUnique} unique events from multiple sources`);
    console.log(`   • Deduplication saved ${totalAll - totalUnique} duplicate events`);
  }
  
  const predicthq = results.find(r => r.source === 'predicthq');
  if (predicthq?.success && predicthq.count > 0) {
    console.log(`   • PredictHQ provides structured data with attendance predictions`);
  }
  
  const apyflux = results.find(r => r.source === 'apyflux');
  if (apyflux?.success && apyflux.count > 0) {
    console.log(`   • Apyflux provides comprehensive venue data and ticket links`);
  }
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  const category = args[0] || CONFIG.DEFAULT_CATEGORY;
  const location = args[1] || CONFIG.DEFAULT_LOCATION;
  
  console.log(title(`🎭 EVENT DATA SOURCE COMPARISON TOOL`));
  console.log(info(`Testing category: ${highlight(category)}`));
  console.log(info(`Testing location: ${highlight(location)}`));
  console.log(info(`Events per source: ${highlight(CONFIG.DEFAULT_LIMIT)}`));
  
  const startTime = Date.now();
  
  // Test all sources
  const results = [];
  
  // Test each source sequentially for clearer output
  results.push(await testPerplexityAPI(category, location));
  results.push(await testApyfluxAPI(category, location));
  results.push(await testPredictHQAPI(category, location));
  results.push(await testCombinedAPI(category, location));
  
  const totalTime = Date.now() - startTime;
  
  // Generate summary
  generateSummary(results, category, location);
  
  console.log(info(`\n⏱️  Total execution time: ${totalTime}ms`));
  console.log(title('🎉 COMPARISON COMPLETE'));
}

// Handle command line execution
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch(console.error);
}

export { testPerplexityAPI, testApyfluxAPI, testPredictHQAPI, testCombinedAPI };