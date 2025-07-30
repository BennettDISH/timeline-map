/**
 * Grid-based coordinate system utilities
 * Provides consistent positioning across alignment tool and map viewer
 */

// Grid configuration
export const GRID_SIZE = 50 // pixels per grid cell
export const GRID_COLUMNS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Convert pixel coordinates to grid coordinates
 * @param {number} pixelX - X position in pixels
 * @param {number} pixelY - Y position in pixels
 * @returns {object} - { gridX, gridY } in grid units
 */
export const pixelsToGrid = (pixelX, pixelY) => {
  return {
    gridX: pixelX / GRID_SIZE,
    gridY: pixelY / GRID_SIZE
  }
}

/**
 * Convert grid coordinates to pixel coordinates
 * @param {number} gridX - X position in grid units
 * @param {number} gridY - Y position in grid units
 * @returns {object} - { pixelX, pixelY } in pixels
 */
export const gridToPixels = (gridX, gridY) => {
  return {
    pixelX: gridX * GRID_SIZE,
    pixelY: gridY * GRID_SIZE
  }
}

/**
 * Convert grid coordinates to human-readable coordinate (e.g., A1, B2)
 * @param {number} gridX - X position in grid units
 * @param {number} gridY - Y position in grid units
 * @returns {string} - Human-readable coordinate like "B2"
 */
export const gridToCoordinate = (gridX, gridY) => {
  const column = getColumnLabel(Math.floor(gridX))
  const row = Math.floor(gridY) + 1
  return `${column}${row}`
}

/**
 * Convert human-readable coordinate to grid coordinates
 * @param {string} coordinate - Coordinate like "B2"
 * @returns {object} - { gridX, gridY } in grid units
 */
export const coordinateToGrid = (coordinate) => {
  const match = coordinate.match(/^([A-Z]+)(\d+)$/)
  if (!match) throw new Error(`Invalid coordinate: ${coordinate}`)
  
  const [, columnStr, rowStr] = match
  const gridX = getColumnIndex(columnStr)
  const gridY = parseInt(rowStr) - 1
  
  return { gridX, gridY }
}

/**
 * Get column label from index (0=A, 1=B, 25=Z, 26=AA, etc.)
 * @param {number} index - Column index
 * @returns {string} - Column label
 */
export const getColumnLabel = (index) => {
  let result = ''
  while (index >= 0) {
    result = GRID_COLUMNS[index % 26] + result
    index = Math.floor(index / 26) - 1
  }
  return result
}

/**
 * Get column index from label (A=0, B=1, Z=25, AA=26, etc.)
 * @param {string} label - Column label
 * @returns {number} - Column index
 */
export const getColumnIndex = (label) => {
  let result = 0
  for (let i = 0; i < label.length; i++) {
    result = result * 26 + (label.charCodeAt(i) - 64)
  }
  return result - 1
}

/**
 * Convert percentage-based coordinates to grid coordinates
 * (for migrating existing data)
 * @param {number} percentX - X position as percentage (0-100)
 * @param {number} percentY - Y position as percentage (0-100)
 * @param {number} containerWidth - Container width in pixels
 * @param {number} containerHeight - Container height in pixels
 * @returns {object} - { gridX, gridY } in grid units
 */
export const percentToGrid = (percentX, percentY, containerWidth, containerHeight) => {
  const pixelX = (percentX / 100) * containerWidth
  const pixelY = (percentY / 100) * containerHeight
  return pixelsToGrid(pixelX, pixelY)
}

/**
 * Convert grid coordinates to percentage-based coordinates
 * (for backward compatibility)
 * @param {number} gridX - X position in grid units
 * @param {number} gridY - Y position in grid units
 * @param {number} containerWidth - Container width in pixels
 * @param {number} containerHeight - Container height in pixels
 * @returns {object} - { percentX, percentY } as percentages (0-100)
 */
export const gridToPercent = (gridX, gridY, containerWidth, containerHeight) => {
  const { pixelX, pixelY } = gridToPixels(gridX, gridY)
  return {
    percentX: (pixelX / containerWidth) * 100,
    percentY: (pixelY / containerHeight) * 100
  }
}

/**
 * Generate grid labels for display
 * @param {number} containerWidth - Container width in pixels
 * @param {number} containerHeight - Container height in pixels
 * @returns {array} - Array of label objects with position and text
 */
export const generateGridLabels = (containerWidth, containerHeight) => {
  const labels = []
  
  // Column labels (A, B, C, etc.)
  for (let i = 0; i < Math.ceil(containerWidth / GRID_SIZE); i++) {
    const x = (i + 0.5) * GRID_SIZE
    if (x < containerWidth) {
      labels.push({
        type: 'column',
        text: getColumnLabel(i),
        x: x,
        y: 10
      })
    }
  }
  
  // Row labels (1, 2, 3, etc.)
  for (let i = 0; i < Math.ceil(containerHeight / GRID_SIZE); i++) {
    const y = (i + 0.5) * GRID_SIZE
    if (y < containerHeight) {
      labels.push({
        type: 'row',
        text: (i + 1).toString(),
        x: 10,
        y: y
      })
    }
  }
  
  return labels
}