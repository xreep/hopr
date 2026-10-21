import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:5001',
        changeOrigin: true
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Vendor chunks (Mapbox GL is loaded on demand by the map component)
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/](chart\.js|react-chartjs-2)[\\/]/.test(id)) return 'charts'
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react'
          return undefined
        }
      }
    },
    chunkSizeWarningLimit: 2100
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['src/test/setup.js']
  }
})
