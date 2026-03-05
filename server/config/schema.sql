-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'viewer' CHECK (role IN ('admin', 'creator', 'viewer')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Worlds table for organizing campaigns/projects
CREATE TABLE IF NOT EXISTS worlds (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}',
    timeline_enabled BOOLEAN DEFAULT true,
    timeline_min_time INTEGER DEFAULT 0,
    timeline_max_time INTEGER DEFAULT 100,
    timeline_current_time INTEGER DEFAULT 50,
    timeline_time_unit VARCHAR(50) DEFAULT 'years'
);

-- Image folders table for hierarchical image organization
CREATE TABLE IF NOT EXISTS image_folders (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_id INTEGER REFERENCES image_folders(id) ON DELETE CASCADE,
    world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    color VARCHAR(7) DEFAULT '#4CAF50',
    icon VARCHAR(10) DEFAULT '📁',
    UNIQUE(name, world_id, parent_id)
);

-- Images table for centralized image management
CREATE TABLE IF NOT EXISTS images (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    alt_text TEXT,
    tags TEXT[],
    base64_data TEXT,
    folder_id INTEGER REFERENCES image_folders(id) ON DELETE SET NULL
);

-- Maps table with hierarchical structure
CREATE TABLE IF NOT EXISTS maps (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
    image_id INTEGER REFERENCES images(id) ON DELETE SET NULL,
    parent_map_id INTEGER REFERENCES maps(id) ON DELETE CASCADE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    zoom_level INTEGER DEFAULT 1,
    map_order INTEGER DEFAULT 0
);

-- Events table (nodes on maps)
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    content TEXT,
    map_id INTEGER REFERENCES maps(id) ON DELETE CASCADE,
    x_position DECIMAL(5,2) NOT NULL DEFAULT 0,
    y_position DECIMAL(5,2) NOT NULL DEFAULT 0,
    x_pixel INTEGER DEFAULT 0,
    y_pixel INTEGER DEFAULT 0,
    start_time INTEGER NOT NULL DEFAULT 0,
    end_time INTEGER NOT NULL DEFAULT 100,
    image_id INTEGER REFERENCES images(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    tooltip_text TEXT,
    link_to_map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL,
    event_type VARCHAR(50) DEFAULT 'standard' CHECK (event_type IN ('standard', 'map_link', 'character', 'location', 'background_map')),
    timeline_enabled BOOLEAN DEFAULT false,
    locked BOOLEAN DEFAULT false
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_worlds_created_by ON worlds(created_by);
CREATE INDEX IF NOT EXISTS idx_image_folders_world ON image_folders(world_id);
CREATE INDEX IF NOT EXISTS idx_image_folders_parent ON image_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_image_folders_created_by ON image_folders(created_by);
CREATE INDEX IF NOT EXISTS idx_images_world ON images(world_id);
CREATE INDEX IF NOT EXISTS idx_images_uploaded_by ON images(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_images_folder ON images(folder_id);
CREATE INDEX IF NOT EXISTS idx_maps_world ON maps(world_id);
CREATE INDEX IF NOT EXISTS idx_maps_parent ON maps(parent_map_id);
CREATE INDEX IF NOT EXISTS idx_events_map ON events(map_id);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(start_time, end_time);
