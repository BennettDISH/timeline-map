# Fantasy Map Timeline - Claude Instructions

## Project Overview
- Frontend: React 18 + Vite + SASS
- Backend: Express.js + PostgreSQL  
- Purpose: Interactive fantasy map timeline tool for plotting events across time and space
- Hosting: Railway (no local server testing available)

## Key Commands
- `npm run dev` - Start both client and server (for development structure reference only)
- `npm run build` - Build for production
- `npm run migrate` - Run database migrations
- `npm run install-all` - Install dependencies for both client and server

## Testing & Deployment
- **No local server testing available** - always push changes to git to test on Railway
- Use standard commit messages without mentioning AI assistance
- Railway automatically deploys from the main branch
- **Always push changes to git when finished with a task** - commit and push automatically after completing work

## Architecture Notes
- Client uses React Router for navigation
- Authentication with JWT tokens (bcryptjs + jsonwebtoken)
- Image handling with both multer and base64 services
- Map interactions handled via custom hooks (useMapData, useMapInteractions)
- PostgreSQL database with migration system

## Development Guidelines
- Follow existing SCSS styling patterns in `client/src/styles/`
- Use existing service layer architecture in `client/src/services/`
- Maintain coordinate system utilities for map positioning (`coordinateUtils.js`, `gridCoordinates.js`)
- Follow React patterns established in `components/` directory
- Authentication context provided via `AuthContext.jsx`

## Key Components
- `MapViewer.jsx` - Main map display component
- `NodeEditor.jsx` - Edit map nodes/events
- `Timeline.jsx` - Timeline visualization
- `ImageGallery.jsx` - Image management interface
- Custom hooks handle map data and interactions

## File Structure
- `/client` - React frontend
- `/server` - Express.js backend with routes, models, middleware
- `/server/config` - Database configuration and migrations
- Railway deployment configured via `railway.toml`