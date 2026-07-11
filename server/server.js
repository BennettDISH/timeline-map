const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure newer image columns exist even if `npm run migrate` hasn't been run on this DB.
// Idempotent and safe on every boot; a missing table (fresh DB pre-init) just logs and no-ops.
const pool = require('./config/database');
pool
  .query('ALTER TABLE images ADD COLUMN IF NOT EXISTS storage_key VARCHAR(500)')
  .catch((err) => console.error('storage_key column ensure skipped:', err.message));

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());

// Behind Railway's proxy — trust the first hop so req.ip is the real client (for rate limiting)
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300 // limit each IP to 300 requests per windowMs
});
app.use('/api/', limiter);

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : 'http://localhost:5173',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving for uploads with proper headers
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, path, stat) => {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
      'Cache-Control': 'public, max-age=86400' // Cache for 1 day
    });
  }
}));

// API Routes
app.use('/api/setup', require('./routes/setup'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/worlds', require('./routes/worlds'));
app.use('/api/maps', require('./routes/maps'));
app.use('/api/events', require('./routes/events'));
app.use('/api/images', require('./routes/images'));
app.use('/api/images-base64', require('./routes/image-base64'));
app.use('/api/image-folders', require('./routes/imageFolders'));

// Health check endpoint (before the SPA fallback so it isn't swallowed)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve the built React app whenever it exists — independent of NODE_ENV, so a missing
// NODE_ENV=production on the host doesn't leave every page as a JSON "Route not found".
const distPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath));

  // SPA fallback: serve index.html for any non-API GET so client-side routes work on direct
  // navigation / refresh (e.g. /auth/callback, /map/:id).
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});