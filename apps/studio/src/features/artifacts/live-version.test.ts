import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { compareSections, parseMarkdown } from './markdown.ts'
import { headingAt, marksOf, offerWords, placedHeadings } from './live-version.ts'

const facts = (revised: string[], added: string[] = [], removed: string[] = []) => ({
  cited: 1,
  added: [],
  dropped: [],
  notesFromFacts: false,
  sections: { added, revised, removed, unchanged: [], conclusionChanged: false },
})

/** A report's Markdown, one line per item. */
const md = (...lines: string[]) => `${lines.join('\n\n')}\n`

describe('what the offer says', () => {
  it('counts the sections changed when the new version replaced the one on screen', () => {
    const v2 = { versionNumber: 2, parentId: 'v1', changeFacts: facts(['A', 'B']) }
    assert.equal(offerWords(v2, 'v1'), 'v2 is here · 2 sections changed.')
    assert.equal(offerWords({ ...v2, changeFacts: facts([], ['C']) }, 'v1'), 'v2 is here · 1 section changed.')
    assert.equal(offerWords({ ...v2, changeFacts: facts([]) }, 'v1'), 'v2 is here · the same sections.')
  })

  it('counts a section removed on its own: it has no heading left to mark', () => {
    const v2 = { versionNumber: 2, parentId: 'v1' }
    assert.equal(
      offerWords({ ...v2, changeFacts: facts(['A'], [], ['B']) }, 'v1'),
      'v2 is here · 1 section changed, 1 removed.',
    )
    assert.equal(
      offerWords({ ...v2, changeFacts: facts([], [], ['B', 'C']) }, 'v1'),
      'v2 is here · 2 sections removed.',
    )
  })

  it('says only which version is current when it replaced another, or its facts say nothing of sections', () => {
    const v3 = { versionNumber: 3, parentId: 'v2', changeFacts: facts(['A']) }
    assert.equal(offerWords(v3, 'v1'), 'v3 is the current version.')
    assert.equal(offerWords({ versionNumber: 2, parentId: 'v1' }, 'v1'), 'v2 is the current version.')
    assert.equal(offerWords({ parentId: 'v1' }, 'v1'), 'This is not the current version.')
  })
})

describe('which headings are marked', () => {
  it('a section added is New, one revised Changed, by its heading’s anchor; the introduction has none', () => {
    const now = parseMarkdown(md('# Fixture report', 'x', '## Next steps', 'y'))
    const marks = marksOf({ added: ['Next steps'], revised: ['Fixture report', '(introduction)'] }, now)
    assert.deepEqual(
      [...marks],
      [
        ['fixture-report', 'Changed'],
        ['next-steps', 'New'],
      ],
    )
  })

  it('compares the text that was on screen, not the facts stored against the version before', () => {
    // v1 on screen, v3 current: v3's own facts are against v2; the marks are against what was read.
    const v1 = md('# R', 'A.', '## Conclusion', 'It holds.', '## Steps', 'One.')
    const v3 = md('# R', 'A.', '## Conclusion', 'It holds, mostly.', '## Steps', 'One.', '## Risks', 'Some.')
    const marks = marksOf(compareSections(v1, v3), parseMarkdown(v3))
    assert.deepEqual(
      [...marks],
      [
        ['conclusion', 'Changed'],
        ['risks', 'New'],
      ],
    )
  })

  it('marks no heading whose name the report repeats, nor one with no letter or digit', () => {
    const now = parseMarkdown(md('# R', '## A', '### Evidence', 'x', '## B', '### Evidence', 'y', '## ???', 'z'))
    assert.deepEqual([...marksOf({ added: ['???'], revised: ['Evidence', 'B'] }, now)], [['b', 'Changed']])
  })
})

describe('the heading kept in its place', () => {
  it('is the last at or above the top of the reading area, else the first below it', () => {
    const at = [
      { anchor: 'a', top: -300 },
      { anchor: 'b', top: -20 },
      { anchor: 'c', top: 140 },
    ]
    assert.equal(headingAt(at)?.anchor, 'b')
    assert.equal(headingAt(at.slice(2))?.anchor, 'c')
    assert.equal(headingAt([]), null)
  })

  it('keys a repeated heading by its occurrence, so the second finds the second', () => {
    const placed = placedHeadings([
      { anchor: 'evidence', top: -200 },
      { anchor: 'b', top: -90 },
      { anchor: 'evidence', top: -10 },
    ])
    assert.deepEqual(
      placed.map((h) => h.anchor),
      ['evidence#0', 'b#0', 'evidence#1'],
    )
    assert.equal(headingAt(placed)?.anchor, 'evidence#1')
  })
})
