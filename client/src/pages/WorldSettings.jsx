import React, { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import axios from 'axios'

function WorldSettings() {
  const { worldId } = useParams()
  const navigate = useNavigate()
  
  const [world, setWorld] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  const [worldFormData, setWorldFormData] = useState({
    name: '',
    description: ''
  })
  
  const [timelineFormData, setTimelineFormData] = useState({
    timelineEnabled: false,
    minTime: 0,
    maxTime: 100,
    currentTime: 50,
    timeUnit: 'years'
  })

  useEffect(() => {
    if (worldId) {
      loadWorld()
    }
  }, [worldId])

  const createAuthAPI = () => {
    const token = localStorage.getItem('auth_token')
    return axios.create({
      baseURL: '/api',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
  }

  const loadWorld = async () => {
    try {
      setLoading(true)
      const api = createAuthAPI()
      const response = await api.get(`/worlds/${worldId}`)
      const worldData = response.data.world
      
      setWorld(worldData)
      setWorldFormData({
        name: worldData.name || '',
        description: worldData.description || ''
      })
      
      setTimelineFormData({
        timelineEnabled: worldData.timelineEnabled || false,
        minTime: worldData.timelineSettings?.minTime || 0,
        maxTime: worldData.timelineSettings?.maxTime || 100,
        currentTime: worldData.timelineSettings?.currentTime || 50,
        timeUnit: worldData.timelineSettings?.timeUnit || 'years'
      })
      
      setError('')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load world')
    } finally {
      setLoading(false)
    }
  }

  const handleWorldSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const api = createAuthAPI()
      await api.put(`/worlds/${worldId}`, worldFormData)
      setSuccess('World details updated successfully!')
      loadWorld() // Reload to get updated data
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update world details')
    } finally {
      setSaving(false)
    }
  }

  const handleTimelineSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const api = createAuthAPI()
      await api.put(`/worlds/${worldId}/timeline`, {
        timeline_enabled: timelineFormData.timelineEnabled,
        timeline_min_time: timelineFormData.minTime,
        timeline_max_time: timelineFormData.maxTime,
        timeline_current_time: timelineFormData.currentTime,
        timeline_time_unit: timelineFormData.timeUnit
      })
      setSuccess('Timeline settings updated successfully!')
      loadWorld() // Reload to get updated data
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update timeline settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="map-viewer-loading">
        <h2>Loading world settings...</h2>
      </div>
    )
  }

  if (error && !world) {
    return (
      <div className="map-viewer-error">
        <h2>Error Loading World</h2>
        <p>{error}</p>
        <Link to="/maps" className="back-link">← Back to Maps</Link>
      </div>
    )
  }

  return (
    <div className="map-manager">
      <div className="page-header">
        <div className="header-content">
          <h1>World Settings: {world?.name}</h1>
          <Link to="/maps" className="back-link">← Back to Maps</Link>
        </div>
      </div>

      <div className="manager-content">
        {error && (
          <div className="error-message" style={{ 
            background: '#f56565', 
            color: 'white', 
            padding: '15px', 
            borderRadius: '6px', 
            marginBottom: '20px' 
          }}>
            {error}
          </div>
        )}

        {success && (
          <div className="success-message" style={{ 
            background: '#48bb78', 
            color: 'white', 
            padding: '15px', 
            borderRadius: '6px', 
            marginBottom: '20px' 
          }}>
            {success}
          </div>
        )}

        {/* World Details Section */}
        <div className="create-map-form">
          <h3>World Details</h3>
          <form onSubmit={handleWorldSave}>
            <div className="form-group">
              <label>World Name</label>
              <input
                type="text"
                value={worldFormData.name}
                onChange={(e) => setWorldFormData({...worldFormData, name: e.target.value})}
                required
                disabled={saving}
              />
            </div>
            
            <div className="form-group">
              <label>Description</label>
              <textarea
                value={worldFormData.description}
                onChange={(e) => setWorldFormData({...worldFormData, description: e.target.value})}
                rows={3}
                disabled={saving}
              />
            </div>
            
            <div className="form-actions">
              <button type="submit" disabled={saving}>
                {saving ? '💾 Saving...' : 'Save World Details'}
              </button>
            </div>
          </form>
        </div>

        {/* Timeline Settings Section */}
        <div className="create-map-form">
          <h3>Timeline Settings</h3>
          <p>Configure timeline settings that apply to all maps in this world.</p>
          
          <form onSubmit={handleTimelineSave}>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={timelineFormData.timelineEnabled}
                  onChange={(e) => setTimelineFormData({...timelineFormData, timelineEnabled: e.target.checked})}
                  disabled={saving}
                />
                Enable Timeline for this World
              </label>
            </div>
            
            {timelineFormData.timelineEnabled && (
              <>
                <div className="form-group">
                  <label>Time Unit</label>
                  <select
                    value={timelineFormData.timeUnit}
                    onChange={(e) => setTimelineFormData({...timelineFormData, timeUnit: e.target.value})}
                    disabled={saving}
                  >
                    <option value="years">Years</option>
                    <option value="months">Months</option>
                    <option value="days">Days</option>
                    <option value="hours">Hours</option>
                    <option value="turns">Turns</option>
                    <option value="rounds">Rounds</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label>Minimum Time</label>
                  <input
                    type="number"
                    value={timelineFormData.minTime}
                    onChange={(e) => setTimelineFormData({...timelineFormData, minTime: parseInt(e.target.value) || 0})}
                    disabled={saving}
                  />
                </div>
                
                <div className="form-group">
                  <label>Maximum Time</label>
                  <input
                    type="number"
                    value={timelineFormData.maxTime}
                    onChange={(e) => setTimelineFormData({...timelineFormData, maxTime: parseInt(e.target.value) || 100})}
                    disabled={saving}
                  />
                </div>
                
                <div className="form-group">
                  <label>Current Time</label>
                  <input
                    type="number"
                    value={timelineFormData.currentTime}
                    onChange={(e) => setTimelineFormData({...timelineFormData, currentTime: parseInt(e.target.value) || 50})}
                    min={timelineFormData.minTime}
                    max={timelineFormData.maxTime}
                    disabled={saving}
                  />
                </div>
              </>
            )}
            
            <div className="form-actions">
              <button type="submit" disabled={saving}>
                {saving ? '💾 Saving...' : 'Save Timeline Settings'}
              </button>
            </div>
          </form>
        </div>

        {/* World Stats */}
        <div className="create-map-form">
          <h3>World Statistics</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
            <div>
              <strong>Total Maps:</strong> {world?.mapCount || 0}
            </div>
            <div>
              <strong>Total Images:</strong> {world?.imageCount || 0}
            </div>
            <div>
              <strong>Created:</strong> {world?.createdAt ? new Date(world.createdAt).toLocaleDateString() : 'Unknown'}
            </div>
            <div>
              <strong>Last Updated:</strong> {world?.updatedAt ? new Date(world.updatedAt).toLocaleDateString() : 'Unknown'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WorldSettings