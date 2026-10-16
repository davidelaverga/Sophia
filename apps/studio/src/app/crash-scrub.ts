// What a crash report may carry (docs/plans/crash-feedback.md): an address's origin and path, never its query or its
// fragment (an invitation's token lives there); no console line, which may quote anyone's words; a click's selector with
// its attribute values blanked (an aria-label can hold a name); no user, headers or cookies. Pure, so it is unit-tested;
// crash-report.ts hands every event and breadcrumb through it before Sentry sends anything.

import type { Breadcrumb, Event } from '@sentry/react'

/** An address without its query and fragment, absolute or relative. */
export function scrubUrl(url: string): string {
  const cut = url.search(/[?#]/)
  return cut === -1 ? url : url.slice(0, cut)
}

/** A fetch's url, and a navigation's from and to (a pushState records both; Codex P1 on #367), each scrubbed. */
function scrubAddresses(data: Record<string, unknown>): Record<string, unknown> {
  const scrubbed = { ...data }
  for (const key of ['url', 'from', 'to']) {
    const value = scrubbed[key]
    if (typeof value === 'string') scrubbed[key] = scrubUrl(value)
  }
  return scrubbed
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category === 'console') return null
  const message = crumb.category?.startsWith('ui.') ? crumb.message?.replaceAll(/="[^"]*"/g, '="…"') : crumb.message
  return {
    ...crumb,
    ...(message !== undefined && { message }),
    ...(crumb.data && { data: scrubAddresses(crumb.data) }),
  }
}

/** A feedback's own address, scrubbed (Codex P1 on #367): Sentry records the page's whole href with it. */
function scrubFeedback(contexts: NonNullable<Event['contexts']>): NonNullable<Event['contexts']> {
  const feedback = contexts['feedback']
  const url: unknown = feedback?.['url']
  if (!feedback || typeof url !== 'string') return contexts
  return { ...contexts, feedback: { ...feedback, url: scrubUrl(url) } }
}

/** Any event, an error's or a feedback's: no user, headers, cookies or query; its addresses scrubbed. */
export function scrubEvent<E extends Event>(given: E): E {
  const event: E = { ...given }
  delete event.user
  if (event.request) {
    const request = { ...event.request }
    delete request.headers
    delete request.cookies
    delete request.query_string
    if (request.url !== undefined) request.url = scrubUrl(request.url)
    event.request = request
  }
  if (event.contexts) event.contexts = scrubFeedback(event.contexts)
  return event
}
