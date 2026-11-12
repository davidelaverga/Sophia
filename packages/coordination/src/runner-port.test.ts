// The runner port's two envelope versions (INC01-CC-005, migration 0096; docs/plans/owner-runner-source-authority.md).
// v1 is frozen byte for byte; v2 is content-free and its instruction is a payload checked against its digest. The
// settings and policies here are SYNTHETIC: they prove the checks, never that any provider, model or effort exists.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalJson } from './canonical.ts'
import {
  checkEnvelope,
  checkPayload,
  digestOf,
  envelopeV2,
  settingsRefusal,
  settingsShapeRefusal,
  sha256Hex,
  type RunnerEnvelope,
  type RunnerEnvelopeV2,
  type RunnerSourcePolicy,
} from './runner-port.ts'

const v1: RunnerEnvelope = {
  v: 1,
  operationId: '00000000-0000-4000-8000-000000000001',
  kind: 'create',
  projectId: '00000000-0000-4000-8000-0000000000a1',
  ownerId: '00000000-0000-4000-8000-0000000000b1',
  resourceId: '00000000-0000-4000-8000-0000000000c1',
  bindingId: '00000000-0000-4000-8000-0000000000d1',
  goalId: '00000000-0000-4000-8000-0000000000e1',
  qualificationId: '00000000-0000-4000-8000-0000000000f1',
  qualificationRevision: 1,
  adapterPin: 'ade473018d32003658b7d38693e083ee2e314bd8',
  environmentRef: 'env-owner-1',
  nativeProjectRef: 'project-sophia',
  profileId: 'read-only-v1',
  profileRevision: 1,
  accountKey: 'claude:acct-1',
  authorityEpoch: 1,
  message: 'Report the Ask admission boundary.',
  title: 'Read-only qualification',
  targetOperationId: null,
  nativeThreadId: null,
}

const POLICY: RunnerSourcePolicy = {
  v: 1,
  instanceId: 'codex',
  models: [
    {
      model: 'synthetic-model',
      options: [
        { id: 'fast', values: [true] },
        { id: 'reasoningEffort', values: ['low', 'high'] },
      ],
    },
  ],
}
const SETTINGS = {
  instanceId: 'codex',
  model: 'synthetic-model',
  options: [
    { id: 'fast', value: true },
    { id: 'reasoningEffort', value: 'high' },
  ],
}
const PAYLOAD = canonicalJson({ message: 'Report the Ask admission boundary.', title: 'Read-only qualification' })

const v2 = (over: Record<string, unknown> = {}): Record<string, unknown> => {
  const { message: _m, title: _t, ...rest } = v1
  return {
    ...rest,
    v: 2,
    payloadSha256: sha256Hex(PAYLOAD),
    manifestSha256: 'c'.repeat(64),
    baseCommit: '0123456789abcdef0123456789abcdef01234567',
    writeScope: 'read_only',
    settings: SETTINGS,
    ...over,
  }
}
const asV2 = (value: Record<string, unknown>): RunnerEnvelopeV2 => {
  const checked = checkEnvelope(value)
  assert.ok(checked.ok, checked.ok ? '' : checked.reason)
  const e = checked.ok ? envelopeV2(checked.envelope) : null
  assert.ok(e)
  return e
}
const refusal = (value: unknown) => {
  const c = checkEnvelope(value)
  return c.ok ? null : c.reason
}

describe('v1 is frozen (0096)', () => {
  it('keeps its exact keys, refusals and digest', () => {
    assert.deepEqual(checkEnvelope(v1), { ok: true, envelope: v1 })
    assert.equal(envelopeV2(v1), null)
    // The digest of this exact fixture computed with the host r6 base's runner-port.ts (09b09413), before 0096.
    assert.equal(digestOf(v1), 'b466929a2ff45a8b34decd1fa807938189464a2047adc3e8d60b6e3e3ee0ab5a')
    assert.match(refusal({ ...v1, payloadSha256: 'a'.repeat(64) }) ?? '', /unknown envelope field payloadSha256/)
    assert.match(refusal({ ...v1, v: 3 }) ?? '', /unsupported protocol version/)
    const { message: _m, ...noMessage } = v1
    assert.match(refusal(noMessage) ?? '', /missing envelope field message/)
  })
})

