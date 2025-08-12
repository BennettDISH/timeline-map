import axios from 'axios'

const API_BASE = '/api/image-folders'

// Create axios instance with auth headers
const createAuthAPI = () => {
  const token = localStorage.getItem('auth_token')
  return axios.create({
    baseURL: API_BASE,
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
}

const imageFolderService = {
  // Get all folders for a world
  async getFolders(worldId) {
    try {
      const api = createAuthAPI()
      const response = await api.get(`/?world_id=${worldId}`)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch folders' }
    }
  },

  // Create a new folder
  async createFolder(folderData) {
    try {
      const api = createAuthAPI()
      const response = await api.post('/', folderData)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to create folder' }
    }
  },

  // Update a folder
  async updateFolder(folderId, updateData) {
    try {
      const api = createAuthAPI()
      const response = await api.put(`/${folderId}`, updateData)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to update folder' }
    }
  },

  // Delete a folder
  async deleteFolder(folderId) {
    try {
      const api = createAuthAPI()
      const response = await api.delete(`/${folderId}`)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to delete folder' }
    }
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