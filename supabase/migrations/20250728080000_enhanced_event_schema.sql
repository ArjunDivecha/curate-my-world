-- Enhanced Event Discovery Database Schema
-- Migration: 20250728080000_enhanced_event_schema.sql

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text matching in deduplication

-- Event sources management table
CREATE TABLE IF NOT EXISTS event_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('api', 'rss', 'scraper', 'social', 'ai_search')),
  base_url text,
  api_config jsonb DEFAULT '{}',
  scraping_config jsonb DEFAULT '{}',
  enabled boolean DEFAULT true,
  last_run timestamptz,
  last_success timestamptz,
  success_rate numeric DEFAULT 1.0 CHECK (success_rate >= 0 AND success_rate <= 1),
  priority integer DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  rate_limit_per_hour integer DEFAULT 100,
  total_events_collected integer DEFAULT 0,
  error_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes for event_sources
CREATE INDEX IF NOT EXISTS idx_event_sources_type_enabled ON event_sources(source_type, enabled);
CREATE INDEX IF NOT EXISTS idx_event_sources_priority ON event_sources(priority DESC) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_event_sources_last_run ON event_sources(last_run);

-- Enhanced events table (extend existing)
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES event_sources(id),
ADD COLUMN IF NOT EXISTS duplicate_group_id uuid,
ADD COLUMN IF NOT EXISTS quality_score integer CHECK (quality_score >= 1 AND quality_score <= 10),
ADD COLUMN IF NOT EXISTS relevance_score integer CHECK (relevance_score >= 1 AND relevance_score <= 10),
ADD COLUMN IF NOT EXISTS raw_data jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS venue_coordinates point,
ADD COLUMN IF NOT EXISTS event_status text DEFAULT 'active' CHECK (event_status IN ('active', 'cancelled', 'postponed', 'sold_out')),
ADD COLUMN IF NOT EXISTS attendance_estimate integer,
ADD COLUMN IF NOT EXISTS age_restriction text,
ADD COLUMN IF NOT EXISTS accessibility_info text;

-- Add new indexes for enhanced events table
CREATE INDEX IF NOT EXISTS idx_events_source_id ON events(source_id);
CREATE INDEX IF NOT EXISTS idx_events_duplicate_group ON events(duplicate_group_id) WHERE duplicate_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_quality_score ON events(quality_score DESC) WHERE quality_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_venue_coordinates ON events USING GIST(venue_coordinates) WHERE venue_coordinates IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_date_location ON events(date_time, city) WHERE date_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_category_date ON events(category, date_time) WHERE category IS NOT NULL AND date_time IS NOT NULL;

-- Full-text search index for events
CREATE INDEX IF NOT EXISTS idx_events_fulltext ON events USING GIN(to_tsvector('english', 
  COALESCE(title, '') || ' ' || 
  COALESCE(description, '') || ' ' || 
  COALESCE(venue, '') || ' ' || 
  COALESCE(array_to_string(tags, ' '), '')
));

-- User preferences table for personalization
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  interests jsonb DEFAULT '{}', -- Categories with weights, keywords, etc.
  location_preferences jsonb DEFAULT '{}', -- Default location, radius, neighborhoods
  time_preferences jsonb DEFAULT '{}', -- Preferred times, days of week
  price_preferences jsonb DEFAULT '{}', -- Price ranges, free events preference
  venue_preferences jsonb DEFAULT '{}', -- Favorite venues, venue types
  ai_instructions text, -- Natural language preferences for AI curation
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- User interactions tracking for learning
CREATE TABLE IF NOT EXISTS user_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  interaction_type text NOT NULL CHECK (interaction_type IN ('view', 'click', 'save', 'rate', 'share', 'report')),
  interaction_value integer, -- For ratings (1-5), or other numeric values
  interaction_data jsonb DEFAULT '{}', -- Additional context data
  created_at timestamptz DEFAULT now()
);

