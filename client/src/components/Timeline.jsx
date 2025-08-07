import React from 'react'

function Timeline({ 
  timelineEnabled, 
  currentTime, 
  timelineSettings, 
  onTimelineChange 
}) {
  if (!timelineEnabled) return null

  return (
    <div className="timeline-container">
      <div className="timeline-header">
        <span className="timeline-label">Timeline: {currentTime} {timelineSettings.timeUnit}</span>
        <div className="timeline-actions"></div>
      </div>
      
      <div className="timeline-controls">
        <span className="timeline-min">{timelineSettings.minTime}</span>
        <input
          type="range"
          min={timelineSettings.minTime}
          max={timelineSettings.maxTime}
          value={currentTime}
          onChange={(e) => onTimelineChange(e.target.value)}
          className="timeline-slider"
        />
        <span className="timeline-max">{timelineSettings.maxTime}</span>
      </div>
    </div>
  )
}

export default Timeline