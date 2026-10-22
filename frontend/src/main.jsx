import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ConfirmProvider } from './components/ConfirmDialog'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import { primeSpeechOnFirstGesture } from './utils/speak'

primeSpeechOnFirstGesture()

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