/**
 * INC04-R07-C2B-PRODUCER-001: the consumer's private observation decoder and per-call merge (packages/dsh-bundle
 * c2b-observation), on the built module. Every accessor below counts its invocations; a decoder that read one would fail
 * the count. Every private value is a canary string checked absent from what passes on and from every error.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, test } from 'node:test'
import {
  CallObservation, DIMENSIONS, N1_SOURCES, OBSERVATION_FRAME_TYPE, OBSERVATION_KEY, ObservationChunkRejected, decodeChunk, idCanonical, payloadOf,
  witnessOf, withoutObservations,
} from '../../packages/dsh-bundle/dist/c2b-observation.js'
import { wire } from '../../packages/dsh-bundle/dist/runtime-wire.generated.js'

const CANARY = 'C2B-CANARY-7f3e'
const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const supported = (value) => ({ status: 'supported', value })

/** A frame exactly as the patched adapter makes it: a reserved type and one non-enumerable frozen payload. */
function frame(payload, descriptor = {}) {
  const out = { type: OBSERVATION_FRAME_TYPE }
  Object.defineProperty(out, OBSERVATION_KEY, { value: payload, enumerable: false, writable: false, configurable: false, ...descriptor })
  return out
}
const transport = (extra = {}) => ({ v: 1, frame: 'transport', sent: 'observable_transport_response', httpStatus: 200, n2: [{ id: supported(`req-${CANARY}`), source: 'response_header' }], ...extra })
const created = (id = `resp-${CANARY}`) => ({ v: 1, frame: 'created', n1: [{ id: supported(id), source: 'created' }] })
const terminal = (extra = {}) => ({
  v: 1, frame: 'terminal', sent: 'observable_transport_response', httpStatus: 200,
  n1: [{ id: supported(`resp-${CANARY}`), source: 'created' }, { id: supported(`resp-${CANARY}`), source: 'completed' }],
  n2: [{ id: supported(`req-${CANARY}`), source: 'response_header' }], providerTerminal: 'completed', rawCounts: { inputTotal: 1000, cacheRead: 200, output: 50 }, ...extra,
})

/** An object whose `key` is an accessor counting its reads (and returning a canary). */
function withGetter(target, key, counter) {
  Object.defineProperty(target, key, { enumerable: true, configurable: true, get() { counter.n += 1; return CANARY } })
  return target
}

/** The known chunk kinds, each with its closed fields (dsh-llm StreamChunk). */
const KINDS = {
  'block-start': { type: 'block-start', index: 0, blockType: 'text' },
  'text-delta': { type: 'text-delta', index: 0, text: 'hello' },
  'reasoning-delta': { type: 'reasoning-delta', index: 1, text: 'think' },
  'tool-call-delta': { type: 'tool-call-delta', index: 2, id: 'call_1', name: 'search', argumentsDelta: '{}' },
  'block-end': { type: 'block-end', index: 0, block: { type: 'text', text: 'hello' } },
  usage: { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } },
  finish: { type: 'finish', reason: { kind: 'stop' }, replayState: { response: { responseId: 'resp-baseline' } } },
}

const rejected = (fn) => assert.throws(fn, (error) => error instanceof ObservationChunkRejected && error.message === 'c2b_chunk_rejected'
  && error.cause === undefined && !String(error.stack).includes(CANARY))

