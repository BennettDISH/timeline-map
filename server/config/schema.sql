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
    settings JSONB DEFAULT '{}'
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
    tags TEXT[]
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

-- Events table
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    content TEXT,
    map_id INTEGER REFERENCES maps(id) ON DELETE CASCADE,
    x_position DECIMAL(5,2) NOT NULL CHECK (x_position >= 0 AND x_position <= 100),
    y_position DECIMAL(5,2) NOT NULL CHECK (y_position >= 0 AND y_position <= 100),
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    image_id INTEGER REFERENCES images(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    tooltip_text VARCHAR(255),
    link_to_map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL,
    event_type VARCHAR(50) DEFAULT 'standard' CHECK (event_type IN ('standard', 'map_link', 'character', 'location'))
);

-- Timeline settings table
CREATE TABLE IF NOT EXISTS timeline_settings (
    id SERIAL PRIMARY KEY,
    world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
    map_id INTEGER REFERENCES maps(id) ON DELETE CASCADE,
    min_time INTEGER NOT NULL DEFAULT 0,
    max_time INTEGER NOT NULL DEFAULT 100,
    time_unit VARCHAR(50) DEFAULT 'years',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User sessions table (for better session management)
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_worlds_created_by ON worlds(created_by);
CREATE INDEX IF NOT EXISTS idx_images_world ON images(world_id);
CREATE INDEX IF NOT EXISTS idx_images_uploaded_by ON images(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_maps_world ON maps(world_id);
CREATE INDEX IF NOT EXISTS idx_maps_parent ON maps(parent_map_id);
CREATE INDEX IF NOT EXISTS idx_events_map ON events(map_id);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_events_position ON events(x_position, y_position);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash);

-- Create default admin user (password: admin123 - change this!)
INSERT INTO users (username, email, password_hash, role) 
VALUES ('admin', 'admin@example.com', '$2a$10$rQZ4nzF5h7VxvYKHD8qJO.CgG2E6M1VhF1K7L8pN9O0qR2S3T4U5V', 'admin')
ON CONFLICT (username) DO NOTHING;