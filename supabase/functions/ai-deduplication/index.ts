import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1'

/**
=============================================================================
AI-POWERED EVENT DEDUPLICATION - SUPABASE EDGE FUNCTION
=============================================================================

PURPOSE:
Intelligent event deduplication using OpenAI's GPT models to identify
semantic duplicates across multiple data sources. Handles variations in
title, description, venue names, and dates that simple string matching
would miss.

INPUT:
- Batch of events to analyze for duplicates
- Confidence threshold for duplicate detection
- Optional manual review triggers

OUTPUT:
- Duplicate groups with confidence scores
- Canonical event selection for each group
- Deduplication statistics and quality metrics

DEPENDENCIES:
- OpenAI API (GPT-4 or GPT-3.5-turbo)
- Enhanced events table with duplicate_group_id
- event_duplicate_groups table for tracking

USAGE:
- Called by orchestration function after collection
- Manual trigger for batch processing
- Scheduled cleanup jobs

NOTES:
- Uses semantic analysis to detect similar events
- Handles venue name variations (e.g., "The Fillmore" vs "Fillmore Auditorium")
- Accounts for date/time formatting differences
- Provides confidence scoring for manual review
- Maintains event quality scores for canonical selection

VERSION: 1.0
LAST UPDATED: 2025-07-28
AUTHOR: Claude Code Implementation
=============================================================================
*/

interface DuplicateCandidate {
  id: string;
  title: string;
  description: string;
  venue: string;
  date_time: string;
  source: string;
  quality_score: number;
  external_url: string;
}

interface DuplicateGroup {
  events: DuplicateCandidate[];
  confidence: number;
  canonical_event_id: string;
  reason: string;
}

