import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, it, mock } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import { forgetPersonalReads } from '../app/account-cache.ts'
import { ApiError } from './client.ts'
// Read more's window read through the module (not a named import), so this file loads on a reader without it.
import * as reader from './personal.ts'
import {
  controlledPinned,
  exportControlledSpace,
  exportPersonalSpace,
  getPersonalSpace,
  isControlled,
  listProjects,
  NotCoherent,
  pinControlled,
  readControlledSpace,
  readPersonalSpace,
  refusedAsControlled,
} from './personal.ts'

const realFetch = globalThis.fetch
const AT = '2026-10-01T10:00:00.000Z'

/** A turn as the export carries it. */
const turn = (seq: number) => ({
  id: randomUUID(),
  seq,
  author: 'person' as const,
  text: `Turn ${String(seq)}`,
  createdAt: AT,
  replyTo: null,
  reply: 'answered' as const,
  suggestion: null,
})

/** One page of the export: its turns, and where the next one starts (null on the last). */
const page = (seqs: number[], next: number | null) =>
  new Response(JSON.stringify({ exportedAt: AT, turns: seqs.map(turn), notes: [], releases: [], next }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

/** A server answering each page as `answer` says; the pages asked for, by where each starts. */
function server(
  answer: (after: number, signal: AbortSignal | null | undefined) => Promise<Response>,
  epochs: Array<string | null> = [],
): number[] {
  const asked: number[] = []
  globalThis.fetch = (url, init) => {
    epochs.push(new Headers(init?.headers).get('x-sophia-personal-epoch'))
    const after = Number(
      new URL(url instanceof Request ? url.url : url, 'http://studio.test').searchParams.get('after'),
    )
    asked.push(after)
    return answer(after, init?.signal)
  }
  return asked
}

describe('the export, read a page at a time', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('reads every page, in order, into one export, each against the epoch the copy began in', async () => {
    const epochs: Array<string | null> = []
    const asked = server((after) => Promise.resolve(after === 0 ? page([1, 2], 2) : page([3], null)), epochs)
    const all = await exportPersonalSpace('token', 3, new AbortController().signal)
    assert.deepEqual(asked, [0, 2])
    assert.deepEqual(epochs, ['3', '3'])
    assert.deepEqual(
      all.turns.map((t) => t.seq),
      [1, 2, 3],
    )
    assert.equal(all.next, null)
  })

  it('stops at once when called off: the page on its way is let go, and none after it is asked for', async () => {
    const stop = new AbortController()
    const shut = new Error('The padlock shut')
    const second = Promise.withResolvers<void>()
    let asking: AbortSignal | null | undefined
    const asked = server((after, signal) => {
      if (after === 0) return Promise.resolve(page([1], 1))
      asking = signal
      second.resolve()
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    })
    const exported = exportPersonalSpace('token', 0, stop.signal)
    await second.promise
    stop.abort(shut)
    assert.equal(asking?.aborted, true, 'the page on its way is stopped at once, not at its time limit')
    await assert.rejects(exported, (err) => err === shut)
    assert.deepEqual(asked, [0, 1], 'no page after the one on its way')
  })

  it('asks for no page more once called off as a page arrives', async () => {
    const stop = new AbortController()
    const gone = new Error('The sheet closed')
    const asked = server((after) => {
      if (after === 0) stop.abort(gone) // the first page arrives as the copy is called off
      return Promise.resolve(after === 0 ? page([1], 1) : page([2], null))
    })
    await assert.rejects(exportPersonalSpace('token', 0, stop.signal), (err) => err === gone)
    assert.deepEqual(asked, [0])
  })
})

describe('reading the space', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('stops when its caller calls it off: the padlock shut, nothing personal is fetched any more', async () => {
    let asking: AbortSignal | null | undefined
    globalThis.fetch = (_url, init) => {
      asking = init?.signal
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    }
    const stop = new AbortController()
    const read = getPersonalSpace('token', null, stop.signal)
    stop.abort()
    assert.equal(asking?.aborted, true, 'stopped at once')
    await assert.rejects(read)
  })
})

