import assert from 'node:assert/strict'
import { it } from 'node:test'
import { managedExploreAccountFromEnv, withManagedExploreAccount } from './managed-explore-account.ts'

const projectId = '189e16ed-29f3-4ce0-af54-00ad20b4d91b'
const founderId = 'ffaa1e8e-d2f8-4e5b-92b2-78e25e786203'
const routeId = 'founder.explore-fixture'
const observedAt = '2026-11-22T16:53:12.019123Z'
const input = {
  projectId,
  founderId,
  routeId,
  balanceCents: 0,
  currency: 'USD',
  autoRechargeEnabled: false,
  observedAt,
}

it('preserves signed safe cents, exact zero and explicit unknown account facts', () => {
  for (const observation of [
    { balanceCents: 0, autoRechargeEnabled: false },
    { balanceCents: -7, autoRechargeEnabled: true },
    { balanceCents: Number.MAX_SAFE_INTEGER, autoRechargeEnabled: false },
    { balanceCents: null, autoRechargeEnabled: null },
  ]) {
    assert.deepEqual(managedExploreAccountFromEnv(JSON.stringify({ ...input, ...observation })), {
      projectId,
      founderId,
      routeId,
      observation: { ...observation, currency: 'USD', observedAt },
    })
  }
})

it('omits disabled, malformed or unsafe observation configuration', () => {
  for (const value of [undefined, '', 'off', '{', 'null', '[]']) {
    assert.equal(managedExploreAccountFromEnv(value), undefined)
  }
  for (const invalid of [
    { apiKey: 'arbitrary-extra-field' },
    { projectId: projectId.toUpperCase() },
    { founderId: '' },
    { routeId: 'other / route' },
    { routeId: `${routeId}\n` },
    { observedAt: `${observedAt}\n` },
    { balanceCents: undefined },
    { balanceCents: '0' },
    { balanceCents: 1.25 },
    { balanceCents: Number.MAX_SAFE_INTEGER + 1 },
    { balanceCents: Number.MIN_SAFE_INTEGER - 1 },
    { autoRechargeEnabled: 'false' },
    { currency: 'EUR' },
    { observedAt: '2026-02-30T16:53:12Z' },
    { observedAt: '2026-11-22T24:00:00Z' },
    { observedAt: '2026-11-22' },
    { observedAt: '2026-11-22T16:53:12' },
  ]) {
    assert.equal(managedExploreAccountFromEnv(JSON.stringify({ ...input, ...invalid })), undefined)
  }
})

it('projects only account facts and requires an exact project, founder and funding route match', () => {
  const config = managedExploreAccountFromEnv(JSON.stringify(input))
  assert.ok(config)
  const view = { funding: { routeId, label: 'OpenAI API credits' as const } }
  assert.deepEqual(withManagedExploreAccount(view, projectId, founderId, config), {
    funding: {
      routeId,
      label: 'OpenAI API credits',
      accountSnapshot: { balanceCents: 0, autoRechargeEnabled: false, currency: 'USD', observedAt },
    },
  })
  assert.equal(withManagedExploreAccount(view, founderId, founderId, config), view)
  assert.equal(withManagedExploreAccount(view, projectId, projectId, config), view)
  assert.equal(withManagedExploreAccount(view, projectId, founderId, { ...config, routeId: 'different' }), view)
  assert.equal(withManagedExploreAccount(view, projectId, founderId, undefined), view)
})
