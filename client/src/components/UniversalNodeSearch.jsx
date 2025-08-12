import React, { useState, useEffect, useRef } from 'react'
import nodeSearchService from '../services/nodeSearchService'

function UniversalNodeSearch({ 
  worldId, 
  currentMapId, 
  availableMaps = [], 
  onNodeSelect, 
  placeholder = "Search for any node across all maps...",
  value = "",
  className = ""
}) {
  const [searchQuery, setSearchQuery] = useState(value)
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  
  const searchRef = useRef(null)
  const resultsRef = useRef(null)
  
  // Create a map lookup for map titles
  const mapLookup = Object.fromEntries(
    availableMaps.map(map => [map.id, map.title])
  )

  // Debounced search function
  useEffect(() => {
    const searchTimeout = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        await performSearch(searchQuery)
      } else {
        setSearchResults([])
        setShowResults(false)
      }
    }, 300)

    return () => clearTimeout(searchTimeout)
  }, [searchQuery, availableMaps])

  const performSearch = async (query) => {
    setIsSearching(true)
    try {
      // Use the new API endpoint to search across all maps
      const searchResult = await nodeSearchService.searchNodes(worldId, query)
      
      if (searchResult.error) {
        console.error('Search error:', searchResult.error)
        setSearchResults([])
        setShowResults(false)
        return
      }
      
      setSearchResults(searchResult.results.slice(0, 20)) // Limit to 20 results
      setShowResults(searchResult.results.length > 0)
      setSelectedIndex(-1)
    } catch (error) {
      console.error('Search failed:', error)
      setSearchResults([])
      setShowResults(false)
    } finally {
      setIsSearching(false)
    }
  }

  const handleInputChange = (e) => {
    setSearchQuery(e.target.value)
  }

  const handleKeyDown = (e) => {
    if (!showResults) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => 
          prev < searchResults.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1)
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && searchResults[selectedIndex]) {
          selectNode(searchResults[selectedIndex])
        }
        break
      case 'Escape':
        setShowResults(false)
        setSelectedIndex(-1)
        break
    }
  }

  const selectNode = (node) => {
    setSearchQuery(node.displayText)
    setShowResults(false)
    setSelectedIndex(-1)
    
    if (onNodeSelect) {
      onNodeSelect({
        nodeId: node.id,
        mapId: node.mapId,
        title: node.title,
        nodeType: node.nodeType,
        mapTitle: node.mapTitle
      })
    }
  }

  const handleClickOutside = (e) => {
    if (searchRef.current && !searchRef.current.contains(e.target)) {
      setShowResults(false)
      setSelectedIndex(-1)
    }
  }

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={`universal-search ${className}`} ref={searchRef}>
      <div className="search-input-container">
        <input
          type="text"
          value={searchQuery}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => searchQuery.length >= 2 && setShowResults(searchResults.length > 0)}
          placeholder={placeholder}
          className="universal-search-input"
        />
        {isSearching && (
          <div className="search-spinner">🔍</div>
        )}
      </div>
      
      {showResults && (
        <div className="search-results" ref={resultsRef}>
          {searchResults.map((result, index) => (
            <div
              key={`${result.mapId}-${result.id}`}
              className={`search-result-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => selectNode(result)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="result-main">
                <span className="result-icon">{result.icon}</span>
                <span className="result-title">{result.title}</span>
                <span className="result-map">({result.mapTitle})</span>
              </div>
              {result.description && (
                <div className="result-description">{result.description}</div>
              )}
            </div>
          ))}
          
          {searchResults.length === 0 && searchQuery.length >= 2 && !isSearching && (
            <div className="no-results">
              No nodes found matching "{searchQuery}"
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default UniversalNodeSearch