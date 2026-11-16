import assert from 'node:assert/strict'
import { getConversationMessages, listConversations } from './conversations.ts'
import { getSince } from './vision.ts'
import { afterEach, describe, it } from 'node:test'
import { retryRead } from '../app/account-cache.ts'
import { renewTokensWith } from './renew.ts'
import {
  admitGoalCommand,
  ApiError,
  callApi,
  changeMemberRole,
  createProject,
  getSnapshot,
  READ_TIMEOUT_MS,
  setGoalTarget,
  WRITE_TIMEOUT_MS,
} from './client.ts'

const P = '6f1f3a52-4b8e-4c62-9d7e-0a1b2c3d4e5f'
const G = '0c5e9b1a-2d3f-4a6b-8c7d-9e0f1a2b3c4d'
const realFetch = globalThis.fetch

/** Answer every fetch with one fixed reply. */
function reply(status: number, body: unknown): void {
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
}

/** A server that takes the connection and never answers: the call ends only when its signal aborts. */
function silence(): void {
  globalThis.fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })
}

async function apiError(call: Promise<unknown>): Promise<ApiError> {
  try {
    await call
  } catch (err: unknown) {
    if (err instanceof ApiError) return err
    throw err
  }
  throw new Error('expected an ApiError')
}

const command = {
  kind: 'hold',
  goalId: G,
  expectedGoalRevision: 1,
  expectedAuthorityEpoch: 1,
  bodySourceId: null,
} as const

describe('Studio API client', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('refuses a success reply that breaks the contract, with the retry that is safe', async () => {
    reply(200, { projectId: P, title: 'Sophia', cursor: 7 })
    const read = await apiError(getSnapshot('t', P))
    assert.deepEqual([read.status, read.code, read.retry], [200, 'contract_violation', 'safe_read'])
    // The person reads that the reply couldn't be read; the contract's own words stay with the error, for us.
    assert.equal(read.message, 'Sophia’s reply couldn’t be read.')
    assert.match(read.cause instanceof Error ? read.cause.message : '', /Snapshot/)

    // The admission committed (202) but its receipt is unreadable: retry with the same key.
    reply(202, { commandId: G, projectId: P, cursor: '9', stage: 'admitted' })
    const admitted = await apiError(admitGoalCommand('t', P, 'key-1', command))
    assert.deepEqual([admitted.code, admitted.retry], ['contract_violation', 'same_admission_key'])

    reply(201, '<!doctype html>')
    const created = await apiError(createProject('t', 'key-2', 'Sophia'))
    assert.deepEqual([created.code, created.retry], ['contract_violation', 'same_admission_key'])
  })

  it('uses the error body only when it is a contract Error, else the HTTP status', async () => {
    reply(409, { code: 'stale_revision', message: 'Stale goal revision', requestId: G, retry: 'never' })
    const stale = await apiError(admitGoalCommand('t', P, 'key-3', command))
    assert.deepEqual([stale.status, stale.code, stale.message], [409, 'stale_revision', 'Stale goal revision'])

    reply(502, { code: 'from_a_proxy' })
    const proxy = await apiError(getSnapshot('t', P))
    // A read stopped at a proxy is asked again (the next describe).
    assert.deepEqual([proxy.status, proxy.code, proxy.retry], [502, 'http_502', 'safe_read'])
    // HTTP/2 carries no status text: the refusal still has words, or it shows as nothing at all; and the same words
    // over HTTP/1.1, whose status text is not ours to show. «Try again» only where it can help; the status is the
    // code's, never the person's to read.
    assert.equal(proxy.message, 'That didn’t go through. Try again.')
    globalThis.fetch = () => Promise.resolve(new Response('<html>', { status: 404, statusText: 'Not Found' }))
    const missing = await apiError(getSnapshot('t', P))
    assert.deepEqual([missing.code, missing.message], ['http_404', 'That didn’t go through.'])
  })

  it('never waits for good: a write with no reply in time is an unknown outcome, retried with the same key', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    silence()
    let settled = false
    const created = apiError(createProject('t', 'key-4', 'Sophia')).finally(() => (settled = true))
    t.mock.timers.tick(WRITE_TIMEOUT_MS - 1)
    await Promise.resolve()
    assert.equal(settled, false)
    t.mock.timers.tick(1)
    const late = await created
    assert.deepEqual([late.status, late.code, late.retry], [0, 'outcome_unknown', 'same_admission_key'])
  })

  it('never labels a write without a key safe to repeat when it got no answer', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    silence()
    const decided = apiError(callApi(`/api/v1/projects/${P}/lobby/${G}`, { token: 't', method: 'PUT' }, (v) => v))
    t.mock.timers.tick(WRITE_TIMEOUT_MS)
    assert.deepEqual([(await decided).code, (await decided).retry], ['outcome_unknown', 'never'])
  })

  // The reliability baseline's gap #10: a PUT is a write, and may be the call that wakes an idle server.
  for (const [label, put] of [
    ['setGoalTarget', () => setGoalTarget('t', P, G, { ownerId: null, targetDate: null, expectedRevision: 0 })],
    ['changeMemberRole', () => changeMemberRole('t', P, G, 'editor')],
  ] as const) {
    it(`${label} waits as a write: not cut at a read’s time, ended at a write’s`, async (t) => {
      t.mock.timers.enable({ apis: ['setTimeout'] })
      silence()
      const seen = { outcome: 'waiting' as unknown, now: (): unknown => seen.outcome }
      void put().then(
        () => (seen.outcome = 'answered'),
        (err: unknown) => (seen.outcome = err),
      )
      t.mock.timers.tick(READ_TIMEOUT_MS)
      await new Promise((resolve) => setImmediate(resolve))
      assert.equal(seen.now(), 'waiting', `cut at a read’s ${String(READ_TIMEOUT_MS)} ms`)
      t.mock.timers.tick(WRITE_TIMEOUT_MS - READ_TIMEOUT_MS)
      await new Promise((resolve) => setImmediate(resolve))
      const late = seen.now()
      assert.equal(late instanceof DOMException && late.name, 'AbortError')
    })
  }

  it('a read gives up sooner than a write, and a caller that stops waiting ends it at once', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    silence()
    const read = getSnapshot('t', P)
    t.mock.timers.tick(READ_TIMEOUT_MS)
    await assert.rejects(read, { name: 'AbortError' })

    const listed = apiError(callApi(`/api/v1/projects/${P}/membership`, { token: 't', method: 'GET' }, (v) => v))
    t.mock.timers.tick(READ_TIMEOUT_MS)
    assert.deepEqual([(await listed).code, (await listed).retry], ['outcome_unknown', 'safe_read'])

    const caller = new AbortController()
    const cancelled = getSnapshot('t', P, caller.signal)
    caller.abort()
    await assert.rejects(cancelled, { name: 'AbortError' })
  })
})

