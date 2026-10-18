// The fixtures' Sentry, in place of src/app/crash-sentry.ts: the real chunk, whose first set-up fails with
// `?sentryFlaky=1`, as a start that didn't take (Codex P2 on #367); the page says so on <html data-sentry-flaky>.
import type * as SentryApi from '@sentry/react'

let thrown = false

export async function loadSentry(): Promise<typeof SentryApi> {
  const Sentry = await import('@sentry/react')
  if (thrown || new URLSearchParams(window.location.search).get('sentryFlaky') !== '1') return Sentry
  return {
    ...Sentry,
    init: () => {
      thrown = true
      document.documentElement.dataset.sentryFlaky = 'thrown'
      throw new Error('Sentry didn’t start')
    },
  }
}
