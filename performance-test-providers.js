/**
 * =============================================================================
 * SCRIPT NAME: performance-test-providers.js
 * =============================================================================
 *
 * DESCRIPTION:
 * Comprehensive performance testing for all event data providers.
 * Tests each provider across all categories and generates detailed performance report.
 *
 * OUTPUT FILES:
 * - provider_performance_report_YYYY_MM_DD_HHMMSS.json: Detailed test results
 * - provider_performance_summary_YYYY_MM_DD_HHMMSS.txt: Human-readable summary
 *
 * VERSION: 1.0
 * LAST UPDATED: 2025-08-01
 * AUTHOR: Claude Code
 *
 * USAGE:
 * node performance-test-providers.js
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import all providers
import { PerplexityClient } from './curate-events-api/src/clients/PerplexityClient.js';
import { ExaClient } from './curate-events-api/src/clients/ExaClient.js';
import { PredictHQClient } from './curate-events-api/src/clients/PredictHQClient.js';
import { SerpApiClient } from './curate-events-api/src/clients/SerpApiClient.js';
import { ApyfluxClient } from './curate-events-api/src/clients/ApyfluxClient.js';

// Import supporting classes
import { EventPipeline } from './curate-events-api/src/pipeline/EventPipeline.js';
import { CategoryManager } from './curate-events-api/src/managers/CategoryManager.js';
import { EventParser } from './curate-events-api/src/parsers/EventParser.js';

// Configuration
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_CONFIG = {
  location: 'San Francisco, CA',
  dateRange: 'next 7 days',
  categories: ['theatre', 'music', 'comedy', 'food', 'art', 'movies', 'tech', 'education'],
  timeout: 30000, // 30 seconds per test
  retries: 2
};

// Output configuration
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
const OUTPUT_DIR = path.join(__dirname, 'outputs');
const REPORT_FILE = path.join(OUTPUT_DIR, `provider_performance_report_${TIMESTAMP}.json`);
const SUMMARY_FILE = path.join(OUTPUT_DIR, `provider_performance_summary_${TIMESTAMP}.txt`);

class ProviderPerformanceTester {
  constructor() {
    this.categoryManager = new CategoryManager();
    this.eventParser = new EventParser();
    this.results = {
      testStartTime: new Date().toISOString(),
      config: TEST_CONFIG,
      providers: {},
      summary: {}
    };

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  }

  /**
   * Initialize all providers with API keys from environment
   */
  async initializeProviders() {
    console.log('🔧 Initializing providers...\n');

    const providers = {};

    // Perplexity (Primary provider)
    if (process.env.PERPLEXITY_API_KEY) {
      try {
        providers.perplexity = new PerplexityClient(process.env.PERPLEXITY_API_KEY);
        console.log('✅ Perplexity initialized');
      } catch (error) {
        console.log('❌ Perplexity failed:', error.message);
      }
    } else {
      console.log('⚠️  Perplexity: No API key found');
    }

    // Exa
    if (process.env.EXA_API_KEY) {
      try {
        providers.exa = new ExaClient();
        console.log('✅ Exa initialized');
      } catch (error) {
        console.log('❌ Exa failed:', error.message);
      }
    } else {
      console.log('⚠️  Exa: No API key found');
    }

    // PredictHQ
    if (process.env.PREDICTHQ_API_KEY) {
      try {
        providers.predicthq = new PredictHQClient(process.env.PREDICTHQ_API_KEY);
        console.log('✅ PredictHQ initialized');
      } catch (error) {
        console.log('❌ PredictHQ failed:', error.message);
      }
    } else {
      console.log('⚠️  PredictHQ: No API key found');
    }

    // SerpAPI
    if (process.env.SERPAPI_API_KEY) {
      try {
        providers.serpapi = new SerpApiClient();
        console.log('✅ SerpAPI initialized');
      } catch (error) {
        console.log('❌ SerpAPI failed:', error.message);
      }
    } else {
      console.log('⚠️  SerpAPI: No API key found');
    }

    // Apyflux
    if (process.env.APYFLUX_API_KEY) {
      try {
        providers.apyflux = new ApyfluxClient();
        console.log('✅ Apyflux initialized');
      } catch (error) {
        console.log('❌ Apyflux failed:', error.message);
      }
    } else {
      console.log('⚠️  Apyflux: No API key found');
    }

    console.log(`\n📊 ${Object.keys(providers).length} providers available for testing\n`);
    return providers;
  }

  /**
   * Test a single provider for a specific category
   */
  async testProvider(providerName, provider, category) {
    const testStart = Date.now();
    const testId = `${providerName}_${category}_${Date.now()}`;

    console.log(`   Testing ${category}...`);

    try {
      let result;
      let events = [];

      // Different call patterns for different providers
      switch (providerName) {
        case 'perplexity':
          // Use EventPipeline for Perplexity (most comprehensive)
          const pipeline = new EventPipeline(process.env.PERPLEXITY_API_KEY);
          result = await this.timeoutPromise(
            pipeline.collectEvents({
              category,
              location: TEST_CONFIG.location,
              dateRange: TEST_CONFIG.dateRange
            }),
            TEST_CONFIG.timeout
          );
          events = result.success ? result.events : [];
          break;

        case 'exa':
          result = await this.timeoutPromise(
            provider.searchEvents({
              category,
              location: TEST_CONFIG.location,
              limit: 20
            }),
            TEST_CONFIG.timeout
          );
          events = result.success ? result.events : [];
          break;

        case 'predicthq':
          result = await this.timeoutPromise(
            provider.searchEvents({
              category,
              location: TEST_CONFIG.location,
              dateRange: TEST_CONFIG.dateRange,
              limit: 20
            }),
            TEST_CONFIG.timeout
          );
          events = result.success ? result.events.map(e => provider.transformEvent(e, category)).filter(Boolean) : [];
          break;

        case 'serpapi':
          result = await this.timeoutPromise(
            provider.searchEvents({
              category,
              location: TEST_CONFIG.location,
              dateRange: TEST_CONFIG.dateRange,
              limit: 20
            }),
            TEST_CONFIG.timeout
          );
          events = result.success ? result.events : [];
          break;

        case 'apyflux':
          result = await this.timeoutPromise(
            provider.searchEvents({
              category,
              location: TEST_CONFIG.location,
              dateRange: TEST_CONFIG.dateRange,
              limit: 20
            }),
            TEST_CONFIG.timeout
          );
          events = result.success ? result.events : [];
          break;

        default:
          throw new Error(`Unknown provider: ${providerName}`);
      }

      const processingTime = Date.now() - testStart;

      // Analyze event quality
      const eventAnalysis = this.analyzeEvents(events, category);

      return {
        testId,
        success: true,
        processingTime,
        eventsFound: events.length,
        eventAnalysis,
        result: result || {},
        error: null,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const processingTime = Date.now() - testStart;
      
      return {
        testId,
        success: false,
        processingTime,
        eventsFound: 0,
        eventAnalysis: {
          validEvents: 0,
          categoryMatch: 0,
          completeness: 0,
          qualityScore: 0
        },
        result: {},
        error: {
          message: error.message,
          type: error.name,
          timeout: error.message.includes('timeout')
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Analyze event quality and completeness
   */
  analyzeEvents(events, category) {
    if (!events || events.length === 0) {
      return {
        validEvents: 0,
        categoryMatch: 0,
        completeness: 0,
        qualityScore: 0
      };
    }

    let validEvents = 0;
    let categoryMatches = 0;
    let completenessScores = [];

    events.forEach(event => {
      // Check if event has required fields
      const hasTitle = event.title && event.title.trim().length > 0;
      const hasVenue = event.venue && event.venue.trim().length > 0;
      const hasDate = event.startDate || event.date;
      
      if (hasTitle && hasVenue && hasDate) {
        validEvents++;
      }

      // Check category match (fuzzy matching)
      if (event.category && event.category.toLowerCase().includes(category.toLowerCase())) {
        categoryMatches++;
      }

      // Calculate completeness score (0-1)
      let completeness = 0;
      if (hasTitle) completeness += 0.3;
      if (hasVenue) completeness += 0.2;
      if (hasDate) completeness += 0.2;
      if (event.description) completeness += 0.1;
      if (event.eventUrl || event.ticketUrl) completeness += 0.1;
      if (event.location || event.address) completeness += 0.1;
      
      completenessScores.push(completeness);
    });

    const avgCompleteness = completenessScores.length > 0 
      ? completenessScores.reduce((a, b) => a + b, 0) / completenessScores.length 
      : 0;

    // Overall quality score (0-100)
    const qualityScore = Math.round(
      (validEvents / events.length) * 40 + // 40% for valid events
      (categoryMatches / events.length) * 30 + // 30% for category match
      avgCompleteness * 30 // 30% for data completeness
    );

    return {
      validEvents,
      categoryMatch: categoryMatches,
      completeness: Math.round(avgCompleteness * 100),
      qualityScore
    };
  }

  /**
   * Add timeout to promises to prevent hanging
   */
  timeoutPromise(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  /**
   * Run performance tests for all providers and categories
   */
  async runTests() {
    console.log('🚀 Starting Provider Performance Tests\n');
    console.log(`📍 Location: ${TEST_CONFIG.location}`);
    console.log(`📅 Date Range: ${TEST_CONFIG.dateRange}`);
    console.log(`📂 Categories: ${TEST_CONFIG.categories.join(', ')}`);
    console.log(`⏱️  Timeout: ${TEST_CONFIG.timeout}ms per test\n`);

    const providers = await this.initializeProviders();
    
    if (Object.keys(providers).length === 0) {
      console.log('❌ No providers available. Please check your API keys.');
      return;
    }

    // Test each provider across all categories
    for (const [providerName, provider] of Object.entries(providers)) {
      console.log(`🧪 Testing ${providerName.toUpperCase()}`);
      console.log('═'.repeat(50));

      const providerStart = Date.now();
      const providerResults = {
        provider: providerName,
        startTime: new Date().toISOString(),
        categories: {},
        summary: {
          totalTests: 0,
          successfulTests: 0,
          failedTests: 0,
          totalEvents: 0,
          totalTime: 0,
          avgTimePerTest: 0,
          avgEventsPerCategory: 0,
          avgQualityScore: 0
        }
      };

      for (const category of TEST_CONFIG.categories) {
        const testResult = await this.testProvider(providerName, provider, category);
        providerResults.categories[category] = testResult;
        providerResults.summary.totalTests++;
        
        if (testResult.success) {
          providerResults.summary.successfulTests++;
          providerResults.summary.totalEvents += testResult.eventsFound;
        } else {
          providerResults.summary.failedTests++;
        }

        // Status indicator
        const status = testResult.success ? '✅' : '❌';
        const events = testResult.eventsFound.toString().padStart(2, ' ');
        const time = `${testResult.processingTime}ms`.padStart(8, ' ');
        const quality = testResult.eventAnalysis.qualityScore.toString().padStart(3, ' ');
        
        console.log(`   ${status} ${category.padEnd(10)} │ ${events} events │ ${time} │ Q:${quality}`);
      }

      const providerTime = Date.now() - providerStart;
      providerResults.totalTime = providerTime;
      providerResults.endTime = new Date().toISOString();

      // Calculate provider summary
      providerResults.summary.totalTime = providerTime;
      providerResults.summary.avgTimePerTest = Math.round(providerTime / TEST_CONFIG.categories.length);
      providerResults.summary.avgEventsPerCategory = providerResults.summary.successfulTests > 0 
        ? Math.round(providerResults.summary.totalEvents / providerResults.summary.successfulTests)
        : 0;

      // Calculate average quality score
      const qualityScores = Object.values(providerResults.categories)
        .filter(r => r.success)
        .map(r => r.eventAnalysis.qualityScore);
      providerResults.summary.avgQualityScore = qualityScores.length > 0
        ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length)
        : 0;

      console.log(`\n📊 ${providerName.toUpperCase()} SUMMARY:`);
      console.log(`   ⏱️  Total Time: ${providerTime}ms (${Math.round(providerTime/1000)}s)`);
      console.log(`   ✅ Success Rate: ${providerResults.summary.successfulTests}/${providerResults.summary.totalTests} (${Math.round(providerResults.summary.successfulTests/providerResults.summary.totalTests*100)}%)`);  
      console.log(`   📊 Total Events: ${providerResults.summary.totalEvents}`);
      console.log(`   🎯 Avg Quality: ${providerResults.summary.avgQualityScore}/100`);
      console.log(`   📈 Avg Events/Category: ${providerResults.summary.avgEventsPerCategory}`);
      console.log();

      this.results.providers[providerName] = providerResults;
    }

    this.results.testEndTime = new Date().toISOString();
    this.results.totalTestTime = Date.now() - new Date(this.results.testStartTime).getTime();

    // Generate overall summary
    this.generateSummary();

    // Save results
    await this.saveResults();
  }

  /**
   * Generate overall test summary
   */
  generateSummary() {
    const providers = Object.values(this.results.providers);
    
    this.results.summary = {
      totalProviders: providers.length,
      totalTests: providers.reduce((sum, p) => sum + p.summary.totalTests, 0),
      totalSuccessfulTests: providers.reduce((sum, p) => sum + p.summary.successfulTests, 0),
      totalEvents: providers.reduce((sum, p) => sum + p.summary.totalEvents, 0),
      totalTestTime: this.results.totalTestTime,
      
      // Provider rankings
      rankings: {
        bySpeed: [...providers].sort((a, b) => a.summary.avgTimePerTest - b.summary.avgTimePerTest),
        byEventCount: [...providers].sort((a, b) => b.summary.totalEvents - a.summary.totalEvents),
        byQuality: [...providers].sort((a, b) => b.summary.avgQualityScore - a.summary.avgQualityScore),
        byReliability: [...providers].sort((a, b) => b.summary.successfulTests - a.summary.successfulTests)
      },

      // Category performance
      categoryPerformance: this.analyzeCategoryPerformance()
    };
  }

  /**
   * Analyze performance by category across all providers
   */
  analyzeCategoryPerformance() {
    const categoryStats = {};

    TEST_CONFIG.categories.forEach(category => {
      const categoryResults = Object.values(this.results.providers)
        .map(provider => provider.categories[category])
        .filter(result => result && result.success);

      categoryStats[category] = {
        totalTests: Object.keys(this.results.providers).length,
        successfulTests: categoryResults.length,
        successRate: Math.round((categoryResults.length / Object.keys(this.results.providers).length) * 100),
        totalEvents: categoryResults.reduce((sum, r) => sum + r.eventsFound, 0),
        avgEvents: categoryResults.length > 0 ? Math.round(categoryResults.reduce((sum, r) => sum + r.eventsFound, 0) / categoryResults.length) : 0,
        avgTime: categoryResults.length > 0 ? Math.round(categoryResults.reduce((sum, r) => sum + r.processingTime, 0) / categoryResults.length) : 0,
        avgQuality: categoryResults.length > 0 ? Math.round(categoryResults.reduce((sum, r) => sum + r.eventAnalysis.qualityScore, 0) / categoryResults.length) : 0
      };
    });

    return categoryStats;
  }

  /**
   * Save results to files
   */
  async saveResults() {
    try {
      // Save detailed JSON report
      fs.writeFileSync(REPORT_FILE, JSON.stringify(this.results, null, 2));
      console.log(`📄 Detailed report saved: ${REPORT_FILE}`);

      // Generate and save human-readable summary
      const summary = this.generateTextSummary();
      fs.writeFileSync(SUMMARY_FILE, summary);
      console.log(`📋 Summary report saved: ${SUMMARY_FILE}`);

    } catch (error) {
      console.error('❌ Error saving results:', error.message);
    }
  }

  /**
   * Generate human-readable text summary
   */
  generateTextSummary() {
    const { summary, providers } = this.results;
    
    let text = `
PROVIDER PERFORMANCE TEST REPORT
===============================================
Test Date: ${new Date(this.results.testStartTime).toLocaleString()}
Location: ${TEST_CONFIG.location}
Date Range: ${TEST_CONFIG.dateRange}
Total Test Time: ${Math.round(summary.totalTestTime / 1000)}s

OVERALL STATISTICS
------------------
Total Providers Tested: ${summary.totalProviders}
Total Tests Executed: ${summary.totalTests}
Total Successful Tests: ${summary.totalSuccessfulTests}
Overall Success Rate: ${Math.round((summary.totalSuccessfulTests / summary.totalTests) * 100)}%
Total Events Found: ${summary.totalEvents}

PROVIDER RANKINGS
-----------------

🏃 FASTEST PROVIDERS (Avg Time per Test):
`;

    summary.rankings.bySpeed.forEach((provider, index) => {
      text += `${index + 1}. ${provider.provider.toUpperCase().padEnd(12)} - ${provider.summary.avgTimePerTest}ms\n`;
    });

    text += `\n📊 MOST EVENTS FOUND:
`;
    summary.rankings.byEventCount.forEach((provider, index) => {
      text += `${index + 1}. ${provider.provider.toUpperCase().padEnd(12)} - ${provider.summary.totalEvents} events\n`;
    });

    text += `\n🎯 HIGHEST QUALITY SCORES:
`;
    summary.rankings.byQuality.forEach((provider, index) => {
      text += `${index + 1}. ${provider.provider.toUpperCase().padEnd(12)} - ${provider.summary.avgQualityScore}/100\n`;
    });

    text += `\n✅ MOST RELIABLE:
`;
    summary.rankings.byReliability.forEach((provider, index) => {
      const successRate = Math.round((provider.summary.successfulTests / provider.summary.totalTests) * 100);
      text += `${index + 1}. ${provider.provider.toUpperCase().padEnd(12)} - ${provider.summary.successfulTests}/${provider.summary.totalTests} (${successRate}%)\n`;
    });

    text += `\nCATEGORY PERFORMANCE
--------------------
`;
    Object.entries(summary.categoryPerformance).forEach(([category, stats]) => {
      text += `${category.toUpperCase().padEnd(10)} │ Success: ${stats.successRate}% │ Avg Events: ${stats.avgEvents} │ Avg Time: ${stats.avgTime}ms │ Avg Quality: ${stats.avgQuality}/100\n`;
    });

    text += `\nDETAILED PROVIDER RESULTS
-------------------------
`;

    Object.entries(providers).forEach(([providerName, providerData]) => {
      text += `\n${providerName.toUpperCase()}
${'='.repeat(providerName.length + 1)}
Total Time: ${Math.round(providerData.totalTime / 1000)}s
Success Rate: ${Math.round((providerData.summary.successfulTests / providerData.summary.totalTests) * 100)}%
Total Events: ${providerData.summary.totalEvents}
Average Quality Score: ${providerData.summary.avgQualityScore}/100

Category Breakdown:
`;

      Object.entries(providerData.categories).forEach(([category, result]) => {
        const status = result.success ? '✅' : '❌';
        const error = result.error ? ` (${result.error.message})` : '';
        text += `  ${status} ${category.padEnd(10)} │ ${result.eventsFound.toString().padStart(2)} events │ ${result.processingTime.toString().padStart(5)}ms │ Q:${result.eventAnalysis.qualityScore.toString().padStart(3)}${error}\n`;
      });
    });

    text += `\nRECOMMENDATIONS
--------------
`;

    // Generate recommendations based on results
    const fastestProvider = summary.rankings.bySpeed[0];
    const mostEventsProvider = summary.rankings.byEventCount[0];
    const highestQualityProvider = summary.rankings.byQuality[0];

    text += `• For SPEED: Use ${fastestProvider.provider.toUpperCase()} (${fastestProvider.summary.avgTimePerTest}ms avg)\n`;
    text += `• For EVENT COUNT: Use ${mostEventsProvider.provider.toUpperCase()} (${mostEventsProvider.summary.totalEvents} total events)\n`;
    text += `• For QUALITY: Use ${highestQualityProvider.provider.toUpperCase()} (${highestQualityProvider.summary.avgQualityScore}/100 quality score)\n`;

    // Category-specific recommendations
    const problematicCategories = Object.entries(summary.categoryPerformance)
      .filter(([_, stats]) => stats.successRate < 50)
      .map(([category, _]) => category);

    if (problematicCategories.length > 0) {
      text += `• PROBLEMATIC CATEGORIES: ${problematicCategories.join(', ')} - consider alternative data sources\n`;
    }

    text += `\nGenerated: ${new Date().toLocaleString()}
`;

    return text;
  }
}

// Run the tests
async function main() {
  const tester = new ProviderPerformanceTester();
  
  try {
    await tester.runTests();
    console.log('\n🎉 Performance testing completed successfully!');
    console.log(`📊 Check the reports in the outputs/ directory`);
  } catch (error) {
    console.error('\n❌ Performance testing failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Test interrupted by user');
  process.exit(0);
});

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}