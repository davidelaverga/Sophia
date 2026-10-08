import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '../../api/client.ts'
import type { MissionDecision } from '@sophia/contracts'
import { alreadyOpen, decidableHere, refusalWords, statementFrom } from './decide.ts'

describe('a message proposed as a decision (C7)', () => {
  it('a member’s words, on one line, as written', () => {
    assert.equal(
      statementFrom('One page,\nwith the sources inline, then.', false),
      'One page, with the sources inline, then.',
    )
  })

  it('Sophia’s words without the marks they are drawn with', () => {
    assert.equal(
      statementFrom('Where it stands:\n- Marco: One page.\n- Lucía: Sources inline.', true),
      'Where it stands: Marco: One page. · Lucía: Sources inline.',
    )
  })

  it('a long message is cut after a sentence within 200 characters', () => {
    const long = 'The brief keeps to one page so a new admin reads it in a minute. '.repeat(4)
    const cut = statementFrom(long, false)
    assert.ok(cut.length <= 200, String(cut.length))
    assert.ok(cut.endsWith('minute.'), cut)
  })

  it('one long sentence is cut at a word, and says so', () => {
    const cut = statementFrom(`Keep ${'everything '.repeat(40)}short`, false)
    assert.ok(cut.length <= 201, String(cut.length))
    assert.ok(cut.endsWith('everything…'), cut)
  })
})

const d = (kind: string, stale: boolean) => ({ kind, stale }) as unknown as MissionDecision

describe('a refused decision', () => {
  it('a stale revision says someone decided first; a refused role says so; anything else says try again', () => {
    assert.equal(
      refusalWords(new ApiError(409, 'stale_revision', 'stale', 'never'), 'decide'),
      'Someone decided it first. This is the brief as it is now.',
    )
    assert.equal(
      refusalWords(new ApiError(409, 'idempotency_mismatch', 'x', 'never'), 'propose'),
      'That proposal couldn’t be sent as written. Try again.',
    )
    assert.equal(refusalWords(new ApiError(403, 'forbidden', 'x', 'never'), 'decide'), 'You can’t decide this here.')
    assert.equal(
      refusalWords(new ApiError(503, 'unavailable', 'down', 'safe_read'), 'propose'),
      'That couldn’t be done. Try again in a moment.',
    )
  })

  it('a constraint or a lesson is decided here; a new direction or a stale one is not', () => {
    assert.equal(decidableHere(d('constraint', false)), true)
    assert.equal(decidableHere(d('lesson', false)), true)
    assert.equal(decidableHere(d('mission', false)), false)
    assert.equal(decidableHere(d('constraint', true)), false)
  })
})

describe('a proposal already waiting (reconciled before a fresh one goes)', () => {
  const waiting = [
    { kind: 'constraint' as const, statement: 'Map first, list second' },
    { kind: 'constraint' as const, statement: 'Briefs stay on one page' },
    { kind: 'mission' as const, statement: 'Reports for every team' },
  ]

  it('is found by its words, whatever the spaces or the case', () => {
    assert.equal(alreadyOpen(waiting, '  briefs stay on ONE page '), true)
  })

  it('other words are a new proposal', () => {
    assert.equal(alreadyOpen(waiting, 'Briefs stay on two pages'), false)
    assert.equal(alreadyOpen([], 'Map first, list second'), false)
  })

  it('the same words waiting as another kind (a new direction) are not this constraint', () => {
    assert.equal(alreadyOpen(waiting, 'Reports for every team'), false)
  })
})

describe('a proposal not sent because the brief could not be read first', () => {
  it('says nothing was sent, and to try again', () => {
    const unread = new ApiError(503, 'brief_unread', 'The brief could not be read', 'never')
    assert.equal(refusalWords(unread, 'propose'), 'Couldn’t check the brief first, so nothing was sent. Try again.')
  })
})
