// Optional error tracking in the browser: with VITE_SENTRY_DSN set at build time, crashes
// are reported to Sentry. The SDK is only downloaded in that case. No personal data is
// sent (no IP addresses, user details or page text).
let sentry = null

export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  import('@sentry/react').then(mod => {
    mod.init({ dsn, environment: import.meta.env.MODE, sendDefaultPii: false, tracesSampleRate: 0 })
    sentry = mod
  }).catch(() => {})
}

export function reportError(error, context = {}) {
  sentry?.captureException(error, { extra: context })
}
