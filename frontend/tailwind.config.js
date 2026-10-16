/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1e3a8a',
        background: '#f8fafc',
        surface: '#ffffff',
        border: '#e2e8f0',
        muted: '#94a3b8',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444'
      }
    }
  },
  plugins: []
}
