import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1'

/**
=============================================================================
COLLECTION ORCHESTRATOR - SUPABASE EDGE FUNCTION
=============================================================================

PURPOSE:
Master orchestration function that coordinates data collection from all
configured event sources. Implements intelligent scheduling, error handling,
deduplication, and quality management across the entire system.

INPUT:
- Collection mode (full, incremental, or specific sources)
- Location and preference filters
- Quality thresholds and collection limits

OUTPUT:
- Coordinated event collection across all active sources
- Master collection run tracking and analytics
- System health monitoring and reporting

DEPENDENCIES:
- All individual collector functions (eventbrite, ticketmaster, etc.)
- Enhanced events table schema with deduplication
- event_sources management table
- AI deduplication engine (when available)

USAGE:
- Scheduled via cron for regular collection runs
- Manual trigger for immediate collection
- Testing and monitoring interface

NOTES:
- Implements circuit breaker pattern for failed services
- Manages rate limits across all sources
- Provides comprehensive error recovery
- Tracks system performance and success rates
- Supports incremental and full collection modes

VERSION: 1.0
LAST UPDATED: 2025-07-28
AUTHOR: Claude Code Implementation
=============================================================================
*/

interface CollectionResult {
  sourceId: string;
  sourceName: string;
  success: boolean;
  eventsFound: number;
  eventsNew: number;
  eventsUpdated: number;
  executionTimeMs: number;
  error?: string;
  collectionRunId?: string;
}

interface CollectionSummary {
  totalSources: number;
  successfulSources: number;
  failedSources: number;
  totalEventsFound: number;
  totalEventsNew: number;
  totalEventsUpdated: number;
  totalExecutionTimeMs: number;
  qualityScore: number;
  successRate: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const { 
      mode = 'incremental', // full, incremental, or specific
      location = 'San Francisco, CA',  
      categories = ['music', 'arts', 'technology'],
      sources = [], // specific sources to run, empty = all enabled
      limits = { eventbrite: 50, ticketmaster: 100, brave: 15 },
      qualityThreshold = 5
    } = await req.json();
    
    console.log('🎭 Starting collection orchestration...');
    console.log(`📍 Location: ${location}`);
    console.log(`🎯 Mode: ${mode}`);
    console.log(`📂 Categories: ${categories.join(', ')}`);
    
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required Supabase environment variables');
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const startTime = Date.now();

    // Get active event sources
    let sourcesQuery = supabase
      .from('event_sources')
      .select('*')
      .eq('enabled', true)
      .order('priority', { ascending: false });

    if (sources.length > 0) {
      sourcesQuery = sourcesQuery.in('name', sources);
    }

    const { data: eventSources, error: sourcesError } = await sourcesQuery;

    if (sourcesError) {
      console.error('❌ Error fetching event sources:', sourcesError);
      throw new Error('Failed to fetch event sources');
    }

    if (!eventSources || eventSources.length === 0) {
      throw new Error('No active event sources found. Please check your configuration.');
    }

    console.log(`📊 Found ${eventSources.length} active event sources`);

    // Generate a simple run ID for tracking (without collection_runs table)
    const masterRunId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('🚀 Starting master collection run:', masterRunId);

    // Execute collection from all sources
    const collectionResults: CollectionResult[] = [];
    
    for (const source of eventSources) {
      console.log(`\n🔄 Processing source: ${source.name} (${source.source_type})`);
      
      try {
        // Check if source should be skipped due to circuit breaker
        if (shouldSkipSource(source)) {
          console.log(`⏭️ Skipping ${source.name} due to circuit breaker`);
          collectionResults.push({
            sourceId: source.id,
            sourceName: source.name,
            success: false,
            eventsFound: 0,
            eventsNew: 0,
            eventsUpdated: 0,
            executionTimeMs: 0,
            error: 'Skipped due to circuit breaker (too many recent failures)'
          });
          continue;
        }

        const result = await collectFromSource(
          source, 
          location, 
          categories, 
          limits[source.name.toLowerCase().split(' ')[0]] || 50,
          supabase
        );

        collectionResults.push(result);

        // Small delay between sources to manage rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (sourceError) {
        console.error(`❌ Error collecting from ${source.name}:`, sourceError);
        
        collectionResults.push({
          sourceId: source.id,
          sourceName: source.name,
          success: false,
          eventsFound: 0,
          eventsNew: 0,
          eventsUpdated: 0,
          executionTimeMs: 0,
          error: sourceError.message
        });

        // Update source error count
        await updateSourceStats(source.id, false, supabase);
      }
    }

