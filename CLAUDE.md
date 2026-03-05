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
- Image upload uses base64-in-DB system (`imageServiceBase64.js` → `image-base64.js` route)
- Map interactions handled via custom hooks (useMapData, useMapInteractions)
- PostgreSQL database with migration system
- `tooltipText` field on events is overloaded as JSON blob storing node type, dimensions, scale, connections, font size, text color

## Development Guidelines
- Follow existing SCSS styling patterns in `client/src/styles/`
- Use existing service layer architecture in `client/src/services/` — do NOT create raw axios instances
- Use `coordinateUtils.js` for map positioning (NOT `gridCoordinates.js` — that file is unused/dead)
- Follow React patterns established in `components/` directory
- Authentication context provided via `AuthContext.jsx`

## Key Components
- `MapViewer.jsx` - Main map display component (uses useMapData + useMapInteractions hooks)
- `MapContainer.jsx` - Map rendering wrapper (mouse events, grid overlay, NodeRenderer)
- `NodeEditor.jsx` - Edit map nodes/events (tabbed form)
- `NodeRenderer.jsx` - Renders nodes on map (text, image, marker modes)
- `InfoPanel.jsx` - Read-only node details in view mode
- `NodesListPanel.jsx` - Sidebar listing all nodes
- `Timeline.jsx` - Timeline scrubber bar
- `ImageGallery.jsx` - Image grid display with search/filter
- `ImageSelector.jsx` - Dropdown image picker for forms
- `UniversalNodeSearch.jsx` - Cross-map node search typeahead

## File Structure
- `/client` - React frontend
- `/server` - Express.js backend with routes, models, middleware
- `/server/config` - Database configuration and migrations
- Railway deployment configured via `railway.toml`

---

## Cleanup TODO List (March 2026 Audit)

A full codebase audit was performed. Below is the complete list of cleanup tasks, ordered by priority. Check items off as they are completed.

### 1. Delete Dead Files (~3,088 lines) — DONE
- [x] Delete `client/src/pages/MapViewer_OLD.jsx`, `MapViewer_Original.jsx`, `MapView.jsx`
- [x] Delete `client/src/services/imageService.js`, `client/src/utils/gridCoordinates.js`
- [x] Delete `MIGRATION_TOOLTIP.md`

### 2. Security: Fix Unauthenticated Endpoints — DONE
- [x] Stripped `setup.js` to only `GET /status` and `POST /init-admin`
- [x] Removed `GET /api/debug/uploads` from `server.js`
- [x] Removed `Migration.jsx` and its route (was unauthenticated duplicate of `AdminPanel.jsx`)

### 3. Remove Debug Logging from Production — DONE
- [x] Removed all debug `console.log` from `events.js`, `UniversalNodeSearch.jsx`, `nodeSearchService.js`, `MapViewer.jsx`, `useMapData.js`
- [x] Removed dead `handleEditorSave` legacy function from `MapViewer.jsx`

### 4. Clean Up SCSS (~1,045 dead/duplicate lines) — DONE
- [x] Removed old `.manager-layout`/`.folders-sidebar`/`.main-content` and first `.image-manager-new` from `imageStyles.scss`
- [x] Removed dead MapView + duplicate dashboard styles from `main.scss`
- [x] Removed duplicate `.map-manager` block from `mapStyles.scss`
- [x] Removed dead `.mode-toggle-container` from `timelineStyles.scss`
- [x] Fixed double import of `imageStyles.scss` (removed `@import` from `main.scss`)
- [x] Removed invalid `truncate: true` from `imageSelector.scss`
- [ ] Consolidate `@keyframes spin` — still defined 5 times (low priority, cosmetic)

### 5. Update schema.sql to Match Production — DONE
- [x] Added `events.locked`, `events.x_pixel`, `events.y_pixel`, `images.base64_data`, `images.folder_id`
- [x] Added `image_folders` table, removed CHECK constraints, changed `tooltip_text` to TEXT
- [x] Removed dead tables: `timeline_settings`, `user_sessions`, `map_timeline_images`
- [x] Removed hardcoded admin INSERT

### 6. Remove One-Off Migration Artifacts — DONE
- [x] Deleted all migration SQL files and scripts
- [x] Removed `server/scripts/` directory
- [x] Removed `migrate:tooltip` and `fix-constraint` npm scripts

### 7. Deduplicate Code — DONE
- [x] Extracted `getNodeType`, `getNodeIcon`, `getNodeTypeLabel`, `getTextNodeProps`, `getNodeScale` into `client/src/utils/nodeUtils.js`
- [x] Updated `NodeRenderer.jsx`, `NodesListPanel.jsx`, `MapViewer.jsx` to use shared utility
- [x] Removed duplicate inner `getNodeType` and empty debug if-blocks from `NodeRenderer.jsx`
- [x] Fixed broken `nodeSearchService.js` (`getMapNodes` removed, `clearCache` fixed)
- [x] Removed unused `useNavigate` import from `InfoPanel.jsx`

### 8. Consolidate Overlapping Features (remaining)
- [ ] Decide: keep `worldTimeline.js` routes OR just use `worlds.js` for timeline updates
- [ ] Decide: keep disk-based image upload (`images.js` multer) OR remove it (frontend only uses base64)
- [ ] Remove the no-op `POST /api/auth/logout` endpoint or implement real session invalidation
- [ ] Make `MapSettings.jsx` use `mapService` instead of raw axios
- [ ] Make `WorldSettings.jsx` use `worldService` instead of raw axios
- [ ] Make `AdminPanel.jsx` use a service instead of raw axios