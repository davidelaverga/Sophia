// Sentry's own chunk, loaded once reports start (docs/plans/crash-feedback.md). Its own module so the fixture pages can
// stand in for it (fixtures/crash-sentry.ts), as they do for the DSN.
export const loadSentry = () => import('@sentry/react')
