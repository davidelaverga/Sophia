// A conversation row's order (CON-01-CC-0023, Codex's review of it; PR #199 r4235629903, r4235862543, CX-0027): the
// highest place any of its messages has taken (`messageSeq`, withdrawn ones included) and its last message's own place
// (`lastMessage.seq`), both optional. Rollout, pinned here: a new reader reads an older API (neither said); an older
// reader rejects a newer API's row or opening (`additionalProperties: false`), so the Studio ships with or before the
// API, and a Studio rollback takes the API back with it.
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

const summary = (row: Record<string, unknown> = {}, lastMessage: Record<string, unknown> | null = opening) => ({
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
  ...row,
})

const list = (row: Record<string, unknown> = {}, lastMessage: Record<string, unknown> | null = opening) => ({
  projectId: '6f1f3a52-4b8e-4c62-9d7e-0a1b2c3d4e5f',
  conversations: [summary(row, lastMessage)],
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
 * `ConversationOpening` and the closedness of `ConversationSummary` as readers before these fields validate them:
 * `packages/contracts/openapi/openapi.json` at `1f49c4fd38bfdff54a4b3097b3e731ff3d0ef7ec` (descriptions left out; the
 * summary's other properties stand in as `true`, its closedness kept).
 */
const OPENING_BEFORE = {
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
const SUMMARY_KEYS_BEFORE = [
  'id',
  'title',
  'revision',
  'summary',
  'summaryCoverage',
  'lastAt',
  'contributors',
  'sophia',
  'openQuestions',
  'questionsCoverage',
  'output',
  'lastMessage',
]
const SUMMARY_BEFORE = {
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(SUMMARY_KEYS_BEFORE.map((k) => [k, true])),
  required: SUMMARY_KEYS_BEFORE,
}

describe('a conversation row’s order: messageSeq and lastMessage.seq (CON-01-CC-0023)', () => {
  it('a new reader reads a new API’s row: both said', () => {
    const read = parseConversationList(list({ messageSeq: 2 }, { ...opening, seq: 1 }))
    assert.equal(read.conversations[0]?.messageSeq, 2)
    assert.equal(read.conversations[0]?.lastMessage?.seq, 1)
  })

  it('either one alone, or a row with no last message (messageSeq said), reads too', () => {
    assert.equal(parseConversationList(list({ messageSeq: 2 })).conversations[0]?.lastMessage?.seq, undefined)
    assert.equal(parseConversationList(list({}, { ...opening, seq: 1 })).conversations[0]?.messageSeq, undefined)
    assert.equal(parseConversationList(list({ messageSeq: 0 }, null)).conversations[0]?.messageSeq, 0)
  })

  it('a new reader reads an older API’s row: neither said', () => {
    const read = parseConversationList(list())
    assert.equal(read.conversations[0]?.messageSeq, undefined)
    assert.equal(read.conversations[0]?.lastMessage?.seq, undefined)
  })

  it('places are whole numbers, never negative, never past 2^53 − 1; a message’s own place is 1 or more', () => {
    for (const bad of [-1, 1.5, 2 ** 53]) assert.throws(() => parseConversationList(list({ messageSeq: bad })))
    for (const bad of [0, -1, 2.5, 2 ** 53]) {
      assert.throws(() => parseConversationList(list({}, { ...opening, seq: bad })))
    }
  })

  it('an older reader rejects a new API’s opening and row (so the Studio ships with or before the API)', () => {
    const ajv = new Ajv({ strict: false })
    addFormats.default(ajv)
    const opening0 = ajv.compile(OPENING_BEFORE)
    const summary0 = ajv.compile(SUMMARY_BEFORE)
    assert.equal(opening0(opening), true)
    assert.equal(opening0({ ...opening, seq: 1 }), false)
    assert.equal(summary0(summary()), true)
    assert.equal(summary0(summary({ messageSeq: 2 })), false)
  })
})
