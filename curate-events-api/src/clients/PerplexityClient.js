/**
 * PerplexityClient.js
 * 
 * Direct API wrapper for Perplexity AI using proven patterns that return 30+ events.
 * Based on successful test-python-replication.js that returned 29 events consistently.
 */

import fetch from 'node-fetch';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PerplexityClient');

export class PerplexityClient {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Perplexity API key is required');
    }
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.perplexity.ai/chat/completions';
    
    // Default parameters that proved successful in testing
    this.defaults = {
      model: 'sonar-reasoning',
      max_tokens: 8000,
      temperature: 0.1
    };
  }

  /**
   * Query Perplexity API using exact patterns from successful tests
   * @param {string} prompt - The query prompt
   * @param {object} options - Optional parameters to override defaults
   * @returns {Promise<object>} API response with content and metadata
   */
  async query(prompt, options = {}) {
    const startTime = Date.now();
    
    // Use exact payload structure from working test
    const payload = {
      model: options.model || this.defaults.model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: options.max_tokens || this.defaults.max_tokens,
      temperature: options.temperature || this.defaults.temperature
    };

    logger.info(`Querying Perplexity API`, {
      model: payload.model,
      promptLength: prompt.length,
      maxTokens: payload.max_tokens
    });

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      logger.info(`API response received`, {
        status: response.status,
        statusText: response.statusText
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Perplexity API error`, {
          status: response.status,
          error: errorText
        });
        throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
      }

      // Handle streaming response properly - critical for getting full content
      const responseText = await response.text();
      const data = JSON.parse(responseText);
      
      const content = data.choices[0].message.content;
      const processingTime = Date.now() - startTime;

      logger.info(`API query completed`, {
        contentLength: content.length,
        processingTime: `${processingTime}ms`,
        usage: data.usage || 'not provided'
      });

      // Log first 500 chars for debugging (like successful test)
      logger.debug(`Response preview`, {
        preview: content.substring(0, 500),
        totalLength: content.length
      });

      return {
        content,
        contentLength: content.length,
        processingTime,
        usage: data.usage,
        model: payload.model,
        success: true
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error(`Perplexity API query failed`, {
        error: error.message,
        processingTime: `${processingTime}ms`,
        prompt: prompt.substring(0, 200)
      });

      throw new Error(`Failed to query Perplexity API: ${error.message}`);
    }
  }

  /**
   * Test API connectivity and validate response format using EventParser
   * @returns {Promise<object>} Test results
   */
  async testConnection() {
    const testPrompt = "get me a list of all the theatre events playing in the bay area over the next 30 days";
    
    logger.info('Testing Perplexity API connection with proven prompt');
    
    try {
      const result = await this.query(testPrompt);
      
      // Use EventParser for accurate event detection
      const { EventParser } = await import('../parsers/EventParser.js');
      const parser = new EventParser();
      
      // Parse events using the same logic as the main system
      const events = parser.parseResponse(result.content, 'theatre', 'San Francisco, CA');
      
      // Analyze content for debugging
      const analysis = parser.analyzeContent(result.content);
      
      const testResults = {
        success: true,
        contentLength: result.contentLength,
        eventPatterns: events.length,
        eventsFound: events.length,
        processingTime: result.processingTime,
        expectedEvents: 30, // Based on successful tests
        meetsExpectation: events.length >= 20, // More realistic expectation
        analysis: analysis,
        sampleEvents: events.slice(0, 3).map(e => ({ title: e.title, venue: e.venue }))
      };

      logger.info(`Connection test completed`, testResults);
      
      return testResults;

    } catch (error) {
      logger.error(`Connection test failed`, { error: error.message });
      
      return {
        success: false,
        error: error.message,
        contentLength: 0,
        eventPatterns: 0,
        eventsFound: 0,
        meetsExpectation: false
      };
    }
  }
}

export default PerplexityClient;