interface DeduplicationResult {
  total_events_analyzed: number;
  duplicate_groups_found: number;
  duplicates_removed: number;
  canonical_events_selected: number;
  confidence_breakdown: {
    high: number;    // >0.9
    medium: number;  // 0.7-0.9
    low: number;     // 0.5-0.7
  };
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
      confidence_threshold = 0.7,
      batch_size = 50,
      location = 'San Francisco, CA',
      date_range_days = 7 
    } = await req.json();
    
    console.log('🧠 Starting AI-powered deduplication...');
    console.log(`🎯 Confidence threshold: ${confidence_threshold}`);
    console.log(`📦 Batch size: ${batch_size}`);
    
    // Get environment variables
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not found in environment variables');
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required Supabase environment variables');
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get recent events that haven't been processed for duplicates
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - date_range_days);

    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, title, description, venue, date_time, source, quality_score, external_url, city, duplicate_group_id')
      .gte('date_time', cutoffDate.toISOString())
      .is('duplicate_group_id', null) // Only unprocessed events
      .order('created_at', { ascending: false })
      .limit(batch_size * 2); // Get more to ensure we have enough for analysis

    if (eventsError) {
      console.error('❌ Error fetching events:', eventsError);
      throw new Error('Failed to fetch events for deduplication');
    }

    if (!events || events.length < 2) {
      return new Response(
        JSON.stringify({ 
          success: true,
          result: {
            total_events_analyzed: events?.length || 0,
            duplicate_groups_found: 0,
            duplicates_removed: 0,
            canonical_events_selected: 0,
            confidence_breakdown: { high: 0, medium: 0, low: 0 }
          },
          message: 'Not enough events to analyze for duplicates',
          timestamp: new Date().toISOString()
        }),
        { 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      );
    }

    console.log(`📊 Analyzing ${events.length} events for duplicates...`);

    // Process events in batches to manage API costs and rate limits
    const duplicateGroups: DuplicateGroup[] = [];
    const batchResults: DeduplicationResult = {
      total_events_analyzed: events.length,
      duplicate_groups_found: 0,
      duplicates_removed: 0,
      canonical_events_selected: 0,
      confidence_breakdown: { high: 0, medium: 0, low: 0 }
    };

    // Group events by similar characteristics for more efficient analysis
    const eventBatches = groupEventsForAnalysis(events, batch_size);

    for (let i = 0; i < eventBatches.length; i++) {
      const batch = eventBatches[i];
      console.log(`🔍 Processing batch ${i + 1}/${eventBatches.length} (${batch.length} events)`);

      try {
        const batchDuplicates = await analyzeBatchForDuplicates(
          batch, 
          openaiApiKey, 
          confidence_threshold
        );

        duplicateGroups.push(...batchDuplicates);

        // Update confidence breakdown
        for (const group of batchDuplicates) {
          if (group.confidence >= 0.9) {
            batchResults.confidence_breakdown.high++;
          } else if (group.confidence >= 0.7) {
            batchResults.confidence_breakdown.medium++;
          } else {
            batchResults.confidence_breakdown.low++;
          }
        }

        // Small delay to respect OpenAI rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (batchError) {
        console.error(`❌ Error processing batch ${i + 1}:`, batchError);
        // Continue with other batches
      }
    }

    console.log(`🎯 Found ${duplicateGroups.length} duplicate groups`);

    // Process duplicate groups and update database
    if (duplicateGroups.length > 0) {
      const processingResult = await processDuplicateGroups(duplicateGroups, supabase);
      
      batchResults.duplicate_groups_found = duplicateGroups.length;
      batchResults.duplicates_removed = processingResult.duplicatesRemoved;
      batchResults.canonical_events_selected = processingResult.canonicalEventsSelected;
    }

    console.log('✅ Deduplication completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        result: batchResults,
        duplicate_groups: duplicateGroups.map(group => ({
          canonical_event_id: group.canonical_event_id,
          duplicate_count: group.events.length - 1,
          confidence: group.confidence,
          reason: group.reason
        })),
        message: `Found and processed ${duplicateGroups.length} duplicate groups with ${batchResults.duplicates_removed} duplicates removed`,
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
    console.error('❌ Error in ai-deduplication:', error);
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

function groupEventsForAnalysis(events: any[], batchSize: number): DuplicateCandidate[][] {
  // Group events by similar characteristics to improve deduplication efficiency
  const groups: { [key: string]: DuplicateCandidate[] } = {};

  for (const event of events) {
    // Create a grouping key based on venue and approximate date
    const eventDate = new Date(event.date_time);
    const dateKey = `${eventDate.getFullYear()}-${eventDate.getMonth()}-${Math.floor(eventDate.getDate() / 3)}`; // 3-day groupings
    const venueKey = event.venue.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10);
    const groupKey = `${venueKey}-${dateKey}`;

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }

    groups[groupKey].push({
      id: event.id,
      title: event.title,
      description: event.description || '',
      venue: event.venue,
      date_time: event.date_time,
      source: event.source,
      quality_score: event.quality_score || 5,
      external_url: event.external_url
    });
  }

  // Convert groups to batches, ensuring no batch exceeds the size limit
  const batches: DuplicateCandidate[][] = [];
  for (const groupEvents of Object.values(groups)) {
    if (groupEvents.length > 1) { // Only analyze groups with multiple events
      // Split large groups into smaller batches
      for (let i = 0; i < groupEvents.length; i += batchSize) {
        const batch = groupEvents.slice(i, i + batchSize);
        if (batch.length > 1) {
          batches.push(batch);
        }
      }
    }
  }

  return batches;
}

