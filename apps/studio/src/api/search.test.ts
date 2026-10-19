import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ContractViolation, parseSearchPage } from '@sophia/contracts/validate'
import { ApiError } from './client.ts'
import { searchServed, servedPage } from './search.ts'

const R = '00000000-0000-4000-8000-000000000001'
const V = '00000000-0000-4000-8000-000000000002'
const M = '00000000-0000-4000-8000-000000000003'
const N = '00000000-0000-4000-8000-000000000004'
const sha = 'a'.repeat(64)

describe('the served search (A38) through the generated validator', () => {
  it('reads sections and messages as the Studio’s hits, with no meeting', () => {
    const page = servedPage(
      parseSearchPage({
        hits: [
          {
            kind: 'report_section',
            id: R,
            title: 'Kiosk pilot · Costs',
            snippet: 'The vendor quoted 9,400.',
            at: '2026-10-16T10:00:00.000Z',
            cite: { recordId: V, sha256: sha, anchor: 'costs#1' },
          },
          {
            kind: 'message',
            id: M,
            title: 'Marco',
            snippet: 'The heron arrived.',
            at: '2026-10-16T09:00:00.000Z',
            cite: { recordId: M, sha256: sha },
            before: N,
          },
        ],
        next: null,
      }),
    )
    assert.deepEqual(
      page.hits.map((h) => [h.kind, h.meetingId, h.cite.anchor, h.before]),
      [
        ['report_section', null, 'costs#1', undefined],
        ['message', null, undefined, N],
      ],
    )
  })

  it('refuses what A38 doesn’t serve: a recap, a hit without its hash', () => {
    const recap = {
      kind: 'recap',
      id: M,
      title: 't',
      snippet: 's',
      at: '2026-10-16T09:00:00.000Z',
      cite: { recordId: M, sha256: sha },
    }
    assert.throws(() => parseSearchPage({ hits: [recap], next: null }), ContractViolation)
    const unhashed = { ...recap, kind: 'note', cite: { recordId: M } }
    assert.throws(() => parseSearchPage({ hits: [unhashed], next: null }), ContractViolation)
  })
})

// R on 0d25 (r4315060306): A38's refusal is known from its status; an error body that never ends must not hold it back.
describe('the served search refused (A38 401/403)', () => {
  for (const status of [401, 403])
    it(`a ${status} whose body never ends is refused at once, from its status (SYNTHETIC stalled body)`, async () => {
      const real = globalThis.fetch
      let cancelled = false
      globalThis.fetch = () =>
        Promise.resolve(
          new Response(new ReadableStream({ cancel: () => void (cancelled = true) }), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
        )
      try {
        const outcome = await Promise.race([
          searchServed('token', R, 'heron', null).then(
            () => 'answered',
            (error: unknown) => error,
          ),
          new Promise((settle) => setTimeout(() => settle('still waiting on the body'), 500)),
        ])
        assert.ok(outcome instanceof ApiError, String(outcome))
        assert.equal(outcome.status, status)
        assert.equal(cancelled, true, 'the body is let go')
      } finally {
        globalThis.fetch = real
      }
    })
})
