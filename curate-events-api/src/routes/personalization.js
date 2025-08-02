/**
 * =============================================================================
 * SCRIPT NAME: personalization.js
 * =============================================================================
 * 
 * INPUT FILES:
 * - curation_prompt_[timestamp].json: User preferences and curation parameters
 * - user_preferences_[timestamp].json: User profile data
 * 
 * OUTPUT FILES:
 * - personalized_events_[timestamp].json: Curated events for user
 * - curation_report_[timestamp].json: Detailed curation analysis and reasoning
 * 
 * DESCRIPTION:
 * Express routes for personalized event curation based on user input processor output.
 * Integrates user preferences with existing event collection pipeline.
 * 
 * ENDPOINTS:
 * - POST /api/personalization/curate - Process user preferences and curate events
 * - POST /api/personalization/feedback - Handle user feedback on recommendations
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-08-01
 * AUTHOR: Arjun Divecha
 * =============================================================================
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { EventPipeline } from '../pipeline/EventPipeline.js';
import { CategoryManager } from '../managers/CategoryManager.js';
import { ApyfluxClient } from '../clients/ApyfluxClient.js';
import { PredictHQClient } from '../clients/PredictHQClient.js';
import { EventDeduplicator } from '../utils/eventDeduplicator.js';
import { createLogger, logRequest, logResponse } from '../utils/logger.js';
import { config } from '../utils/config.js';

const router = express.Router();
const logger = createLogger('PersonalizationRoute');

// Initialize clients
const eventPipeline = new EventPipeline(config.perplexityApiKey);
const categoryManager = new CategoryManager();
const apyfluxClient = new ApyfluxClient();
const predictHQClient = new PredictHQClient(config.predictHQApiKey);
const deduplicator = new EventDeduplicator();

/**
 * PersonalizationEngine class handles the core personalization logic
 */
class PersonalizationEngine {
  constructor() {
    this.outputDir = path.join(process.cwd(), 'personalization_outputs');
    this.ensureOutputDir();
  }

