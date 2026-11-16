// A held Personal input (A52: a person turn with reply `recorded`) through the Studio's own readers: the canonical
// generated parsers behind every Personal read, and "Your data"'s export as DataSheet composes it (exportPersonalSpace,
// then exportText), both unchanged. Synthetic words only; fetch is a local stub, nothing leaves the process.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { exportPersonalSpace, getEarlierPersonalTurns, getPersonalSpace, getPersonalTurns } from '../../api/personal.ts'
import { exportText } from './data-view.ts'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const AT = '2026-10-01T10:00:00.000Z'
const HELD_WORDS = 'Kept for later, not a question yet.'

const held = {
  id: '6f1c2a7e-0d4b-4c39-9a51-3e0b7d1c9a01',
  seq: 2,
  author: 'person',
  text: HELD_WORDS,
  createdAt: AT,
  replyTo: null,
  reply: 'recorded',
  suggestion: null,
}
const asked = { ...held, id: '6f1c2a7e-0d4b-4c39-9a51-3e0b7d1c9a00', seq: 1, text: 'Asked earlier.', reply: 'answered' }

/** Every Personal read, as the API answers it, with a held turn in it. */
const BODIES: Record<string, unknown> = {
  '/api/v1/personal': {
    companion: 'rehearsal',
    revision: 3,
    turns: [asked, held],
    earlier: false,
    notes: [],
    releases: [],
    epoch: 0,
    days: 1,
  },
  '/api/v1/personal/turns': { revision: 3, turns: [held], pending: false },
  '/api/v1/personal/turns/earlier': { turns: [asked, held], earlier: false },
  '/api/v1/personal/export': { exportedAt: AT, turns: [asked, held], notes: [], releases: [], next: null },
}

/** The API answering each read with `body(path)`; the paths asked for. */
function serve(body: (path: string) => unknown): string[] {
  const paths: string[] = []
  globalThis.fetch = (url) => {
    const path = new URL(url instanceof Request ? url.url : String(url), 'http://studio.test').pathname
    paths.push(path)
    return Promise.resolve(
      new Response(JSON.stringify(body(path)), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
  }
  return paths
}

describe('a held turn through the canonical Personal readers', () => {
  it('the space, the poll and reading back each parse it, its reply kept as recorded', async () => {
    serve((path) => BODIES[path])
    const space = await getPersonalSpace('token', null)
    const page = await getPersonalTurns('token', 1)
    const earlier = await getEarlierPersonalTurns('token', 3)
    for (const turns of [space.turns, page.turns, earlier.turns]) {
      const t = turns.find((x) => x.seq === 2)
      assert.deepEqual([t?.author, t?.text, t?.reply], ['person', HELD_WORDS, 'recorded'])
    }
    assert.equal(page.pending, false)
  })

  it('"Your data" copies it as the person said it, through DataSheet\'s unchanged export and text', async () => {
    const paths = serve((path) => BODIES[path])
    const text = exportText(await exportPersonalSpace('token', 0, new AbortController().signal), 'Ana')
    assert.deepEqual(paths, ['/api/v1/personal/export'])
    assert.match(text, /You: Asked earlier\.\n.*You: Kept for later, not a question yet\.$/)
  })

  it('a reply state outside the contract is still refused, whole', async () => {
    serve(() => ({ revision: 3, turns: [{ ...held, reply: 'kept' }], pending: false }))
    await assert.rejects(getPersonalTurns('token', 1))
    serve(() => ({ revision: 3, turns: [{ ...held, reply: 'Recorded' }], pending: false }))
    await assert.rejects(getPersonalTurns('token', 1))
  })
})