describe('the Work list', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('takes its query’s signal: an account that leaves stops its read at once', async () => {
    let asked: AbortSignal | null | undefined
    globalThis.fetch = (_url, init) => {
      asked = init?.signal
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    }
    const stop = new AbortController()
    const reading = listProjects('token', stop.signal).then(
      () => 'answered',
      () => 'stopped',
    )
    stop.abort()
    // Against a sentinel, so a read that goes on (until its own time is up) fails here instead of hanging.
    const now = await Promise.race([reading, new Promise((done) => setTimeout(() => done('still reading'), 300))])
    assert.equal(now, 'stopped')
    assert.equal(asked?.aborted, true)
  })
})

// INC03-DES-001: a controlled space (A55/A54) read through the actual reader. Every answer here is synthetic and closed
// (the generated parsers refuse anything the contract doesn't say); nothing leaves the process.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const refusal = (status: number, code: string, retry: 'never' | 'safe_read' | 'retry') =>
  json({ code, message: `Synthetic ${code}`, retry, requestId: uuid(999) }, status)
/** C5: the old reads' refusal of a controlled space. */
const C5 = () => refusal(503, 'projection_unavailable', 'never')

const cturn = (seq: number, input: string | null = null) => ({
  id: uuid(1000 + seq),
  seq,
  author: 'person' as const,
  text: `Turn ${String(seq)}`,
  createdAt: AT,
  replyTo: null,
  reply: 'answered' as const,
  suggestion: null,
  input: input === null ? null : { inputId: input, control: 'withdrawn' as const, revision: 2 },
  prompt: 'excluded' as const,
  activity: true,
})
const cview = (inputId: string, seq: number) => ({
  inputId,
  turnId: uuid(1000 + seq),
  seq,
  createdAt: AT,
  reply: 'answered' as const,
  decisions: [],
  route: null,
  control: {
    state: 'withdrawn' as const,
    revision: 2,
    heldReason: null,
    withdrawnPhase: 'after_publication' as const,
    replaces: null,
    replacedBy: [],
  },
  prior: { financial: 'settled' as const, effect: 'none' as const, answer: 'published' as const },
  calls: [],
  withheld: [],
})
const LEGACY_SPACE = {
  companion: 'rehearsal',
  revision: 3,
  turns: [],
  earlier: false,
  notes: [],
  releases: [],
  epoch: 1,
  days: 0,
}
/** A55's answer: its newest window from `first` (100 turns' seqs given), `earlier` and its revision. */
const a55 = (seqs: number[], { revision = 7, earlier = false, inputs = [] as ReturnType<typeof cview>[] } = {}) => ({
  spaceContract: 'personal_controlled_space_v1',
  companion: 'rehearsal',
  revision,
  epoch: 1,
  days: 2,
  turns: seqs.map((n) => cturn(n, inputs.find((v) => v.seq === n)?.inputId ?? null)),
  earlier,
  pending: false,
  inputs,
  notes: [],
  releases: [],
})
const turnPage = (seqs: number[], { revision = 7, earlier = false, input = null as string | null } = {}) => ({
  revision,
  epoch: 1,
  turns: seqs.map((n, i) => cturn(n, i === 0 ? input : null)),
  earlier,
  pending: false,
})

/** The synthetic API: each request asked, as `METHOD path?query`, answered by `answer`. */
function api(answer: (path: string) => Response | Promise<Response>): string[] {
  const asked: string[] = []
  globalThis.fetch = (url, init) => {
    const u = new URL(url instanceof Request ? url.url : String(url), 'http://studio.test')
    const path = `${u.pathname}${u.search}`
    asked.push(`${init?.method ?? 'GET'} ${path}`)
    return Promise.resolve(answer(path))
  }
  return asked
}

const plan = (pinned = false, from: number | null = null) => ({ pinned, from })
const outcome = (p: Promise<unknown>) =>
  p.then(
    (value) => ({ value, error: null }),
    (error: unknown) => ({ value: null, error }),
  )

