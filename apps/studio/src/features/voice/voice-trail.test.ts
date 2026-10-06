import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CaptionTurn } from '../conversation/captions.ts'
import { parseMarkdown } from '../artifacts/markdown.ts'
import {
  latestSpoken,
  RUN_MIN,
  saidKeys,
  sectionAmong,
  sectionIndex,
  spokenBlock,
  spokenRun,
  wordsOf,
} from './voice-trail.ts'

const turn = (
  id: string,
  speaker: CaptionTurn['speaker'],
  first: string,
  ...rest: (string | number)[]
): CaptionTurn => ({
  id,
  exchangeId: 'x',
  speaker,
  actorId: speaker === 'sophia' ? null : 'marco',
  parts: [first, ...rest.filter((p) => typeof p === 'string')].map((text, i) => ({ sequence: i + 1, text })),
  state: 'partial',
  end: null,
  at: rest.find((p) => typeof p === 'number') ?? 1,
})

describe('what Sophia is saying', () => {
  it('is her latest turn’s words, in their order, while hers is the latest turn', () => {
    const turns = [
      turn('a', 'sophia', 'First.', 1),
      turn('b', 'member', 'Mine.', 2),
      turn('c', 'sophia', 'The fixture', ' holds.', 3),
    ]
    assert.equal(latestSpoken(turns), 'The fixture holds.')
  })

  it('is nothing once a member speaks after her, or before she has', () => {
    assert.equal(latestSpoken([turn('a', 'sophia', 'First.', 1), turn('b', 'member', 'Mine.', 2)]), null)
    assert.equal(latestSpoken([turn('b', 'member', 'Mine.', 1)]), null)
  })
})

describe('where her words run in a block', () => {
  it('finds her words in a row, whatever their case, accents or punctuation', () => {
    const block = 'The fixture holds, and the pilot ran with fourteen teams.'
    const run = spokenRun(block, saidKeys('So: the PILOT ran with fourteen teams'))
    assert.ok(run)
    assert.equal(block.slice(run.start, run.end), 'the pilot ran with fourteen teams')
    assert.equal(run.words, 6)
    assert.equal(spokenRun('Él llegó más tarde de lo esperado.', saidKeys('el llego mas tarde'))?.words, 4)
  })

  it('needs at least a few words in a row: a word or two could be any sentence’s', () => {
    assert.equal(RUN_MIN, 4)
    assert.equal(spokenRun('The fixture holds.', saidKeys('the fixture')), null)
    assert.equal(spokenRun('The fixture holds.', saidKeys('holds the fixture well')), null)
  })

  it('matches her latest words, not where she began', () => {
    const opening = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen'
    assert.equal(spokenRun('one two three four', saidKeys(`${opening} fifteen`)), null)
  })
})

describe('which block her words are in', () => {
  it('is the one they run longest in; none when they run in none', () => {
    const blocks = ['The first version of a labelled fixture report.', 'The fixture holds, as the pilot showed.']
    assert.equal(spokenBlock(blocks, 'and as the pilot showed us')?.index, 1)
    assert.equal(spokenBlock(blocks, 'nothing of the kind'), null)
    // An earlier block with fewer of her words in a row gives way to a later one with more.
    const both = ['The pilot ran with fourteen teams.', 'So the pilot ran with fourteen teams, and two left.']
    assert.equal(spokenBlock(both, 'the pilot ran with fourteen teams and two left')?.index, 1)
    assert.equal(spokenBlock(blocks, null), null)
  })

  it('keeps each word’s place, for the light on the page', () => {
    assert.deepEqual(
      wordsOf('It’s here.').map((w) => [w.key, w.start, w.end]),
      [
        ["it's", 0, 4],
        ['here', 5, 9],
      ],
    )
  })
})

describe('the section index', () => {
  it('names the report’s title and its sections, never the headings under them', () => {
    const md = ['# Fixture *report*', 'x', '## Conclusion', 'y', '### A detail', 'z', '## Next `steps`', 'w']
    const report = parseMarkdown(`${md.join('\n\n')}\n`)
    assert.deepEqual(
      sectionIndex(report.blocks).map((e) => [e.anchor, e.text]),
      [
        ['fixture-report', 'Fixture report'],
        ['conclusion', 'Conclusion'],
        ['next-steps', 'Next steps'],
      ],
    )
  })

  it('takes the report’s own top level: sections written at ## with no title, or at ### under a ## title', () => {
    const untitled = parseMarkdown(`${['## One', 'x', '### Detail', 'y', '## Two', 'z'].join('\n\n')}\n`)
    assert.deepEqual(
      sectionIndex(untitled.blocks).map((e) => e.anchor),
      ['one', 'two'],
    )
    const deep = parseMarkdown(`${['## Title', 'x', '### One', 'y', '### Two', 'z'].join('\n\n')}\n`)
    assert.deepEqual(
      sectionIndex(deep.blocks).map((e) => e.anchor),
      ['title', 'one', 'two'],
    )
  })

  it('gives two sections with one name two entries, each its own heading', () => {
    const notes = parseMarkdown(`${['# R', 'x', '## Notes', 'y', '## Notes', 'z'].join('\n\n')}\n`)
    assert.deepEqual(
      sectionIndex(notes.blocks).map((e) => [e.key, e.occurrence]),
      [
        ['r#0', 0],
        ['notes#0', 0],
        ['notes#1', 1],
      ],
    )
  })
})

describe('where she is in one turn', () => {
  it('is the block her words end in: from one paragraph to the next, the light goes with her', () => {
    const blocks = [
      'The second version of a labelled fixture report, published while the first was read.',
      'Read it once, then again.',
    ]
    const said =
      'the second version of a labelled fixture report, published while the first was read. Read it once, then again'
    assert.equal(spokenBlock(blocks, said)?.index, 1)
  })
})

describe('her section', () => {
  it('is the last heading before her words that the index names, never a sub-heading', () => {
    const index = new Set(['fixture-report#0', 'conclusion#0', 'recommendations#0'])
    assert.equal(sectionAmong(['fixture-report#0', 'conclusion#0', 'a-detail#0'], index), 'conclusion#0')
    assert.equal(sectionAmong(['a-detail#0'], index), null)
  })
})
