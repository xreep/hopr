import { test, expect } from '@playwright/test'
import { signInAs } from './helpers.mjs'

async function openDeliveries(page) {
  await signInAs(page, 'Driver')
  await page.goto('/driver-panel')
  await expect(page.getByRole('heading', { name: 'My deliveries' })).toBeVisible()
  const start = page.getByRole('button', { name: 'Start route' })
  if (await start.isVisible()) await start.click()
  await expect(page.getByText(/^Stop \d of 5$/)).toBeVisible()
}

// The dock on phones and the card on larger screens carry the same actions
const action = (page, name) => page.getByRole('button', { name }).filter({ visible: true }).first()

test('a driver delivers with the customer’s signature', async ({ page }) => {
  await openDeliveries(page)
  await action(page, /^(Mark delivered|Delivered)$/).click()

  const pad = page.getByRole('img', { name: /Customer signature drawing area/ })
  const box = await pad.boundingBox()
  await page.mouse.move(box.x + 20, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 20, { steps: 8 })
  await page.mouse.move(box.x + box.width - 20, box.y + box.height - 20, { steps: 8 })
  await page.mouse.up()

  await page.getByRole('button', { name: 'Complete delivery' }).click()
  await expect(page.getByText('Delivery completed with proof')).toBeVisible()
})

test('a delivery made without signal is kept on the phone and sent when it reconnects', async ({ page, context }) => {
  await openDeliveries(page)
  await context.setOffline(true)

  await action(page, /^Couldn.t deliver$/).click()
  await page.getByRole('radio', { name: 'Address not found' }).check()
  await page.getByRole('button', { name: 'Mark as failed' }).click()
  await expect(page.getByText('1 update waiting to send')).toBeVisible()
  await expect(page.getByText('Waiting to send').first()).toBeVisible()

  await context.setOffline(false)
  await expect(page.getByText('All saved deliveries have been sent')).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('1 update waiting to send')).toBeHidden()
})
