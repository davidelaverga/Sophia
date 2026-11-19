// INC04-S03b B2 (0108): the shared check of a patched producer's provider-reported models. Every report here is a
// SYNTHETIC fixture in the carried producer's shape (patches/t3code/ade47301-provider-reported-models.patch): nothing
// here is a provider's report or qualifies a T3 install.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  checkReport,
  codeUnitOrder,
  isAttemptId,
  isModelId,
  REPORT_MAX_BYTES,
  reportBytes,
  reportFromProducer,
  type RunnerModelReport,
} from './runner-model-report.ts'

const THREAD = 'mcp:launch:thread-1'
const RUN = 'run-1'

const attempt = (over: Record<string, unknown> = {}) => ({
  attemptId: 'attempt:r1-a2',
  attemptOrdinal: 2,
  reason: 'steering_restart',
  status: 'completed',
  active: true,
  providerInstanceId: 'claudeAgent',
  rootTurns: 3,
  terminalRootTurns: 2,
  reportingRootTurns: 1,
  unboundTurns: 0,
  modelEvidence: 'reported',
  models: ['claude-model-a', 'claude-model-b'],
  modelsOmitted: 0,
  excludedModelValues: 1,
  ...over,
})
const earlier = (over: Record<string, unknown> = {}) =>
  attempt({
    attemptId: 'attempt:r1-a1',
    attemptOrdinal: 1,
    reason: 'initial',
    status: 'superseded',
    active: false,
    rootTurns: 1,
    terminalRootTurns: 1,
    reportingRootTurns: 0,
    modelEvidence: 'unknown',
    models: [],
    excludedModelValues: 0,
    ...over,
  })
const producer = (over: Record<string, unknown> = {}) => ({
  evidence: 'collected',
  collectedAt: '2026-11-14T00:00:00.000Z',
  activeAttemptId: 'attempt:r1-a2',
  attemptPolicy: 'latest_by_attempt_ordinal',
  attemptLimit: 8,
  attemptsOwned: 2,
  attemptsOmitted: 0,
  attempts: [attempt(), earlier()],
  ...over,
})
const fromProducer = (raw: unknown) => reportFromProducer(raw, THREAD, RUN)
const state = (r: RunnerModelReport) => (r.state === 'malformed' ? `malformed:${r.reason}` : r.state)
const withModels = (models: string[]) => producer({ attempts: [attempt({ models }), earlier()] })

describe('a collected report: checked, rebuilt and bound to the receipt', () => {
  it('rebuilds the producer report in canonical form with the receipt ids, and the wire check keeps it exactly', () => {
    const r = fromProducer(producer())
    assert.equal(r.state, 'collected')
    assert.deepEqual(Object.keys(r), [
      'state',
      'threadId',
      'runId',
      'collectedAt',
      'activeAttemptId',
      'attemptPolicy',
      'attemptLimit',
      'attemptsOwned',
      'attemptsOmitted',
      'attempts',
    ])
    assert.equal(r.state === 'collected' && r.threadId, THREAD)
    assert.equal(r.state === 'collected' && r.runId, RUN)
    // A host's report, re-read on Sophia's side, is the same object; the producer's own key never crosses.
    assert.deepEqual(checkReport(JSON.parse(JSON.stringify(r))), r)
    assert.equal(state(checkReport({ ...producer(), threadId: THREAD, runId: RUN })), 'malformed:invalid')
  })

  it('keeps an unavailable report, with its reason and the producer time, and nothing else', () => {
    const r = fromProducer({ evidence: 'unavailable', reason: 'provider_turns_load_failed', collectedAt: 'x' })
    assert.deepEqual(r, {
      state: 'unavailable',
      threadId: THREAD,
      runId: RUN,
      reason: 'provider_turns_load_failed',
      collectedAt: 'x',
    })
    for (const bad of [
      { evidence: 'unavailable', reason: 'other', collectedAt: 'x' },
      { evidence: 'unavailable', reason: 'attempts_not_loaded' },
      { evidence: 'unavailable', reason: 'attempts_not_loaded', collectedAt: 'x', extra: 1 },
    ])
      assert.equal(state(fromProducer(bad)), 'malformed:invalid', JSON.stringify(bad))
  })

  it('never takes a requested, accepted, effort or final field, and refuses any unknown key', () => {
    for (const extra of ['requested', 'accepted', 'effort', 'final', 'complete'])
      assert.equal(state(fromProducer({ ...producer(), [extra]: true })), 'malformed:invalid', extra)
    assert.equal(
      state(fromProducer(producer({ attempts: [{ ...attempt(), effort: 'high' }, earlier()] }))),
      'malformed:invalid',
    )
  })

  it('refuses ids it cannot bind: blank receipt ids, a NUL or a lone surrogate', () => {
    assert.equal(state(reportFromProducer(producer(), ' ', RUN)), 'malformed:invalid')
    assert.equal(state(reportFromProducer(producer(), THREAD, '')), 'malformed:invalid')
    assert.equal(state(fromProducer(producer({ collectedAt: 'a\u0000b' }))), 'malformed:invalid')
    assert.equal(state(fromProducer(producer({ collectedAt: 'a\ud800b' }))), 'malformed:invalid')
    assert.equal(state(fromProducer(producer({ collectedAt: '' }))), 'collected', 'any representable string')
  })
})

