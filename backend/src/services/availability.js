// Driver days off: IST calendar dates (YYYY-MM-DD) a driver is not working. Auto-dispatch
// and manual assignment both skip a driver on the day a route is planned for.
import { body } from 'express-validator'
import { IST_OFFSET_MIN } from '../utils/time.js'

export const MAX_DAYS_OFF = 60
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const istDateKey = date => new Date(new Date(date).getTime() + IST_OFFSET_MIN * 60000).toISOString().slice(0, 10)

// A real calendar date in YYYY-MM-DD form (rejects 2026-02-30)
export function isDayKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

// Sorted, without duplicates or days already past
export function normalizeDaysOff(days, now = new Date()) {
  const today = istDateKey(now)
  return [...new Set(days)].filter(day => day >= today).sort().slice(0, MAX_DAYS_OFF)
}

export const isOffOn = (driver, date) => Boolean(driver?.daysOff?.includes(istDateKey(date)))

// "2 Nov" for the IST day of a date
export function dayLabel(date) {
  const [, month, day] = istDateKey(date).split('-').map(Number)
  return `${day} ${MONTHS[month - 1]}`
}

export const offReason = (driver, date) => `${driver.name} is off on ${dayLabel(date)}`

// The day a route takes its driver: the day it started once it is on the road, else the
// day it is planned for
export const routeDay = route => (route.status === 'active' && route.startedAt) || route.plannedStart || route.createdAt

export const daysOffValidators = [
  body('daysOff').isArray({ max: 2 * MAX_DAYS_OFF }).withMessage('Provide the days off as a list'),
  body('daysOff.*').custom(isDayKey).withMessage('Days off must be dates like 2026-10-31')
]
