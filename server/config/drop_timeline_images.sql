-- Drop timeline images functionality
-- This removes all timeline background images from the database

-- Drop the map_timeline_images table completely
DROP TABLE IF EXISTS map_timeline_images CASCADE;

-- Note: We're keeping the events table timeline_enabled column as that's for individual nodes
-- Note: We're keeping the worlds table timeline settings as those are still needed for the timeline slider