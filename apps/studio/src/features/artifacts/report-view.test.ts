import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readReportLink, reportSearch, withReportLink } from './report-link.ts'
import { clampWidth, defaultWidth } from './usePaneWidth.ts'
import {
  elapsedText,
  factChips,
  formatBytes,
  money,
  progressRatio,
  progressText,
  reportFilename,
  researchState,
  sourceWords,
  spendText,
} from './report-view.ts'

const progress = {
  capUsd: 5,
  committedUsd: 0.744,
  searches: { used: 2, max: 5 },
  reads: { used: 3, max: 8 },
}

describe('a research card in words', () => {
  const running = { phase: 'running', state: 'running', reason: null } as const

  it('names each state, and a missing PDF is partly delivered, never a fallback', () => {
    assert.equal(researchState(running, [], ['markdown']).label, 'Researching')
    assert.equal(researchState({ ...running, phase: 'queued', state: 'pending' }, [], ['markdown']).state, 'starting')
    assert.equal(researchState({ ...running, phase: 'held' }, [], ['markdown']).label, 'Held')
    assert.equal(researchState({ ...running, phase: 'stopped', state: 'cancelled' }, [], ['markdown']).label, 'Stopped')
    const done = { phase: 'result_ready', state: 'succeeded', reason: null } as const
    assert.equal(researchState(done, [{ format: 'markdown' }], ['markdown']).state, 'ready')
    const partial = researchState(done, [{ format: 'markdown' }], ['markdown', 'pdf'])
    assert.deepEqual([partial.state, partial.label], ['partial', 'Partly delivered'])
    assert.equal(/fallback/i.test(JSON.stringify(partial)), false)
    assert.equal(researchState(done, [{ format: 'markdown' }, { format: 'pdf' }], ['markdown', 'pdf']).state, 'ready')
  })

  it('says why a report was not produced, in the blocker’s own words', () => {
    const failed = { phase: 'failed', state: 'failed' } as const
    assert.equal(
      researchState({ ...failed, reason: 'blocked: Every source is behind a login.' }, [], ['markdown']).note,
      'Not produced: Every source is behind a login.',
    )
    assert.match(
      researchState({ ...failed, reason: 'no_result_submitted: the draft is kept' }, [], ['markdown']).note ?? '',
      /without submitting/,
    )
    const replaced = researchState(
      { ...failed, reason: 'revoked: a source it read was withdrawn; the task continues without it' },
      [],
      ['markdown'],
    )
    assert.deepEqual(
      [replaced.state, replaced.label],
      ['replaced', 'Replaced'],
      'a revoked task is replaced, not failed',
    )
    assert.equal(researchState({ ...failed, reason: null }, [], ['markdown']).note, 'No report was produced.')
  })

  it('shows progress, spend and time in plain figures', () => {
    assert.equal(progressText(progress), '3 of 8 reads · 2 of 5 searches')
    assert.equal(spendText(progress), '$0.74 of $5.00')
    assert.equal(money(0.005), '$0.01')
    assert.ok(Math.abs(progressRatio(progress) - 0.1488) < 1e-9)
    assert.equal(progressRatio({ capUsd: 5, committedUsd: 9 }), 1)
    const t0 = '2026-10-01T10:00:00Z'
    assert.equal(elapsedText(t0, Date.parse(t0) + 30_000), 'under a minute')
    assert.equal(elapsedText(t0, Date.parse(t0) + 6 * 60_000), '6 min')
    assert.equal(elapsedText(t0, Date.parse(t0) + 72 * 60_000), '1 h 12 min')
    assert.equal(formatBytes(812), '812 B')
    assert.equal(formatBytes(4200), '4.2 KB')
  })

  it('names a download the way the API does', () => {
    assert.equal(reportFilename('Sandboxed PDF rendering', 2, 'pdf'), 'sandboxed-pdf-rendering-v2.pdf')
    assert.equal(reportFilename('Équipe & coûts', 1, 'markdown'), 'equipe-couts-v1.md')
    assert.equal(reportFilename('!!!', null, 'markdown'), 'report.md')
  })
})

describe('a version’s chips come from its facts, never its notes', () => {
  it('lists sources and sections changed, a changed conclusion and notes the service wrote', () => {
    const chips = factChips({
      versionNumber: 2,
      changeFacts: {
        cited: 4,
        added: ['a', 'b'],
        dropped: ['c'],
        sections: {
          added: ['Pricing'],
          revised: ['Costs'],
          removed: [],
          unchanged: ['Hosts'],
          conclusionChanged: true,
        },
        notesFromFacts: true,
      },
    })
    assert.deepEqual(
      chips.map((c) => c.label),
      ['+2 sources', '−1 source', '1 section added', '1 revised', 'Conclusion changed', 'Notes written from the facts'],
    )
    assert.deepEqual(
      factChips({ versionNumber: 1, changeFacts: { cited: 1, added: ['a'], dropped: [] } }).map((c) => c.label),
      ['1 source'],
    )
    assert.deepEqual(factChips({ versionNumber: 3 }), [])
  })
})

describe('how a cited source was retrieved', () => {
  it('tells a snippet from a page read in full or in part, and never invents an origin status', () => {
    assert.deepEqual(sourceWords({ kind: 'search_results', coverage: 'complete', originHttpStatus: null }), {
      coverage: 'Snippet only',
      tone: 'amber',
      route: 'Search results (Tavily)',
      origin: null,
    })
    const page = sourceWords({ kind: 'web_read', coverage: 'partial', originHttpStatus: null })
    assert.deepEqual(
      [page.coverage, page.route, page.origin],
      ['Read in part', 'Page extraction (Jina)', 'Origin status unknown'],
    )
    assert.equal(
      sourceWords({ kind: 'web_read', coverage: 'complete', originHttpStatus: 200 }).origin,
      'Origin answered 200',
    )
    assert.equal(sourceWords({ kind: 'input', coverage: null, originHttpStatus: null }).coverage, 'From the project')
  })
})

describe('the open report in the address bar', () => {
  const A = '11111111-1111-4111-8111-111111111111'
  const V = '22222222-2222-4222-8222-222222222222'

  it('reads and writes the report, its version and the full page, keeping other parameters', () => {
    assert.deepEqual(readReportLink(`?report=${A}&version=${V}&view=full`), {
      artifactId: A,
      versionId: V,
      size: 'full',
    })
    assert.deepEqual(readReportLink(`?report=${A}`), { artifactId: A, versionId: null, size: 'side' })
    assert.equal(readReportLink('?report=nope'), null)
    assert.equal(readReportLink('?x=1'), null)
    assert.equal(
      withReportLink('?x=1', { artifactId: A, versionId: V, size: 'full' }),
      `?x=1&report=${A}&version=${V}&view=full`,
    )
    assert.equal(withReportLink(`?x=1&report=${A}&view=full`, null), '?x=1')
    assert.equal(withReportLink(`?report=${A}`, null), '')
    assert.equal(reportSearch(`?x=1&report=${A}&view=full`), `?report=${A}&view=full`)
    assert.equal(reportSearch('?x=1'), '')
  })
})

describe('the side pane’s width', () => {
  it('opens at about 46% between 480 and 720px, and always leaves 400px beside it', () => {
    assert.equal(defaultWidth(1440), 662)
    assert.equal(defaultWidth(2400), 720)
    assert.equal(defaultWidth(1000), 480)
    assert.equal(clampWidth(900, 1440), 900, 'a person may widen it past the default')
    assert.equal(clampWidth(1200, 1440), 1040, 'never leaving less than 400px')
    assert.equal(clampWidth(300, 1440), 480)
  })
})
