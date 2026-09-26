import http from './http'

const API_BASE = '/api/image-folders'

const imageFolderService = {
  // Get all folders for a world
  async getFolders(worldId) {
    const response = await http.get(`${API_BASE}/?world_id=${worldId}`)
    return response.data
  },

  // Create a new folder
  async createFolder(folderData) {
    const response = await http.post(`${API_BASE}/`, folderData)
    return response.data
  },

  // Update a folder
  async updateFolder(folderId, updateData) {
    const response = await http.put(`${API_BASE}/${folderId}`, updateData)
    return response.data
  },

  // Delete a folder
  async deleteFolder(folderId) {
    const response = await http.delete(`${API_BASE}/${folderId}`)
    return response.data
  },

  // Helper function to build folder tree structure
  buildFolderTree(folders) {
    const folderMap = new Map()
    const rootFolders = []

    // First pass: create all folder objects
    folders.forEach(folder => {
      folderMap.set(folder.id, {
        ...folder,
        children: []
      })
    })

    // Second pass: build hierarchy
    folders.forEach(folder => {
      if (folder.parentId) {
        const parent = folderMap.get(folder.parentId)
        const child = folderMap.get(folder.id)
        if (parent && child) {
          parent.children.push(child)
        }
      } else {
        const rootFolder = folderMap.get(folder.id)
        if (rootFolder) {
          rootFolders.push(rootFolder)
        }
      }
    })

    return rootFolders
  },

  // Get folder path for breadcrumbs
  getFolderPath(folders, folderId) {
    const folderMap = new Map()
    folders.forEach(folder => folderMap.set(folder.id, folder))

    const path = []
    let currentId = folderId

    while (currentId) {
      const folder = folderMap.get(currentId)
      if (folder) {
        path.unshift(folder)
        currentId = folder.parentId
      } else {
        break
      }
    }

    return path
  }
}

export default imageFolderService