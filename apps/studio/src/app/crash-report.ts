// Crash reports and feedback (docs/plans/crash-feedback.md), through Sentry where the deploy names a project
// (VITE_SENTRY_DSN), and nothing at all where it doesn't. Sentry loads on its own chunk, after the Studio has started,
// with no default personal data, no performance tracing and no replay; every event and breadcrumb passes through
// crash-scrub.ts first.
import type * as SentryApi from '@sentry/react'
import { CRASH_DSN } from './crash-dsn.ts'
import { scrubBreadcrumb, scrubEvent } from './crash-scrub.ts'

type SentryModule = typeof SentryApi

let loading: Promise<SentryModule> | null = null

/** Whether reports and feedback go anywhere: a Studio without a DSN offers neither. */
export const reportsOn = (): boolean => CRASH_DSN !== ''

export function startCrashReports(): void {
  if (!reportsOn() || loading) return
  loading = import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn: CRASH_DSN,
      environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? 'production',
      sendDefaultPii: false,
      tracesSampleRate: 0,
      beforeSend: (event) => scrubEvent(event),
      beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
    })
    return Sentry
  })
}

/** What a boundary caught (LoadFailed): reported, never thrown again. */
export function reportCrash(error: unknown): void {
  void loading?.then((Sentry) => Sentry.captureException(error)).catch(() => undefined)
}

/** Feedback in the person's words; resolves to whether Sentry took it within a few seconds. */
export async function sendFeedback(message: string): Promise<boolean> {
  if (!loading) return false
  const Sentry = await loading
  Sentry.captureFeedback({ message, source: 'studio' })
  return Sentry.flush(8000)
}
