-- Disable Eventbrite source since their public search API is deprecated
UPDATE event_sources 
SET enabled = false, 
    updated_at = now(),
    error_count = error_count + 1
WHERE name = 'Eventbrite SF Bay Area';

-- Check the current status
SELECT name, enabled, error_count, updated_at 
FROM event_sources 
WHERE name LIKE '%Eventbrite%';