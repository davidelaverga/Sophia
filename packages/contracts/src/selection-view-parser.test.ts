// The A56 selection preview parser (INC04-S01b): the generated standalone validator of SelectionView, read through the
// typed parser. Synthetic views only, shaped as the kernel's projectSelection returns them. A reader is tolerant: a
// property the contract does not list is dropped in place, so every case starts from a fresh copy.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ContractViolation, parseSelectionView } from './validate.ts'

const HEAD = { contract: 'inc04.selection.input.v1', policyVersion: 'inc04-s01-policy-v1' }
const SEED = {
  providerInstanceRef: 'research-sol-medium-v1',
  model: 'gpt-6.1-sol',
  options: [{ id: 'effort', value: 'medium' }],
}

const owner = () => ({
  candidateRef: 'api:44444444-4444-4444-8444-444444444444',
  relation: 'owner',
  limitation: 'eligible',
  codes: [],
  routeKind: 'api',
  payerScopeRef: 'acc-1',
  seed: SEED,
})

const shared = (): Record<string, unknown> => ({
  ...HEAD,
  disclosure: 'shared',
  requestRevision: 'v1.m1.a1.e1.r1.p0.s0',
  outcome: 'selected',
  globalCodes: [],
  nextSteps: [],
  mode: 'auto',
  strictSettings: null,
  candidates: [
    owner(),
    {
      candidateRef: 'native:66666666-6666-4666-8666-666666666666',
      relation: 'owner',
      limitation: 'not_permitted_for_this_work',
    },
  ],
  proposal: { ...owner(), accepted: 'unknown', observed: 'unknown' },
  alternatives: [],
  fallback: null,
})

describe('A56 SelectionView reader', () => {
  it('reads a shared view, a withheld proposal, no proposal, and the restricted view as sent', () => {
    assert.deepEqual(parseSelectionView(shared()), shared())
    const withheld = { ...shared(), proposal: { withheld: true } }
    assert.deepEqual(parseSelectionView(structuredClone(withheld)), withheld)
    const none = { ...shared(), outcome: 'waiting', proposal: null, globalCodes: ['no_candidates'], candidates: [] }
    assert.deepEqual(parseSelectionView(structuredClone(none)), none)
    const restricted = { ...HEAD, disclosure: 'restricted' }
    assert.deepEqual(parseSelectionView(structuredClone(restricted)), restricted)
  })

  it('drops what it does not list, inside the view and inside a candidate', () => {
    const v = { ...shared(), ownerAccount: 'acc-other', candidates: [{ ...owner(), totalCapUsd: 5 }] }
    const read = parseSelectionView(v)
    assert.equal('ownerAccount' in read, false)
    assert.ok(read.disclosure === 'shared')
    assert.equal(JSON.stringify(read).includes('totalCapUsd'), false)
  })

  it('refuses a restricted view that carries any detail, and a shared view missing a field', () => {
    assert.throws(
      () => parseSelectionView({ ...HEAD, disclosure: 'restricted', outcome: 'selected' }),
      ContractViolation,
    )
    const missing = shared()
    delete missing.candidates
    assert.throws(() => parseSelectionView(missing), ContractViolation)
  })

  it('refuses unknown enums, a withheld proposal with candidate detail, and another contract', () => {
    assert.throws(() => parseSelectionView({ ...shared(), outcome: 'maybe' }), ContractViolation)
    assert.throws(() => parseSelectionView({ ...shared(), mode: 'guess' }), ContractViolation)
    assert.throws(
      () => parseSelectionView({ ...shared(), candidates: [{ ...owner(), limitation: 'probably' }] }),
      ContractViolation,
    )
    assert.throws(
      () => parseSelectionView({ ...shared(), proposal: { withheld: true, candidateRef: 'api:x' } }),
      ContractViolation,
    )
    assert.throws(() => parseSelectionView({ ...shared(), contract: 'inc04.selection.input.v2' }), ContractViolation)
    assert.throws(() => parseSelectionView({ ...shared(), proposal: { ...owner() } }), ContractViolation)
  })
})