/** Answer every fetch with a proxy's own page: HTML, no contract body. */
const proxyPage = (status: number) => {
  globalThis.fetch = () =>
    Promise.resolve(
      new Response('<html><body><h1>Bad gateway</h1></body></html>', {
        status,
        headers: { 'content-type': 'text/html' },
      }),
    )
}

// The reliability baseline's gap #2 (docs/plans/reliability-retry-5xx-and-write-timeouts.md): what Render's proxy
// answers while a deploy or a cold start runs, a 502/503/504 page with no contract body, is asked again on a read, and
// never repeated by a write, which waits for the person's press.
describe('a proxy’s 502/503/504 without the contract', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const target = { ownerId: null, targetDate: '2026-11-20', expectedRevision: 0 }

  for (const status of [502, 503, 504]) {
    it(`${String(status)} on a read: safe to ask again, and the cache asks it again`, async () => {
      proxyPage(status)
      const snapshot = await apiError(getSnapshot('t', P))
      assert.deepEqual(
        [snapshot.status, snapshot.code, snapshot.retry],
        [status, `http_${String(status)}`, 'safe_read'],
      )
      assert.equal(retryRead(0, snapshot), true)
      const listed = await apiError(callApi('/api/v1/projects', { token: 't', method: 'GET' }, (v) => v))
      assert.equal(listed.retry, 'safe_read')
      assert.equal(retryRead(2, listed), true)
      assert.equal(retryRead(3, listed), false, 'three tries, as TanStack’s default')
    })

    it(`${String(status)} on a write without a key: final, never repeated by itself`, async () => {
      proxyPage(status)
      const posted = await apiError(
        callApi(`/api/v1/projects/${P}/lobby/${G}`, { token: 't', method: 'POST' }, (v) => v),
      )
      assert.deepEqual([posted.status, posted.retry], [status, 'never'])
      assert.equal(retryRead(0, posted), false)
      const set = await apiError(setGoalTarget('t', P, G, target))
      assert.equal(set.retry, 'never')
    })

    // Review P2: the proxy may answer after the API committed (an instance lost mid-request, a gateway timeout), so a
    // keyed write's outcome is unknown: the key is kept, and only the person's press sends it again, under that key.
    it(`${String(status)} on an admission: an unknown outcome, sent again only with the same key`, async () => {
      proxyPage(status)
      const created = await apiError(createProject('t', 'key-5', 'Sophia'))
      assert.deepEqual([created.status, created.retry], [status, 'same_admission_key'])
      const keyed = await apiError(
        callApi(`/api/v1/projects/${P}/lobby/${G}`, { token: 't', method: 'POST', key: 'key-6' }, (v) => v),
      )
      assert.equal(keyed.retry, 'same_admission_key')
    })
  }

  it('a 500 page stays final, on a read and on an admission: the API’s own 5xx always carries its body', async () => {
    proxyPage(500)
    const read = await apiError(callApi('/api/v1/projects', { token: 't', method: 'GET' }, (v) => v))
    assert.deepEqual([read.code, read.retry], ['http_500', 'never'])
    assert.equal(retryRead(0, read), false)
    const created = await apiError(createProject('t', 'key-7', 'Sophia'))
    assert.equal(created.retry, 'never')
  })

  it('a 4xx page on a read stays final, as before', async () => {
    globalThis.fetch = () =>
      Promise.resolve(new Response('<html>', { status: 404, headers: { 'content-type': 'text/html' } }))
    const missing = await apiError(callApi('/api/v1/projects', { token: 't', method: 'GET' }, (v) => v))
    assert.deepEqual([missing.code, missing.retry], ['http_404', 'never'])
    assert.equal(retryRead(0, missing), false)
  })
})

