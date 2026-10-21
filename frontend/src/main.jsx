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
              background: '#141E33',
              color: '#F4F7FB',
              border: '1px solid rgb(169 180 200 / 0.14)',
              borderRadius: '12px',
              fontSize: '14px',
              boxShadow: '0 20px 40px -16px rgb(0 0 0 / 0.9)'
            },
            success: { iconTheme: { primary: '#D4FF3F', secondary: '#070B14' } },
            error: { iconTheme: { primary: '#FF6B78', secondary: '#070B14' } }
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)