describe('a controlled space, read legacy first (C5) and pinned', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('reads the old way first; its typed answer is the space, and nothing controlled is asked', async () => {
    const asked = api(() => json(LEGACY_SPACE))
    let pinned = 0
    const read = await readPersonalSpace('t', null, plan(), () => (pinned += 1))
    assert.equal(isControlled(read), false)
    assert.deepEqual([asked, pinned], [['GET /api/v1/personal'], 0])
  })

  it('only C5’s refusal moves the read to A55, pinned, after the old one, never before it', async () => {
    const asked = api((path) => (path.startsWith('/api/v1/personal/answer-controls/space') ? json(a55([1, 2])) : C5()))
    let pinned = 0
    const read = await readPersonalSpace('t', 'Europe/Rome', plan(), () => (pinned += 1))
    assert.equal(isControlled(read), true)
    assert.equal(pinned, 1)
    assert.deepEqual(asked, [
      'GET /api/v1/personal?timeZone=Europe%2FRome',
      'GET /api/v1/personal/answer-controls/space?timeZone=Europe%2FRome',
    ])
  })

  it('no other failure moves it: another 503, another retry, 401, 403, a parse failure, each stays a failure', async () => {
    const failures = [
      refusal(503, 'unavailable', 'safe_read'),
      refusal(503, 'projection_unavailable', 'safe_read'),
      refusal(401, 'unauthenticated', 'never'),
      refusal(403, 'forbidden', 'never'),
      json({ ...LEGACY_SPACE, companion: 'somewhere' }),
    ]
    for (const failure of failures) {
      const asked = api(() => failure.clone())
      const { error } = await outcome(readPersonalSpace('t', null, plan(), () => assert.fail('pinned')))
      assert.ok(error instanceof ApiError, String(error))
      assert.equal(refusedAsControlled(error), false)
      assert.deepEqual(asked, ['GET /api/v1/personal'], 'never the controlled read')
    }
  })

  it('once pinned, reads A55 only; its failures are failures, never the old read in their place', async () => {
    for (const failure of [
      refusal(503, 'projection_unavailable', 'never'),
      refusal(503, 'unavailable', 'safe_read'),
      json({ ...a55([1]), companion: 'somewhere' }),
      json({ ...a55([1]), spaceContract: 'personal_controlled_space_v2' }),
    ]) {
      const asked = api(() => failure.clone())
      const { error } = await outcome(readPersonalSpace('t', null, plan(true), () => assert.fail('pinned again')))
      assert.ok(error instanceof ApiError, String(error))
      assert.deepEqual(asked, ['GET /api/v1/personal/answer-controls/space'])
    }
    const parsed = await outcome(
      (async () => {
        api(() => json({ ...a55([1]), companion: 'somewhere' }))
        return readPersonalSpace('t', null, plan(true), () => undefined)
      })(),
    )
    assert.ok(parsed.error instanceof ApiError && parsed.error.code === 'contract_violation', 'an unknown enum')
  })

  it('a round reads the windows read back, to `from`, with each input’s view and when each read answered', async () => {
    const X = uuid(11)
    const asked = api((path) => {
      if (path.startsWith('/api/v1/personal/answer-controls/space')) return json(a55([201, 202], { earlier: true }))
      if (path.endsWith('before=201')) return json(turnPage([101, 102], { earlier: true, input: X }))
      if (path.endsWith('before=101')) return json(turnPage([1, 2]))
      if (path === `/api/v1/personal/answers/${X}/control`) return json(cview(X, 101))
      return refusal(404, 'not_found', 'never')
    })
    const read = await readPersonalSpace('t', null, plan(true, 101), () => undefined)
    assert.ok(isControlled(read))
    assert.deepEqual(asked, [
      'GET /api/v1/personal/answer-controls/space',
      'GET /api/v1/personal/answer-controls/turns?before=201',
      `GET /api/v1/personal/answers/${X}/control`,
    ])
    assert.deepEqual(
      read.back.map((w) => w.before),
      [201],
      'back to what was read before, no further',
    )
    assert.equal(read.views.get(X)?.inputId, X)
    assert.ok(read.viewAt.get(X), 'the view’s own read time')
    assert.ok(read.readAt <= read.asOf && (read.back[0]?.at ?? '') <= read.asOf)
  })

  it('a window read at another revision is no whole picture: the round is read again, then said not coherent', async () => {
    let spaces = 0
    const mixed = (again: boolean) =>
      api((path) => {
        if (path.startsWith('/api/v1/personal/answer-controls/space')) {
          spaces += 1
          return json(a55([201], { earlier: true }))
        }
        // Again: every window at 8 (the space at 7). Else only the first round's: the second round is coherent.
        return json(turnPage([101], { revision: again || spaces === 1 ? 8 : 7 }))
      })
    mixed(true)
    const { error } = await outcome(readPersonalSpace('t', null, plan(true, 101), () => undefined))
    assert.ok(error instanceof NotCoherent)
    assert.equal(spaces, 2, 'asked twice, no more')
    spaces = 0
    mixed(false)
    const { value, error: none } = await outcome(readPersonalSpace('t', null, plan(true, 101), () => undefined))
    assert.equal(none, null, 'coherent on the second round')
    assert.ok(value)
    assert.equal(spaces, 2)
  })
})

