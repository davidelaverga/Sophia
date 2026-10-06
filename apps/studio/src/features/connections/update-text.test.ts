import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MeetingRecap } from '../../api/vision.ts'
import { updateLines, updateText } from './update-text.ts'

const recap = {
  meetingId: 'm1',
  startedAt: '2026-10-04T15:00:00.000Z',
  endedAt: '2026-10-04T15:38:00.000Z',
  decided: [
    {
      decisionId: 'd1',
      statement: 'Keep the room checks on fixtures',
      proposedBy: 'a',
      decidedBy: 'b',
      at: '',
      undoable: false,
    },
  ],
  made: [{ artifactId: 'r', artifactVersionId: 'v2', title: 'Fixture report', versionNumber: 2, askedBy: 'a' }],
  open: [{ proposalId: 'p1', statement: 'Record a short demo of the room' }],
} satisfies Pick<MeetingRecap, 'meetingId' | 'startedAt' | 'endedAt' | 'decided' | 'made' | 'open'>

describe('updateLines', () => {
  it('lists what was decided and made, chosen; what is still open, not chosen', () => {
    assert.deepEqual(
      updateLines(recap).map((l) => [l.key, l.text, l.chosen]),
      [
        ['d1', 'Decided: Keep the room checks on fixtures', true],
        ['v2', 'Made: Fixture report · v2', true],
        ['p1', 'Still open: Record a short demo of the room', false],
      ],
    )
  })
})

/** A day as the test reads it: the date's month and day. */
const day = (iso: string) => iso.slice(5, 10)

describe('updateText', () => {
  it('is the head, the chosen lines in order, and the link; no one’s name', () => {
    const lines = updateLines(recap)
    const text = updateText({
      title: 'Fixture project',
      recap,
      lines,
      chosen: new Set(['p1', 'd1']),
      link: 'https://x/p/1',
      day,
    })
    assert.equal(
      text,
      [
        'Fixture project · Project update · 10-04',
        '',
        '• Decided: Keep the room checks on fixtures',
        '• Still open: Record a short demo of the room',
        '',
        'Open in Sophia: https://x/p/1',
      ].join('\n'),
    )
    assert.doesNotMatch(text, /\b(a|b)\b proposed|decided by/)
  })

  it('with nothing chosen, says so in place of the lines', () => {
    const text = updateText({ title: 'P', recap, lines: updateLines(recap), chosen: new Set(), link: 'L', day })
    assert.match(text, /Nothing chosen yet\./)
  })
})
