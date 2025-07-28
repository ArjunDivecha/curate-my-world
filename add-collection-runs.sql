-- Add missing collection_runs table for tracking collection runs

CREATE TABLE IF NOT EXISTS collection_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES event_sources(id),
  run_type text DEFAULT 'manual' CHECK (run_type IN ('manual', 'scheduled', 'test')),
  status text DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  events_found integer DEFAULT 0,
  events_new integer DEFAULT 0,
  events_updated integer DEFAULT 0,
  execution_time_ms integer DEFAULT 0,
  error_message text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  metadata jsonb DEFAULT '{}'
);

-- Add indexes for collection_runs
CREATE INDEX IF NOT EXISTS idx_collection_runs_source_id ON collection_runs(source_id);
CREATE INDEX IF NOT EXISTS idx_collection_runs_status ON collection_runs(status);
CREATE INDEX IF NOT EXISTS idx_collection_runs_started_at ON collection_runs(started_at DESC);

-- Check the table was created
SELECT 'collection_runs table created successfully' as message;