// R-REFUSAL-CLIENT-01: a protected conversation read is refused at the client's first sight of its 403 status. A slow,
// endless or malformed error body cannot delay or change that refusal (the view fences on it).
const pendingBody = () => new ReadableStream<Uint8Array>({ start() {} }) // never sends, never ends
const withinMs = <T>(ms: number, p: Promise<T>) =>
  Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`not settled in ${ms} ms`)), ms)),
  ])
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (error: unknown) => error,
  )

describe('a protected conversation read refused by its status', () => {
  for (const [label, read] of [
    ['the list', () => listConversations('t', 'p')],
    ['a thread', () => getConversationMessages('t', 'p', 'c', null)],
  ] as const) {
    it(`${label}: refused as forbidden while its error body never arrives`, async () => {
      globalThis.fetch = () => Promise.resolve(new Response(pendingBody(), { status: 403 }))
      const error = await withinMs(200, refusal(read()))
      assert.ok(error instanceof ApiError)
      assert.deepEqual([error.status, error.code], [403, 'forbidden'])
    })

    it(`${label}: refused as forbidden whatever a malformed error body says`, async () => {
      globalThis.fetch = () => Promise.resolve(new Response('<html>denied</html>', { status: 403 }))
      const error = await refusal(read())
      assert.ok(error instanceof ApiError)
      assert.deepEqual([error.status, error.code], [403, 'forbidden'])
    })
  }
})

// R-391-UPDATES-01: Updates' own «since» read is refused at the client's first sight of its 401 or 403 status, with that
// status (closedDoor), whatever its error body does.
describe('Updates’ «since» read refused by its status', () => {
  for (const status of [401, 403]) {
    it(`${status}: refused while its error body never arrives`, async () => {
      globalThis.fetch = () => Promise.resolve(new Response(pendingBody(), { status }))
      const error = await withinMs(200, refusal(getSince('t', 'p')))
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, status)
    })

    it(`${status}: refused with its status whatever a malformed error body says`, async () => {
      globalThis.fetch = () => Promise.resolve(new Response('<html>denied</html>', { status }))
      const error = await refusal(getSince('t', 'p'))
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, status)
    })
  }

  it('another failure (503) still waits for its body, as before', async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        Response.json({ code: 'unavailable', message: 'Busy', requestId: G, retry: 'never' }, { status: 503 }),
      )
    const error = await refusal(getSince('t', 'p'))
    assert.ok(error instanceof ApiError)
    assert.deepEqual([error.status, error.code], [503, 'unavailable'])
  })
})