  async ensureOutputDir() {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      logger.warn('Could not create output directory', { error: error.message });
    }
  }

  /**
   * Process user curation prompt and generate personalized event recommendations
   */
  async processUserCurationPrompt(curationPrompt) {
    const startTime = Date.now();
    const sessionId = curationPrompt.metadata?.user_session_id || `session_${Date.now()}`;
    
    logger.info('Starting personalized curation', {
      sessionId,
      location: curationPrompt.user_profile?.location?.primary_location,
      interestCount: Object.keys(curationPrompt.user_profile?.interests || {}).length
    });

    try {
      // Extract user preferences
      const userProfile = curationPrompt.user_profile;
      const curationParams = curationPrompt.curation_parameters;
      
      // Build comprehensive search strategy based on user interests
      const searchStrategy = this.buildSearchStrategy(userProfile, curationParams);
      
      // Collect events from multiple sources based on user preferences
      const eventCollectionResults = await this.collectPersonalizedEvents(searchStrategy);
      
      // Apply AI-powered personalization and ranking
      const personalizedEvents = await this.applyPersonalization(
        eventCollectionResults, 
        userProfile, 
        curationParams
      );
      
      // Generate curation report with reasoning
      const curationReport = this.generateCurationReport(
        personalizedEvents,
        eventCollectionResults,
        userProfile,
        curationParams,
        Date.now() - startTime
      );
      
      // Save outputs
      const outputFiles = await this.savePersonalizationOutputs(
        sessionId,
        personalizedEvents,
        curationReport,
        userProfile
      );
      
      logger.info('Personalized curation completed', {
        sessionId,
        eventsFound: personalizedEvents.length,
        processingTime: `${Date.now() - startTime}ms`,
        outputFiles: outputFiles.length
      });

      return {
        success: true,
        sessionId,
        events: personalizedEvents,
        curationReport,
        outputFiles,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      logger.error('Personalization processing failed', {
        sessionId,
        error: error.message,
        stack: error.stack,
        processingTime: `${Date.now() - startTime}ms`
      });
      
      throw error;
    }
  }

  /**
   * Build search strategy based on user preferences
   */
  buildSearchStrategy(userProfile, curationParams) {
    const location = userProfile.location?.primary_location || 'San Francisco, CA';
    const radiusMiles = userProfile.location?.radius_miles || 25;
    const interests = userProfile.interests || {};
    const timePrefs = userProfile.time_preferences || {};
    const additionalPrefs = userProfile.additional_preferences || {};
    
    // Sort interests by rating to prioritize searches
    const sortedInterests = Object.entries(interests)
      .sort(([,a], [,b]) => b - a)
      .filter(([,rating]) => rating >= 2.0); // Only include interests rated 2.0+
    
    // Build date range based on user preferences
    const advanceNoticeDays = timePrefs.advance_notice_days || 7;
    const dateRange = this.buildDateRange(advanceNoticeDays, timePrefs);
    
    // Determine event limit based on curation parameters
    const maxEvents = curationParams.max_events_per_week || 15;
    const eventsPerCategory = Math.ceil(maxEvents / Math.max(sortedInterests.length, 1));
    
    return {
      location,
      radiusMiles,
      dateRange,
      sortedInterests,
      timePreferences: timePrefs,
      additionalPreferences: additionalPrefs,
      curationParameters: curationParams,
      eventsPerCategory: Math.min(eventsPerCategory, 8), // Cap per category
      totalEventLimit: maxEvents * 2 // Collect more for better filtering
    };
  }

  /**
   * Build date range string based on user preferences
   */
  buildDateRange(advanceNoticeDays, timePrefs) {
    const now = new Date();
    const endDate = new Date(now.getTime() + (advanceNoticeDays * 24 * 60 * 60 * 1000));
    
    const preferredDays = timePrefs.preferred_days || ['weekdays', 'weekends'];
    const preferredTimes = timePrefs.preferred_times || ['evening'];
    
    // Build natural language date range
    let dateRange = `next ${advanceNoticeDays} days`;
    
    if (preferredDays.length === 1) {
      if (preferredDays[0] === 'weekends') {
        dateRange += ', weekends only';
      } else if (preferredDays[0] === 'weekdays') {
        dateRange += ', weekdays only';
      }
    }
    
    if (preferredTimes.length === 1) {
      dateRange += `, ${preferredTimes[0]} events`;
    }
    
    return dateRange;
  }

  /**
   * Collect events from multiple sources based on search strategy
   */
  async collectPersonalizedEvents(searchStrategy) {
    const { location, sortedInterests, dateRange, eventsPerCategory } = searchStrategy;
    
    logger.info('Collecting personalized events', {
      location,
      categories: sortedInterests.map(([cat, rating]) => `${cat}(${rating})`),
      dateRange,
      eventsPerCategory
    });

    const allEventCollections = [];
    
    // Collect events for each interest category
    for (const [category, rating] of sortedInterests) {
      try {
        logger.info(`Collecting events for category: ${category} (rating: ${rating})`);
        
        // Adjust collection intensity based on user interest rating
        const categoryLimit = Math.ceil(eventsPerCategory * (rating / 5.0));
        
        // Collect from multiple sources in parallel
        const [perplexityResult, apyfluxResult] = await Promise.allSettled([
          this.collectFromPerplexity(category, location, dateRange, categoryLimit, searchStrategy),
          this.collectFromApyflux(category, location, dateRange, categoryLimit, searchStrategy)
        ]);
        
        // Process results
        const categoryResults = {
          category,
          userRating: rating,
          sources: {
            perplexity: this.processSourceResult(perplexityResult, 'perplexity'),
            apyflux: this.processSourceResult(apyfluxResult, 'apyflux')
          }
        };
        
        allEventCollections.push(categoryResults);
        
      } catch (error) {
        logger.error(`Error collecting events for category ${category}`, {
          category,
          error: error.message
        });
      }
    }
    
    return allEventCollections;
  }

  /**
   * Collect events from Perplexity via EventPipeline
   */
  async collectFromPerplexity(category, location, dateRange, limit, searchStrategy) {
    const additionalContext = this.buildPerplexityContext(searchStrategy);
    
    return await eventPipeline.collectEvents({
      category,
      location,
      dateRange,
      options: {
        limit,
        minConfidence: searchStrategy.curationParameters?.quality_threshold || 0.7,
        maxTokens: config.perplexity.maxTokens,
        temperature: config.perplexity.temperature,
        additionalContext
      }
    });
  }

  /**
   * Build additional context for Perplexity based on user preferences
   */
  buildPerplexityContext(searchStrategy) {
    const { additionalPreferences, timePreferences } = searchStrategy;
    const contextParts = [];
    
    // Price preferences
    if (additionalPreferences.price_preference) {
      const priceInfo = additionalPreferences.price_preference;
      if (priceInfo.preference === 'free') {
        contextParts.push('Focus on free events only');
      } else if (priceInfo.max) {
        contextParts.push(`Prefer events under $${priceInfo.max}`);
      }
    }
    
    // Time preferences
    if (timePreferences.preferred_times) {
      contextParts.push(`Prefer ${timePreferences.preferred_times.join(' or ')} events`);
    }
    
    return contextParts.join('. ');
  }

  /**
   * Collect events from Apyflux
   */
  async collectFromApyflux(category, location, dateRange, limit, searchStrategy) {
    const query = apyfluxClient.buildSearchQuery(category, location);
    
    return await apyfluxClient.searchEvents({
      query,
      location,
      category,
      dateRange,
      limit
    });
  }

  /**
   * Process source result from Promise.allSettled
   */
  processSourceResult(result, sourceName) {
    if (result.status === 'fulfilled' && result.value.success) {
      return {
        success: true,
        events: result.value.events || [],
        count: result.value.events?.length || 0,
        processingTime: result.value.processingTime
      };
    } else {
      return {
        success: false,
        events: [],
        count: 0,
        error: result.reason?.message || result.value?.error || 'Unknown error'
      };
    }
  }

  /**
   * Apply AI-powered personalization and ranking to collected events
   */
  async applyPersonalization(eventCollectionResults, userProfile, curationParams) {
    logger.info('Applying personalization to collected events');
    
    // Flatten all events from all sources and categories
    const allEvents = [];
    const eventMetadata = new Map();
    
    for (const categoryResult of eventCollectionResults) {
      const { category, userRating, sources } = categoryResult;
      
      for (const [sourceName, sourceResult] of Object.entries(sources)) {
        if (sourceResult.success && sourceResult.events) {
          for (const event of sourceResult.events) {
            // Add metadata for personalization scoring
            const eventId = this.generateEventId(event);
            eventMetadata.set(eventId, {
              category,
              userRating,
              source: sourceName,
              originalIndex: allEvents.length
            });
            
            // Add personalization metadata to event
            event._personalization = {
              category,
              userRating,
              source: sourceName,
              eventId
            };
            
            allEvents.push(event);
          }
        }
      }
    }
    
    logger.info(`Personalizing ${allEvents.length} events`);
    
    // Deduplicate events
    const deduplicatedEvents = deduplicator.deduplicateEvents([{ events: allEvents }]);
    
    // Score and rank events based on user preferences
    const scoredEvents = this.scoreEventsForUser(deduplicatedEvents, userProfile, eventMetadata);
    
    // Apply quality threshold
    const qualityThreshold = curationParams.quality_threshold || 0.7;
    const qualityFilteredEvents = scoredEvents.filter(event => 
      event._personalization.personalizedScore >= qualityThreshold
    );
    
    // Limit to max events per week
    const maxEvents = curationParams.max_events_per_week || 15;
    const finalEvents = qualityFilteredEvents.slice(0, maxEvents);
    
    logger.info('Personalization complete', {
      originalEvents: allEvents.length,
      afterDeduplication: deduplicatedEvents.length,
      afterQualityFilter: qualityFilteredEvents.length,
      finalCount: finalEvents.length
    });
    
    return finalEvents;
  }

  /**
   * Generate unique event ID for deduplication and tracking
   */
  generateEventId(event) {
    const title = event.title || event.name || '';
    const date = event.date || event.startDate || '';
    const venue = event.venue || event.location || '';
    
    return `${title}_${date}_${venue}`.toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 50);
  }

  /**
   * Score events based on user preferences
   */
  scoreEventsForUser(events, userProfile, eventMetadata) {
    const interests = userProfile.interests || {};
    const timePrefs = userProfile.time_preferences || {};
    const additionalPrefs = userProfile.additional_preferences || {};
    
    return events.map(event => {
      let score = 0;
      const scoring = { breakdown: {} };
      
      // Base score from user interest rating
      const metadata = eventMetadata.get(event._personalization?.eventId);
      if (metadata) {
        const categoryScore = (metadata.userRating / 5.0) * 0.6; // 60% weight
        score += categoryScore;
        scoring.breakdown.categoryInterest = categoryScore;
      }
      
      // Time preference scoring
      const timeScore = this.scoreEventTime(event, timePrefs) * 0.2; // 20% weight
      score += timeScore;
      scoring.breakdown.timePreference = timeScore;
      
      // Price preference scoring
      const priceScore = this.scoreEventPrice(event, additionalPrefs) * 0.2; // 20% weight
      score += priceScore;
      scoring.breakdown.pricePreference = priceScore;
      
      // Ensure score is between 0 and 1
      score = Math.max(0, Math.min(1, score));
      
      // Add personalization data to event
      event._personalization = {
        ...event._personalization,
        personalizedScore: score,
        scoring
      };
      
      return event;
    }).sort((a, b) => b._personalization.personalizedScore - a._personalization.personalizedScore);
  }

  /**
   * Score event based on time preferences
   */
  scoreEventTime(event, timePrefs) {
    const preferredTimes = timePrefs.preferred_times || ['evening'];
    let timeScore = 0.5; // Base score
    
    // Check if event description mentions preferred times
    const eventText = `${event.title || ''} ${event.description || ''}`.toLowerCase();
    
    for (const timeSlot of preferredTimes) {
      if (eventText.includes(timeSlot)) {
        timeScore += 0.3;
      }
    }
    
    return Math.min(1, timeScore);
  }

  /**
   * Score event based on price preferences
   */
  scoreEventPrice(event, additionalPrefs) {
    const priceInfo = additionalPrefs.price_preference;
    if (!priceInfo) return 0.5;
    
    const eventText = `${event.title || ''} ${event.description || ''} ${event.price || ''}`.toLowerCase();
    
    if (priceInfo.preference === 'free') {
      if (eventText.includes('free') || eventText.includes('no cost')) {
        return 1.0;
      }
      return 0.2; // Penalize non-free events if user wants free
    }
    
    return 0.5; // Default if can't determine price
  }

  /**
   * Generate comprehensive curation report
   */
  generateCurationReport(personalizedEvents, eventCollectionResults, userProfile, curationParams, processingTime) {
    const report = {
      metadata: {
        generated_at: new Date().toISOString(),
        processing_time_ms: processingTime,
        user_session_id: curationParams.metadata?.user_session_id
      },
      user_profile_summary: {
        location: userProfile.location?.primary_location,
        radius_miles: userProfile.location?.radius_miles,
        top_interests: Object.entries(userProfile.interests || {})
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([category, rating]) => ({ category, rating })),
        time_preferences: userProfile.time_preferences,
        price_preference: userProfile.additional_preferences?.price_preference?.preference
      },
      curation_results: {
        total_events_collected: eventCollectionResults.reduce((sum, cat) => {
          return sum + Object.values(cat.sources).reduce((sourceSum, source) => {
            return sourceSum + (source.count || 0);
          }, 0);
        }, 0),
        events_after_personalization: personalizedEvents.length,
        quality_threshold_applied: curationParams.quality_threshold
      },
      personalization_insights: this.generatePersonalizationInsights(personalizedEvents, userProfile)
    };
    
    return report;
  }

  /**
   * Generate insights about the personalization process
   */
  generatePersonalizationInsights(personalizedEvents, userProfile) {
    const categoryDistribution = {};
    const scoreDistribution = { high: 0, medium: 0, low: 0 };
    
    for (const event of personalizedEvents) {
      const category = event._personalization?.category || 'unknown';
      categoryDistribution[category] = (categoryDistribution[category] || 0) + 1;
      
      const score = event._personalization?.personalizedScore || 0;
      if (score >= 0.8) scoreDistribution.high++;
      else if (score >= 0.6) scoreDistribution.medium++;
      else scoreDistribution.low++;
    }
    
    return {
      category_distribution: categoryDistribution,
      score_distribution: scoreDistribution,
      average_personalization_score: personalizedEvents.reduce((sum, event) => 
        sum + (event._personalization?.personalizedScore || 0), 0) / personalizedEvents.length || 0
    };
  }

  /**
   * Save personalization outputs to files
   */
  async savePersonalizationOutputs(sessionId, personalizedEvents, curationReport, userProfile) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFiles = [];
    
    try {
      // Save personalized events
      const eventsFile = path.join(this.outputDir, `personalized_events_${sessionId}_${timestamp}.json`);
      await fs.writeFile(eventsFile, JSON.stringify({
        session_id: sessionId,
        generated_at: new Date().toISOString(),
        events: personalizedEvents,
        count: personalizedEvents.length
      }, null, 2));
      outputFiles.push(eventsFile);
      
      // Save curation report
      const reportFile = path.join(this.outputDir, `curation_report_${sessionId}_${timestamp}.json`);
      await fs.writeFile(reportFile, JSON.stringify(curationReport, null, 2));
      outputFiles.push(reportFile);
      
      logger.info('Personalization outputs saved', {
        sessionId,
        outputFiles: outputFiles.length
      });
      
    } catch (error) {
      logger.error('Error saving personalization outputs', {
        sessionId,
        error: error.message
      });
    }
    
    return outputFiles;
  }
}