async function analyzeBatchForDuplicates(
  events: DuplicateCandidate[],
  openaiApiKey: string,
  confidenceThreshold: number
): Promise<DuplicateGroup[]> {
  
  // Prepare events data for AI analysis
  const eventsForAnalysis = events.map((event, index) => ({
    index,
    id: event.id,
    title: event.title,
    venue: event.venue,
    date: event.date_time.split('T')[0], // Just the date part
    source: event.source,
    quality_score: event.quality_score
  }));

  const prompt = `
You are an expert event deduplication system. Analyze the following events and identify which ones are duplicates of each other.

Events to analyze:
${eventsForAnalysis.map(e => `${e.index}: "${e.title}" at "${e.venue}" on ${e.date} (Source: ${e.source}, Quality: ${e.quality_score})`).join('\n')}

Instructions:
1. Look for events that represent the same real-world event, even if they have:
   - Slightly different titles
   - Different venue name formats (e.g., "The Fillmore" vs "Fillmore Auditorium")
   - Same date but slightly different times
   - Different sources

2. For each group of duplicates found:
   - Choose the canonical event (highest quality score, most complete information)
   - Provide a confidence score (0.0-1.0) based on how certain you are they're duplicates
   - Explain why you think they're duplicates

3. Only report groups with confidence >= ${confidenceThreshold}

Respond in JSON format:
{
  "duplicate_groups": [
    {
      "event_indices": [0, 3, 7],
      "canonical_index": 0,
      "confidence": 0.95,
      "reason": "Same artist, same venue, same date - just different title formatting"
    }
  ]
}

If no duplicates are found, return: {"duplicate_groups": []}
`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo', // Using 3.5-turbo for cost efficiency
        messages: [
          {
            role: 'system',
            content: 'You are an expert at identifying duplicate events across different data sources. You understand that the same event can be listed with variations in title, venue names, and formatting.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1, // Low temperature for consistent results
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenAI API error (${response.status}):`, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    // Parse AI response
    let analysisResult;
    try {
      analysisResult = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error('Error parsing AI response:', aiResponse);
      throw new Error('Invalid JSON response from OpenAI');
    }

    // Convert AI analysis to our duplicate group format
    const duplicateGroups: DuplicateGroup[] = [];

    for (const group of analysisResult.duplicate_groups || []) {
      if (group.confidence >= confidenceThreshold && group.event_indices.length > 1) {
        const groupEvents = group.event_indices.map((index: number) => events[index]);
        const canonicalEvent = events[group.canonical_index];

        duplicateGroups.push({
          events: groupEvents,
          confidence: group.confidence,
          canonical_event_id: canonicalEvent.id,
          reason: group.reason
        });
      }
    }

    return duplicateGroups;

  } catch (error) {
    console.error('Error in AI analysis:', error);
    return []; // Return empty array on error to continue processing
  }
}

async function processDuplicateGroups(
  duplicateGroups: DuplicateGroup[],
  supabase: any
): Promise<{ duplicatesRemoved: number; canonicalEventsSelected: number }> {
  
  let duplicatesRemoved = 0;
  let canonicalEventsSelected = 0;

  for (const group of duplicateGroups) {
    try {
      // Create duplicate group record
      const { data: duplicateGroupRecord, error: groupError } = await supabase
        .from('event_duplicate_groups')
        .insert({
          canonical_event_id: group.canonical_event_id,
          confidence_score: group.confidence,
          detection_method: 'ai'
        })
        .select()
        .single();

      if (groupError || !duplicateGroupRecord) {
        console.error('Error creating duplicate group:', groupError);
        continue;
      }

      // Update all events in the group with the duplicate_group_id
      const eventIds = group.events.map(e => e.id);
      const { error: updateError } = await supabase
        .from('events')
        .update({
          duplicate_group_id: duplicateGroupRecord.id
        })
        .in('id', eventIds);

      if (updateError) {
        console.error('Error updating events with duplicate group ID:', updateError);
        continue;
      }

      // Count duplicates (all except canonical event)
      duplicatesRemoved += group.events.length - 1;
      canonicalEventsSelected += 1;

      console.log(`✅ Processed duplicate group: ${group.events.length} events, confidence: ${group.confidence}`);

    } catch (error) {
      console.error('Error processing duplicate group:', error);
    }
  }

  return { duplicatesRemoved, canonicalEventsSelected };
}