// R-MEMBER-READ-01 (docs/plans/native-resources-member-read.md): a project member read that opts in (`memberRead`) is
// refused at the client's first sight of a final 401, 403 or 404, with that status and retry `never`, before its error
// body is inspected: a slow, endless or malformed body can't delay or change it, and the cache never asks again.
const MEMBER_PATH = `/api/v1/projects/${P}/native-resources` as const
type Init = Parameters<typeof callApi>[1]
type Cancel = 'settles' | 'hangs' | 'rejects'

/** What happened, in order: the send, any read or cancel of the reply's body, the parser, the refusal. */
interface Seen {
  events: string[]
}

/** A body that sends `text` (or nothing) and then never ends; its cancel notes itself and settles, hangs or rejects. */
function openBody(seen: Seen, text: string | null, cancel: Cancel): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (text !== null) controller.enqueue(new TextEncoder().encode(text))
    },
    cancel() {
      seen.events.push('cancel')
      if (cancel === 'hangs') return new Promise<void>(() => undefined)
      if (cancel === 'rejects') return Promise.reject(new Error('cancel failed'))
      return undefined
    },
  })
}

/** A reply whose body readers note themselves: reading it at all is what an early refusal must not do. */
function watched(seen: Seen, body: BodyInit | null, status: number): Response {
  const res = new Response(body, { status, headers: { 'content-type': 'application/json' } })
  for (const read of ['json', 'text', 'arrayBuffer', 'blob', 'formData'] as const)
    Object.defineProperty(res, read, {
      value: () => {
        seen.events.push(`read:${read}`)
        return Response.prototype[read].call(res)
      },
    })
  return res
}

/** Every fetch answers with `make`, noting the send. */
function answer(seen: Seen, make: () => Response): void {
  globalThis.fetch = () => {
    seen.events.push('fetch')
    return Promise.resolve(make())
  }
}

/** One call to the member path, its parser noting itself. */
function memberCall(seen: Seen, init: Partial<Init>): Promise<unknown> {
  return callApi(MEMBER_PATH, { token: 't', method: 'GET', ...init }, (value) => {
    seen.events.push('parse')
    return value
  })
}

/** The call's ApiError within `ms`, noted as the refusal in causal order. */
async function refusedWithin(seen: Seen, call: Promise<unknown>, ms = 500): Promise<ApiError> {
  const error = await withinMs(ms, refusal(call))
  seen.events.push('refused')
  assert.ok(error instanceof ApiError, `expected an ApiError, got ${String(error)}`)
  return error
}

const errorBody = { code: 'not_found', message: 'No such project for this member', requestId: G, retry: 'never' }