-- Indexes for user interactions
CREATE INDEX IF NOT EXISTS idx_user_interactions_user_event ON user_interactions(user_id, event_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_type ON user_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_user_interactions_created ON user_interactions(created_at DESC);

-- Collection runs log for monitoring
CREATE TABLE IF NOT EXISTS collection_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES event_sources(id),
  run_type text NOT NULL CHECK (run_type IN ('scheduled', 'manual', 'retry')),
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  events_found integer DEFAULT 0,
  events_new integer DEFAULT 0,
  events_updated integer DEFAULT 0,
  events_duplicates integer DEFAULT 0,
  error_message text,
  execution_time_ms integer,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Indexes for collection runs
CREATE INDEX IF NOT EXISTS idx_collection_runs_source_status ON collection_runs(source_id, status);
CREATE INDEX IF NOT EXISTS idx_collection_runs_started ON collection_runs(started_at DESC);

-- Event deduplication groups tracking
CREATE TABLE IF NOT EXISTS event_duplicate_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_event_id uuid REFERENCES events(id), -- The "main" event to show users
  confidence_score numeric DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  detection_method text NOT NULL CHECK (detection_method IN ('fingerprint', 'ai', 'manual')),
  created_at timestamptz DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id), -- For manual review
  review_status text DEFAULT 'pending' CHECK (review_status IN ('pending', 'confirmed', 'rejected'))
);

-- Venue information cache
CREATE TABLE IF NOT EXISTS venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  city text,
  state text,
  postal_code text,
  country text DEFAULT 'US',
  coordinates point,
  venue_type text, -- concert_hall, theater, museum, restaurant, etc.
  capacity integer,
  website text,
  phone text,
  social_media jsonb DEFAULT '{}',
  accessibility_info text,
  parking_info text,
  public_transit_info text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for venues
CREATE INDEX IF NOT EXISTS idx_venues_location ON venues USING GIST(coordinates) WHERE coordinates IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venues_city_state ON venues(city, state);
CREATE INDEX IF NOT EXISTS idx_venues_name_trgm ON venues USING GIN(name gin_trgm_ops);

-- Update the events table to reference venues
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES venues(id);
CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id) WHERE venue_id IS NOT NULL;

-- Insert initial SF Bay Area event sources
INSERT INTO event_sources (name, source_type, base_url, api_config, priority, rate_limit_per_hour) VALUES
('Eventbrite SF Bay Area', 'api', 'https://www.eventbriteapi.com/v3/', '{"location": "San Francisco, CA", "categories": ["music", "arts", "technology"]}', 10, 1000),
('Ticketmaster SF Bay Area', 'api', 'https://app.ticketmaster.com/discovery/v2/', '{"location": "San Francisco", "radius": "50"}', 10, 5000),
('SeatGeek SF Bay Area', 'api', 'https://api.seatgeek.com/2/', '{"geoip": "37.7749,-122.4194", "range": "50mi"}', 9, 1000),
('Dice.fm SF Bay Area', 'api', 'https://api.dice.fm/v1/', '{"location": "san-francisco"}', 8, 500),
('SF Recreation & Parks RSS', 'rss', 'https://sfrecpark.org/events/feed/', '{}', 7, 24),
('Funcheap SF RSS', 'rss', 'https://sf.funcheap.com/feed/', '{}', 8, 24),
('UC Berkeley Events', 'rss', 'https://events.berkeley.edu/feed/', '{}', 6, 24),
('Stanford Events', 'rss', 'https://events.stanford.edu/feed/', '{}', 6, 24),
('The Fillmore Venue', 'scraper', 'https://www.thefillmore.com/', '{"selector_config": {"events": ".event-item", "title": ".event-title", "date": ".event-date"}}', 7, 12),
('Warfield Theater', 'scraper', 'https://www.thewarfield.com/', '{"selector_config": {"events": ".show", "title": ".show-title", "date": ".show-date"}}', 7, 12);

