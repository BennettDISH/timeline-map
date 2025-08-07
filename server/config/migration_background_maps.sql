-- Migration to add background_map event type
-- Add background_map to the event_type constraint

-- Drop the old constraint
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;

-- Add the new constraint with background_map included
ALTER TABLE events ADD CONSTRAINT events_event_type_check 
CHECK (event_type IN ('standard', 'map_link', 'character', 'location', 'background_map'));