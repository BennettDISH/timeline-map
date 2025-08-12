-- Migration to expand tooltip_text field from VARCHAR(255) to TEXT
-- This is needed to store larger JSON metadata including connections

-- Backup current data first
DO $$
BEGIN
    -- Create backup table if not exists
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'events_backup_tooltip_migration') THEN
        CREATE TABLE events_backup_tooltip_migration AS SELECT * FROM events;
        RAISE NOTICE 'Created backup table: events_backup_tooltip_migration';
    END IF;
END
$$;

-- Alter the tooltip_text column from VARCHAR(255) to TEXT
ALTER TABLE events ALTER COLUMN tooltip_text TYPE TEXT;

-- Add comment to document the change
COMMENT ON COLUMN events.tooltip_text IS 'JSON metadata for node including dimensions, connections, and node type. Expanded from VARCHAR(255) to TEXT to support larger metadata.';

-- Verify the change
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'events' 
        AND column_name = 'tooltip_text' 
        AND data_type = 'text'
    ) THEN
        RAISE NOTICE 'SUCCESS: tooltip_text column successfully changed to TEXT type';
    ELSE
        RAISE EXCEPTION 'FAILED: tooltip_text column was not successfully changed';
    END IF;
END
$$;