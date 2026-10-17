// Crash reports and feedback (docs/plans/crash-feedback.md), through Sentry where the deploy names a project
// (VITE_SENTRY_DSN), and nothing at all where it doesn't. Sentry loads on its own chunk, after the Studio has started,
// with no default personal data, no performance tracing and no replay; every event and breadcrumb passes through
// crash-scrub.ts first.
import type * as SentryApi from '@sentry/react'
import { CRASH_DSN } from './crash-dsn.ts'
import { loadSentry } from './crash-sentry.ts'
import { scrubBreadcrumb, scrubEvent } from './crash-scrub.ts'

type SentryModule = typeof SentryApi

let loading: Promise<SentryModule | null> | null = null

/** Whether reports and feedback go anywhere: a Studio without a DSN offers neither. */
export const reportsOn = (): boolean => CRASH_DSN !== ''

/**
 * What fails before Sentry has loaded, held and sent once it has (Codex P1 on #367): the chunk comes after the Studio
 * starts, and its own handlers only from then on.
 */
function holdEarly(): { stop: () => unknown[] } {
  const held: unknown[] = []
  const onError = (e: ErrorEvent) => held.push(e.error ?? e.message)
  const onRejection = (e: PromiseRejectionEvent) => held.push(e.reason)
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return {
    stop: () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      return held
    },
  }
}

export function startCrashReports(): void {
  if (!reportsOn() || loading) return
  const early = holdEarly()
  loading = loadSentry()
    .then((Sentry) => {
      Sentry.init({
        dsn: CRASH_DSN,
        environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? 'production',
        sendDefaultPii: false,
        tracesSampleRate: 0,
        beforeSend: (event) => scrubEvent(event),
        beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
      })
      // Feedback skips beforeSend: every event, feedback too, is scrubbed here (Codex P1 on #367).
      Sentry.addEventProcessor((event) => scrubEvent(event))
      for (const error of early.stop()) Sentry.captureException(error)
      return Sentry
    })
    .catch(() => {
      early.stop()
      // Not loaded or not set up: nothing goes, and a later send says it couldn't (Codex P2 on #367).
      loading = null
      return null
    })
}

/** What a boundary caught (LoadFailed): reported, never thrown again. */
export function reportCrash(error: unknown): void {
  void loading?.then((Sentry) => Sentry?.captureException(error)).catch(() => undefined)
}

/** Feedback in the person's words; resolves to whether Sentry took it within a few seconds, never throws. */
export async function sendFeedback(message: string): Promise<boolean> {
  try {
    const Sentry = await loading
    if (!Sentry) return false
    Sentry.captureFeedback({ message, source: 'studio' })
    return await Sentry.flush(8000)
  } catch {
    return false
  }
}
