import React from 'react'

function Timeline({ 
  timelineEnabled, 
  currentTime, 
  timelineSettings, 
  onTimelineChange 
}) {
  if (!timelineEnabled) return null

  return (
    <div className="timeline-container" style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      padding: '12px 20px',
      boxShadow: '0 -2px 10px rgba(0,0,0,0.2)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      gap: '15px'
    }}>
      <div style={{ 
        fontSize: '14px', 
        fontWeight: '600',
        minWidth: '60px'
      }}>
        Timeline
      </div>
      
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
        onChange={(e) => onTimelineChange(parseInt(e.target.value))}
        style={{
          flex: 1,
          height: '6px',
          background: 'rgba(255,255,255,0.3)',
          borderRadius: '3px',
          outline: 'none',
          cursor: 'pointer'
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