describe('decoding: no private value passes on, no getter runs, an ordinary chunk is untouched', () => {
  test('every ordinary chunk kind passes as the same object', () => {
    for (const chunk of Object.values(KINDS)) {
      const decoded = decodeChunk(chunk)
      assert.equal(decoded.kind, 'pass')
      assert.equal(decoded.chunk, chunk, `${chunk.type}: the same object`)
    }
  })

  test('a well-formed frame never passes on; its payload is read', () => {
    const decoded = decodeChunk(frame(Object.freeze(transport())))
    assert.equal(decoded.kind, 'frame')
    assert.equal(decoded.payload.frame, 'transport')
    assert.equal(decoded.payload.n2[0].id.value, `req-${CANARY}`)
  })

  test('a frame whose payload is enumerable, an accessor, absent or not v1 is dropped without reading it', () => {
    const counter = { n: 0 }
    const cases = [
      frame(transport(), { enumerable: true }),
      (() => { const f = { type: OBSERVATION_FRAME_TYPE }; return withGetter(f, OBSERVATION_KEY, counter) })(),
      { type: OBSERVATION_FRAME_TYPE },
      frame({ ...transport(), v: 2 }),
      frame(null),
      frame(`raw-${CANARY}`),
    ]
    for (const f of cases) assert.deepEqual(decodeChunk(f), { kind: 'frame', payload: null })
    assert.equal(counter.n, 0, 'no getter ran')
  })

  test('the reserved key on EVERY known kind, whatever its descriptor, is removed by rebuilding from own data fields', () => {
    const descriptors = [
      { value: CANARY, enumerable: true },
      { value: CANARY, enumerable: false },
      { value: { v: 1, payload: CANARY }, enumerable: true },
    ]
    for (const [kind, base] of Object.entries(KINDS)) {
      for (const d of descriptors) {
        const chunk = { ...base }
        Object.defineProperty(chunk, OBSERVATION_KEY, { ...d, configurable: true, writable: true })
        const decoded = decodeChunk(chunk)
        assert.equal(decoded.kind, 'pass')
        assert.notEqual(decoded.chunk, chunk, `${kind}: rebuilt`)
        assert.deepEqual(decoded.chunk, base, `${kind}: exactly its own closed fields`)
        assert.equal(Reflect.getOwnPropertyDescriptor(decoded.chunk, OBSERVATION_KEY), undefined)
        assert.ok(!JSON.stringify(decoded.chunk).includes(CANARY))
      }
      // An accessor reserved key is never invoked.
      const counter = { n: 0 }
      const decoded = decodeChunk(withGetter({ ...base }, OBSERVATION_KEY, counter))
      assert.deepEqual(decoded.chunk, base)
      assert.equal(counter.n, 0, `${kind}: the reserved accessor was not invoked`)
    }
  })

  test('the baseline successful N1 in finish.replayState is kept exactly (the only N1 a generic chunk carries)', () => {
    const finish = { ...KINDS.finish }
    Object.defineProperty(finish, OBSERVATION_KEY, { value: CANARY, enumerable: true, configurable: true })
    assert.deepEqual(decodeChunk(finish).chunk.replayState, { response: { responseId: 'resp-baseline' } })
  })

  test('an accessor type, an accessor known field beside the reserved key, or the key on an unknown kind is the fixed rejection', () => {
    const counter = { n: 0 }
    rejected(() => decodeChunk(withGetter({}, 'type', counter)))
    const field = withGetter({ type: 'text-delta', index: 0 }, 'text', counter)
    Object.defineProperty(field, OBSERVATION_KEY, { value: CANARY, enumerable: false })
    rejected(() => decodeChunk(field))
    const unknown = { type: 'mystery' }
    Object.defineProperty(unknown, OBSERVATION_KEY, { value: CANARY, enumerable: false })
    rejected(() => decodeChunk(unknown))
    rejected(() => decodeChunk(null))
    assert.equal(counter.n, 0, 'no getter ran, even while rejecting')
  })

  test('closed payload validation: every malformed member makes the whole frame null (dropped)', () => {
    const bad = [
      { ...transport(), extra: CANARY },
      { ...transport(), sent: 'unknown' },
      { ...transport(), httpStatus: 99 },
      { ...transport(), httpStatus: 200.5 },
      { ...transport(), n2: [{ id: supported(`req-${CANARY}`), source: 'typed_error' }] },
      { ...transport(), n1: created().n1 },
      { ...created(), n1: [{ id: { status: 'identity_unsupported', reason: 'over_bound' }, source: 'created' }] },
      { ...created(), n1: [{ id: supported(''), source: 'created' }] },
      { ...created(), n1: [{ id: supported(`a\u0000${CANARY}`), source: 'created' }] },
      { ...created(), n1: [{ id: supported(`a\uD800${CANARY}`), source: 'created' }] },
      { ...created(), n1: [{ id: supported('x'.repeat(8193)), source: 'created' }] },
      { ...created(), n1: [{ id: { status: 'identity_unsupported', reason: 'whatever' }, source: 'created' }] },
      terminal({ n1: [{ id: supported('a'), source: 'completed' }, { id: supported('a'), source: 'completed' }] }),
      terminal({ n2: [1, 2, 3].map(() => ({ id: supported('r'), source: 'response_header' })) }),
      terminal({ rawCounts: { inputTotal: 1.5 } }),
      terminal({ rawCounts: { inputTotal: 2 ** 53 } }),
      terminal({ rawCounts: { inputTotal: -1 } }),
      terminal({ rawCounts: { reasoning: 3 } }),
      terminal({ rawCounts: {} }),
      { ...terminal(), providerTerminal: undefined },
      terminal({ providerTerminal: 'aborted' }),
      { v: 1, frame: 'mystery' },
    ]
    for (const payload of bad) assert.equal(payloadOf(JSON.parse(JSON.stringify(payload))), null, JSON.stringify(payload).slice(0, 90))
    // An unsupported id with a fixed reason is valid in a terminal frame (counts retained beside it).
    assert.ok(payloadOf(terminal({ n1: [{ id: { status: 'identity_unsupported', reason: 'over_bound' }, source: 'completed' }] })))
  })

  test('withoutObservations: no frame escapes, and a consumer that stops reading stops it (no further reads, no drain)', async () => {
    let reads = 0
    async function* source() {
      for (const c of [frame(transport()), KINDS['text-delta'], frame(created()), KINDS['block-end'], frame(terminal()), KINDS.usage, KINDS.finish]) {
        reads += 1
        yield c
      }
    }
    const sink = new CallObservation()
    const seen = []
    for await (const c of withoutObservations(source(), sink)) seen.push(c.type)
    assert.deepEqual(seen, ['text-delta', 'block-end', 'usage', 'finish'])
    assert.equal(sink.delivered, 3)
    reads = 0
    const early = new CallObservation()
    for await (const c of withoutObservations(source(), early)) if (c.type === 'text-delta') break
    assert.equal(reads, 2, 'the frame and the delta, nothing after the return')
    assert.equal(early.observed().deliveryUnknownReason, 'closed_before_terminal_frame')
  })
})

