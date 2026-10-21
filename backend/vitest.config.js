import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    testTimeout: 30000,
    hookTimeout: 120000,
    // Each file gets its own in-memory MongoDB; run files serially to keep memory low
    fileParallelism: false
  }
})
