import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, it } from 'node:test'
import { exportPersonalSpace, getPersonalSpace } from './personal.ts'

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
