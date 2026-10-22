import { test, expect } from '@playwright/test'
import { signInAs } from './helpers.mjs'

const DELIVERIES = `address,customer,phone,priority,window start,window end,weight kg,notes,lat,lng
"Connaught Place, New Delhi, Delhi 110001",Aditi Malhotra,+91 98100 11223,standard,,,3,Office reception,28.6318,77.2194
"Khan Market, New Delhi, Delhi 110003",Rahul Khanna,+91 98110 22334,urgent,,,6,Call on arrival,28.5991,77.2263
"Lajpat Nagar Central Market, New Delhi, Delhi 110024",Simran Kaur,,standard,,,2,,28.5677,77.2433
`

test('a visitor opens the demo from the homepage', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Delivery routes that follow India’s roads'.replace('’', "'"))
  await page.getByRole('button', { name: 'Try the demo' }).first().click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sanjay')
})

test('a fleet manager plans a route from a spreadsheet, saves it and auto-dispatches', async ({ page }) => {
  await signInAs(page, 'Fleet manager')
  await page.goto('/route-planner')

  await page.getByRole('group', { name: 'Your hubs' }).getByRole('button', { name: /Okhla/ }).click()
  await page.getByLabel('Upload CSV of deliveries').setInputFiles({ name: 'deliveries.csv', mimeType: 'text/csv', buffer: Buffer.from(DELIVERIES) })
  await expect(page.getByText('3 of 3 addresses pinned', { exact: false })).toBeVisible()

  // The hub's own vehicle is listed first, nearest the hub
  await page.getByRole('checkbox', { name: /Tata Ace EV/ }).check()
  await page.getByRole('button', { name: 'Optimize routes' }).click()
  await expect(page.getByRole('heading', { name: 'Optimized plan' })).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: /^Save route/ }).click()
  await expect(page.getByText(/Saved 1 route/)).toBeVisible()

  await page.goto('/routes')
  await page.getByRole('button', { name: 'Auto-dispatch' }).click()
  const assign = page.getByRole('button', { name: /^Assign \d+ routes?$/ })
  await expect(assign).toBeEnabled()
  await assign.click()
  await expect(page.getByText(/assigned/i).first()).toBeVisible()
})
