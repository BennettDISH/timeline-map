import { useState, useCallback, useRef, useEffect } from 'react'
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
  
  // Container ready state to trigger re-renders
  const [containerReady, setContainerReady] = useState(false)

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
          setContainerReady(true)
        }
      }, 0)
    } else {
      setContainerReady(false)
    }
  }, [camera, zoom])
  
  // Force re-render when container dimensions change
  useEffect(() => {
    if (!containerRef.current) return
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setContainerReady(true)
        }
      }
    })
    
    resizeObserver.observe(containerRef.current)
    
    return () => resizeObserver.disconnect()
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
    const mouseX = e.clientX
    const mouseY = e.clientY
    
    // Only allow node dragging in edit mode and if node is not locked
    if (interactionMode === 'edit' && !node.locked) {
      e.stopPropagation() // Prevent map dragging for unlocked nodes
      setIsDraggingNode(true)
      setDraggingNode(node)
      setDragStartMouse({ x: mouseX, y: mouseY })
      setDragStartNodePos({ x: node.worldX, y: node.worldY })
      setIsDraggingViewport(false) // Stop viewport dragging
    }
    // For locked nodes or view mode, don't stop propagation - allow viewport panning
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
      
      // (no coordinate clamping — positions used as dragged)
      
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
      const finalWorldX = draggingNode.worldX
      const finalWorldY = draggingNode.worldY
      const nodeToSave = draggingNode
      const moved = finalWorldX !== dragStartNodePos.x || finalWorldY !== dragStartNodePos.y

      // Clear drag state immediately to prevent further updates
      setIsDraggingNode(false)
      setDraggingNode(null)

      // A click-to-select (no movement) must not issue a redundant position write
      if (moved) {
        try {
          await eventService.updateEvent(nodeToSave.id, {
            x_pixel: Math.round(finalWorldX),
            y_pixel: Math.round(finalWorldY)
          })
        } catch (err) {
          // Reset node position on error
          setNodes(nodes.map(node =>
            node.id === nodeToSave.id
              ? { ...node, worldX: dragStartNodePos.x, worldY: dragStartNodePos.y }
              : node
          ))
        }
      }
    }

    // Clear remaining drag states
    setIsDraggingViewport(false)
  }, [isDraggingNode, draggingNode, dragStartNodePos, nodes, setNodes])

  const handleWheel = useCallback((e) => {
    e.preventDefault()

    // Viewport zoom
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.1, Math.min(5, zoom * zoomFactor))

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // Keep the world point under the cursor fixed while zooming. screenToWorld uses the OLD
      // zoom; solve for the camera that maps that world point back to the cursor at newZoom:
      //   worldPos = camera + (mouse - center) / zoom  ->  camera = worldPos - (mouse - center) / newZoom
      const worldPos = screenToWorld(mouseX, mouseY)
      const centerX = rect.width / 2
      const centerY = rect.height / 2

      setZoom(newZoom)
      setCamera({
        x: worldPos.x - (mouseX - centerX) / newZoom,
        y: worldPos.y - (mouseY - centerY) / newZoom
      })
    }
  }, [zoom, screenToWorld])

  // Keep a drag alive when the pointer leaves the container: bind move/up to window for the
  // duration of the drag so a release anywhere ends it (and saves). The container itself no
  // longer wires onMouseMove/onMouseUp, so there is no double-handling.
  useEffect(() => {
    if (!isDraggingNode && !isDraggingViewport) return
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingNode, isDraggingViewport, handleMouseMove, handleMouseUp])

  // Attach wheel natively with { passive: false } so preventDefault actually suppresses page
  // scroll — React's synthetic onWheel is passive and ignores preventDefault.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel, { passive: false })
  }, [handleWheel, containerReady])

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
    containerReady,
    
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