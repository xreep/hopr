import { defineConfig, devices } from '@playwright/test'

const API_PORT = 5055
const WEB_PORT = 4180

// End-to-end tests against a production build of the web app and a throwaway API
export default defineConfig({
  testDir: 'e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Maps would load tiles from the internet; the tests check the app, not the tiles
    serviceWorkers: 'block'
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /driver|tracking/ }
  ],
  webServer: [
    {
      command: 'node e2e/server.mjs',
      port: API_PORT,
      reuseExistingServer: false,
      env: { E2E_API_PORT: String(API_PORT), E2E_WEB_PORT: String(WEB_PORT) }
    },
    {
      command: `npm run build --workspace=frontend && cd frontend && npx vite preview --port ${WEB_PORT} --strictPort`,
      port: WEB_PORT,
      reuseExistingServer: false,
      timeout: 180000,
      env: { VITE_API_URL: '/api', VITE_PROXY_TARGET: `http://localhost:${API_PORT}` }
    }
  ]
})
