// Backend has no compile step. "Build" verifies every module parses and all
// imports resolve by loading the Express app (without connecting to MongoDB).
const started = Date.now()
await import('../src/app.js')
console.log(`backend build check ok (${Date.now() - started}ms)`)
process.exit(0)
