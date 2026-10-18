// Where crash reports and feedback go (docs/plans/crash-feedback.md): the deploy's Sentry project, or nowhere. Its own
// module so the fixture pages can stand in for it (fixtures/crash-dsn.ts).
export const CRASH_DSN = import.meta.env.VITE_SENTRY_DSN ?? ''
