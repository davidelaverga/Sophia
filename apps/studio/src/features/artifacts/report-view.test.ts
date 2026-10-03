import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openedLink, readReportLink, reportSearch, withReportLink, type ReportLink } from './report-link.ts'
import { clampWidth, defaultWidth } from './usePaneWidth.ts'
import { compareSections } from './markdown.ts'
import {
  conclusionTopic,
  currentOffer,
  elapsedText,
  escapeStepsDown,
  failedOutright,
  focusFree,
  formatsOffered,
  focusReturn,
  pdfMissing,
  factChips,
  formatBytes,
  money,
  progressRatio,
  progressText,
  renditionRefusal,
  renditionWords,
  reportFilename,
  researchState,
  sourceTitle,
  sourceWords,
  pinTo,
  rereadFor,
  spendText,
  summaryEdit,
  versionMissing,
  versionReadFailure,
} from './report-view.ts'

const progress = {
  capUsd: 5,
  committedUsd: 0.744,
  searches: { used: 2, max: 5 },
  reads: { used: 3, max: 8 },
}

const refusal = (code: string, status = 409) => renditionRefusal({ status, code, message: 'The research is held' })

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
    const why = researchState(done, [{ format: 'markdown' }], ['markdown', 'pdf'], {
      pdfReason: 'The PDF was not rendered',
    })
    assert.equal(why.note, 'The Markdown report is ready. The PDF was not rendered.', 'the reason the service recorded')
    const again = researchState(done, [{ format: 'markdown' }], ['markdown', 'pdf'], {
      pdfReason: 'The PDF was not rendered',
      pdfRendering: true,
    })
    assert.deepEqual(
      [again.state, again.note],
      ['partial', 'The Markdown report is ready. The PDF is being rendered again.'],
      'Try PDF again under way',
    )
    assert.equal(researchState(done, [{ format: 'markdown' }, { format: 'pdf' }], ['markdown', 'pdf']).state, 'ready')
  })

  it('answers Try PDF again in words: queued, the checks a version fails, or why it was refused', () => {
    assert.equal(
      renditionWords({ state: 'queued', renderJobId: 'j' }),
      'Rendering the PDF again. It appears here when it’s ready.',
    )
    const checks = [
      { name: 'report_title', outcome: 'passed', detail: null },
      { name: 'report_words', outcome: 'failed', detail: 'The report has 40 words; a report has at least 100' },
      { name: 'report_sections', outcome: 'failed', detail: null },
    ] as const
    assert.equal(
      renditionWords({ state: 'rejected', checks }),
      'This report can’t be printed as a PDF: The report has 40 words; a report has at least 100; report_sections.',
    )
    assert.equal(
      renditionWords({ state: 'failed', reason: 'failed: render_error' }),
      'The PDF could not be produced again (failed: render_error).',
    )
    assert.equal(
      refusal('native_capability_unavailable', 503),
      'No PDF renderer is running right now. Try again later.',
    )
    assert.equal(refusal('research_limit_reached'), 'The PDF was already tried three times for this version.')
    assert.equal(refusal('forbidden', 403), 'Your role can’t ask for the PDF.')
    assert.equal(
      refusal('source_ineligible', 403),
      'This report draws on a source that was withdrawn, so it isn’t printed again.',
      'a withdrawn source, though it is a 403',
    )
    assert.equal(refusal('invalid_state'), 'The research is held', 'otherwise the API’s own reason')
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
          revised: ['Conclusion'],
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
    const pdfOnly = { cited: 4, added: [], dropped: [], notesFromFacts: true, renditionOnly: true }
    assert.deepEqual(
      factChips({ versionNumber: 3, changeFacts: pdfOnly }).map((c) => c.label),
      ['PDF added'],
      'a rendition-only version adds the PDF and nothing else',
    )
  })

  it('names what changed when the conclusion fact covers recommendations only (CX-0019)', () => {
    // The pilot's facts, as 0027 section_facts gives them for a version that revised its recommendations only.
    const sections = { added: [], revised: ['Recommendations'], removed: [], unchanged: ['R', 'Conclusion'] }
    const chips = factChips({
      versionNumber: 2,
      changeFacts: { cited: 3, added: [], dropped: [], sections: { ...sections, conclusionChanged: true } },
    })
    assert.deepEqual(
      chips.map((c) => c.label),
      ['1 revised', 'Recommendations changed'],
    )
  })
})

