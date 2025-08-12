import eventService from './eventService'

class NodeSearchService {
  constructor() {
    this.allNodesCache = new Map() // mapId -> nodes array
    this.lastCacheUpdate = 0
    this.cacheTimeout = 30000 // 30 seconds
  }

  // Search nodes across all maps in a world
  async searchNodes(worldId, searchQuery = '', options = {}) {
    try {
      // For now, we'll need to get this data by fetching all maps for the world
      // Then fetch nodes for each map
      
      const searchResults = []
      
      // This is a placeholder - we'll need to implement proper cross-map search
      // For now, return empty array and we'll build this step by step
      
      return {
        results: searchResults,
        totalCount: 0
      }
    } catch (error) {
      console.error('Node search failed:', error)
      return {
        results: [],
        totalCount: 0,
        error: error.message
      }
    }
  }

  // Get all nodes for a specific map (with caching)
  async getMapNodes(mapId) {
    const now = Date.now()
    
    // Check cache
    if (this.allNodesCache.has(mapId) && (now - this.lastCacheUpdate) < this.cacheTimeout) {
      return this.allNodesCache.get(mapId)
    }

    try {
      // Fetch nodes for this map
      const response = await eventService.getEvents(mapId)
      const nodes = response.events || []
      
      // Cache the results
      this.allNodesCache.set(mapId, nodes)
      this.lastCacheUpdate = now
      
      return nodes
    } catch (error) {
      console.error(`Failed to fetch nodes for map ${mapId}:`, error)
      return []
    }
  }

  // Clear cache when needed
  clearCache() {
    this.allNodesCache.clear()
    this.lastCacheUpdate = 0
  }

  // Format search result for display
  formatSearchResult(node, mapTitle = 'Unknown Map') {
    const nodeTypeIcons = {
      'info': 'ℹ️',
      'npc': '👤', 
      'item': '⚔️',
      'map_link': '🗺️',
      'background_map': '🖼️'
    }

    // Get node type from metadata or fall back to event type
    let nodeType = 'info'
    try {
      if (node.tooltipText) {
        const metadata = JSON.parse(node.tooltipText)
        nodeType = metadata.nodeType || 'info'
      }
    } catch (e) {
      if (node.eventType === 'background_map') nodeType = 'background_map'
      else if (node.eventType === 'map_link') nodeType = 'map_link'
    }

    return {
      id: node.id,
      mapId: node.mapId,
      title: node.title || `Untitled Node #${node.id}`,
      description: node.description || '',
      nodeType,
      icon: nodeTypeIcons[nodeType] || 'ℹ️',
      mapTitle,
      displayText: `${nodeTypeIcons[nodeType]} ${node.title || `Node #${node.id}`} (${mapTitle})`
    }
  }
}

export default new NodeSearchService()