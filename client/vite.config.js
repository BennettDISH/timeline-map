import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rolldownOptions: {
      output: {
        // the same two long-lived chunks as before: React and the router, and axios
        codeSplitting: {
          groups: [
            { name: 'vendor', test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run[\\/]router)[\\/]/ },
            { name: 'utils', test: /[\\/]node_modules[\\/]axios[\\/]/ }
          ]
        }
      }
    }
  }
})