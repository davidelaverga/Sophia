import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ReportCard } from '@sophia/contracts'
import { coverOf, metaOf, monogramOf } from './report-cover.ts'

const ID = '00000000-0000-4000-8000-0000000000c9'

/** A cover's lines as their words. */
const words = (markdown: string) => coverOf(markdown).lines.map((l) => l.words)

describe('coverOf: a Markdown report’s first lines, as words', () => {
  it('takes the first heading, then the opening paragraphs, a section’s heading marked as one', () => {
    const cover = coverOf('# Fixture report\n\nThe first version.\n\nIt cites one page.\n\n## Conclusion\n\nThe end.\n')
    assert.equal(cover.heading, 'Fixture report')
    assert.deepEqual(cover.lines, [
      { words: 'The first version.', section: false },
      { words: 'It cites one page.', section: false },
      { words: 'Conclusion', section: true },
      { words: 'The end.', section: false },
    ])
  })

  it('drops citation ids, written bare or as links, and emphasis marks', () => {
    assert.deepEqual(words(`# A\n\nIt cites **one** page [${ID}].\n\nAnd _another_ [1](<${ID}>) here.\n`), [
      'It cites one page.',
      'And another here.',
    ])
  })

  it('reads list items and table rows as words, and leaves out a table’s rule', () => {
    assert.deepEqual(words('# A\n\n- one\n- two\n\n| Measure | Pilot |\n| --- | --- |\n| Active | 12 |\n'), [
      'one',
      'two',
      'Measure · Pilot',
      'Active · 12',
    ])
  })

  it('has no heading when the text starts without one, and keeps at most six lines', () => {
    const cover = coverOf(Array.from({ length: 9 }, (_, i) => `Line ${String(i + 1)}.`).join('\n\n'))
    assert.equal(cover.heading, null)
    assert.equal(cover.lines.length, 6)
  })
})

describe('monogramOf: the format a cover falls back to', () => {
  it('names the designed page first, then the PDF, then the Markdown', () => {
    assert.equal(monogramOf(['markdown', 'pdf', 'html']), 'HTML')
    assert.equal(monogramOf(['markdown', 'pdf']), 'PDF')
    assert.equal(monogramOf(['markdown']), 'MD')
  })
})

const CARD: ReportCard = {
  artifactId: '00000000-0000-4000-8000-0000000000b1',
  projectId: '00000000-0000-4000-8000-000000000001',
  projectTitle: 'Onboarding pilot',
  title: 'Pilot readout',
  summary: null,
  summaryAuthorId: null,
  summaryRevision: 1,
  summaryUpdatedAt: null,
  currentVersionId: '00000000-0000-4000-8000-0000000000d2',
  currentVersionNumber: 2,
  versionCount: 2,
  updatedAt: '2026-10-01T09:00:00.000Z',
  formats: ['markdown', 'html'],
  latestChange: { note: null, retained: null },
}
const NOW = Date.parse('2026-10-07T12:00:00.000Z')

describe('metaOf: a tile’s one meta line', () => {
  it('says the formats beyond the Markdown, the version, the count when there are several, and the day', () => {
    assert.equal(metaOf(CARD, false, NOW), 'HTML · v2 · 2 versions · Oct 1')
  })

  it('leaves out one version, and «updated»', () => {
    const one = { ...CARD, formats: ['markdown'] as const, currentVersionNumber: 1, versionCount: 1 }
    assert.equal(metaOf(one, false, NOW), 'v1 · Oct 1')
  })

  it('names the project first when every project is listed', () => {
    assert.equal(
      metaOf({ ...CARD, formats: ['markdown', 'pdf'] }, true, NOW),
      'Onboarding pilot · PDF · v2 · 2 versions · Oct 1',
    )
  })
})
