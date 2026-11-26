import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { landedNow, pendingOf, type Held } from './pending-message.ts'

const args = { text: 'See you at 6' }
const held = (over: Partial<Held> = {}): Held => ({
  ids: new Set(),
  landed: null,
  saidSince: () => false,
  ...over,
})
const done = { status: 'done' as const, args, result: { contributionId: 'c1' } }
const saidSince = (text: string) => text === 'See you at 6'

describe('a message drawn before the server answers (chat-pace.md)', () => {
  it('is drawn at once, dimmed while it goes', () => {
    assert.deepEqual(pendingOf({ status: 'sending', args }, held()), {
      text: 'See you at 6',
      status: 'sending',
      id: null,
    })
  })

  it('stays, offered again, where its reply was lost', () => {
    assert.equal(pendingOf({ status: 'unknown', args }, held())?.status, 'unknown')
  })

  it('gives way while it goes when the feed brings it before the reply: never drawn twice', () => {
    assert.equal(pendingOf({ status: 'sending', args }, held({ saidSince })), null)
  })

  it('keeps its row where its reply was lost, in the discussion or not: Try again replays, never doubles', () => {
    assert.equal(pendingOf({ status: 'unknown', args }, held({ saidSince }))?.status, 'unknown')
  })

  it('stays until the discussion holds it, then is drawn there alone', () => {
    assert.deepEqual(pendingOf(done, held()), { text: 'See you at 6', status: 'sent', id: 'c1' })
    assert.equal(pendingOf(done, held({ ids: new Set(['c1']) })), null)
  })

  it('never comes back once landed: withdrawn, or out of the newest 50, it is gone from the discussion too', () => {
    const landed = landedNow(done, held({ ids: new Set(['c1']) }))
    assert.equal(landed, 'c1')
    assert.equal(pendingOf(done, held({ landed })), null)
    assert.equal(landedNow({ status: 'idle' }, held({ landed: 'c1' })), 'c1')
  })

  it('draws nothing for a refused message here: its words went back to the bar, or onto a row of their own', () => {
    assert.equal(pendingOf({ status: 'rejected', args }, held()), null)
    assert.equal(pendingOf({ status: 'idle' }, held()), null)
  })
})
