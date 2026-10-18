import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import { needsOrder, needsRefusedKey, needsRefusedNow, readSince } from './useNeeds.ts'

// R-NEEDS-OWN-READ-01: the account's Needs refusal, in this page's read order, in the account's query cache. What the
// browser cases (e2e/home-needs-refusal.spec.ts) cannot stage on one query: an older read answering after a refusal, a
// remount reading the same cache, and another account's own scope.
const refusedAt = (client: QueryClient, account: string) => client.getQueryData<number>(needsRefusedKey(account)) ?? 0

describe('the account Needs refusal, in read order', () => {
  it('a 503 with no refusal before it keeps the rows read', () => {
    const client = new QueryClient()
    const read = { readFrom: needsOrder() }
    assert.equal(readSince(read, refusedAt(client, 'a')), read)
  })

  it('an older read answering after the refusal shows nothing, nor after a 503; a read since restores', () => {
    const client = new QueryClient()
    const older = { readFrom: needsOrder() } // set out before the refusal, answered after it (a late 200)
    needsRefusedNow(client, 'a')
    assert.equal(readSince(older, refusedAt(client, 'a')), undefined)
    // A 503 after the refusal changes nothing: the refusal stays, the older rows stay hidden.
    assert.equal(readSince(older, refusedAt(client, 'a')), undefined)
    const since = { readFrom: needsOrder() }
    assert.equal(readSince(since, refusedAt(client, 'a')), since)
  })

  it('a remount reads the same refusal from the account cache; another account has its own', () => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
    const before = { readFrom: needsOrder() }
    needsRefusedNow(client, 'a')
    const at = refusedAt(client, 'a')
    // The view goes and comes back: what it reads is the same cache entry, so the older rows stay hidden.
    assert.equal(refusedAt(client, 'a'), at)
    assert.equal(readSince(before, refusedAt(client, 'a')), undefined)
    // Another account's refusal is its own: account b, never refused, shows its rows.
    assert.equal(refusedAt(client, 'b'), 0)
    assert.equal(readSince(before, refusedAt(client, 'b')), before)
  })

  it('a later refusal moves the mark on, never back', () => {
    const client = new QueryClient()
    needsRefusedNow(client, 'a')
    const first = refusedAt(client, 'a')
    needsRefusedNow(client, 'a')
    assert.ok(refusedAt(client, 'a') > first)
  })
})
