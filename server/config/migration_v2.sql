-- Migration v2: Add worlds system to existing database
-- This migration adds the worlds table and updates existing tables

-- Create worlds table if it doesn't exist
CREATE TABLE IF NOT EXISTS worlds (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}'
);

-- Add world_id column to images table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'images' AND column_name = 'world_id') THEN
        ALTER TABLE images ADD COLUMN world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add world_id column to maps table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'maps' AND column_name = 'world_id') THEN
        ALTER TABLE maps ADD COLUMN world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Update timeline_settings table to have world_id if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'timeline_settings' AND column_name = 'world_id') THEN
        ALTER TABLE timeline_settings ADD COLUMN world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_worlds_created_by ON worlds(created_by);
CREATE INDEX IF NOT EXISTS idx_images_world ON images(world_id);
CREATE INDEX IF NOT EXISTS idx_maps_world ON maps(world_id);

-- Create a default world for existing data
INSERT INTO worlds (name, description, created_by, settings)
SELECT 'Default World', 'Automatically created for existing data', 1, '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM worlds WHERE name = 'Default World')
AND EXISTS (SELECT 1 FROM users WHERE id = 1);

-- Update existing images to belong to the default world
UPDATE images 
SET world_id = (SELECT id FROM worlds WHERE name = 'Default World' LIMIT 1)
WHERE world_id IS NULL 
AND EXISTS (SELECT 1 FROM worlds WHERE name = 'Default World');

-- Update existing maps to belong to the default world  
UPDATE maps 
SET world_id = (SELECT id FROM worlds WHERE name = 'Default World' LIMIT 1)
WHERE world_id IS NULL 
AND EXISTS (SELECT 1 FROM worlds WHERE name = 'Default World');

-- Update existing timeline_settings to belong to the default world
UPDATE timeline_settings 
SET world_id = (SELECT id FROM worlds WHERE name = 'Default World' LIMIT 1)
WHERE world_id IS NULL 
AND EXISTS (SELECT 1 FROM worlds WHERE name = 'Default World');