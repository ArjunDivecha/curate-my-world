-- Fix Security Issues Migration
-- Migration: 20250728120000_fix_security_policies.sql

-- Enable RLS on all tables that don't have it
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_duplicate_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- Fix events table policies - allow public read for active events
DROP POLICY IF EXISTS "Public can read active events" ON events;
CREATE POLICY "Public can read active events" ON events
  FOR SELECT USING (
    event_status IS NULL OR event_status = 'active'
  );

-- Allow authenticated users to insert events (for the function)
DROP POLICY IF EXISTS "Authenticated users can insert events" ON events;
CREATE POLICY "Authenticated users can insert events" ON events
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow service role to manage all events (for functions)
DROP POLICY IF EXISTS "Service role can manage events" ON events;
CREATE POLICY "Service role can manage events" ON events
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Fix venues table policies - allow public read
DROP POLICY IF EXISTS "Public can read venues" ON venues;
CREATE POLICY "Public can read venues" ON venues
  FOR SELECT USING (true);

-- Allow authenticated users to insert venues
DROP POLICY IF EXISTS "Authenticated users can insert venues" ON venues;
CREATE POLICY "Authenticated users can insert venues" ON venues
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Fix event_duplicate_groups policies
DROP POLICY IF EXISTS "Public can read duplicate groups" ON event_duplicate_groups;
CREATE POLICY "Public can read duplicate groups" ON event_duplicate_groups
  FOR SELECT USING (true);

-- Allow service role to manage duplicate groups
DROP POLICY IF EXISTS "Service role can manage duplicate groups" ON event_duplicate_groups;
CREATE POLICY "Service role can manage duplicate groups" ON event_duplicate_groups
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Create a function to safely delete old events (with proper authorization)
CREATE OR REPLACE FUNCTION delete_old_events(older_than_days integer DEFAULT 30)
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Only allow service role or admin to delete events
  IF auth.jwt() ->> 'role' NOT IN ('service_role', 'admin') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete events';
  END IF;
  
  DELETE FROM events 
  WHERE created_at < NOW() - (older_than_days || ' days')::INTERVAL
    AND (event_status = 'cancelled' OR date_time < NOW() - INTERVAL '7 days');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to safely clear test events
CREATE OR REPLACE FUNCTION clear_test_events()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Only allow service role or admin to clear test events
  IF auth.jwt() ->> 'role' NOT IN ('service_role', 'admin') THEN
    RAISE EXCEPTION 'Insufficient permissions to clear test events';
  END IF;
  
  DELETE FROM events 
  WHERE source = 'test_data' OR title ILIKE '%test%' OR description ILIKE '%test%';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on utility functions
GRANT EXECUTE ON FUNCTION delete_old_events(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION clear_test_events() TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_events_enriched() TO authenticated;

-- Add security comments
COMMENT ON POLICY "Public can read active events" ON events IS 'Allows public access to active events only';
COMMENT ON POLICY "Service role can manage events" ON events IS 'Allows Edge Functions to manage events with service role';
COMMENT ON FUNCTION delete_old_events(integer) IS 'Safely deletes old events with proper authorization';
COMMENT ON FUNCTION clear_test_events() IS 'Safely clears test events with proper authorization';
