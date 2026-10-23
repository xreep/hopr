// Email notifications through Resend's HTTP API (free tier: 3,000 emails a month). Set
// RESEND_API_KEY and EMAIL_FROM to turn them on; without them nothing is sent anywhere.
// Each person's profile settings decide what reaches them: the email channel must be on,
// and so must the topic (route changes, vehicle maintenance, weekly report).
// SMS is not offered: Indian SMS needs DLT sender registration, which is not free.
import User from '../models/User.js'
import Vehicle from '../models/Vehicle.js'
import Route from '../models/Route.js'
import { computeKpis } from './analytics.js'
import { reportError } from './monitoring.js'
import { formatIST, istDay, istHour } from '../utils/time.js'
import { isDemoEmail } from './demo.js'

// Emails go out in the background so requests never wait for the provider. Tests can
// wait for them with settled().
const pending = new Set()
export function inBackground(promise) {
  const p = Promise.resolve(promise).catch(error => reportError(error, { action: 'notification' })).finally(() => pending.delete(p))
  pending.add(p)
  return p
}
export const settled = () => Promise.all([...pending])

const RESEND_URL = 'https://api.resend.com/emails'
export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
const appUrl = () => (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')
const MANAGERS = ['admin', 'fleet_manager']

export async function sendEmail({ to, subject, text }) {
  if (!emailEnabled() || !to) return false
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text }),
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) throw new Error(`Email provider answered ${res.status}`)
    return true
  } catch (error) {
    console.warn('Email not sent:', error.message)
    reportError(error, { action: 'send email' })
    return false
  }
}

// Everyone in `filter` who wants this topic by email. One message each, so nobody sees
// anyone else's address.
async function emailPeople(filter, topic, subject, lines) {
  if (!emailEnabled()) return 0
  const people = (await User.find({ ...filter, isActive: true, 'notifications.email': true, [`notifications.${topic}`]: true }).select('email name').lean())
    .filter(p => !isDemoEmail(p.email)) // the shared demo accounts' addresses are not real inboxes
  const text = `${lines.join('\n')}\n\n${appUrl()}\n\nYou get this because of your notification settings in Hopr (Profile).`
  const sent = await Promise.all(people.map(p => sendEmail({ to: p.email, subject, text })))
  return sent.filter(Boolean).length
}

const toManagers = (topic, subject, lines) => emailPeople({ role: { $in: MANAGERS } }, topic, subject, lines)

// Account ---------------------------------------------------------------------------

// Sent whatever the notification settings say: the person asked for it
export function passwordReset(user, token) {
  return sendEmail({
    to: user.email,
    subject: 'Reset your Hopr password',
    text: [
      `Hello ${user.name},`,
      '',
      'Someone asked to reset the password for your Hopr account. To choose a new one, open this link within an hour:',
      '',
      `${appUrl()}/reset-password?token=${token}`,
      '',
      'If it was not you, ignore this email: your password stays as it is.'
    ].join('\n')
  })
}

// Route changes ---------------------------------------------------------------------

export function routeAssigned(route, driverId) {
  if (route.isDemo) return 0
  return emailPeople({ _id: driverId }, 'routeUpdates', `New route: ${route.name}`, [
    `You have a new route: ${route.name} (${route.routeId}), ${route.stops?.length || 0} stops.`,
    route.plannedStart ? `Planned start: ${formatIST(new Date(route.plannedStart))}.` : 'Open My deliveries to start it.'
  ])
}

export function deliveryFailed(route, stop, driverName) {
  if (route.isDemo) return 0
  return toManagers('routeUpdates', `Delivery failed: ${stop.customerName || stop.address.split(',')[0]}`, [
    `${driverName || 'The driver'} could not deliver stop ${stop.sequence} on ${route.name} (${route.routeId}).`,
    `Reason: ${stop.failureReason}.`,
    `Address: ${stop.address}`
  ])
}

