// What a crash report may carry (docs/plans/crash-feedback.md): an address's origin and path, never its query or its
// fragment (an invitation's token lives there); no console line, which may quote anyone's words; a click's selector with
// its attribute values blanked (an aria-label can hold a name); no user, headers or cookies. Pure, so it is unit-tested;
// crash-report.ts hands every event and breadcrumb through it before Sentry sends anything.

import type { Breadcrumb, ErrorEvent } from '@sentry/react'

/** An address without its query and fragment, absolute or relative. */
export function scrubUrl(url: string): string {
  const cut = url.search(/[?#]/)
  return cut === -1 ? url : url.slice(0, cut)
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category === 'console') return null
  const message = crumb.category?.startsWith('ui.') ? crumb.message?.replaceAll(/="[^"]*"/g, '="…"') : crumb.message
  const url: unknown = crumb.data?.['url']
  return {
    ...crumb,
    ...(message !== undefined && { message }),
    ...(crumb.data && { data: { ...crumb.data, ...(typeof url === 'string' && { url: scrubUrl(url) }) } }),
  }
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const { user: _user, request, ...rest } = event
  if (!request) return rest
  const { headers: _headers, cookies: _cookies, query_string: _query, url, ...kept } = request
  return { ...rest, request: { ...kept, ...(url !== undefined && { url: scrubUrl(url) }) } }
}
