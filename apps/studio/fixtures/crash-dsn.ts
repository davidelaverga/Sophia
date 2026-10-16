// The fixtures' crash reports (crash-feedback.md), in place of src/app/crash-dsn.ts: `?sentry=1` turns them on with a DSN
// whose ingest the checks answer (e2e/crash-feedback.spec.ts); otherwise off, as a Studio without one is.
export const CRASH_DSN = new URLSearchParams(window.location.search).has('sentry')
  ? 'https://public@o1.ingest.sentry.io/1'
  : ''
