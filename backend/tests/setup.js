// Runs before every test file. Database-backed suites opt in via useTestDb().
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-only-secret-not-used-anywhere-else'
delete process.env.MAPBOX_TOKEN