describe('model ids keep the producer rules exactly; attempt ids follow the pin', () => {
  it('counts UTF-16 units: 200 accepted, 201 refused, astral counted twice', () => {
    const bmp = 'é'.repeat(200)
    const astral = '😀'.repeat(100)
    assert.ok(isModelId(bmp) && isModelId(astral) && isModelId('x'.repeat(200)))
    assert.ok(!isModelId('é'.repeat(201)) && !isModelId(`${astral}a`) && !isModelId(''))
    assert.equal(state(fromProducer(withModels([astral]))), 'collected')
    assert.equal(state(fromProducer(withModels([`${astral}a`]))), 'malformed:invalid')
  })

  it('trims as JavaScript does: an edge U+00A0, U+3000 or U+FEFF is refused; inside, it is data', () => {
    for (const edge of [' ', '　', '﻿', ' ', ' ', '\t'])
      assert.ok(!isModelId(`${edge}m`) && !isModelId(`m${edge}`), JSON.stringify(edge))
    assert.ok(isModelId('model x') && isModelId('model　x'))
  })

  it('refuses C0 and C1 controls in a model id (U+007F, U+0085), but keeps them as data in an attempt id', () => {
    for (const c of ['\u0001', '\u001f', '\u007f', '\u0085', '\u009f']) {
      assert.ok(!isModelId(`m${c}x`), JSON.stringify(c))
      assert.ok(isAttemptId(`a${c}x`), JSON.stringify(c))
    }
    assert.ok(!isAttemptId('a\u0000x') && !isAttemptId(' a') && !isAttemptId('a\n') && !isAttemptId(''))
    assert.ok(isAttemptId('x'.repeat(5000)), 'unbounded at the pin: only the whole report is bounded')
  })

  it('orders by UTF-16 code unit, never by code point or collation: U+1F600 before U+E000', () => {
    assert.ok(codeUnitOrder('\u{1f600}', '') < 0, 'a high surrogate precedes U+E000')
    assert.equal(state(fromProducer(withModels(['\u{1f600}', '']))), 'collected')
    assert.equal(state(fromProducer(withModels(['', '\u{1f600}']))), 'malformed:invalid')
    assert.equal(state(fromProducer(withModels(['B', 'a', 'b']))), 'collected')
    assert.equal(state(fromProducer(withModels(['a', 'a']))), 'malformed:invalid', 'distinct')
    assert.equal(state(fromProducer(withModels(['b', 'a']))), 'malformed:invalid', 'ordered')
  })
})

