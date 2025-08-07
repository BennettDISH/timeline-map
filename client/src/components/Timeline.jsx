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
    <div className={`timeline-container ${timelineActive ? 'active' : 'inactive'}`}>
      <div className="timeline-content">
        <button
          onClick={onToggleActive}
          className={`timeline-toggle ${timelineActive ? 'active' : ''}`}
          title={timelineActive ? 'Click to show all nodes' : 'Click to activate timeline filtering'}
        >
          <span className="toggle-icon">
            {timelineActive ? '⏸️' : '▶️'}
          </span>
          Timeline
        </button>
        
        <div className="timeline-range-display">
          {timelineSettings.minTime}
        </div>
        
        <div className="timeline-slider-container">
          <input
            type="range"
            className="timeline-slider"
            min={timelineSettings.minTime}
            max={timelineSettings.maxTime}
            value={currentTime}
            onChange={(e) => timelineActive && onTimelineChange(parseInt(e.target.value))}
            disabled={!timelineActive}
          />
          <div 
            className="slider-fill"
            style={{
              width: timelineActive 
                ? `${((currentTime - timelineSettings.minTime) / (timelineSettings.maxTime - timelineSettings.minTime)) * 100}%`
                : '0%'
            }}
          />
        </div>
        
        <div className="timeline-range-display">
          {timelineSettings.maxTime}
        </div>
        
        <div className="timeline-current-time">
          <span className="time-value">{currentTime}</span>
          <span className="time-unit">{timelineSettings.timeUnit}</span>
        </div>
      </div>
    </div>
  )
}

export default Timeline