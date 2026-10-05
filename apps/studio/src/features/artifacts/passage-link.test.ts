import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { wordsOf } from '../voice/voice-trail.ts'
import {
  findLocated,
  hashWords,
  LOCATED_MAX_WORDS,
  locate,
  locatorParam,
  passageLink,
  readLocator,
} from './passage-link.ts'
import { reportSearch, withReportLink } from './report-link.ts'

const here = { origin: 'https://studio.test', pathname: '/p/x/studio', search: '?tab=x', hash: '' }
const report = {
  artifactId: `${'a'.repeat(8)}-0000-4000-8000-000000000001`,
  versionId: `${'b'.repeat(8)}-0000-4000-8000-000000000002`,
}
const HOLDS = 'It cites one page. The fixture holds, as before.'
const keys = (text: string) => wordsOf(text).map((w) => w.key)

describe('where a selection is placed', () => {
  it('takes every word it touches, whole: begun or ended mid-word, the word is in', () => {
    const start = HOLDS.indexOf('he fixture')
    const end = HOLDS.indexOf('ds,') + 1
    const at = locate(2, HOLDS, start, end)
    assert.deepEqual(at, { block: 2, word: 4, count: 3, hash: hashWords(['the', 'fixture', 'holds']) })
  })

  it('is nothing when it touches no word', () => {
    assert.equal(locate(0, HOLDS, HOLDS.indexOf('.'), HOLDS.indexOf('.') + 1), null)
  })

  it('keeps at most its first words', () => {
    const long = 'word '.repeat(LOCATED_MAX_WORDS + 20)
    assert.equal(locate(0, long, 0, long.length)?.count, LOCATED_MAX_WORDS)
  })
})

describe('the link to a passage', () => {
  const at = { block: 3, word: 4, count: 3, hash: hashWords(['the', 'fixture', 'holds']) }

  it('names the report, its version and where the passage is, with no word of it', () => {
    const link = new URL(passageLink(here, report, at))
    assert.equal(link.pathname, '/p/x/studio')
    assert.equal(link.searchParams.get('report'), report.artifactId)
    assert.equal(link.searchParams.get('version'), report.versionId)
    assert.equal(link.searchParams.get('passage'), `3.4.3.${at.hash}`)
    assert.equal(link.searchParams.get('tab'), 'x')
    assert.ok(!link.href.toLowerCase().includes('fixture'))
  })

  it('is read back, and nothing that isn’t one is', () => {
    assert.deepEqual(readLocator(`?passage=${locatorParam(at)}`), at)
    assert.equal(readLocator('?passage=The%20fixture%20holds'), null)
    assert.equal(readLocator(`?passage=3.4.0.${at.hash}`), null)
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
  const at = { block: 2, word: 4, count: 3, hash: hashWords(keys('the fixture holds')) }

  it('is at its place when the words there are still its words', () => {
    const found = findLocated(blocks, at)
    assert.ok(found)
    assert.equal(found.block, 2)
    assert.equal(blocks[2]?.slice(found.start, found.end), 'The fixture holds')
  })

  it('is wherever its words went when the text moved; nothing when they are gone', () => {
    const moved = ['A new opening paragraph.', ...blocks]
    assert.equal(findLocated(moved, at)?.block, 3)
    assert.equal(findLocated(['Nothing of the kind here.'], at), null)
  })
})