describe('a controlled space’s copy, read a page at a time', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  const exportPage = (seqs: number[], next: number | null, exportedAt: string) => ({
    exportedAt,
    epoch: 1,
    turns: seqs.map((n) => cturn(n)),
    next,
    inputs: [],
    notes: [],
    releases: [],
  })

  it('reads every page against the epoch it began in, keeping when each page was made', async () => {
    const epochs: Array<string | null> = []
    const asked: string[] = []
    globalThis.fetch = (url, init) => {
      const u = new URL(url instanceof Request ? url.url : String(url), 'http://studio.test')
      asked.push(`${u.pathname}${u.search}`)
      epochs.push(new Headers(init?.headers).get('x-sophia-personal-epoch'))
      const first = u.searchParams.get('after') === '0'
      return Promise.resolve(
        json(first ? exportPage([1, 2], 2, AT) : exportPage([3], null, '2026-10-01T10:00:05.000Z')),
      )
    }
    const all = await exportControlledSpace('t', 4, new AbortController().signal)
    assert.deepEqual(asked, [
      '/api/v1/personal/answer-controls/export?after=0',
      '/api/v1/personal/answer-controls/export?after=2',
    ])
    assert.deepEqual(epochs, ['4', '4'])
    assert.deepEqual(
      all.turns.map((t) => t.seq),
      [1, 2, 3],
    )
    assert.deepEqual(all.pages, [
      { from: 1, exportedAt: AT },
      { from: 3, exportedAt: '2026-10-01T10:00:05.000Z' },
    ])
  })

  it('an erasure since the copy began refuses it (request_erased): no page after, nothing copied', async () => {
    api(() => refusal(409, 'request_erased', 'never'))
    const { error } = await outcome(exportControlledSpace('t', 4, new AbortController().signal))
    assert.ok(error instanceof ApiError && error.code === 'request_erased')
  })
})

describe('the controlled pin’s life in the account’s cache', () => {
  it('lasts past an idle collection, and goes only with the explicit resets: the padlock, an erasure', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    try {
      // As in a browser: idle queries are collected after five minutes (react-query's default there).
      const client = new QueryClient({ defaultOptions: { queries: { gcTime: 300_000 } } })
      client.setQueryData(['personal', 'luis', 'other'], 'x')
      pinControlled(client, 'luis')
      mock.timers.tick(10 * 60_000)
      assert.equal(client.getQueryData(['personal', 'luis', 'other']), undefined, 'an ordinary idle one went')
      assert.equal(controlledPinned(client, 'luis'), true, 'the pin stays')
      forgetPersonalReads(client)
      assert.equal(controlledPinned(client, 'luis'), false, 'the padlock takes it')
      pinControlled(client, 'luis')
      void client.resetQueries({ queryKey: ['personal', 'luis'] })
      assert.equal(controlledPinned(client, 'luis'), false, 'an erasure’s read afresh takes it')
      pinControlled(client, 'luis')
      assert.equal(controlledPinned(new QueryClient(), 'luis'), false, 'another account’s cache has none')
    } finally {
      mock.timers.reset()
    }
  })
})

