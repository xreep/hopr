import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// The security headers Vercel sends (vercel.json), also sent by `vite preview` so a local
// production build is checked against the same Content Security Policy. HSTS is left to
// the HTTPS host.
const siteHeaders = Object.fromEntries(
  JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')).headers
    .find(h => h.source === '/(.*)').headers
    .filter(h => h.key !== 'Strict-Transport-Security')
    .map(h => [h.key, h.value])
)

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
  preview: { headers: siteHeaders },
  // MapLibre's worker is an ES module; keep it one when Vite bundles it
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      output: {
        // Vendor chunks (MapLibre GL is loaded on demand by the map component)
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