describe('v2 is content-free and exact (0096)', () => {
  it('accepts a create and an input with every fact, and nothing else', () => {
    assert.equal(asV2(v2()).baseCommit, '0123456789abcdef0123456789abcdef01234567')
    const input = asV2(
      v2({
        kind: 'input',
        operationId: '00000000-0000-4000-8000-000000000002',
        targetOperationId: v1.operationId,
        nativeThreadId: 'thread-1',
      }),
    )
    assert.equal(input.kind, 'input')
  })

  it('refuses text, a Stop, missing or malformed facts, and settings that are not exact', () => {
    const cases: [Record<string, unknown>, RegExp][] = [
      [v2({ message: 'inline text' }), /unknown envelope field message/],
      [v2({ title: 'inline title' }), /unknown envelope field title/],
      [v2({ kind: 'stop', targetOperationId: v1.operationId, nativeThreadId: 't' }), /only a create or an input/],
      [v2({ payloadSha256: 'x' }), /digests/],
      [v2({ manifestSha256: undefined }), /missing envelope field manifestSha256|digests/],
      [v2({ baseCommit: 'main' }), /baseCommit/],
      [v2({ baseCommit: '0123456' }), /baseCommit/],
      [v2({ writeScope: 'read_write' }), /writeScope/],
      [v2({ settings: { ...SETTINGS, extra: 1 } }), /settings are/],
      [v2({ settings: { ...SETTINGS, instanceId: '9codex' } }), /instanceId/],
      [v2({ settings: { ...SETTINGS, model: ' padded' } }), /model/],
      [v2({ settings: { ...SETTINGS, options: SETTINGS.options.toReversed() } }), /sorted/],
      [v2({ settings: { ...SETTINGS, options: [{ id: 'fast', value: '' }] } }), /value/],
      [v2({ targetOperationId: v1.operationId }), /targets no thread/],
      [v2({ kind: 'input', targetOperationId: v1.operationId, nativeThreadId: null }), /native thread/],
    ]
    for (const [value, reason] of cases) assert.match(refusal(value) ?? 'accepted', reason, JSON.stringify(value))
  })

  it('binds its digest to the content-free envelope only: the instruction is not in it', () => {
    const e = asV2(v2())
    assert.equal(canonicalJson(e).includes('Report the Ask'), false)
    assert.notEqual(digestOf(e), digestOf(v2({ baseCommit: 'f'.repeat(40) })))
    assert.notEqual(digestOf(e), digestOf(v2({ payloadSha256: sha256Hex('{"message":"x","title":"y"}') })))
  })
})

const payloadReason = (env: RunnerEnvelopeV2, p: unknown) => {
  const c = checkPayload(env, p)
  return c.ok ? 'accepted' : c.reason
}

describe('a v2 payload is exactly what its digest binds (0096)', () => {
  it('admits the canonical instruction of a create, and of an input without a title', () => {
    assert.deepEqual(checkPayload(asV2(v2()), PAYLOAD), {
      ok: true,
      payload: { message: 'Report the Ask admission boundary.', title: 'Read-only qualification' },
    })
    const body = canonicalJson({ message: 'And the outbox?', title: null })
    const input = asV2(
      v2({
        kind: 'input',
        targetOperationId: v1.operationId,
        nativeThreadId: 't',
        payloadSha256: sha256Hex(body),
      }),
    )
    assert.equal(checkPayload(input, body).ok, true)
  })

  it('refuses a missing, altered, re-spelled or wrongly shaped payload', () => {
    const e = asV2(v2())
    assert.match(payloadReason(e, undefined), /needs its payload/)
    assert.match(payloadReason(e, PAYLOAD.replace('Report', 'Delete')), /does not match its digest/)
    // The same value spelled otherwise is other bytes: refused even when its own digest is presented.
    const spaced = JSON.stringify(
      { message: 'Report the Ask admission boundary.', title: 'Read-only qualification' },
      null,
      1,
    )
    assert.match(payloadReason(asV2(v2({ payloadSha256: sha256Hex(spaced) })), spaced), /canonical JSON/)
    const extra = canonicalJson({ message: 'm', title: 't', tool: 'x' })
    assert.match(payloadReason(asV2(v2({ payloadSha256: sha256Hex(extra) })), extra), /exactly \{message, title\}/)
    const untitled = canonicalJson({ message: 'm', title: null })
    assert.match(payloadReason(asV2(v2({ payloadSha256: sha256Hex(untitled) })), untitled), /title/)
    const titledInput = canonicalJson({ message: 'm', title: 't' })
    const input = asV2(
      v2({
        kind: 'input',
        targetOperationId: v1.operationId,
        nativeThreadId: 't',
        payloadSha256: sha256Hex(titledInput),
      }),
    )
    assert.match(payloadReason(input, titledInput), /an input none/)
  })
})