describe('a member read refused by its final status (memberRead)', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
    renewTokensWith(null)
  })

  for (const status of [401, 403, 404]) {
    for (const cancel of ['settles', 'hangs', 'rejects'] as const) {
      it(`${status}: refused at once while its error body never ends (its cancel ${cancel})`, async () => {
        const seen: Seen = { events: [] }
        answer(seen, () => watched(seen, openBody(seen, null, cancel), status))
        const error = await refusedWithin(seen, memberCall(seen, { memberRead: true }))
        assert.deepEqual(
          [error.status, error.code, error.message, error.retry],
          [status, `http_${status}`, 'That didn’t go through.', 'never'],
        )
        // Cancelled, not awaited, before the refusal; never read and never parsed.
        assert.deepEqual(seen.events, ['fetch', 'cancel', 'refused'])
      })
    }

    it(`${status}: refused with its status whatever a malformed error body says, unread`, async () => {
      const seen: Seen = { events: [] }
      answer(seen, () => watched(seen, openBody(seen, '<html>{"code":"ok"', 'settles'), status))
      const error = await refusedWithin(seen, memberCall(seen, { memberRead: true }))
      assert.deepEqual([error.status, error.code, error.retry], [status, `http_${status}`, 'never'])
      assert.deepEqual(seen.events, ['fetch', 'cancel', 'refused'])
    })

    it(`${status}: refused with its status, unread, even when the error body is a contract Error`, async () => {
      const seen: Seen = { events: [] }
      answer(seen, () => watched(seen, JSON.stringify({ ...errorBody, retry: 'safe_read' }), status))
      const error = await refusedWithin(seen, memberCall(seen, { memberRead: true }))
      assert.deepEqual([error.status, error.code, error.retry], [status, `http_${status}`, 'never'])
      assert.ok(!seen.events.some((e) => e.startsWith('read:') || e === 'parse'), seen.events.join(' '))
    })
  }

  it('a refused token is renewed once (apiFetch, as before), and the 200 that follows is read', async () => {
    const seen: Seen = { events: [] }
    const asked: string[] = []
    renewTokensWith((stale) => {
      asked.push(stale)
      return Promise.resolve('fresh-token')
    })
    const sent: (string | null)[] = []
    globalThis.fetch = (_url, init) => {
      const authorization = new Headers(init?.headers).get('authorization')
      sent.push(authorization)
      return Promise.resolve(
        authorization === 'Bearer fresh-token'
          ? Response.json({ page: 1 })
          : new Response(openBody(seen, null, 'settles'), { status: 401 }),
      )
    }
    const value = await withinMs(500, memberCall(seen, { memberRead: true, token: 'stale-token' }))
    assert.deepEqual(value, { page: 1 })
    assert.deepEqual(asked, ['stale-token'])
    assert.deepEqual(sent, ['Bearer stale-token', 'Bearer fresh-token'])
    assert.deepEqual(seen.events, ['cancel', 'parse'])
  })

  it('a 401 after the one renewal is the refusal: never renewed again, never sent a third time', async () => {
    const seen: Seen = { events: [] }
    const asked: string[] = []
    renewTokensWith((stale) => {
      asked.push(stale)
      return Promise.resolve(`${stale}-renewed`)
    })
    const sent: (string | null)[] = []
    globalThis.fetch = (_url, init) => {
      sent.push(new Headers(init?.headers).get('authorization'))
      return Promise.resolve(watched(seen, openBody(seen, null, 'hangs'), 401))
    }
    const error = await refusedWithin(seen, memberCall(seen, { memberRead: true, token: 'stale-token' }))
    assert.deepEqual([error.status, error.code, error.retry], [401, 'http_401', 'never'])
    assert.deepEqual(asked, ['stale-token'])
    assert.deepEqual(sent, ['Bearer stale-token', 'Bearer stale-token-renewed'])
    assert.ok(!seen.events.some((e) => e.startsWith('read:') || e === 'parse'), seen.events.join(' '))
  })

  it('combined with protectedRead or doorRead, its own refusal wins: its status and never', async () => {
    for (const [legacy, status] of [
      [{ protectedRead: true }, 403],
      [{ doorRead: true }, 401],
      [{ doorRead: true }, 403],
      [{ protectedRead: true, doorRead: true }, 403],
      [{ protectedRead: true, doorRead: true }, 404],
    ] as const) {
      const seen: Seen = { events: [] }
      answer(seen, () => watched(seen, openBody(seen, null, 'hangs'), status))
      const error = await refusedWithin(seen, memberCall(seen, { ...legacy, memberRead: true }))
      assert.deepEqual([error.status, error.code, error.retry], [status, `http_${status}`, 'never'], `${status}`)
      assert.deepEqual(seen.events, ['fetch', 'cancel', 'refused'])
    }
  })

  it('a successful member read is parsed exactly as without the option', async () => {
    for (const init of [{ memberRead: true }, {}] as const) {
      const seen: Seen = { events: [] }
      answer(seen, () => Response.json({ observedAt: '2026-11-12T00:00:00Z', resources: [] }))
      assert.deepEqual(await memberCall(seen, init), { observedAt: '2026-11-12T00:00:00Z', resources: [] })
      assert.deepEqual(seen.events, ['fetch', 'parse'])
    }
  })

  it('a reply that breaks the contract is still a contract violation, safe to read again', async () => {
    answer({ events: [] }, () => Response.json({ observedAt: 7 }))
    const error = await apiError(
      callApi(MEMBER_PATH, { token: 't', method: 'GET', memberRead: true }, () => {
        throw new Error('not a page')
      }),
    )
    assert.deepEqual([error.status, error.code, error.retry], [200, 'contract_violation', 'safe_read'])
  })
})

