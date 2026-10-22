import { expect } from '@playwright/test'

// Signs in with one of the demo accounts from the sign-in page's demo buttons
export async function signInAs(page, role) {
  await page.goto('/login')
  await page.getByRole('button', { name: role, exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

// A tracking link for the next undelivered stop on the Ranchi demo route
export async function trackingLink(request) {
  const login = await request.post('/api/auth/login', { data: { email: 'manager@hopr.com', password: 'manager123' } })
  const headers = { Authorization: `Bearer ${(await login.json()).token}` }
  const { routes } = await (await request.get('/api/routes?limit=50', { headers })).json()
  const ranchi = routes.find(r => r.name === 'Ranchi morning run')
  const { route } = await (await request.get(`/api/routes/${ranchi._id}`, { headers })).json()
  const stop = route.stops.filter(s => s.status === 'pending' || s.status === 'in_progress').sort((a, b) => b.sequence - a.sequence)[0]
  return `/track/${stop.trackingToken}`
}
