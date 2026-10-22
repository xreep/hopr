import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { signInAs, trackingLink } from './helpers.mjs'

// WCAG 2.1 A and AA checks on every main screen. Serious and critical issues fail the run.
async function expectAccessible(page, name) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.maplibregl-canvas') // the map canvas is decorative; markers carry the labels
    .analyze()
  const serious = violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
  expect(serious.map(v => `${name}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}

test('public pages', async ({ page, request }) => {
  for (const [path, name] of [['/', 'homepage'], ['/login', 'sign-in']]) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await expectAccessible(page, name)
  }
  await page.goto(await trackingLink(request))
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectAccessible(page, 'tracking')
})

test('manager screens', async ({ page }) => {
  await signInAs(page, 'Fleet manager')
  for (const [path, heading] of [
    ['/dashboard', /Good (morning|afternoon|evening)/],
    ['/route-planner', 'Route planner'],
    ['/routes', 'Routes and dispatch'],
    ['/monitor', /Live monitor/],
    ['/vehicles', /Vehicles/],
    ['/drivers', /Drivers/],
    ['/analytics', /Analytics/]
  ]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expectAccessible(page, path)
  }
})

test('driver screens', async ({ page }) => {
  await signInAs(page, 'Driver')
  await page.goto('/driver-panel')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await expectAccessible(page, 'driver panel')
})