    // Calculate summary statistics
    const summary = calculateSummary(collectionResults);
    const totalExecutionTime = Date.now() - startTime;

    console.log('\n📈 Collection Summary:');
    console.log(`✅ Success Rate: ${(summary.successRate * 100).toFixed(1)}%`);
    console.log(`📊 Total Events Found: ${summary.totalEventsFound}`);
    console.log(`🆕 New Events: ${summary.totalEventsNew}`);
    console.log(`🔄 Updated Events: ${summary.totalEventsUpdated}`);
    console.log(`⏱️ Total Execution Time: ${totalExecutionTime}ms`);

    console.log(`✅ Master collection run ${masterRunId} completed`);

    // Perform deduplication if we have new events
    if (summary.totalEventsNew > 0) {
      console.log('\n🔍 Starting deduplication process...');
      try {
        const deduplicationStats = await performDeduplication(supabase, qualityThreshold);
        console.log(`✨ Deduplication completed: ${deduplicationStats.duplicatesFound} duplicates found`);
      } catch (dedupError) {
        console.error('⚠️ Deduplication failed:', dedupError);
        // Don't fail the entire collection for deduplication errors
      }
    }

    // Return comprehensive results
    return new Response(
      JSON.stringify({ 
        success: true,
        masterCollectionRunId: masterRunId,
        summary,
        results: collectionResults,
        executionTimeMs: totalExecutionTime,
        message: `Collection completed with ${(summary.successRate * 100).toFixed(1)}% success rate. Found ${summary.totalEventsNew} new events.`,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      }
    );

  } catch (error) {
    console.error('❌ Error in collection orchestrator:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      }
    );
  }
});

function shouldSkipSource(source: any): boolean {
  // Circuit breaker logic: skip if error rate is too high
  const errorRate = source.error_count / Math.max(1, source.total_events_collected || 1);
  const recentFailures = source.error_count > 5 && source.success_rate < 0.3;
  
  // Skip if last run was less than 30 minutes ago and had errors
  const lastRun = source.last_run ? new Date(source.last_run).getTime() : 0;
  const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
  const recentRun = lastRun > thirtyMinutesAgo;
  
  return recentFailures && recentRun;
}

async function collectFromSource(
  source: any,
  location: string,
  categories: string[],
  limit: number,
  supabase: any
): Promise<CollectionResult> {
  const sourceStartTime = Date.now();
  
  try {
    let result: any = {};

    // Call appropriate collector based on source type and name
    if (source.name.includes('Eventbrite')) {
      // Eventbrite public search API is deprecated as of 2024
      throw new Error('Eventbrite public search API has been deprecated and is no longer available');
    } else if (source.name.includes('Ticketmaster')) {
      result = await callTicketmasterCollector(location, categories, limit);
    } else if (source.source_type === 'api' && source.name.includes('Brave')) {
      result = await callBraveCollector(location, categories, limit);
    } else {
      throw new Error(`No collector implemented for source: ${source.name}`);
    }

    const executionTime = Date.now() - sourceStartTime;

    if (result.success) {
      // Update source success stats
      await updateSourceStats(source.id, true, supabase);

      return {
        sourceId: source.id,
        sourceName: source.name,
        success: true,
        eventsFound: result.stats?.totalFound || result.events?.length || 0,
        eventsNew: result.stats?.newEvents || 0,
        eventsUpdated: result.stats?.updated || 0,
        executionTimeMs: executionTime,
        collectionRunId: result.collectionRunId
      };
    } else {
      throw new Error(result.error || 'Unknown error from collector');
    }

  } catch (error) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      success: false,
      eventsFound: 0,
      eventsNew: 0,
      eventsUpdated: 0,
      executionTimeMs: Date.now() - sourceStartTime,
      error: error.message
    };
  }
}

