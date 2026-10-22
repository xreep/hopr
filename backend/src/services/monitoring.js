// Optional error tracking: with SENTRY_DSN set (Sentry's free tier is enough), server
// errors are reported there; without it this module does nothing. No personal data is
// sent: no request bodies, cookies, IP addresses or user details.
let sentry = null

export async function initMonitoring() {
  if (!process.env.SENTRY_DSN || sentry) return false
  sentry = await import('@sentry/node')
  sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    sendDefaultPii: false,
    tracesSampleRate: 0
  })
  process.on('unhandledRejection', reason => reportError(reason, { source: 'unhandledRejection' }))
  return true
}

export function reportError(error, context = {}) {
  if (!sentry) return
  sentry.captureException(error instanceof Error ? error : new Error(String(error)), { extra: context })
}
