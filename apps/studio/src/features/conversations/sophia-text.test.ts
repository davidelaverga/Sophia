import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { blocksOf, plainOf } from './sophia-text.ts'

describe('Sophia’s words, read as light text (C6)', () => {
  it('a single line is one paragraph', () => {
    assert.deepEqual(blocksOf('Noted.'), [{ kind: 'p', text: 'Noted.' }])
  })

  it('a line ending in a colon leads the list under it; a short name before a colon says who', () => {
    assert.deepEqual(blocksOf('Where it stands:\n- Marco: One page.\n- Lucía: Sources inline.'), [
      { kind: 'lead', text: 'Where it stands:' },
      {
        kind: 'list',
        items: [
          { who: 'Marco', text: 'One page.' },
          { who: 'Lucía', text: 'Sources inline.' },
        ],
      },
    ])
  })

  it('an item with no speaker keeps its words whole, colons and all', () => {
    assert.deepEqual(blocksOf('- Map first, list second · proposed'), [
      { kind: 'list', items: [{ who: null, text: 'Map first, list second · proposed' }] },
    ])
    // A colon far into the line, or after a sentence, is not a speaker.
    assert.deepEqual(blocksOf('- The owner named at signup, handed on: then who?'), [
      { kind: 'list', items: [{ who: null, text: 'The owner named at signup, handed on: then who?' }] },
    ])
  })

  it('blank lines part paragraphs; a paragraph’s lines stay together', () => {
    assert.deepEqual(blocksOf('One.\nStill one.\n\nTwo.'), [
      { kind: 'p', text: 'One.\nStill one.' },
      { kind: 'p', text: 'Two.' },
    ])
  })

  it('a list and a paragraph in one block come apart in order', () => {
    assert.deepEqual(blocksOf('Decided:\n- Keep the brief to one page · Oct 5\nNothing was decided here.'), [
      { kind: 'lead', text: 'Decided:' },
      { kind: 'list', items: [{ who: null, text: 'Keep the brief to one page · Oct 5' }] },
      { kind: 'p', text: 'Nothing was decided here.' },
    ])
  })

  it('in one line, for a row: the lead, each item with its speaker, the words, apart', () => {
    assert.equal(
      plainOf('Where it stands:\n- Marco: One page.\n- Lucía: Sources inline.\n\nNothing decided.\nYet.'),
      'Where it stands: Marco: One page. · Lucía: Sources inline. · Nothing decided. Yet.',
    )
  })

  it('empty words are no block', () => {
    assert.deepEqual(blocksOf('  \n\n '), [])
  })
})