describe("settings are a profile's declared policy, exactly (0096)", () => {
  it('allows exactly the declared instance, model, options and values', () => {
    assert.equal(settingsRefusal(POLICY, SETTINGS), null)
  })

  it('refuses no policy, another instance or model, an undeclared value, a type swap, a left-out option', () => {
    const cases: [RunnerSourcePolicy | undefined, unknown, RegExp][] = [
      [undefined, SETTINGS, /no source policy/],
      [POLICY, { ...SETTINGS, instanceId: 'claudeAgent' }, /provider instance/],
      [POLICY, { ...SETTINGS, model: 'other-model' }, /model/],
      [POLICY, { ...SETTINGS, options: [SETTINGS.options[0], { id: 'reasoningEffort', value: 'xhigh' }] }, /value/],
      [POLICY, { ...SETTINGS, options: [{ id: 'fast', value: 'true' }, SETTINGS.options[1]] }, /value/],
      [POLICY, { ...SETTINGS, options: [SETTINGS.options[1]] }, /declared options/],
      [POLICY, { ...SETTINGS, options: [{ id: 'effort', value: 'high' }, SETTINGS.options[0]] }, /declared options/],
    ]
    for (const [policy, settings, reason] of cases)
      assert.match(settingsRefusal(policy, settings) ?? 'allowed', reason, JSON.stringify(settings))
  })
})

// ---- repair 13 (NATIVE12-F02): the model and string option values are counted in code points ----

const rocket = '\u{1F680}'
/** A value of `points` code points: supplementary (2 UTF-16 units each), mixed, or ASCII. */
const text = (kind: 'supplementary' | 'mixed' | 'ascii', points: number) =>
  kind === 'supplementary'
    ? rocket.repeat(points)
    : kind === 'mixed'
      ? Array.from({ length: points }, (_, i) => (i % 2 === 0 ? 'é' : rocket)).join('')
      : 'm'.repeat(points)
const withModel = (model: string) => ({
  instanceId: 'codex',
  model,
  options: [{ id: 'reasoningEffort', value: 'high' }],
})
const withValue = (value: string) => ({
  instanceId: 'codex',
  model: 'synthetic-model',
  options: [{ id: 'reasoningEffort', value }],
})
const declaring = (model: string, value: string): RunnerSourcePolicy => ({
  v: 1,
  instanceId: 'codex',
  models: [{ model, options: [{ id: 'reasoningEffort', values: [value] }] }],
})
/** Code points, counted without spreading the string. */
const pointsOf = (v: string) => {
  let count = 0
  for (const _ of v) count += 1
  return count
}
const REFUSED = ['model is not a model name', 'an option value is a text or a boolean']
/** Every check that reads them agrees: all allow, or all refuse with their own reason. */
const agreed = (ok: boolean) => ({
  shape: ok ? [null, null] : REFUSED,
  envelope: ok ? [null, null] : REFUSED,
  policy: ok ? [null, null] : REFUSED,
})
/** The 25 characters JavaScript trim() removes. */
const TRIMS = [
  '\t',
  '\n',
  '\u000b',
  '\f',
  '\r',
  ' ',
  '\u00a0',
  '\u1680',
  '\u2000',
  '\u2001',
  '\u2002',
  '\u2003',
  '\u2004',
  '\u2005',
  '\u2006',
  '\u2007',
  '\u2008',
  '\u2009',
  '\u200a',
  '\u2028',
  '\u2029',
  '\u202f',
  '\u205f',
  '\u3000',
  '\ufeff',
]

