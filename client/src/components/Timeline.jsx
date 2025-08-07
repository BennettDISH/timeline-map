import React from 'react'

function Timeline({ 
  timelineEnabled, 
  timelineActive,
  currentTime, 
  timelineSettings, 
  onTimelineChange,
  onToggleActive
}) {
  if (!timelineEnabled) return null

  return (
    <div className="timeline-container" style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: timelineActive 
        ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        : 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)',
      color: 'white',
      padding: '12px 20px',
      boxShadow: '0 -2px 10px rgba(0,0,0,0.2)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      gap: '15px',
      transition: 'background 0.3s ease'
    }}>
      <button
        onClick={onToggleActive}
        style={{
          background: 'none',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '600',
          minWidth: '60px',
          padding: '4px 8px',
          borderRadius: '4px',
          background: timelineActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
          transition: 'all 0.2s ease'
        }}
        title={timelineActive ? 'Click to show all nodes' : 'Click to activate timeline filtering'}
      >
        {timelineActive ? '⏸️ Timeline' : '▶️ Timeline'}
      </button>
      
      <div style={{ 
        fontSize: '12px', 
        minWidth: '40px',
        textAlign: 'center',
        opacity: 0.8
      }}>
        {timelineSettings.minTime}
      </div>
      
      <input
        type="range"
        min={timelineSettings.minTime}
        max={timelineSettings.maxTime}
        value={currentTime}
        onChange={(e) => timelineActive && onTimelineChange(parseInt(e.target.value))}
        disabled={!timelineActive}
        style={{
          flex: 1,
          height: '6px',
          background: timelineActive ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
          borderRadius: '3px',
          outline: 'none',
          cursor: timelineActive ? 'pointer' : 'not-allowed',
          opacity: timelineActive ? 1 : 0.5,
          transition: 'all 0.2s ease'
        }}
      />
      
      <div style={{ 
        fontSize: '12px', 
        minWidth: '40px',
        textAlign: 'center',
        opacity: 0.8
      }}>
        {timelineSettings.maxTime}
      </div>
      
      <div style={{
        fontSize: '14px',
        fontWeight: '500',
        minWidth: '120px',
        textAlign: 'right',
        background: 'rgba(255,255,255,0.2)',
        padding: '4px 8px',
        borderRadius: '12px'
      }}>
        {currentTime} {timelineSettings.timeUnit}
      </div>
    </div>
  )
}

export default Timeline