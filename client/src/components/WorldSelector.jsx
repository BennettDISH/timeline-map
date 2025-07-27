import React, { useState, useEffect } from 'react'
import worldService from '../services/worldService'

function WorldSelector({ onWorldSelect, currentWorldId = null }) {
  const [worlds, setWorlds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newWorldName, setNewWorldName] = useState('')
  const [newWorldDescription, setNewWorldDescription] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadWorlds()
  }, [])

  const loadWorlds = async () => {
    try {
      setLoading(true)
      const result = await worldService.getWorlds()
      setWorlds(result.worlds)
      setError('')

      // Auto-select if only one world or restore previous selection
      if (result.worlds.length === 1 && !currentWorldId) {
        handleWorldSelect(result.worlds[0])
      } else if (currentWorldId) {
        const currentWorld = result.worlds.find(w => w.id === parseInt(currentWorldId))
        if (currentWorld && onWorldSelect) {
          onWorldSelect(currentWorld)
        }
      }
    } catch (err) {
      console.error('Failed to load worlds:', err)
      setError(err.message || 'Failed to load worlds')
    } finally {
      setLoading(false)
    }
  }

  const handleWorldSelect = (world) => {
    worldService.setCurrentWorld(world)
    if (onWorldSelect) {
      onWorldSelect(world)
    }
  }

  const handleCreateWorld = async (e) => {
    e.preventDefault()
    
    if (!newWorldName.trim()) {
      setError('World name is required')
      return
    }

    setCreating(true)
    setError('')

    try {
      const result = await worldService.createWorld({
        name: newWorldName.trim(),
        description: newWorldDescription.trim() || null
      })

      // Add new world to list and select it
      const newWorld = result.world
      setWorlds([newWorld, ...worlds])
      handleWorldSelect(newWorld)
      
      // Reset form
      setNewWorldName('')
      setNewWorldDescription('')
      setShowCreateForm(false)
    } catch (err) {
      console.error('Failed to create world:', err)
      setError(err.message || 'Failed to create world')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteWorld = async (worldId, e) => {
    e.stopPropagation()
    
    const world = worlds.find(w => w.id === worldId)
    if (!confirm(`Are you sure you want to delete "${world.name}"? This will permanently delete all maps, events, and images in this world.`)) {
      return
    }

    try {
      await worldService.deleteWorld(worldId)
      setWorlds(worlds.filter(w => w.id !== worldId))
      
      // Clear current world if it was deleted
      if (currentWorldId === worldId) {
        worldService.setCurrentWorld(null)
        if (onWorldSelect) {
          onWorldSelect(null)
        }
      }
    } catch (err) {
      console.error('Failed to delete world:', err)
      setError(err.message || 'Failed to delete world')
    }
  }

  if (loading) {
    return <div className="world-selector-loading">Loading worlds...</div>
  }

  return (
    <div className="world-selector">
      <div className="world-selector-header">
        <h3>Select World</h3>
        <button 
          className="create-world-button"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? '✕ Cancel' : '+ New World'}
        </button>
      </div>

      {error && (
        <div className="world-selector-error">
          {error}
        </div>
      )}

      {showCreateForm && (
        <div className="create-world-form">
          <form onSubmit={handleCreateWorld}>
            <div className="form-group">
              <label htmlFor="world-name">World Name</label>
              <input
                type="text"
                id="world-name"
                value={newWorldName}
                onChange={(e) => setNewWorldName(e.target.value)}
                placeholder="Enter world name..."
                required
                disabled={creating}
              />
            </div>
            <div className="form-group">
              <label htmlFor="world-description">Description (optional)</label>
              <textarea
                id="world-description"
                value={newWorldDescription}
                onChange={(e) => setNewWorldDescription(e.target.value)}
                placeholder="Describe your world..."
                rows={3}
                disabled={creating}
              />
            </div>
            <div className="form-actions">
              <button type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Create World'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="worlds-list">
        {worlds.length === 0 ? (
          <div className="no-worlds">
            <p>No worlds created yet. Create your first world to get started!</p>
          </div>
        ) : (
          worlds.map(world => (
            <div 
              key={world.id}
              className={`world-item ${currentWorldId === world.id ? 'selected' : ''}`}
              onClick={() => handleWorldSelect(world)}
            >
              <div className="world-info">
                <div className="world-name">{world.name}</div>
                {world.description && (
                  <div className="world-description">{world.description}</div>
                )}
                <div className="world-stats">
                  {world.mapCount} maps • {world.imageCount} images
                </div>
              </div>
              <div className="world-actions">
                <button 
                  className="delete-world-button"
                  onClick={(e) => handleDeleteWorld(world.id, e)}
                  title="Delete world"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default WorldSelector