// Initialize personalization engine
const personalizationEngine = new PersonalizationEngine();

/**
 * POST /api/personalization/curate
 * Process user curation prompt and return personalized events
 */
router.post('/curate', async (req, res) => {
  const startTime = Date.now();
  logRequest(logger, req, 'personalizedCuration');
  
  try {
    const curationPrompt = req.body;
    
    // Validate required fields
    if (!curationPrompt.user_profile) {
      return res.status(400).json({
        success: false,
        error: 'Missing user_profile in curation prompt',
        timestamp: new Date().toISOString()
      });
    }
    
    if (!curationPrompt.user_profile.location?.primary_location) {
      return res.status(400).json({
        success: false,
        error: 'Missing primary_location in user profile',
        timestamp: new Date().toISOString()
      });
    }
    
    // Process the curation request
    const result = await personalizationEngine.processUserCurationPrompt(curationPrompt);
    
    const duration = Date.now() - startTime;
    
    const response = {
      success: true,
      sessionId: result.sessionId,
      events: result.events,
      count: result.events.length,
      curationReport: result.curationReport,
      outputFiles: result.outputFiles,
      processingTime: duration,
      timestamp: new Date().toISOString()
    };
    
    logResponse(logger, res, 'personalizedCuration', duration);
    res.json(response);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Error in personalized curation', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      duration: `${duration}ms`
    });
    
    res.status(500).json({
      success: false,
      error: 'Internal server error during personalized curation',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/personalization/feedback
 * Handle user feedback on event recommendations
 */
router.post('/feedback', async (req, res) => {
  const startTime = Date.now();
  logRequest(logger, req, 'userFeedback');
  
  try {
    const { sessionId, eventId, feedback, rating } = req.body;
    
    // Validate required fields
    if (!sessionId || !eventId || !feedback) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sessionId, eventId, feedback',
        timestamp: new Date().toISOString()
      });
    }
    
    // Log feedback for future learning
    logger.info('User feedback received', {
      sessionId,
      eventId,
      feedback,
      rating,
      timestamp: new Date().toISOString()
    });
    
    // In a production system, you would store this feedback for ML training
    // For now, we'll just acknowledge receipt
    
    const duration = Date.now() - startTime;
    
    res.json({
      success: true,
      message: 'Feedback received and logged',
      sessionId,
      eventId,
      processingTime: duration,
      timestamp: new Date().toISOString()
    });
    
    logResponse(logger, res, 'userFeedback', duration);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Error processing user feedback', {
      error: error.message,
      body: req.body,
      duration: `${duration}ms`
    });
    
    res.status(500).json({
      success: false,
      error: 'Internal server error processing feedback',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
