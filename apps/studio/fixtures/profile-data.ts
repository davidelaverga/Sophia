// The person's own profile on the fixture pages (A32, docs/plans/profile-editor.md), answered as the API answers it
// (0062): one profile per token, a name trimmed and checked, compare-and-set on its revision, idempotent per key. A
// page's checks steer it through `window.profileFixture`: a server without profiles (404, an API before A32), a save
// whose reply is lost after it was kept, and a name changed elsewhere (another tab or device).
import type { Profile } from '@sophia/contracts'

interface Kept {
  profile: Profile
  /** Each key's edit and its answer: the same edit again answers the same; another edit under it is a conflict. */
  keys: Map<string, { sent: string; reply: Profile }>
}

interface ProfileFixture {
  /** Answer as a server without the route (404 in Fastify's words, not the contract's). */
  unavailable: boolean
  /** Keep the next save, then lose its reply (the request fails as a dropped connection does). */
  loseNextReply: boolean
  /** Answer the next read with a 503, as a server that is away does. */
  failNextRead: boolean
  /** Answer the next save only after this many milliseconds (0: at once), as a cold server does. */
  slowNextSaveMs: number
  /** Hold the next read until `releaseRead`, as a slow server does. */
  holdNextRead: boolean
  /** Let a held read answer. */
  releaseRead: () => void
  /** Every save the page sent: its key and its body, in order. */
  saves: { key: string; body: unknown }[]
  /** Change the name as another device would, for a token (else the first one read): the revision moves on. */
  changeElsewhere: (name: string, token?: string) => void
  /** The profile kept for a token now (else the first one read). */
  profileOf: (token?: string) => Profile
}

declare global {
  interface Window {
    profileFixture?: ProfileFixture
  }
}

const kept = new Map<string, Kept>()

/** Reads held by `holdNextRead`, each waiting for `releaseRead`. */
const heldReads: (() => void)[] = []

const keptFor = (token: string): Kept => {
  const found = kept.get(token)
  if (found) return found
  const made: Kept = { profile: { displayName: null, chosen: false, revision: 0 }, keys: new Map() }
  kept.set(token, made)
  return made
}

const fixture: ProfileFixture = {
  unavailable: new URLSearchParams(window.location.search).get('profile') === 'none',
  loseNextReply: false,
  failNextRead: false,
  slowNextSaveMs: 0,
  holdNextRead: false,
  releaseRead: () => {
    for (const release of heldReads.splice(0)) release()
  },
  saves: [],
  changeElsewhere: (name, token) => {
    const k = keptFor(token ?? [...kept.keys()][0] ?? '')
    k.profile = { displayName: name, chosen: true, revision: k.profile.revision + 1 }
  },
  profileOf: (token) => keptFor(token ?? [...kept.keys()][0] ?? '').profile,
}
window.profileFixture = fixture

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

/** An API refusal as the contract's Error has it (a request id included, as the API's error handler sends). */
const refusal = (status: number, code: string, message: string) =>
  json({ code, message, retry: 'never', requestId: crypto.randomUUID() }, status)

/** Control, format and line-separator characters, as 0062 refuses them. */
const HIDDEN: readonly (readonly [number, number])[] = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
]

const hidden = (name: string): boolean => {
  for (const ch of name) {
    const at = ch.codePointAt(0) ?? 0
    if (HIDDEN.some(([from, to]) => at >= from && at <= to)) return true
  }
  return false
}

/** A name as 0062 checks it, after trimming: blank, an address, hidden characters or more than 60 are refused. */
function refused(name: string): string | null {
  if (name === '') return 'A display name is needed'
  if (name.includes('@')) return 'A display name, not an address'
  if (hidden(name)) return 'Invalid display name'
  return /^.{1,60}$/su.test(name) ? null : 'Invalid display name'
}

const tokenOf = (init: RequestInit | undefined): string =>
  /^Bearer (.+)$/.exec(new Headers(init?.headers).get('authorization') ?? '')?.[1] ?? ''

/** The body ProfileUpdate asks for (A32), or null. */
function updateOf(body: unknown): { displayName: string; expectedRevision: number } | null {
  if (typeof body !== 'object' || body === null || !('displayName' in body) || !('expectedRevision' in body))
    return null
  const { displayName, expectedRevision } = body
  return typeof displayName === 'string' && typeof expectedRevision === 'number'
    ? { displayName, expectedRevision }
    : null
}

/** A save under its key: the same edit again answers the same, another edit under it is a conflict. */
function replayed(k: Kept, key: string, sent: string): Response | null {
  const prior = k.keys.get(key)
  if (!prior) return null
  return prior.sent === sent
    ? json(prior.reply)
    : refusal(409, 'idempotency_conflict', 'Idempotency key reused with different request')
}

function saved(init: RequestInit | undefined): Response | Promise<Response> {
  const key = new Headers(init?.headers).get('idempotency-key') ?? ''
  const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  fixture.saves.push({ key, body })
  const request = updateOf(body)
  if (!key || !request) return refusal(422, 'invalid_request', 'body must have displayName and expectedRevision')
  const k = keptFor(tokenOf(init))
  const name = request.displayName.trim()
  const sent = JSON.stringify([name, request.expectedRevision])
  const again = replayed(k, key, sent)
  if (again) return again
  const why = refused(name)
  if (why) return refusal(422, 'invalid_request', why)
  if (k.profile.revision !== request.expectedRevision) return refusal(409, 'stale_revision', 'Stale profile')
  k.profile = { displayName: name, chosen: true, revision: k.profile.revision + 1 }
  k.keys.set(key, { sent, reply: k.profile })
  if (!fixture.loseNextReply) return json(k.profile)
  fixture.loseNextReply = false
  return Promise.reject(new TypeError('Failed to fetch'))
}

/** A read of the profile, or once a 503 when the page asked for one. */
function answerRead(init: RequestInit | undefined): Response {
  if (!fixture.failNextRead) return json(keptFor(tokenOf(init)).profile)
  fixture.failNextRead = false
  return refusal(503, 'unavailable', 'Unavailable')
}

/** A read, held until `releaseRead` when the page asked for that; it answers what is kept when let through. */
function read(init: RequestInit | undefined): Response | Promise<Response> {
  if (!fixture.holdNextRead) return answerRead(init)
  fixture.holdNextRead = false
  return new Promise<Response>((resolve) => heldReads.push(() => resolve(answerRead(init))))
}

/** GET and PUT /api/v1/me/profile; null for any other request. */
export function profileAnswer(
  method: string,
  path: string,
  init: RequestInit | undefined,
): Response | Promise<Response> | null {
  if (path !== '/api/v1/me/profile') return null
  if (fixture.unavailable) {
    return json({ message: `Route ${method}:${path} not found`, error: 'Not Found', statusCode: 404 }, 404)
  }
  if (method === 'GET') return read(init)
  if (method !== 'PUT') return null
  const wait = fixture.slowNextSaveMs
  fixture.slowNextSaveMs = 0
  return wait > 0 ? new Promise<Response>((resolve) => setTimeout(() => resolve(saved(init)), wait)) : saved(init)
}