// INC03-DES-001 R1 (CORE df064b29, root d0153c26): a view is its page's input's (R01), and a round reads back all that
// was loaded (R02). Synthetic, closed answers; fetch fully replaced, every request a GET.
const R1_X = uuid(5000)
/** A turn with an input at `control`/`revision`, or without one. */
const r1turn = (seq: number, input: { control: 'active' | 'held' | 'withdrawn'; revision: number } | null = null) => ({
  ...cturn(seq),
  reply: input?.control === 'withdrawn' ? ('withdrawn' as const) : ('failed' as const),
  input: input ? { inputId: R1_X, ...input } : null,
  prompt: 'eligible' as const,
})
/** X's view at `control`/`revision`, with `calls` (what may change at one control revision). */
const r1view = (
  control: 'active' | 'held' | 'withdrawn',
  revision: number,
  over: { turnId?: string; seq?: number; calls?: object[]; withheld?: object[] } = {},
) => ({
  ...cview(R1_X, 101),
  turnId: over.turnId ?? uuid(1101),
  seq: over.seq ?? 101,
  reply: control === 'withdrawn' ? 'withdrawn' : 'failed',
  control: {
    state: control,
    revision,
    heldReason: null,
    withdrawnPhase: control === 'withdrawn' ? 'before_reservation' : null,
    replaces: null,
    replacedBy: [],
  },
  calls: over.calls ?? [],
  withheld: over.withheld ?? [],
})
const seqs = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
/** A55 whose newest window is `newest`, earlier turns existing; no inputs on it. */
const r1space = (newest: number[]) => ({ ...a55(newest, { earlier: true }) })
/** A54's page before `before`: `turns`, at revision 7, epoch 1. */
const r1page = (turns: object[], earlier: boolean) => ({ revision: 7, epoch: 1, turns, earlier, pending: false })

describe('R01: a view is the view of its page’s input, as the page has it', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  /** The earlier window holds X at control active/0; its view is `view()` (asked anew each time). */
  function earlierWithX(view: () => object) {
    return api((path) => {
      if (path.startsWith('/api/v1/personal/answer-controls/space')) return json(r1space(seqs(102, 201)))
      if (path.endsWith('before=102'))
        return json(
          r1page([...seqs(2, 100).map((n) => r1turn(n)), r1turn(101, { control: 'active', revision: 0 })], true),
        )
      if (path === `/api/v1/personal/answers/${R1_X}/control`) return json(view())
      return refusal(404, 'not_found', 'never')
    })
  }

  it('a view at a newer control than its page’s is never returned with it: read again, then not coherent', async () => {
    earlierWithX(() => r1view('withdrawn', 1))
    const { value, error } = await outcome(readControlledSpace('t', null, 2))
    assert.equal(value, null, 'no mixed read returned')
    assert.ok(error instanceof NotCoherent)
  })

  it('the next round that holds wins; a view whose money or kept answers moved at the same control is read as it is', async () => {
    let views = 0
    const settled = [
      {
        callId: uuid(301),
        financial: 'settled',
        reason: null,
        launch: 'tagged',
        answer: 'withheld',
        possibleEffect: true,
      },
    ]
    earlierWithX(() => {
      views += 1
      return views === 1 ? r1view('withdrawn', 1) : r1view('active', 0, { calls: settled })
    })
    const read = await readControlledSpace('t', null, 2)
    assert.equal(views, 2)
    assert.deepEqual(read.views.get(R1_X)?.control, { ...r1view('active', 0).control })
    assert.equal(read.views.get(R1_X)?.calls[0]?.financial, 'settled', 'same control revision: money as it stands')
  })

  it('a view of another turn, or another seq, doesn’t hold', async () => {
    for (const other of [{ turnId: uuid(1102) }, { seq: 102 }]) {
      earlierWithX(() => r1view('active', 0, other))
      const { error } = await outcome(readControlledSpace('t', null, 2))
      assert.ok(error instanceof NotCoherent, JSON.stringify(other))
    }
  })

  it('A55’s own inputs must hold with its window too', async () => {
    api((path) =>
      path.startsWith('/api/v1/personal/answer-controls/space')
        ? json({
            ...a55([101]),
            turns: [r1turn(101, { control: 'active', revision: 0 })],
            inputs: [r1view('withdrawn', 1)],
          })
        : refusal(404, 'not_found', 'never'),
    )
    const { error } = await outcome(readControlledSpace('t', null, null))
    assert.ok(error instanceof NotCoherent)
  })

  it('read more: a window whose view doesn’t hold isn’t joined (null); one that holds is, with its time', async () => {
    earlierWithX(() => r1view('withdrawn', 1))
    const viewed = { views: new Map(), at: new Map() }
    assert.equal(await reader.readControlledWindow('t', 102, { revision: 7, epoch: 1 }, viewed), null)
    earlierWithX(() => r1view('active', 0))
    const ok = { views: new Map(), at: new Map() }
    const window = await reader.readControlledWindow('t', 102, { revision: 7, epoch: 1 }, ok)
    assert.equal(window?.page.turns.at(-1)?.seq, 101)
    assert.ok(ok.at.get(R1_X))
    assert.equal(await reader.readControlledWindow('t', 102, { revision: 8, epoch: 1 }, ok), null, 'another revision')
  })
})

