import { useState, useCallback, useRef } from 'react'
import { createCoordinateUtils } from '../utils/coordinateUtils'
import eventService from '../services/eventService'

export const useMapInteractions = (nodes, setNodes, mapId, interactionMode) => {
  // Camera and zoom state
  const [camera, setCamera] = useState({ x: 500, y: 500 })
  const [zoom, setZoom] = useState(1)
  
  // Interaction state
  const [isDraggingViewport, setIsDraggingViewport] = useState(false)
  const [isDraggingNode, setIsDraggingNode] = useState(false)
  const [dragStartMouse, setDragStartMouse] = useState({ x: 0, y: 0 })
  const [dragStartCamera, setDragStartCamera] = useState({ x: 0, y: 0 })
  const [dragStartNodePos, setDragStartNodePos] = useState({ x: 0, y: 0 })
  const [draggingNode, setDraggingNode] = useState(null)
  
  // Saving state
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const containerRef = useRef(null)
  
  // Create coordinate utilities
  const { worldToScreen, screenToWorld } = createCoordinateUtils(containerRef, camera, zoom)

  // Callback ref to ensure we know when container mounts
  const setContainerRef = useCallback((element) => {
    containerRef.current = element
    if (element) {
      // Use setTimeout to ensure the element is fully rendered
      setTimeout(() => {
        const rect = element.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          console.log('📏 Container mounted and ready:', rect)
        }
      }, 0)
    }
  }, [])

  const handleMouseDown = useCallback((e) => {
    const mouseX = e.clientX
    const mouseY = e.clientY
    
    // Start viewport dragging by default (node dragging is handled separately)
    setIsDraggingViewport(true)
    setDragStartMouse({ x: mouseX, y: mouseY })
    setDragStartCamera({ x: camera.x, y: camera.y })
  }, [camera])

  const handleNodeMouseDown = useCallback((e, node) => {
    e.stopPropagation() // Prevent map dragging
    
    const mouseX = e.clientX
    const mouseY = e.clientY
    
    // Only allow dragging in edit mode
    if (interactionMode === 'edit') {
      setIsDraggingNode(true)
      setDraggingNode(node)
      setDragStartMouse({ x: mouseX, y: mouseY })
      setDragStartNodePos({ x: node.worldX, y: node.worldY })
      setIsDraggingViewport(false) // Stop viewport dragging
    }
  }, [interactionMode])

  const handleMouseMove = useCallback((e) => {
    const mouseX = e.clientX
    const mouseY = e.clientY
    
    if (isDraggingNode && draggingNode) {
      // Node dragging
      const mouseDeltaX = mouseX - dragStartMouse.x
      const mouseDeltaY = mouseY - dragStartMouse.y
      
      const worldDeltaX = mouseDeltaX / zoom
      const worldDeltaY = mouseDeltaY / zoom
      
      const newWorldX = dragStartNodePos.x + worldDeltaX
      const newWorldY = dragStartNodePos.y + worldDeltaY
      
      // DEBUG: Check for coordinate corruption during drag
      if (Math.abs(newWorldX) > 10000 || Math.abs(newWorldY) > 10000) {
        console.log('🚨 PREVENTING COORDINATE CORRUPTION DURING DRAG:', {
          nodeId: draggingNode.id,
          mouseDelta: { x: mouseDeltaX, y: mouseDeltaY },
          worldDelta: { x: worldDeltaX, y: worldDeltaY },
          dragStart: dragStartNodePos,
          newWorld: { x: newWorldX, y: newWorldY },
          zoom,
          camera
        })
        return // Don't update coordinates if they're corrupted
      }
      
      setNodes(nodes.map(node => 
        node.id === draggingNode.id 
          ? { ...node, worldX: newWorldX, worldY: newWorldY }
          : node
      ))
      setDraggingNode({ ...draggingNode, worldX: newWorldX, worldY: newWorldY })
      
    } else if (isDraggingViewport) {
      // Viewport dragging
      const mouseDeltaX = mouseX - dragStartMouse.x
      const mouseDeltaY = mouseY - dragStartMouse.y
      
      const cameraDeltaX = -mouseDeltaX / zoom
      const cameraDeltaY = -mouseDeltaY / zoom
      
      setCamera({
        x: dragStartCamera.x + cameraDeltaX,
        y: dragStartCamera.y + cameraDeltaY
      })
    }
  }, [isDraggingNode, isDraggingViewport, draggingNode, dragStartMouse, dragStartCamera, dragStartNodePos, zoom, camera, nodes, setNodes])

  const handleMouseUp = useCallback(async () => {
    if (isDraggingNode && draggingNode) {
      // Save node position
      const finalWorldX = draggingNode.worldX
      const finalWorldY = draggingNode.worldY
      const nodeToSave = draggingNode
      
      console.log('💾 SAVING NODE POSITION:', {
        nodeId: nodeToSave.id,
        finalWorld: { x: finalWorldX, y: finalWorldY },
        finalScreen: worldToScreen(finalWorldX, finalWorldY),
        dragStartWorld: dragStartNodePos,
        camera,
        zoom
      })
      
      // Clear drag state immediately to prevent further updates
      setIsDraggingNode(false)
      setDraggingNode(null)
      
      try {
        const pixelX = Math.round(finalWorldX)
        const pixelY = Math.round(finalWorldY)
        
        // Prevent saving corrupted coordinates to database
        if (Math.abs(pixelX) > 10000 || Math.abs(pixelY) > 10000) {
          console.log('🚨 PREVENTED SAVING CORRUPTED COORDINATES:', {
            nodeId: draggingNode.id,
            worldPos: { x: finalWorldX, y: finalWorldY },
            pixelPos: { x: pixelX, y: pixelY }
          })
          return
        }
        
        const dragUpdateData = {
          x_pixel: pixelX,
          y_pixel: pixelY
        }
        console.log('🎯 DRAG UPDATE DATA:', dragUpdateData)
        await eventService.updateEvent(nodeToSave.id, dragUpdateData)
        console.log('✅ Node position saved for node:', nodeToSave.id)
      } catch (err) {
        console.error('Failed to save node position:', err)
        // Reset node position on error
        setNodes(nodes.map(node => 
          node.id === nodeToSave.id 
            ? { ...node, worldX: dragStartNodePos.x, worldY: dragStartNodePos.y }
            : node
        ))
      }
    }
    
    // Clear remaining drag states
    setIsDraggingViewport(false)
  }, [isDraggingNode, draggingNode, worldToScreen, dragStartNodePos, camera, zoom, nodes, setNodes])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    
    // Viewport zoom
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.1, Math.min(5, zoom * zoomFactor))
    
    // Zoom towards mouse position
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      
      const worldPos = screenToWorld(mouseX, mouseY)
      setZoom(newZoom)
      
      // Adjust camera to keep mouse position fixed
      const newScreenPos = worldToScreen(worldPos.x, worldPos.y)
      const deltaX = (mouseX - newScreenPos.x) / newZoom
      const deltaY = (mouseY - newScreenPos.y) / newZoom
      
      setCamera(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }))
    }
  }, [zoom, screenToWorld, worldToScreen])

  return {
    // State
    camera,
    setCamera,
    zoom,
    setZoom,
    isDraggingViewport,
    isDraggingNode,
    draggingNode,
    saving,
    setSaving,
    saveError,
    setSaveError,
    
    // Refs and utils
    containerRef,
    setContainerRef,
    worldToScreen,
    screenToWorld,
    
    // Event handlers
    handleMouseDown,
    handleNodeMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel
  }
}