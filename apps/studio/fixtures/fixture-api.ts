// The fixture page answers the Studio's API itself, from data.ts: the brief and nothing else. Any other request is
// recorded and refused, so a check that reached for the network fails instead of passing on a real service.
import { mission, PROJECT } from './data.ts'

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

/** Requests the fixture didn't expect, as `METHOD /path`: the checks assert there are none. */
export const unexpected: string[] = []

function hrefOf(input: RequestInfo | URL): string {
  if (input instanceof Request) return input.url
  if (input instanceof URL) return input.href
  return input
}

/** `revision`: the brief's revision now (a background update moves it). */
export function installFixtureApi(revision: () => number): void {
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const url = new URL(hrefOf(input), window.location.href)
    if (method === 'GET' && url.pathname === `/api/v1/projects/${PROJECT}/mission`) {
      return Promise.resolve(json(mission(revision())))
    }
    unexpected.push(`${method} ${url.pathname}`)
    console.error(`[fixture] unexpected request: ${method} ${url.pathname}`)
    return Promise.resolve(new Response(JSON.stringify({ code: 'fixture_unexpected' }), { status: 501 }))
  }
}
