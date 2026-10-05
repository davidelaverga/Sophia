import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MissionWithdrawalPreview } from '@sophia/contracts'
import { askDraft, keptLine, keptText, MESSAGE_MAX, PASSAGE_MAX, passageText, undoable } from './passage.ts'

const preview = (over: Partial<MissionWithdrawalPreview> = {}): MissionWithdrawalPreview => ({
  entryId: 'n',
  ledgerRevision: 1,
  previewToken: 't',
  expiresAt: '2099-01-01T00:00:00.000Z',
  entries: [{ id: 'n', state: 'current', text: 'x' }],
  decisions: [],
  ...over,
})

describe('the passage', () => {
  it('is the selection with its spacing made one line, and nothing without a letter or a digit', () => {
    assert.equal(passageText('  The fixture\n\n  holds.  '), 'The fixture holds.')
    assert.equal(passageText(' \n '), null)
    assert.equal(passageText('— …'), null)
  })

  it('is cut at a word past its limit, with an ellipsis', () => {
    const long = `${'word '.repeat(400)}end`
    const cut = passageText(long) ?? ''
    assert.ok(cut.length <= PASSAGE_MAX + 1)
    assert.ok(cut.endsWith('word…'))
    assert.equal(passageText('a'.repeat(PASSAGE_MAX)), 'a'.repeat(PASSAGE_MAX))
  })
})

describe('what is written with it', () => {
  const source = { title: 'Fixture report', version: 2 }

  it('asks with the quote and its source first, then whatever was already written', () => {
    assert.equal(askDraft('It holds.', source, ''), '“It holds.” (Fixture report, v2)\n')
    assert.equal(askDraft('It holds.', source, 'Why?'), '“It holds.” (Fixture report, v2)\nWhy?')
  })

  it('stays inside the chat’s limit: the quote is cut shorter, and a full message is left as it is', () => {
    const long = 'word '.repeat(160).trim()
    const asked = askDraft(long, source, 'x'.repeat(1500))
    assert.ok(asked.length <= MESSAGE_MAX)
    assert.ok(asked.startsWith('“word'))
    assert.ok(asked.endsWith('x'.repeat(1500)))
    const full = 'x'.repeat(1990)
    assert.equal(askDraft('It holds.', source, full), full)
  })

  it('keeps the quote with where it came from', () => {
    assert.equal(keptText('It holds.', source), '“It holds.” — Fixture report, v2')
  })
})

describe('when Undo may forget the kept note', () => {
  it('only when nothing but the note itself would go', () => {
    assert.equal(undoable(preview()), true)
    const decision = {
      id: 'd',
      kind: 'constraint' as const,
      state: 'proposed' as const,
      revision: 1,
      statement: 's',
      purpose: null,
      destination: null,
      origin: null,
    }
    assert.equal(undoable(preview({ decisions: [decision] })), false)
    assert.equal(
      undoable(
        preview({
          entries: [
            { id: 'n', state: 'current', text: 'x' },
            { id: 'm', state: 'superseded', text: 'y' },
          ],
        }),
      ),
      false,
    )
  })
})

describe('what the kept line says', () => {
  it('follows the note’s write, and offers Undo once it is kept', () => {
    assert.equal(keptLine('sending', 'none', 'idle').words, 'Keeping it…')
    assert.equal(keptLine('sending', 'none', 'idle').busy, true)
    const kept = keptLine('done', 'none', 'idle')
    assert.deepEqual([kept.words, kept.action, kept.settled, kept.busy], ['Kept in the brief.', 'undo', true, false])
  })

  it('after no reply, offers only the same write again, and no other Keep meanwhile', () => {
    const lost = keptLine('unknown', 'none', 'idle')
    assert.deepEqual([lost.action, lost.busy, lost.settled], ['retry', true, false])
    const undoLost = keptLine('done', 'none', 'unknown')
    assert.deepEqual([undoLost.action, undoLost.busy, undoLost.settled], ['retry-undo', true, false])
  })

  it('says Undo’s moment over the write’s, and stays on a failure until the next Keep', () => {
    assert.equal(keptLine('done', 'checking', 'idle').words, 'Taking it out…')
    assert.equal(keptLine('done', 'none', 'done').words, 'Taken out of the brief.')
    assert.equal(keptLine('done', 'built', 'idle').settled, true)
    for (const failed of [keptLine('rejected', 'none', 'idle'), keptLine('done', 'unreadable', 'idle')]) {
      assert.deepEqual([failed.error, failed.settled], [true, false])
    }
  })
})