/** The topic of a changed conclusion fact whose changed headings are `changed`. */
const topic = (changed: Partial<Record<'added' | 'revised' | 'removed', string[]>>, conclusionChanged = true) =>
  conclusionTopic({ added: [], revised: [], removed: [], ...changed, conclusionChanged })

/** A report whose recommendations read `recommendation`, beside the same conclusion. */
const withRecommendation = (recommendation: string) =>
  `# Report\n\nBody.\n\n## Conclusion\n\nUse A.\n\n## Recommendations\n\n${recommendation}\n`

describe('what a changed conclusion fact covers (CX-0019)', () => {
  it('names the part whose heading changed', () => {
    assert.equal(topic({ revised: ['Conclusion'] }), 'Conclusion')
    assert.equal(topic({ added: ['Option A', 'Option B'], revised: ['Key recommendations'] }), 'Recommendations')
    assert.equal(topic({ removed: ['Recommendation'], revised: ['Conclusions'] }), 'Conclusion and recommendations')
    assert.equal(topic({ revised: ['Conclusions and recommendations'] }), 'Conclusion and recommendations')
    assert.equal(topic({ revised: ['**Conclusioni**'] }), 'Conclusion', 'markup is stripped as the service strips it')
  })

  it('names either when no changed heading tells them apart, and nothing when the fact is false', () => {
    assert.equal(topic({ revised: ['Résumé'] }), 'Conclusion or recommendations')
    assert.equal(topic({ revised: ['Conclusion'] }, false), null, 'the fact decides, not the headings')
  })

  it('gives the comparison of two texts the same words', () => {
    assert.equal(
      conclusionTopic(compareSections(withRecommendation('Do X.'), withRecommendation('Do X and Y.'))),
      'Recommendations',
    )
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

  it('is named by its title, else its site, else as the project’s: never by its id', () => {
    assert.equal(sourceTitle({ title: 'A page', url: 'https://example.org/a' }), 'A page')
    assert.equal(sourceTitle({ title: null, url: 'https://example.org/a' }), 'example.org')
    assert.equal(sourceTitle({ title: null, url: null }), 'A source from the project')
  })
})

/** A list of versions as the viewer's query holds it, newest first. */
const list = (fetchStatus: 'fetching' | 'paused' | 'idle', ...ids: string[]) => ({
  data: ids.map((id) => ({ id })),
  fetchStatus,
})
const v = (id: string) => ({ id })

/** A read of the versions that failed with `error` (the API's code and status), holding `data` from an earlier read. */
const failedRead = (
  code: string,
  status: number,
  data?: unknown,
  fetchStatus: 'fetching' | 'paused' | 'idle' = 'idle',
) => ({
  isError: true,
  error: { code, status },
  data,
  fetchStatus,
})

describe('a version the link names', () => {
  it('is missing only once a list read again since the link named it lacks it (a cached list can predate it)', () => {
    const idle = { isSuccess: true, fetchStatus: 'idle' as const }
    assert.equal(versionMissing(idle, false, true), true)
    assert.equal(versionMissing(idle, false, false), false, 'the list is read again first')
    assert.equal(versionMissing({ ...idle, fetchStatus: 'fetching' }, false, true), false, 'being read again')
    assert.equal(versionMissing({ ...idle, fetchStatus: 'paused' }, false, true), false, 'a read paused offline')
    assert.equal(versionMissing(idle, true, true), false)
    assert.equal(versionMissing({ isSuccess: false, fetchStatus: 'fetching' }, false, true), false, 'nothing read yet')
  })

  it('pins a report opened without one to the current version, once a fresh list names it (ART-02)', () => {
    assert.equal(pinTo(null, list('idle', 'v2', 'v1')), 'v2')
    assert.equal(pinTo(null, list('fetching', 'v1')), null, 'a cached list being read again can predate v2')
    assert.equal(pinTo(null, list('paused', 'v1')), null, 'a read paused offline is not a read')
    assert.equal(pinTo(null, { data: undefined, fetchStatus: 'idle' }), null, 'nothing read')
    assert.equal(pinTo(null, list('idle')), null, 'no version yet')
    assert.equal(
      pinTo('v1', list('idle', 'v2', 'v1')),
      null,
      'the link names its version: a newer one never replaces it',
    )
  })

  it('keeps what was read when a read again in the background fails', () => {
    assert.equal(failedOutright({ isError: true, data: undefined }), true)
    assert.equal(failedOutright({ isError: true, data: [{ id: 'v2' }] }), false, 'the focus read failed: v2 stays')
    assert.equal(failedOutright({ isError: false, data: undefined }), false, 'still reading')
  })

  it('says a failed read of the versions when the version asked for is not to hand, never "loading" (M03-RF-0021)', () => {
    const v1 = [{ id: 'v1' }]
    const unavailable = failedRead('unavailable', 503, v1)
    assert.equal(versionReadFailure(unavailable, false, true), 'failed', 'the list read again for it lacks it')
    assert.equal(versionReadFailure(failedRead('outcome_unknown', 0), false, true), 'failed', 'no reply at all')
    assert.equal(versionReadFailure(failedRead('http_404', 404), false, true), 'failed', 'no route: not a refusal')
    // The API's refusals, by their code: `not_found` is a 422.
    assert.equal(versionReadFailure(failedRead('not_found', 422), false, true), 'refused')
    assert.equal(versionReadFailure(failedRead('forbidden', 403, v1), false, true), 'refused')
    assert.equal(versionReadFailure(unavailable, true, true), null, 'the version read earlier stays on screen')
    assert.equal(versionReadFailure(unavailable, false, false), null, 'not yet read again for it: an old error')
    assert.equal(versionReadFailure(failedRead('unavailable', 503), false, false), 'failed', 'nothing read at all')
    assert.equal(versionReadFailure(failedRead('unavailable', 503, v1, 'fetching'), false, true), null, 'read again')
    assert.equal(versionReadFailure(failedRead('unavailable', 503, v1, 'paused'), false, true), null, 'offline')
    assert.equal(versionReadFailure({ isError: false, error: null, fetchStatus: 'idle' }, false, true), null)
  })

  it('offers the current version when another is on screen, and nothing when it is the one shown', () => {
    const versions = [v('v3'), v('v2'), v('v1')]
    assert.deepEqual(currentOffer(versions, versions[2]), v('v3'))
    assert.equal(currentOffer(versions, versions[0]), null)
    assert.equal(currentOffer(versions, undefined), null, 'nothing shown yet')
    assert.equal(currentOffer(undefined, v('v1')), null)
  })

  it('reads the list again once for a version it lacks, and never for the current version', () => {
    assert.equal(rereadFor(true, null, 'v4'), 'v4')
    assert.equal(rereadFor(true, 'v4', 'v4'), null, 'once')
    assert.equal(rereadFor(true, 'v4', 'v5'), 'v5', 'again for another version')
    assert.equal(rereadFor(false, null, 'v4'), null, 'the list holds it')
    assert.equal(rereadFor(true, null, null), null, 'the current version')
  })
})

describe('a PDF asked for', () => {
  it('is missing when the version on screen has no rendition, and only once the version is read', () => {
    const pdf = { renditions: [{}] } as never
    assert.equal(pdfMissing('pdf', { renditions: [] }), true)
    assert.equal(pdfMissing('pdf', {}), true, 'a version published before renditions')
    assert.equal(pdfMissing('pdf', pdf), false)
    assert.equal(pdfMissing('markdown', { renditions: [] }), false, 'the Markdown was asked for')
    assert.equal(pdfMissing('pdf', undefined), false, 'not read yet')
  })
})

describe('the focus when the pane closes', () => {
  const shown = new Set(['card row', 'Chat toggle'])
  const visible = (el: string) => shown.has(el)
  it('returns to the opener on screen, else to its panel’s toggle, and never takes it from where it went', () => {
    assert.equal(focusReturn(true, 'card row', null, visible), 'card row')
    // A chat notice's Open: the chat closed as the report opened, so its button is out of sight.
    assert.equal(focusReturn(true, 'notice Open', 'Chat toggle', visible), 'Chat toggle')
    assert.equal(focusReturn(true, 'notice Open', null, visible), null, 'nothing on screen to return to')
    assert.equal(focusReturn(true, null, null, visible), null, 'a deep link: no opener')
    assert.equal(focusReturn(false, 'card row', 'Chat toggle', visible), null, 'the side panel took it')
  })

  it('is handed on only while nobody holds it: never from a control the person moved to (M03-RF-0022)', () => {
    const body = { isConnected: true }
    assert.equal(focusFree(null, body), true, 'nothing holds it')
    assert.equal(focusFree(body, body), true, 'the page holds it')
    assert.equal(focusFree({ isConnected: false }, body), true, 'what held it went (the citation, with its tab)')
    assert.equal(focusFree({ isConnected: true }, body), false, 'Sign out, in the account menu, keeps it')
  })
})

describe('the viewer’s Esc', () => {
  it('steps down only in a project in sight, with no modal sheet, when no field or dialog keeps it', () => {
    const free = { defaultPrevented: false, repeat: false, owned: false }
    assert.equal(escapeStepsDown(free, true, false), true)
    assert.equal(escapeStepsDown(free, false, false), false, 'a project kept out of sight for its call takes no keys')
    assert.equal(escapeStepsDown(free, true, true), false, 'a modal sheet on screen has it')
    assert.equal(escapeStepsDown({ ...free, owned: true }, true, false), false, 'a field or a dialog keeps its own')
    assert.equal(escapeStepsDown({ ...free, defaultPrevented: true }, true, false), false, 'already handled')
    assert.equal(escapeStepsDown({ ...free, repeat: true }, true, false), false, 'held down: one press, one step')
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
      format: 'markdown',
    })
    assert.deepEqual(readReportLink(`?report=${A}`), {
      artifactId: A,
      versionId: null,
      size: 'side',
      format: 'markdown',
    })
    assert.equal(readReportLink(`?report=${A}&format=pdf`)?.format, 'pdf')
    assert.equal(readReportLink(`?report=${A}&format=docx`)?.format, 'markdown', 'only a PDF is another format')
    assert.equal(readReportLink('?report=nope'), null)
    assert.equal(readReportLink('?x=1'), null)
    assert.equal(
      withReportLink('?x=1', { artifactId: A, versionId: V, size: 'full', format: 'markdown' }),
      `?x=1&report=${A}&version=${V}&view=full`,
    )
    assert.equal(
      withReportLink('', { artifactId: A, versionId: null, size: 'side', format: 'pdf' }),
      `?report=${A}&format=pdf`,
    )
    assert.equal(withReportLink(`?report=${A}&format=pdf`, null), '')
    assert.equal(withReportLink(`?x=1&report=${A}&view=full`, null), '?x=1')
    assert.equal(withReportLink(`?report=${A}`, null), '')
    assert.equal(reportSearch(`?x=1&report=${A}&view=full`), `?report=${A}&view=full`)
    assert.equal(reportSearch(`?x=1&report=${A}&format=pdf`), `?report=${A}&format=pdf`)
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

describe('a description edit', () => {
  it('is saved against the revision it began from, trimmed', () => {
    assert.deepEqual(summaryEdit({ text: '  A sharper description ', base: 3 }), {
      summary: 'A sharper description',
      expectedRevision: 3,
    })
  })
})

describe('opening a report', () => {
  const A = '11111111-1111-4111-8111-111111111111'
  const reading: ReportLink = { artifactId: A, versionId: 'v2', size: 'full', format: 'pdf' }
  it('keeps the format on screen for the same report, unless another is asked for', () => {
    assert.equal(openedLink(reading, { artifactId: A, versionId: 'v2' }).format, 'pdf', 'a card’s sources footer')
    assert.equal(openedLink(reading, { artifactId: A, format: 'markdown' }).format, 'markdown')
    assert.equal(openedLink(reading, { artifactId: 'another' }).format, 'markdown', 'another report: its Markdown')
    assert.equal(openedLink(null, { artifactId: A }).format, 'markdown')
  })

  it('keeps the size on screen and names the version asked for, else the current one', () => {
    assert.deepEqual(openedLink(reading, { artifactId: 'another' }), {
      artifactId: 'another',
      versionId: null,
      size: 'full',
      format: 'markdown',
    })
    assert.equal(openedLink(null, { artifactId: A, versionId: 'v1' }).versionId, 'v1')
    assert.equal(openedLink(null, { artifactId: A }).size, 'side')
  })
})

describe('Knowledge’s format filter', () => {
  const md = { formats: ['markdown'] }
  const pdf = { formats: ['markdown', 'pdf'] }
  it('is offered once a report has a PDF, and kept while a format is chosen so it can be cleared', () => {
    assert.equal(formatsOffered('any', [md, md]), false, 'no PDF anywhere: "With PDF" could only be empty')
    assert.equal(formatsOffered('any', []), false)
    assert.equal(formatsOffered('any', [md, pdf]), true)
    assert.equal(formatsOffered('pdf', []), true, 'a chosen filter stays, so it can be cleared')
    assert.equal(formatsOffered('markdown_only', [md]), true)
  })
})
