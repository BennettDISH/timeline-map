import { useState, useEffect } from 'react'
import mapService from '../services/mapService'
import eventService from '../services/eventService'
import worldService from '../services/worldService'

export const useMapData = (mapId) => {
  const [map, setMap] = useState(null)
  const [nodes, setNodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [availableMaps, setAvailableMaps] = useState([])

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const [mapResult, eventsResult] = await Promise.all([
          mapService.getMap(mapId),
          eventService.getEvents(mapId)
        ])
        
        const mapData = mapResult.map
        
        // Load world data to get timeline settings
        let worldData = null
        if (mapData.worldId) {
          try {
            const worldResult = await worldService.getWorld(mapData.worldId)
            worldData = worldResult.world
          } catch (err) {
            // Continue without world data if it fails
          }
        }
        
        // Merge map data with world timeline settings
        const enrichedMap = {
          ...mapData,
          timelineEnabled: worldData?.timelineEnabled || false,
          timelineMinTime: worldData?.timelineSettings?.minTime || 0,
          timelineMaxTime: worldData?.timelineSettings?.maxTime || 100,
          timelineCurrentTime: worldData?.timelineSettings?.currentTime || 50,
          timelineTimeUnit: worldData?.timelineSettings?.timeUnit || 'years'
        }
        
        setMap(enrichedMap)
        
        // Convert coordinates to world pixels and parse background map data
        
        const convertedNodes = eventsResult.events.map(node => {
          // Priority: use pixel coordinates if they exist, otherwise use percentage * 1000
          let worldX, worldY
          
          if (node.xPixel !== undefined && node.xPixel !== null) {
            worldX = node.xPixel
            worldY = node.yPixel || 0
          } else {
            // Convert percentage to world coordinates 
            worldX = (node.x || 0) * 1000
            worldY = (node.y || 0) * 1000
          }
          
          // Check if node is incorrectly at origin
          if (worldX === 0 && worldY === 0) {
            // Keep the coordinates as they are for now
          }
          
          // DEBUG: Check for corrupted coordinates from database
          if (Math.abs(worldX) > 10000 || Math.abs(worldY) > 10000) {
            // Reset to reasonable coordinates near camera center
            worldX = 500 + (Math.random() - 0.5) * 200
            worldY = 500 + (Math.random() - 0.5) * 200
          }
          
          // Parse dimensions from tooltip_text for background_map, standard, and map_link nodes with images
          let width = 400, height = 300
          if ((node.eventType === 'background_map' || 
               (node.eventType === 'standard' && node.imageUrl) || 
               (node.eventType === 'map_link' && node.imageUrl)) && node.tooltipText) {
            try {
              const dimensions = JSON.parse(node.tooltipText)
              width = dimensions.width || (node.eventType === 'standard' || node.eventType === 'map_link' ? 100 : 400)
              height = dimensions.height || (node.eventType === 'standard' || node.eventType === 'map_link' ? 100 : 300)
            } catch (e) {
              // Fallback to defaults if JSON parsing fails
              width = (node.eventType === 'standard' || node.eventType === 'map_link') ? 100 : 400
              height = (node.eventType === 'standard' || node.eventType === 'map_link') ? 100 : 300
            }
          } else if ((node.eventType === 'standard' || node.eventType === 'map_link') && node.imageUrl) {
            // Default size for image nodes
            width = 100
            height = 100
          }
          
          return {
            ...node,
            worldX,
            worldY,
            width,
            height
          }
        })
        setNodes(convertedNodes)
        
        // Load available maps for linking
        if (enrichedMap.worldId) {
          try {
            const mapsResult = await mapService.getMaps(enrichedMap.worldId)
            setAvailableMaps(mapsResult.maps.filter(m => m.id !== parseInt(mapId)))
          } catch (err) {
            // Continue without available maps
          }
        }
        
      } catch (err) {
        setError(err.message || 'Failed to load map')
      } finally {
        setLoading(false)
      }
    }
    
    if (mapId) {
      loadData()
    }
  }, [mapId])

  return {
    map,
    setMap,
    nodes,
    setNodes,
    loading,
    error,
    availableMaps
  }
}