describe("the producer's order, counts and relations", () => {
  it('orders attempts by ordinal descending, then id by code unit; ties are judged the same way, ids distinct', () => {
    const tieA = attempt({ attemptId: 'a', active: false })
    const tieB = attempt({ attemptId: 'b', active: false })
    const tied = (attempts: unknown[]) =>
      fromProducer(producer({ activeAttemptId: null, attemptsOwned: attempts.length, attempts }))
    assert.equal(state(tied([tieA, tieB])), 'collected')
    assert.equal(state(tied([tieB, tieA])), 'malformed:invalid')
    assert.equal(state(tied([tieA, { ...tieB, attemptId: 'a' }])), 'malformed:invalid')
    assert.equal(state(fromProducer(producer({ attempts: [earlier(), attempt()] }))), 'malformed:invalid')
  })

  it('keeps counters as safe non-negative integers (positive where the contract says so)', () => {
    const at = (over: Record<string, unknown>) =>
      state(fromProducer(producer({ attempts: [attempt(over), earlier()] })))
    assert.equal(at({ excludedModelValues: Number.MAX_SAFE_INTEGER }), 'collected')
    for (const bad of [Number.MAX_SAFE_INTEGER + 1, -1, 1.5, '1', null])
      assert.equal(at({ excludedModelValues: bad }), 'malformed:invalid', String(bad))
    assert.equal(at({ attemptOrdinal: 0 }), 'malformed:invalid')
    assert.equal(state(fromProducer(producer({ attemptLimit: 0 }))), 'malformed:invalid')
  })

  it('refuses a report whose counts contradict themselves', () => {
    const at = (over: Record<string, unknown>) =>
      state(fromProducer(producer({ attempts: [attempt(over), earlier()] })))
    assert.equal(at({ terminalRootTurns: 4 }), 'malformed:invalid', 'terminal > root')
    assert.equal(at({ reportingRootTurns: 3 }), 'malformed:invalid', 'reporting > terminal')
    assert.equal(at({ models: [] }), 'malformed:invalid', 'reported needs a model')
    assert.equal(at({ reportingRootTurns: 0 }), 'malformed:invalid', 'reported needs a reporting turn')
    assert.equal(at({ modelsOmitted: 1 }), 'malformed:invalid', 'omitted models only past 8')
    assert.equal(at({ active: false }), 'malformed:invalid', 'active is exactly the run active attempt')
    assert.equal(state(fromProducer(producer({ attemptsOwned: 5 }))), 'malformed:invalid', 'omitted = owned - returned')
    assert.equal(state(fromProducer(producer({ attemptsOwned: 3, attemptsOmitted: 1 }))), 'malformed:invalid')
    const eight = Array.from({ length: 8 }, (_, i) => `m${i}`)
    assert.equal(at({ models: eight, modelsOmitted: 4 }), 'collected')
  })
})

describe('the whole report is bounded: 32768 compact UTF-8 bytes, wrapper and ids included', () => {
  /** A producer report whose canonical wire form (bound to RUN) is exactly `bytes` long, padded in collectedAt. */
  function rawSized(bytes: number, pad: string) {
    const base = reportBytes(reportFromProducer(producer({ collectedAt: '' }), THREAD, RUN))
    const unit = Buffer.byteLength(JSON.stringify(pad)) - 2
    const head = pad.repeat(Math.floor((bytes - base) / unit))
    return producer({ collectedAt: head + 'x'.repeat(bytes - base - Buffer.byteLength(JSON.stringify(head)) + 2) })
  }
  const sized = (bytes: number, pad: string) => reportFromProducer(rawSized(bytes, pad), THREAD, RUN)

  it('accepts exactly the bound and refuses one byte more, counting escapes and multibyte characters', () => {
    for (const pad of ['é', '😀', '"', '\\', 'a']) {
      const at = sized(REPORT_MAX_BYTES, pad)
      assert.equal(at.state, 'collected', JSON.stringify(pad))
      assert.equal(reportBytes(at), REPORT_MAX_BYTES)
      assert.equal(state(sized(REPORT_MAX_BYTES + 1, pad)), 'malformed:oversize', JSON.stringify(pad))
    }
  })

  it('counts the receipt ids: a long run id alone can make a report oversize', () => {
    const raw = rawSized(REPORT_MAX_BYTES - 100, 'a')
    assert.equal(state(reportFromProducer(raw, THREAD, RUN)), 'collected')
    assert.equal(state(reportFromProducer(raw, THREAD, `run-${'r'.repeat(200)}`)), 'malformed:oversize')
  })

  it('re-checks a wire report: an oversized one stays malformed on the worker side, with no content', () => {
    const at = sized(REPORT_MAX_BYTES, 'a')
    assert.ok(at.state === 'collected')
    const over = { ...at, collectedAt: `${at.collectedAt}y` }
    assert.deepEqual(checkReport(over), { state: 'malformed', reason: 'oversize' })
    assert.deepEqual(checkReport({ state: 'malformed', reason: 'oversize' }), {
      state: 'malformed',
      reason: 'oversize',
    })
    assert.deepEqual(checkReport({ state: 'absent' }), { state: 'malformed', reason: 'invalid' })
    assert.deepEqual(checkReport({ state: 'malformed', reason: 'x', detail: 'secret' }), {
      state: 'malformed',
      reason: 'invalid',
    })
  })
})
