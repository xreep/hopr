import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ConfirmProvider } from './components/ConfirmDialog'
import ErrorBoundary from './components/ErrorBoundary'
// Overpass, served with the app (no third-party font requests)
import '@fontsource/overpass/400.css'
import '@fontsource/overpass/600.css'
import '@fontsource/overpass/700.css'
import '@fontsource/overpass/800.css'
import './index.css'
import { primeSpeechOnFirstGesture } from './utils/speak'
import { initMonitoring } from './utils/monitoring'

primeSpeechOnFirstGesture()
initMonitoring()

// Offline support for the driver app (production builds only, so development reloads stay fresh)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ConfirmProvider>
          <ErrorBoundary variant="page">
            <App />
          </ErrorBoundary>
        </ConfirmProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#FFFFFF',
              color: '#15191D',
              border: '1px solid #DCE0E3',
              borderRadius: '6px',
              fontSize: '14px',
              fontFamily: 'Overpass, ui-sans-serif, system-ui, sans-serif',
              boxShadow: '0 8px 24px rgb(16 24 32 / 0.12)'
            },
            success: { iconTheme: { primary: '#0B6B3A', secondary: '#FFFFFF' } },
            error: { iconTheme: { primary: '#C8102E', secondary: '#FFFFFF' } }
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)