describe('the per-call merge: delivered facts only, first-known, sticky bounded witnesses', () => {
  const accept = (...frames) => {
    const o = new CallObservation()
    // Through JSON, as the adapter's frozen payload has no undefined members.
    for (const f of frames) o.accept(payloadOf(JSON.parse(JSON.stringify(f))))
    return o.observed()
  }

  test('nothing delivered: all unknown, the v1-fallback observation', () => {
    assert.deepEqual(new CallObservation().observed(), { deliveryUnknownReason: 'no_frame_delivered' })
  })

  test('F1 only (headers) then an early return: only the transport facts, delivery closed before the terminal frame', () => {
    assert.deepEqual(accept(transport()), {
      sent: 'observable_transport_response', httpStatus: 200, n2: { id: supported(`req-${CANARY}`), sources: ['response_header'] }, deliveryUnknownReason: 'closed_before_terminal_frame',
    })
  })

  test('F1, F2 then a return: the created N1 too, still no terminal and no counts', () => {
    const o = accept(transport(), created())
    assert.deepEqual(o.n1, { id: supported(`resp-${CANARY}`), sources: ['created'] })
    assert.equal(o.providerTerminal, undefined)
    assert.equal(o.rawCounts, undefined)
    assert.equal(o.deliveryUnknownReason, 'closed_before_terminal_frame')
  })

  test('F1, F2, F3: the same N1 at created and completed is ONE id with both sources; counts known; delivery none', () => {
    const o = accept(transport(), created(), terminal())
    assert.deepEqual(o.n1, { id: supported(`resp-${CANARY}`), sources: ['created', 'completed'] })
    assert.deepEqual(o.rawCounts, { inputTotal: 1000, cacheRead: 200, output: 50 })
    assert.equal(o.deliveryUnknownReason, 'none')
    assert.equal(o.conflicts, undefined)
    assert.equal(wire.ResearchSettleRequest({ attemptId: 'a', nativeSessionId: 'n', reservationId: '00000000-0000-4000-8000-000000000001', outcome: 'uncertain',
      evidence: { contract: 'c1p_complete_report', report: 'not_complete', counts: { nonCachedInput: { class: 'unknown' }, cacheRead: { class: 'unknown' }, cacheWrite: { class: 'unknown' }, output: { class: 'unknown' } },
        ending: 'stream_completed', responseId: { status: 'unknown' }, observed: o } }), true, 'A58-valid')
  })

  test('order, duplicates, late and excess frames: only the first of each kind, in order, at most three', () => {
    const second = terminal({ providerTerminal: 'failed', rawCounts: { output: 9 } })
    assert.deepEqual(accept(transport(), transport({ httpStatus: 201 }), created(), terminal(), second, transport()), accept(transport(), created(), terminal()))
    // A frame arriving after a later kind is late and dropped: F3 then F1 keeps only F3.
    const late = accept(terminal({ sent: undefined, httpStatus: undefined, n2: undefined }), transport({ httpStatus: 503 }))
    assert.equal(late.httpStatus, undefined)
    assert.equal(late.deliveryUnknownReason, 'none')
  })

  test('a contradiction keeps the first value and ONE sticky witness of the competing canonical (never unknown)', () => {
    const o = new CallObservation()
    o.accept(payloadOf(created(`resp-A-${CANARY}`)))
    o.accept(payloadOf(JSON.parse(JSON.stringify(terminal({ n1: [{ id: supported(`resp-B-${CANARY}`), source: 'completed' }], httpStatus: 500 })))))
    const out = o.observed()
    assert.deepEqual(out.n1, { id: supported(`resp-A-${CANARY}`), sources: ['created'] })
    assert.deepEqual(out.conflicts, [{ dimension: 'n1', witness: sha(`c2b-conflict-v1|n1|s:${sha(`resp-B-${CANARY}`)}`) }])
    assert.equal(out.httpStatus, 500, 'the first known status (F1 never crossed)')
    assert.ok(!JSON.stringify(out.conflicts).includes(CANARY), 'no raw competing id')
    // Sticky: a second, different competing value on the same dimension changes nothing; the witness stays the first's.
    const twice = new CallObservation()
    twice.accept(payloadOf(created(`resp-A-${CANARY}`)))
    twice.accept(payloadOf(JSON.parse(JSON.stringify(terminal({ n1: [{ id: supported(`resp-B-${CANARY}`), source: 'created' }, { id: supported(`resp-C-${CANARY}`), source: 'completed' }] })))))
    assert.deepEqual(twice.observed().n1, { id: supported(`resp-A-${CANARY}`), sources: ['created'] })
    assert.deepEqual(twice.observed().conflicts, [{ dimension: 'n1', witness: sha(`c2b-conflict-v1|n1|s:${sha(`resp-B-${CANARY}`)}`) }])
  })

  test('the witness form is the service\'s (0110): sha256 of c2b-conflict-v1|dimension|competing canonical', () => {
    assert.equal(witnessOf('n1', idCanonical(supported('resp_B'))), sha(`c2b-conflict-v1|n1|s:${sha('resp_B')}`))
    assert.equal(witnessOf('http_status', '503'), sha('c2b-conflict-v1|http_status|503'))
    assert.deepEqual(DIMENSIONS, ['n1', 'n2', 'http_status', 'provider_terminal', 'input_total', 'cache_read', 'output', 'cross_c1p'])
    assert.deepEqual(N1_SOURCES, ['created', 'completed', 'incomplete', 'failed'])
  })

  test('unsupported then supported is a gain; supported then unsupported keeps the supported id; no witness either way', () => {
    const gain = accept(transport({ n2: [{ id: { status: 'identity_unsupported', reason: 'over_bound' }, source: 'response_header' }] }),
      terminal({ n2: [{ id: supported('req-ok'), source: 'typed_error' }] }))
    assert.deepEqual(gain.n2, { id: supported('req-ok'), sources: ['typed_error'] })
    const keep = accept(created('resp-ok'), terminal({ n1: [{ id: { status: 'identity_unsupported', reason: 'not_string' }, source: 'failed' }] }))
    assert.deepEqual(keep.n1, { id: supported('resp-ok'), sources: ['created'] })
    assert.equal(gain.conflicts ?? keep.conflicts, undefined)
  })

  test('raw counts only with a terminal; missing cache stays unknown (never 0); the known zeros stay known', () => {
    const partial = accept(terminal({ providerTerminal: 'failed', rawCounts: { inputTotal: 1000, output: 7 } }))
    assert.deepEqual(partial.rawCounts, { inputTotal: 1000, output: 7 })
    const zeros = accept(terminal({ rawCounts: { inputTotal: 0, cacheRead: 0, output: 0 } }))
    assert.deepEqual(zeros.rawCounts, { inputTotal: 0, cacheRead: 0, output: 0 })
    const errorEvent = accept(terminal({ providerTerminal: 'error_event', rawCounts: undefined, n1: [{ id: supported('r'), source: 'created' }] }))
    assert.equal(errorEvent.rawCounts, undefined)
    assert.equal(errorEvent.providerTerminal, 'error_event')
  })
})