async function callEventbriteCollector(
  location: string, 
  categories: string[], 
  limit: number
): Promise<any> {
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/eventbrite-collector`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
    },
    body: JSON.stringify({ location, categories, limit })
  });

  if (!response.ok) {
    throw new Error(`Eventbrite collector failed: ${response.status}`);
  }

  return await response.json();
}

async function callTicketmasterCollector(
  location: string, 
  categories: string[], 
  limit: number
): Promise<any> {
  // Default SF coordinates
  const coordinates = { lat: 37.7749, lng: -122.4194 };

  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ticketmaster-collector`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
    },
    body: JSON.stringify({ location, coordinates, categories, limit })
  });

  if (!response.ok) {
    throw new Error(`Ticketmaster collector failed: ${response.status}`);
  }

  return await response.json();
}

async function callBraveCollector(
  location: string, 
  categories: string[], 
  limit: number
): Promise<any> {
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/fetch-real-events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
    },
    body: JSON.stringify({ 
      location, 
      preferences: { 
        categories, 
        customKeywords: [] 
      } 
    })
  });

  if (!response.ok) {
    throw new Error(`Brave collector failed: ${response.status}`);
  }

  return await response.json();
}

async function updateSourceStats(
  sourceId: string, 
  success: boolean, 
  supabase: any
): Promise<void> {
  try {
    const { data: source } = await supabase
      .from('event_sources')
      .select('success_rate, error_count')
      .eq('id', sourceId)
      .single();

    if (source) {
      const newSuccessRate = success 
        ? Math.min(1.0, (source.success_rate || 1.0) * 1.02)
        : Math.max(0.1, (source.success_rate || 1.0) * 0.95);

      await supabase
        .from('event_sources')
        .update({
          last_run: new Date().toISOString(),
          success_rate: newSuccessRate,
          error_count: success ? source.error_count : (source.error_count || 0) + 1,
          ...(success && { last_success: new Date().toISOString() })
        })
        .eq('id', sourceId);
    }
  } catch (error) {
    console.error('Error updating source stats:', error);
  }
}

function calculateSummary(results: CollectionResult[]): CollectionSummary {
  const summary: CollectionSummary = {
    totalSources: results.length,
    successfulSources: results.filter(r => r.success).length,
    failedSources: results.filter(r => !r.success).length,
    totalEventsFound: results.reduce((sum, r) => sum + r.eventsFound, 0),
    totalEventsNew: results.reduce((sum, r) => sum + r.eventsNew, 0),
    totalEventsUpdated: results.reduce((sum, r) => sum + r.eventsUpdated, 0),
    totalExecutionTimeMs: results.reduce((sum, r) => sum + r.executionTimeMs, 0),
    qualityScore: 0,
    successRate: 0
  };

  summary.successRate = summary.totalSources > 0 
    ? summary.successfulSources / summary.totalSources 
    : 0;

  // Calculate quality score based on events found and success rate
  summary.qualityScore = Math.min(10, Math.max(1, 
    Math.round((summary.totalEventsNew / Math.max(1, summary.totalSources)) * summary.successRate * 2)
  ));

  return summary;
}

async function performDeduplication(
  supabase: any, 
  qualityThreshold: number
): Promise<{ duplicatesFound: number; duplicatesRemoved: number }> {
  // Basic deduplication based on title and venue similarity
  console.log('🔍 Performing basic deduplication...');

  // Find potential duplicates using PostgreSQL similarity functions
  const { data: duplicates, error: dupError } = await supabase
    .rpc('find_potential_duplicates', {
      similarity_threshold: 0.8,
      quality_threshold: qualityThreshold
    });

  if (dupError) {
    console.error('Error finding duplicates:', dupError);
    return { duplicatesFound: 0, duplicatesRemoved: 0 };
  }

  // For now, just log the duplicates found
  // TODO: Implement AI-powered deduplication with OpenAI
  console.log(`Found ${duplicates?.length || 0} potential duplicate groups`);

  return {
    duplicatesFound: duplicates?.length || 0,
    duplicatesRemoved: 0 // TODO: Implement actual duplicate removal
  };
}