// Coordinate system utilities for MapViewer
// Handles conversion between world coordinates and screen coordinates

export const createCoordinateUtils = (containerRef, camera, zoom) => {
  const worldToScreen = (worldX, worldY) => {
    if (!containerRef.current) {
      // Use a reasonable default viewport size if container not ready
      const centerX = 800
      const centerY = 400
      const screenX = centerX + (worldX - camera.x) * zoom
      const screenY = centerY + (worldY - camera.y) * zoom
      return { x: screenX, y: screenY }
    }
    
    const rect = containerRef.current.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      // Use a reasonable default if dimensions not available yet
      const centerX = 800
      const centerY = 400
      const screenX = centerX + (worldX - camera.x) * zoom
      const screenY = centerY + (worldY - camera.y) * zoom
      return { x: screenX, y: screenY }
    }
    
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    
    const screenX = centerX + (worldX - camera.x) * zoom
    const screenY = centerY + (worldY - camera.y) * zoom
    
    // DEBUG: Log coordinate conversion if it seems wrong
    if (screenX > 10000 || screenY > 10000 || screenX < -10000 || screenY < -10000) {
      console.log('🚨 COORDINATE CONVERSION ERROR:', {
        input: { worldX, worldY },
        camera,
        zoom,
        rect: { width: rect.width, height: rect.height },
        center: { centerX, centerY },
        calculation: {
          deltaX: worldX - camera.x,
          deltaY: worldY - camera.y,
          scaledDeltaX: (worldX - camera.x) * zoom,
          scaledDeltaY: (worldY - camera.y) * zoom
        },
        output: { screenX, screenY }
      })
    }
    
    return { x: screenX, y: screenY }
  }
  
  const screenToWorld = (screenX, screenY) => {
    if (!containerRef.current) return { x: 0, y: 0 }
    
    const rect = containerRef.current.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    
    const worldX = camera.x + (screenX - centerX) / zoom
    const worldY = camera.y + (screenY - centerY) / zoom
    
    return { x: worldX, y: worldY }
  }
  
  return { worldToScreen, screenToWorld }
}