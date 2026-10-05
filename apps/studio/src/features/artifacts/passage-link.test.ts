import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findLocated, LOCATED_MAX_WORDS, locate, locatorParam, passageLink, readLocator } from './passage-link.ts'
import { reportSearch, withReportLink } from './report-link.ts'

const here = { origin: 'https://studio.test', pathname: '/p/x/studio', search: '?tab=x', hash: '' }
const report = {
  artifactId: `${'a'.repeat(8)}-0000-4000-8000-000000000001`,
  versionId: `${'b'.repeat(8)}-0000-4000-8000-000000000002`,
}
const HOLDS = 'It cites one page. The fixture holds, as before.'

describe('where a selection is placed', () => {
  it('takes every word it touches, whole: begun or ended mid-word, the word is in', () => {
    const start = HOLDS.indexOf('he fixture')
    const end = HOLDS.indexOf('ds,') + 1
    assert.deepEqual(locate(2, HOLDS, start, end), { block: 2, word: 4, count: 3 })
  })

  it('is nothing when it touches no word, or its block is past what a link can name', () => {
    assert.equal(locate(0, HOLDS, HOLDS.indexOf('.'), HOLDS.indexOf('.') + 1), null)
    assert.equal(locate(10_000, HOLDS, 0, HOLDS.length), null)
  })

  it('keeps at most its first words', () => {
    const long = 'word '.repeat(LOCATED_MAX_WORDS + 20)
    assert.equal(locate(0, long, 0, long.length)?.count, LOCATED_MAX_WORDS)
  })
})

describe('the link to a passage', () => {
  const at = { block: 3, word: 4, count: 3 }

  it('names the report, its version and where the passage is: nothing of its text, not even a hash', () => {
    const link = new URL(passageLink(here, report, at))
    assert.equal(link.pathname, '/p/x/studio')
    assert.equal(link.searchParams.get('report'), report.artifactId)
    assert.equal(link.searchParams.get('version'), report.versionId)
    assert.equal(link.searchParams.get('passage'), '3.4.3')
    assert.equal(link.searchParams.get('tab'), 'x')
  })

  it('is read back, and nothing that isn’t one is', () => {
    assert.deepEqual(readLocator(`?passage=${locatorParam(at)}`), at)
    assert.equal(readLocator('?passage=The%20fixture%20holds'), null)
    assert.equal(readLocator('?passage=3.4.0'), null)
    assert.equal(readLocator(`?passage=3.4.${String(LOCATED_MAX_WORDS + 1)}`), null)
    assert.equal(readLocator('?report=r'), null)
  })

  it('stays with the report as the route settles, and goes with any step of the viewer', () => {
    const search = `?x=1&report=${report.artifactId}&passage=${locatorParam(at)}`
    assert.deepEqual(readLocator(reportSearch(search)), at)
    assert.equal(readLocator(reportSearch(`?passage=${locatorParam(at)}`)), null)
    const stepped = withReportLink(search, {
      artifactId: report.artifactId,
      versionId: null,
      size: 'full',
      format: 'markdown',
    })
    assert.equal(readLocator(stepped), null)
  })
})

describe('finding the passage', () => {
  const blocks = ['Fixture report', 'The first version of a labelled fixture report.', HOLDS]

  it('is at its place in the version’s text', () => {
    const found = findLocated(blocks, { block: 2, word: 4, count: 3 })
    assert.ok(found)
    assert.equal(blocks[2]?.slice(found.start, found.end), 'The fixture holds')
  })

  it('is nothing when the place isn’t in this text: no such block, or its words run out', () => {
    assert.equal(findLocated(blocks, { block: 9, word: 0, count: 1 }), null)
    assert.equal(findLocated(blocks, { block: 0, word: 1, count: 5 }), null)
  })
})