describe('R02: a round reads back everything that was loaded, as far as it was loaded', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  /** A space whose newest window is `newest`, and 100-turn pages below it down to seq 1. */
  function deep(newest: number[], asked: string[] = []) {
    return api((path) => {
      asked.push(path)
      if (path.startsWith('/api/v1/personal/answer-controls/space')) return json(r1space(newest))
      const before = Number(/before=(\d+)/.exec(path)?.[1])
      const from = Math.max(1, before - 100)
      return json(
        r1page(
          seqs(from, before - 1).map((n) => r1turn(n)),
          from > 1,
        ),
      )
    })
  }

  it('more than 20 windows loaded: all are read again, to the oldest seq loaded', async () => {
    deep(seqs(2201, 2300))
    const read = await readControlledSpace('t', null, 1)
    assert.equal(read.back[0]?.page.turns[0]?.seq, 1, 'the oldest loaded is reached')
    assert.equal(read.back.length, 22)
    const all = read.back.flatMap((w) => w.page.turns.map((t) => t.seq))
    assert.deepEqual(all, seqs(1, 2200), 'every turn once, in order')
  })

  it('the newest window moved on: the windows read back still reach what was loaded, with no gap', async () => {
    deep(seqs(251, 350))
    const read = await readControlledSpace('t', null, 101)
    const all = [...read.back.flatMap((w) => w.page.turns.map((t) => t.seq)), ...read.turns.map((t) => t.seq)]
    assert.ok((all[0] ?? Infinity) <= 101)
    assert.deepEqual(all, seqs(all[0] ?? 0, 350))
  })

  it('a page that makes no progress, or repeats its cursor, fails honestly at once, never read again', async () => {
    for (const bad of [
      () => r1page([], true),
      () =>
        r1page(
          seqs(102, 150).map((n) => r1turn(n)),
          true,
        ),
      () => r1page([r1turn(60), r1turn(50)], true),
    ]) {
      const asked: string[] = []
      api((path) => {
        asked.push(path)
        return path.startsWith('/api/v1/personal/answer-controls/space') ? json(r1space(seqs(102, 201))) : json(bad())
      })
      const { error } = await outcome(readControlledSpace('t', null, 1))
      assert.ok(error instanceof Error && error.name === 'ReadBackMalformed', String(error))
      assert.equal(asked.length, 2, 'one space, one page: no retry')
    }
  })

  it('called off, it stops: no page after, nothing returned', async () => {
    const stop = new AbortController()
    const asked: string[] = []
    globalThis.fetch = (url) => {
      asked.push(url instanceof Request ? url.url : url instanceof URL ? url.href : url)
      stop.abort()
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
    }
    const { value } = await outcome(readControlledSpace('t', null, 1, stop.signal))
    assert.equal(value, null)
    assert.equal(asked.length, 1)
  })
})
