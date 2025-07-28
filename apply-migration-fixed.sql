-- Enhanced Event Discovery Database Schema
-- Fixed SQL for direct application

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Event sources management table
CREATE TABLE IF NOT EXISTS event_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
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

-- Insert initial SF Bay Area event sources (only if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM event_sources WHERE name = 'Eventbrite SF Bay Area') THEN
        INSERT INTO event_sources (name, source_type, base_url, api_config, priority, rate_limit_per_hour) VALUES
        ('Eventbrite SF Bay Area', 'api', 'https://www.eventbriteapi.com/v3/', '{"location": "San Francisco, CA", "categories": ["music", "arts", "technology"]}', 10, 1000);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM event_sources WHERE name = 'Ticketmaster SF Bay Area') THEN
        INSERT INTO event_sources (name, source_type, base_url, api_config, priority, rate_limit_per_hour) VALUES
        ('Ticketmaster SF Bay Area', 'api', 'https://app.ticketmaster.com/discovery/v2/', '{"location": "San Francisco", "radius": "50"}', 10, 5000);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM event_sources WHERE name = 'SeatGeek SF Bay Area') THEN
        INSERT INTO event_sources (name, source_type, base_url, api_config, priority, rate_limit_per_hour) VALUES
        ('SeatGeek SF Bay Area', 'api', 'https://api.seatgeek.com/2/', '{"geoip": "37.7749,-122.4194", "range": "50mi"}', 9, 1000);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM event_sources WHERE name = 'SF Recreation & Parks RSS') THEN
        INSERT INTO event_sources (name, source_type, base_url, api_config, priority, rate_limit_per_hour) VALUES
        ('SF Recreation & Parks RSS', 'rss', 'https://sfrecpark.org/events/feed/', '{}', 7, 24);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM event_sources WHERE name = 'Funcheap SF RSS') THEN
        INSERT INTO event_sources (name, source_type, base_url, api_config, priority, rate_limit_per_hour) VALUES
        ('Funcheap SF RSS', 'rss', 'https://sf.funcheap.com/feed/', '{}', 8, 24);
    END IF;
END $$;