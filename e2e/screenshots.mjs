// README screenshots, taken from the development servers with demo data loaded
// (npm run dev, DEMO_MODE=true, then npm run seed --workspace=backend):
//   node e2e/screenshots.mjs [http://localhost:3000]
// Writes JPEGs to docs/screenshots/. Uses real road geometry and map tiles, so it needs
// the internet.
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.argv[2] || 'http://localhost:3000'
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 82 })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

async function signIn(page, role) {
  await page.goto(`${BASE}/login`)
  await page.getByRole('button', { name: role, exact: true }).click()
  await page.waitForURL(/\/dashboard$/)
}

const browser = await chromium.launch()

// Desktop: homepage, planner, dashboard during a demo morning
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' })
const page = await desktop.newPage()
await page.goto(BASE)
await wait(9000) // the street map loads once the page is idle, then the van gets going
await shot(page, 'homepage')

await signIn(page, 'Fleet manager')
await page.goto(`${BASE}/route-planner`)
await page.getByRole('group', { name: 'Your hubs' }).getByRole('button', { name: /Okhla/ }).click()
await page.getByLabel('Upload CSV of deliveries').setInputFiles({
  name: 'deliveries.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from(`address,customer,phone,priority,window start,window end,weight kg,notes,lat,lng
"Connaught Place, New Delhi, Delhi 110001",Aditi Malhotra,,standard,,,3,,28.6318,77.2194
"Khan Market, New Delhi, Delhi 110003",Rahul Khanna,,urgent,,,6,,28.5991,77.2263
"Lajpat Nagar Central Market, New Delhi, Delhi 110024",Simran Kaur,,standard,,,2,,28.5677,77.2433
"Hauz Khas Village, New Delhi, Delhi 110016",Vikram Sethi,,standard,,,4,,28.5535,77.1940
"Select Citywalk, Saket, New Delhi, Delhi 110017",Meera Bhatia,,standard,,,1.5,,28.5286,77.2193
"India Gate, New Delhi, Delhi 110001",Arjun Kapoor,,standard,,,2,,28.6129,77.2295
`)
})
await page.getByRole('checkbox', { name: /Tata Ace EV/ }).check()
await page.getByRole('button', { name: 'Optimize routes' }).click()
await page.getByRole('heading', { name: 'Optimized plan' }).waitFor({ timeout: 30000 })
await wait(4000)
await shot(page, 'planner')

await page.goto(`${BASE}/dashboard`)
await page.getByRole('button', { name: 'Run a demo morning' }).click()
await wait(30000) // let the vans get a few stops in
await page.getByRole('button', { name: /Zoom the map to Pooja/ }).click()
await wait(5000)
await shot(page, 'dashboard')

// A tracking link for a Delhi customer still waiting
const token = await page.evaluate(async () => {
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` }
  const { routes } = await (await fetch('/api/routes?status=active&limit=50', { headers })).json()
  const delhi = routes.find(r => r.name === 'New Delhi morning run')
  const { route } = await (await fetch(`/api/routes/${delhi._id}`, { headers })).json()
  return route.stops.filter(s => s.status === 'pending').sort((a, b) => b.sequence - a.sequence)[0].trackingToken
})

// Phone: the driver app and the customer's tracking page in Hindi
const phone = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' })
const driverPage = await phone.newPage()
await signIn(driverPage, 'Driver')
await driverPage.goto(`${BASE}/driver-panel`)
await wait(5000)
await shot(driverPage, 'driver')

const trackPage = await phone.newPage()
await trackPage.goto(`${BASE}/track/${token}`)
await trackPage.getByRole('button', { name: 'हिंदी' }).click()
await wait(6000)
await shot(trackPage, 'tracking-hindi')

await browser.close()
console.log(`Screenshots saved to ${OUT}`)