describe('a model and a string option value are 1 to 200 code points, as the schema and SQL count (repair 13, NATIVE12-F02)', () => {
  it('accepts up to 200 and refuses 201, for supplementary, mixed and ASCII, at every check that reads them', () => {
    const seen: unknown[] = []
    for (const kind of ['supplementary', 'mixed', 'ascii'] as const)
      for (const points of [1, 100, 101, 199, 200, 201]) {
        const value = text(kind, points)
        assert.equal(pointsOf(value), points)
        const model = withModel(value)
        const option = withValue(value)
        seen.push({
          kind,
          points,
          units: value.length,
          shape: [settingsShapeRefusal(model), settingsShapeRefusal(option)],
          envelope: [refusal(v2({ settings: model })), refusal(v2({ settings: option }))],
          policy: [
            settingsRefusal(declaring(value, 'high'), model),
            settingsRefusal(declaring('synthetic-model', value), option),
          ],
        })
      }
    assert.deepEqual(
      seen,
      seen.map((s) => {
        const { kind, points, units } = s as { kind: string; points: number; units: number }
        return { kind, points, units, ...agreed(points <= 200) }
      }),
    )
  })

  it('keeps every other rule: no edge whitespace, non-empty, a string or a boolean, ASCII ids and instances', () => {
    const trims = TRIMS
    assert.equal(trims.length, 25)
    for (const c of trims) {
      assert.equal(`${c}m`.trim(), 'm', 'the established trim() set')
      for (const v of [`${c}m`, `m${c}`]) {
        assert.equal(settingsShapeRefusal(withModel(v)), 'model is not a model name', JSON.stringify(v))
        assert.equal(settingsShapeRefusal(withValue(v)), 'an option value is a text or a boolean', JSON.stringify(v))
      }
      // Inside a value, a trim() character is kept, as SQL keeps it.
      assert.equal(settingsShapeRefusal(withModel(`m${c}m`)), null, JSON.stringify(c))
    }
    // Characters trim() keeps are allowed at an edge.
    for (const c of ['\u0085', '​', '᠎']) assert.equal(settingsShapeRefusal(withModel(`${c}m`)), null)
    assert.equal(settingsShapeRefusal(withModel('')), 'model is not a model name')
    assert.equal(settingsShapeRefusal(withValue('')), 'an option value is a text or a boolean')
    assert.equal(settingsShapeRefusal({ ...withModel('m'), model: 7 }), 'model is not a model name')
    assert.equal(settingsShapeRefusal({ ...withValue('x'), options: [{ id: 'reasoningEffort', value: true }] }), null)
    assert.equal(
      settingsShapeRefusal({ ...withValue('x'), options: [{ id: 'reasoningEffort', value: 3 }] }),
      'an option value is a text or a boolean',
    )
    assert.equal(settingsShapeRefusal({ ...SETTINGS, instanceId: 'i'.repeat(64) }), null)
    assert.equal(
      settingsShapeRefusal({ ...SETTINGS, instanceId: 'i'.repeat(65) }),
      'instanceId is not a provider instance id',
    )
    assert.equal(
      settingsShapeRefusal({ ...SETTINGS, instanceId: `é${'i'.repeat(10)}` }),
      'instanceId is not a provider instance id',
    )
    assert.equal(settingsShapeRefusal({ ...withValue('x'), options: [{ id: `o${'p'.repeat(99)}`, value: 'x' }] }), null)
    assert.equal(
      settingsShapeRefusal({ ...withValue('x'), options: [{ id: `o${'p'.repeat(100)}`, value: 'x' }] }),
      'an option is {id, value}',
    )
    assert.equal(
      settingsShapeRefusal({ ...withValue('x'), options: [{ id: `é${'p'.repeat(5)}`, value: 'x' }] }),
      'an option is {id, value}',
    )
  })

  it('keeps policy membership exact at 200 code points: an undeclared value of that length is refused as undeclared', () => {
    assert.match(
      settingsRefusal(declaring('synthetic-model', text('mixed', 200)), withValue(text('supplementary', 200))) ?? '',
      /not declared/,
    )
  })
})
