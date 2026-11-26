import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { projectTitle, TAB_TITLE_MOST, tabTitle } from './document-title.ts'

describe('tabTitle', () => {
  it('keeps a title that fits as it is', () => {
    assert.equal(tabTitle('Launch plan'), 'Launch plan')
    assert.equal(tabTitle('x'.repeat(TAB_TITLE_MOST)), 'x'.repeat(TAB_TITLE_MOST))
  })

  it('cuts a long title to its start and «…», at the most a tab says', () => {
    const cut = tabTitle(`${'word '.repeat(36)}end`)
    assert.equal(Array.from(cut).length <= TAB_TITLE_MOST, true)
    assert.equal(cut.endsWith('…'), true)
    assert.equal(cut.includes(' …'), false)
  })

  it('never cuts inside a character', () => {
    const cut = tabTitle('🙂'.repeat(TAB_TITLE_MOST + 5))
    assert.equal(cut, `${'🙂'.repeat(TAB_TITLE_MOST - 1)}…`)
  })
})

describe('projectTitle', () => {
  it('says the shortened title, with who waits first', () => {
    assert.equal(projectTitle('Launch plan', 0), 'Launch plan · Sophia')
    assert.equal(projectTitle('Launch plan', 2), '(2) Launch plan · Sophia')
    assert.equal(projectTitle('x'.repeat(180), 0), `${'x'.repeat(TAB_TITLE_MOST - 1)}… · Sophia`)
  })
})
