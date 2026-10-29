import { test, expect } from '@playwright/test'
import { trackingLink } from './helpers.mjs'

test('a customer follows their delivery and switches to Hindi', async ({ page, request }) => {
  await page.goto(await trackingLink(request))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/is on the way|is arriving|Your order is packed/)
  await expect(page.getByText('Delivering to')).toBeVisible()

  await page.getByRole('button', { name: 'हिंदी' }).click()
  await expect(page.getByText('पता', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'English' })).toBeVisible()
})

test('an unknown tracking link says so', async ({ page }) => {
  await page.goto('/track/this-is-not-a-real-tracking-token')
  await expect(page.getByText('This tracking link is not valid.')).toBeVisible()
})

test('a customer sees the expected arrival when the driver shares no location', async ({ page, request }) => {
  // A fresh driver and route, so the shared demo routes are left alone. Its own address,
  // so these sign-ins don't count against the browser tests' sign-in limit.
  const own = { 'X-Forwarded-For': '203.0.113.19' }
  const login = await (await request.post('/api/auth/login', { headers: own, data: { email: 'manager@hopr.com', password: 'manager123' } })).json()
  const manager = { Authorization: `Bearer ${login.token}` }
  const email = `e2e-no-gps-${Date.now()}@example.test`
  const signup = await (await request.post('/api/auth/register', { headers: own, data: { name: 'Sunil Test', email, password: 'e2e-no-gps-1' } })).json()
  const { user } = signup
  const hub = { name: 'Hopr Hub, Kokar', address: 'Kokar, Ranchi, Jharkhand 834001', coordinates: [85.3521, 23.3756] }
  const saved = await (await request.post('/api/routes', {
    headers: manager,
    data: {
      name: 'E2E no GPS', depot: hub, vehicleType: 'van', departureTime: new Date().toISOString(), assignments: [{ driver: user._id }],
      stops: [
        { address: 'Lalpur Chowk, Circular Road, Lalpur, Ranchi, Jharkhand 834001', coordinates: [85.3383, 23.3722], customerName: 'Asha Test' },
        { address: 'Morabadi Maidan, Morabadi, Ranchi, Jharkhand 834008', coordinates: [85.3278, 23.3909], customerName: 'Vikas Test' }
      ]
    }
  })).json()
  const route = saved.routes[0]
  const driver = { Authorization: `Bearer ${signup.token}` }
  expect((await request.patch(`/api/routes/${route._id}/start`, { headers: driver })).ok()).toBe(true)

  const last = route.stops.sort((a, b) => b.sequence - a.sequence)[0]
  await page.goto(`/track/${last.trackingToken}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/is on the way/)
  await expect(page.getByText(/Expected around \d{1,2}:\d{2}/)).toBeVisible()
  await expect(page.getByText('Live location isn’t shared yet.')).toBeVisible()

  await page.getByRole('button', { name: 'हिंदी' }).click()
  await expect(page.getByText('लाइव लोकेशन अभी शेयर नहीं हुई है।')).toBeVisible()
})