describe('without memberRead, and for what it doesn’t cover, nothing changes', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('an ordinary 404 is still read from its body: a contract Error speaks, else the status', async () => {
    const seen: Seen = { events: [] }
    answer(seen, () => watched(seen, JSON.stringify(errorBody), 404))
    const error = await refusedWithin(seen, memberCall(seen, {}))
    assert.deepEqual(
      [error.status, error.code, error.message, error.retry],
      [404, 'not_found', errorBody.message, 'never'],
    )
    assert.deepEqual(seen.events, ['fetch', 'read:json', 'refused'])

    const malformed: Seen = { events: [] }
    answer(malformed, () => watched(malformed, '<html>missing</html>', 404))
    const page = await refusedWithin(malformed, memberCall(malformed, {}))
    assert.deepEqual([page.code, page.retry], ['http_404', 'never'])
    assert.deepEqual(malformed.events, ['fetch', 'read:json', 'refused'])
  })

  it('protectedRead alone: 403 forbidden as before, a 404 still read from its body', async () => {
    const seen: Seen = { events: [] }
    answer(seen, () => watched(seen, openBody(seen, null, 'settles'), 403))
    const error = await refusedWithin(seen, memberCall(seen, { protectedRead: true }))
    assert.deepEqual([error.status, error.code, error.retry], [403, 'forbidden', 'safe_read'])

    const missing: Seen = { events: [] }
    answer(missing, () => watched(missing, JSON.stringify(errorBody), 404))
    const read = await refusedWithin(missing, memberCall(missing, { protectedRead: true }))
    assert.deepEqual([read.code, read.retry], ['not_found', 'never'])
    assert.deepEqual(missing.events, ['fetch', 'read:json', 'refused'])
  })

  it('doorRead alone: 401 and 403 with their status as before, a 404 still read from its body', async () => {
    for (const status of [401, 403]) {
      const seen: Seen = { events: [] }
      answer(seen, () => watched(seen, openBody(seen, null, 'settles'), status))
      const error = await refusedWithin(seen, memberCall(seen, { doorRead: true }))
      assert.deepEqual([error.status, error.code, error.retry], [status, `http_${status}`, 'safe_read'])
    }
    const missing: Seen = { events: [] }
    answer(missing, () => watched(missing, JSON.stringify(errorBody), 404))
    const read = await refusedWithin(missing, memberCall(missing, { doorRead: true }))
    assert.deepEqual([read.code, read.retry], ['not_found', 'never'])
    assert.deepEqual(missing.events, ['fetch', 'read:json', 'refused'])
  })

  it('a proxy’s 503 on a member read is still a failure to ask again, read as before', async () => {
    for (const init of [{ memberRead: true }, {}] as const) {
      const seen: Seen = { events: [] }
      answer(seen, () => watched(seen, '<html>Service Unavailable</html>', 503))
      const error = await refusedWithin(seen, memberCall(seen, init))
      assert.deepEqual([error.status, error.code, error.retry], [503, 'http_503', 'safe_read'])
      assert.deepEqual(seen.events, ['fetch', 'read:json', 'refused'])
    }
  })

  it('memberRead on a write or a keyed admission changes nothing: its 404 and 503 are read as before', async () => {
    for (const [init, retry503] of [
      [{ method: 'POST', key: 'key-member' }, 'same_admission_key'],
      [{ method: 'POST' }, 'never'],
    ] as const) {
      const missing: Seen = { events: [] }
      answer(missing, () => watched(missing, JSON.stringify(errorBody), 404))
      const read = await refusedWithin(missing, memberCall(missing, { ...init, memberRead: true }))
      assert.deepEqual([read.code, read.retry], ['not_found', 'never'])
      assert.deepEqual(missing.events, ['fetch', 'read:json', 'refused'])

      const busy: Seen = { events: [] }
      answer(busy, () => watched(busy, '<html>busy</html>', 503))
      const failed = await refusedWithin(busy, memberCall(busy, { ...init, memberRead: true }))
      assert.deepEqual([failed.code, failed.retry], ['http_503', retry503])
    }
  })

  it('a member read still gives up at a read’s time, and ends at once when its caller stops waiting', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    silence()
    const timed = apiError(memberCall({ events: [] }, { memberRead: true }))
    t.mock.timers.tick(READ_TIMEOUT_MS)
    assert.deepEqual([(await timed).code, (await timed).retry], ['outcome_unknown', 'safe_read'])

    const caller = new AbortController()
    const stopped = apiError(memberCall({ events: [] }, { memberRead: true, signal: caller.signal }))
    caller.abort()
    assert.deepEqual([(await stopped).code, (await stopped).retry], ['outcome_unknown', 'safe_read'])
  })
})
