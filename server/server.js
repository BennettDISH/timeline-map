const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
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

// Debug route to list uploaded files
app.get('/api/debug/uploads', (req, res) => {
  const fs = require('fs');
  const uploadsDir = path.join(__dirname, 'uploads');
  
  try {
    if (!fs.existsSync(uploadsDir)) {
      return res.json({ 
        message: 'Uploads directory does not exist',
        path: uploadsDir 
      });
    }
    
    const files = fs.readdirSync(uploadsDir);
    res.json({ 
      message: 'Uploads directory contents',
      path: uploadsDir,
      files: files,
      count: files.length
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error reading uploads directory',
      error: error.message,
      path: uploadsDir
    });
  }
});

// API Routes
app.use('/api/setup', require('./routes/setup'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/worlds', require('./routes/worlds'));
app.use('/api/worlds', require('./routes/worldTimeline'));
app.use('/api/maps', require('./routes/maps'));
app.use('/api/events', require('./routes/events'));
app.use('/api/images', require('./routes/images'));
app.use('/api/images-base64', require('./routes/image-base64'));

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist', 'index.html'));
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

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