-- Add Row Level Security policies
ALTER TABLE event_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_runs ENABLE ROW LEVEL SECURITY;

-- Policies for event_sources (admin only for management)
CREATE POLICY "Admin can manage event sources" ON event_sources
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Everyone can read enabled event sources" ON event_sources
  FOR SELECT USING (enabled = true);

-- Policies for user_preferences (users can only see their own)
CREATE POLICY "Users can manage their own preferences" ON user_preferences
  FOR ALL USING (auth.uid() = user_id);

-- Policies for user_interactions (users can only see their own)
CREATE POLICY "Users can manage their own interactions" ON user_interactions
  FOR ALL USING (auth.uid() = user_id);

-- Policies for collection_runs (read-only for users, admin for management)
CREATE POLICY "Admin can manage collection runs" ON collection_runs
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Users can read collection run status" ON collection_runs
  FOR SELECT USING (true);

-- Create materialized view for high-performance event queries
CREATE MATERIALIZED VIEW IF NOT EXISTS events_enriched AS
SELECT 
  e.*,
  s.name as source_name,
  s.source_type,
  v.name as venue_name_full,
  v.coordinates as venue_coordinates_full,
  v.venue_type,
  v.capacity as venue_capacity,
  ST_X(v.coordinates) as venue_longitude,
  ST_Y(v.coordinates) as venue_latitude
FROM events e
LEFT JOIN event_sources s ON e.source_id = s.id
LEFT JOIN venues v ON e.venue_id = v.id
WHERE e.date_time >= NOW() - INTERVAL '1 day' -- Only future and very recent events
  AND (e.event_status IS NULL OR e.event_status = 'active');

-- Index the materialized view
CREATE INDEX IF NOT EXISTS idx_events_enriched_date_city ON events_enriched(date_time, city);
CREATE INDEX IF NOT EXISTS idx_events_enriched_quality ON events_enriched(quality_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_events_enriched_source ON events_enriched(source_type, source_name);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_events_enriched()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY events_enriched;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to automatically update venue coordinates when address changes
CREATE OR REPLACE FUNCTION update_venue_coordinates()
RETURNS TRIGGER AS $$
BEGIN
  -- This will be called by our geocoding service
  -- For now, just ensure the updated_at is set
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_venue_coordinates_update
  BEFORE UPDATE ON venues
  FOR EACH ROW
  EXECUTE FUNCTION update_venue_coordinates();

-- Function to calculate event quality score based on completeness
CREATE OR REPLACE FUNCTION calculate_event_quality_score(event_record events)
RETURNS integer AS $$
DECLARE
  score integer := 0;
BEGIN
  -- Base score
  score := 5;
  
  -- Add points for completeness
  IF event_record.title IS NOT NULL AND length(event_record.title) > 5 THEN
    score := score + 1;
  END IF;
  
  IF event_record.description IS NOT NULL AND length(event_record.description) > 20 THEN
    score := score + 1;
  END IF;
  
  IF event_record.venue IS NOT NULL AND length(event_record.venue) > 2 THEN
    score := score + 1;
  END IF;
  
  IF event_record.date_time IS NOT NULL THEN
    score := score + 1;
  END IF;
  
  IF event_record.external_url IS NOT NULL THEN
    score := score + 1;
  END IF;
  
  -- Ensure score is between 1 and 10
  RETURN GREATEST(1, LEAST(10, score));
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE event_sources IS 'Manages all external sources for event data collection';
COMMENT ON TABLE user_preferences IS 'Stores user preferences for personalized event recommendations';
COMMENT ON TABLE user_interactions IS 'Tracks user interactions with events for learning and analytics';
COMMENT ON TABLE collection_runs IS 'Logs all data collection runs for monitoring and debugging';
COMMENT ON TABLE venues IS 'Cached venue information with geocoding and details';
COMMENT ON MATERIALIZED VIEW events_enriched IS 'High-performance view combining events with source and venue data';