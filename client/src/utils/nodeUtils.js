// Shared utility functions for working with node metadata

export const getNodeType = (node) => {
  if (node.eventType === 'background_map') return 'background_map'
  if (node.eventType === 'map_link') return 'map_link'

  try {
    if (node.tooltipText) {
      const metadata = JSON.parse(node.tooltipText)
      return metadata.nodeType || 'info'
    }
  } catch (e) {}

  return 'info'
}

export const getNodeIcon = (node) => {
  const nodeType = getNodeType(node)
  if (nodeType === 'npc') return '👤'
  if (nodeType === 'item') return '⚔️'
  if (nodeType === 'text') return '📝'
  if (nodeType === 'map_link') return '🗺️'
  if (nodeType === 'background_map') return '🖼️'
  return node.imageUrl ? '📷' : 'ℹ️'
}

export const getNodeTypeLabel = (node) => {
  const nodeType = getNodeType(node)
  if (nodeType === 'npc') return 'NPC'
  if (nodeType === 'item') return 'Item'
  if (nodeType === 'text') return 'Text'
  if (nodeType === 'map_link') return 'Map Link'
  if (nodeType === 'background_map') return 'Background Map'
  return 'Info Node'
}

export const getTextNodeProps = (node) => {
  try {
    if (node.tooltipText) {
      const metadata = JSON.parse(node.tooltipText)
      return {
        fontSize: metadata.fontSize || 16,
        textColor: metadata.textColor || 'white',
        width: metadata.width || 200
      }
    }
  } catch (e) {}
  return { fontSize: 16, textColor: 'white', width: 200 }
}

export const getNodeScale = (node) => {
  if ((node.eventType !== 'standard' && node.eventType !== 'map_link' && node.eventType !== 'background_map') || !node.imageId) return 100

  try {
    if (node.tooltipText) {
      const dimensions = JSON.parse(node.tooltipText)
      return dimensions.scale || 100
    }
  } catch (e) {}

  return 100
}
