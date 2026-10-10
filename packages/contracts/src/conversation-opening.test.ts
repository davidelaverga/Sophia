// A conversation row's last message carries its place in the conversation (`seq`, optional; PR #199 r4235629903,
// CON-01-CC-0021): a newer reader orders equal-time rows by it. Rollout, pinned here: a new reader reads an older API
// (no `seq`); an older reader rejects a newer API's opening (`additionalProperties: false`), so the Studio ships with or
// before the API, and a Studio rollback takes the API back with it.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Ajv } from 'ajv'
import addFormats from 'ajv-formats'
import { parseConversationList } from './validate.ts'

/** A projection not made: as the API says it for every conversation before G2 (A16 `ProjectionCoverage`). */
const NOT_ASSESSED = {
  state: 'not_assessed',
  complete: false,
  fromSeq: null,
  throughSeq: null,
  newer: 0,
  generatedAt: null,
  replyId: null,
  eligibilityRevision: null,
  ledgerRevision: null,
}

const opening = {
  author: 'member',
  actorId: '0c5e9b1a-2d3f-4a6b-8c7d-9e0f1a2b3c4d',
  name: 'Lucía',
  text: 'One page, the sources inline.',
  at: '2026-10-10T01:00:00.000Z',
}

const list = (lastMessage: Record<string, unknown>) => ({
  projectId: '6f1f3a52-4b8e-4c62-9d7e-0a1b2c3d4e5f',
  conversations: [
    {
      id: '00000000-0000-4000-8000-0000000000c1',
      title: 'Short or long briefs?',
      revision: 3,
      summary: null,
      summaryCoverage: NOT_ASSESSED,
      lastAt: '2026-10-10T01:00:00.000Z',
      contributors: [{ actorId: '0c5e9b1a-2d3f-4a6b-8c7d-9e0f1a2b3c4d', name: 'Lucía' }],
      sophia: false,
      openQuestions: 0,
      questionsCoverage: NOT_ASSESSED,
      output: null,
      lastMessage,
    },
  ],
  more: false,
  policy: {
    id: 'conversation-text-v1',
    notice: 'Messages here are saved for this project and can be read by its members.',
    retention: 'until_withdrawn_or_erased',
    audience: 'project_members',
  },
  capability: { state: 'enabled', write: true, moderate: false, ask: 'available', askReason: null },
})

/**
 * `ConversationOpening` as readers before `seq` validate it: `packages/contracts/openapi/openapi.json` at
 * `1f49c4fd38bfdff54a4b3097b3e731ff3d0ef7ec`, kept here as it was (descriptions left out).
 */
const OPENING_BEFORE_SEQ = {
  type: 'object',
  additionalProperties: false,
  properties: {
    author: { type: 'string', enum: ['member', 'sophia'] },
    actorId: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
    name: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    text: { type: 'string', maxLength: 140 },
    at: { type: 'string', format: 'date-time' },
  },
  required: ['author', 'actorId', 'name', 'text', 'at'],
}

describe('ConversationOpening.seq: a row’s last message, placed (CON-01-CC-0021)', () => {
  it('a new reader reads a new API’s opening with its place', () => {
    const read = parseConversationList(list({ ...opening, seq: 10 }))
    assert.equal(read.conversations[0]?.lastMessage?.seq, 10)
  })

  it('a new reader reads an older API’s opening, with no place', () => {
    const read = parseConversationList(list(opening))
    assert.equal(read.conversations[0]?.lastMessage?.seq, undefined)
  })

  it('a place is a whole number from 1', () => {
    assert.throws(() => parseConversationList(list({ ...opening, seq: 0 })))
    assert.throws(() => parseConversationList(list({ ...opening, seq: 1.5 })))
  })

  it('an older reader rejects a new API’s opening (so the Studio ships with or before the API)', () => {
    const ajv = new Ajv({ strict: false })
    addFormats.default(ajv)
    const older = ajv.compile(OPENING_BEFORE_SEQ)
    assert.equal(older(opening), true)
    assert.equal(older({ ...opening, seq: 10 }), false)
  })
})
