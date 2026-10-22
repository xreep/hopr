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
