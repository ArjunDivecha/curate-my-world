-- Kill vampire events - create function to truncate events table
CREATE OR REPLACE FUNCTION truncate_events_table()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM events;
$$;