import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pageSections } from './page-sections.ts'

describe('a designed page’s sections (revise-section.md)', () => {
  it('names each by its aria-label, else its first heading, else its id; in page order, once', () => {
    const html = [
      '<main data-section="intro"><h1 data-block="b1">Where <em>we</em> stand</h1></main>',
      '<section id="x" data-section="sources" aria-label="Sources">',
      '<section data-section="plain"><p>No heading</p></section>',
      '<section data-section="intro"><h2>Again</h2></section>',
      '<section data-section="Bad Id"><h2>Refused</h2></section>',
    ].join('\n')
    assert.deepEqual(pageSections(html), [
      { id: 'intro', label: 'Where we stand' },
      { id: 'sources', label: 'Sources' },
      { id: 'plain', label: 'plain' },
    ])
  })

  it('a page with no named section has none to offer', () => {
    assert.deepEqual(pageSections('<main><h1>Untitled</h1></main>'), [])
  })
})