export function routeCompleted(route) {
  if (route.isDemo) return 0
  const delivered = route.stops.filter(s => s.status === 'completed').length
  const failed = route.stops.filter(s => s.status === 'failed').length
  return toManagers('routeUpdates', `Route finished: ${route.name}`, [
    `${route.name} (${route.routeId}) is finished: ${delivered} delivered, ${failed} failed.`,
    route.actualTime ? `It took ${route.actualTime} minutes.` : ''
  ].filter(Boolean))
}

export function driverAwaitingApproval(user) {
  return toManagers('routeUpdates', `New driver waiting for approval: ${user.name}`, [
    `${user.name} (${user.email}) signed up as a driver and is waiting for approval.`,
    'Approve them on the Drivers page.'
  ])
}

// Scheduled: vehicle maintenance and the weekly report -------------------------------

const MAINTENANCE_NOTICE_DAYS = 3

export async function maintenanceDue(now = new Date()) {
  const soon = new Date(now.getTime() + MAINTENANCE_NOTICE_DAYS * 86400000)
  // Once per service date: the date notified is remembered on the vehicle
  const due = await Vehicle.find({ status: { $ne: 'inactive' }, nextMaintenance: { $lte: soon }, $expr: { $ne: ['$maintenanceNotifiedFor', '$nextMaintenance'] } })
  for (const v of due) {
    await toManagers('maintenanceAlerts', `Service due: ${v.name} (${v.licensePlate})`, [
      `${v.name} (${v.vehicleId}, ${v.licensePlate}) is due for service on ${formatIST(v.nextMaintenance)}.`
    ])
    v.maintenanceNotifiedFor = v.nextMaintenance
    await v.save()
  }
  return due.length
}

export async function weeklyReport(now = new Date()) {
  // Mondays from 08:00 IST, once per week
  if (istDay(now) !== 1 || istHour(now) < 8) return 0
  const weekAgo = new Date(now.getTime() - 7 * 86400000)
  const people = await User.find({
    role: { $in: MANAGERS }, isActive: true, 'notifications.email': true, 'notifications.weeklyReports': true,
    $or: [{ weeklyReportSentAt: null }, { weeklyReportSentAt: { $lt: new Date(now.getTime() - 6 * 86400000) } }]
  })
  if (!people.length) return 0
  const routes = await Route.find({ $or: [{ plannedStart: { $gte: weekAgo } }, { completedAt: { $gte: weekAgo } }] })
    .select('status stops vehicle fuelCost totalDistance actualDistance loadKg capacityKg savings co2Kg startedAt plannedStart vehicleType isDemo').lean()
  const k = computeKpis(routes, await Vehicle.countDocuments({ status: 'active' }))
  const lines = [
    'Last week in Hopr:',
    `- ${k.totalDeliveries} delivered, ${k.failedDeliveries} failed (${k.completionRate ?? '-'}% completion)`,
    `- On time: ${k.onTimeRate ?? '-'}%`,
    `- Arrival time accuracy: ${k.etaErrorMin === null ? '-' : `${Math.round(k.etaErrorMin)} min average gap`}`,
    `- Distance planned: ${k.totalDistanceKm} km, fuel ₹${k.totalFuelCost}, CO2 ${k.co2Kg} kg`,
    `- Saved by optimising: ${k.optimizationSavingsKm} km`
  ]
  let sent = 0
  for (const person of people) {
    if (await sendEmail({ to: person.email, subject: 'Your weekly Hopr report', text: `${lines.join('\n')}\n\n${appUrl()}/analytics` })) sent++
    person.weeklyReportSentAt = now
    await person.save()
  }
  return sent
}

// Hourly check for maintenance alerts and the weekly report, only when email is on
let timer = null
export function startNotificationClock(intervalMs = 3600000) {
  if (timer || !emailEnabled()) return null
  const tick = async () => {
    try {
      await maintenanceDue()
      await weeklyReport()
    } catch (error) {
      reportError(error, { action: 'scheduled notifications' })
    }
  }
  tick()
  timer = setInterval(tick, intervalMs)
  timer.unref?.()
  return timer
}
