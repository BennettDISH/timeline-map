-- Migration: Add locked field to events table
-- This allows nodes to be locked to prevent accidental dragging in edit mode

DO $$ 
BEGIN
    -- Add locked column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' AND column_name = 'locked'
    ) THEN
        ALTER TABLE events ADD COLUMN locked BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added locked column to events table';
    ELSE
        RAISE NOTICE 'locked column already exists in events table';
    END IF;
END $$;