const API_BASE = '/api'

class NodeSearchService {
  constructor() {
    this.searchCache = new Map() // searchKey -> results
    this.lastCacheUpdate = 0
    this.cacheTimeout = 30000 // 30 seconds
  }

  // Search nodes across all maps in a world
  async searchNodes(worldId, searchQuery = '', options = {}) {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        throw new Error('Authentication required')
      }

      const searchKey = `${worldId}-${searchQuery}`
      const now = Date.now()
      
      // Check cache
      if (this.searchCache.has(searchKey) && (now - this.lastCacheUpdate) < this.cacheTimeout) {
        return this.searchCache.get(searchKey)
      }

      // Build query parameters
      const params = new URLSearchParams({
        worldId: worldId.toString()
      })
      
      if (searchQuery && searchQuery.trim().length > 0) {
        params.append('query', searchQuery.trim())
      }

      const url = `${API_BASE}/events/search?${params}`

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`)
      }

      const data = await response.json()

      const formattedResults = data.results.map(node => this.formatSearchResult(node, node.mapTitle))
      
      const result = {
        results: formattedResults,
        totalCount: data.totalCount
      }
      
      // Cache the results
      this.searchCache.set(searchKey, result)
      this.lastCacheUpdate = now
      
      return result
    } catch (error) {
      console.error('Node search failed:', error)
      return {
        results: [],
        totalCount: 0,
        error: error.message
      }
    }
  }

  clearCache() {
    this.searchCache.clear()
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