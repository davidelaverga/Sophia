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
  designState,
  htmlMissing,
  pdfMissing,
  renditionOf,
  viewerFormats,
  factChips,
  factsLine,
  formatBytes,
  money,
  notesNeedFacts,
  notesShown,
  progressRatio,
  progressText,
  quotedHeadings,
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

  it('says a finished task is completed, its detail read, being read or unreadable; never at work', () => {
    const done = { phase: 'result_ready', state: 'succeeded', reason: null } as const
    // The hosted cards: finished research whose detail is not in hand said "Researching" for days.
    const unlinked = researchState(done, [], ['markdown'])
    assert.deepEqual(
      [unlinked.state, unlinked.label, unlinked.tone, unlinked.note],
      ['completed', 'Completed', 'teal', 'No published report is linked to this task.'],
    )
    const reading = researchState(done, [], ['markdown', 'pdf'], {}, { status: 'reading' })
    assert.deepEqual([reading.state, reading.label, reading.note], ['completed', 'Completed', 'Reading its report…'])
    const unread = researchState(done, [], ['markdown'], {}, { status: 'failed', message: 'Sophia is unavailable' })
    assert.deepEqual(
      [unread.state, unread.label, unread.tone, unread.note],
      ['completed', 'Completed', 'amber', 'Its report could not be read here: Sophia is unavailable.'],
      'the reply’s own words',
    )
    for (const words of [unlinked, reading, unread]) {
      assert.equal(/Researching|arrives here|missing/u.test(JSON.stringify(words)), false, JSON.stringify(words))
    }
    // Either half of the record says finished.
    assert.equal(researchState({ ...done, phase: 'running' }, [], ['markdown']).state, 'completed')
    assert.equal(researchState({ ...done, state: 'running' }, [], ['markdown']).state, 'completed')
    // Outputs in hand are shown whatever the read again says: the report stays delivered, partly or wholly.
    const failed = { status: 'failed', message: 'Sophia is unavailable' } as const
    assert.equal(researchState(done, [{ format: 'markdown' }], ['markdown'], {}, failed).state, 'ready')
    assert.equal(researchState(done, [{ format: 'markdown' }], ['markdown', 'pdf'], {}, failed).state, 'partial')
  })

  it('keeps a task at work at work while its detail is read, and says when its progress cannot be', () => {
    assert.deepEqual([researchState(running, [], ['markdown'], {}, { status: 'reading' }).label], ['Researching'])
    const lost = researchState(
      running,
      [],
      ['markdown'],
      {},
      {
        status: 'failed',
        message: 'That didn’t go through (HTTP 500). Try again.',
      },
    )
    assert.deepEqual(
      [lost.state, lost.note],
      ['researching', 'Its progress could not be read here: That didn’t go through (HTTP 500). Try again.'],
    )
    // A record that ended keeps its own words, whatever the read.
    const failed = { status: 'failed', message: 'x' } as const
    const stopped = { phase: 'stopped', state: 'cancelled', reason: null } as const
    assert.equal(researchState(stopped, [], ['markdown'], {}, failed).label, 'Stopped')
    assert.equal(researchState({ ...running, phase: 'held' }, [], ['markdown'], {}, failed).label, 'Held')
    const blocked = { phase: 'failed', state: 'failed', reason: 'blocked: Every source is behind a login.' } as const
    assert.equal(
      researchState(blocked, [], ['markdown'], {}, { status: 'reading' }).note,
      'Not produced: Every source is behind a login.',
    )
    assert.equal(
      researchState({ ...running, phase: 'queued', state: 'pending' }, [], ['markdown'], {}, failed).state,
      'starting',
    )
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
  it('count the sections revised and name a changed conclusion; what came and went is the facts line’s', () => {
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
      ['1 revised', 'Conclusion changed'],
      'sources and sections added or removed are said once, in the facts line; notes from the facts are not shown',
    )
    assert.deepEqual(
      factChips({ versionNumber: 1, changeFacts: { cited: 1, added: ['a'], dropped: [] } }).map((c) => c.label),
      ['1 source'],
    )
    assert.deepEqual(factChips({ versionNumber: 3 }), [])
    const pdfOnly = { cited: 4, added: [], dropped: [], notesFromFacts: true, renditionOnly: true }
    assert.deepEqual(factChips({ versionNumber: 3, changeFacts: pdfOnly }), [], 'the facts line says it adds the PDF')
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

/** No source is one of the report's own versions. */
const NONE: ReadonlySet<string> = new Set()

/** Sections as the service stores them: none unless given. */
const sectionFacts = (s: Partial<Record<'added' | 'revised' | 'removed' | 'unchanged', string[]>>) => ({
  added: [],
  revised: [],
  removed: [],
  unchanged: [],
  conclusionChanged: false,
  ...s,
})

/**
 * The pilot's v2 facts (CX-0026): a seven-section report under its title, one section a table, amended into its title
 * and two new sections; its five sources dropped and the first version cited in their place. Synthetic headings of
 * the same shape.
 */
const PILOT = {
  parentId: 'v1',
  changeFacts: {
    cited: 1,
    added: ['base'],
    dropped: ['s1', 's2', 's3', 's4', 's5'],
    notesFromFacts: false,
    sections: {
      ...sectionFacts({
        added: ['Revised recommendations', 'Sources'],
        removed: [
          'Summary',
          'Compatibility and standards',
          'Charging speed in practice',
          'Product claims vs. evidence',
          'Comparison table',
          'Recommendations for buyers',
          'Limitations of this review',
        ],
        unchanged: ['USB-C charging for phones'],
      }),
      conclusionChanged: true,
    },
  },
}

/** A later version over `sections`, citing what it did before unless `sources` says otherwise. */
const amended = (
  sections: Parameters<typeof sectionFacts>[0],
  sources: { added?: string[]; dropped?: string[] } = {},
  more: { notesFromFacts?: boolean; renditionOnly?: boolean } = {},
) => ({
  parentId: 'v1',
  changeFacts: { cited: 3, added: [], dropped: [], ...sources, sections: sectionFacts(sections), ...more },
})

describe('a version’s facts line, first in its history entry (CX-0026)', () => {
  it('names the sections removed and added and counts the sources, from the facts alone', () => {
    assert.equal(
      factsLine(PILOT, 1, NONE),
      'Compared with v1: 7 sections removed: “Summary”, “Compatibility and standards”, “Charging speed in practice”, ' +
        '“Product claims vs. evidence”, “Comparison table”, “Recommendations for buyers”, “Limitations of this review”; ' +
        '2 added: “Revised recommendations”, “Sources”. Cited sources: 5 dropped, 1 added.',
      'the sources count is "Cited sources", which the section called Sources cannot be read into',
    )
    assert.deepEqual(
      factChips({ versionNumber: 2, ...PILOT }).map((c) => c.label),
      ['Recommendations changed'],
      'nothing the line says is said again as a chip',
    )
    assert.equal(factsLine(amended({ added: ['Pricing'] }), 1, NONE), 'Compared with v1: 1 section added: “Pricing”.')
    assert.equal(
      factsLine(amended({ removed: ['Costs'] }, { dropped: ['a'] }), 2, NONE),
      'Compared with v2: 1 section removed: “Costs”. Cited sources: 1 dropped.',
    )
  })

  it('keeps revised sections a count, never names them, and says when none came or went', () => {
    const revised = amended({ revised: ['Pros', 'Cons', 'Pros', 'Cons'], unchanged: ['Options'] })
    assert.equal(factsLine(revised, 1, NONE), 'Compared with v1: no section added or removed.')
    assert.deepEqual(
      factChips({ versionNumber: 2, ...revised }).map((c) => c.label),
      ['4 revised'],
    )
  })

  it('quotes each heading, so one the worker wrote never reads as the service’s own words', () => {
    const line = factsLine(
      amended({ removed: ['Comparison table; no section added or removed'], added: ['All other sections unchanged'] }),
      1,
      NONE,
    )
    assert.equal(
      line,
      'Compared with v1: 1 section removed: “Comparison table; no section added or removed”; ' +
        '1 added: “All other sections unchanged”.',
    )
    assert.equal(
      factsLine(amended({ added: ['The “rest”” unchanged'] }), 1, NONE),
      'Compared with v1: 1 section added: “The "rest"" unchanged”.',
      'a heading’s own quotes never close the quote',
    )
  })

  it('quotes every heading of a comparison’s lists, so one with a comma never reads as two sections', () => {
    assert.equal(
      quotedHeadings(['Pros, cons and trade-offs', 'Pricing', 'The “rest” unchanged']),
      '“Pros, cons and trade-offs”, “Pricing”, “The "rest" unchanged”',
    )
    const long = `A heading that runs on ${'and on '.repeat(10)}`
    assert.equal(quotedHeadings([long]), `“${long}”`, 'named whole: the comparison is where a heading is read in full')
  })

  it('names at most eight headings of a list, each cut short past 60 characters', () => {
    const long = `A heading that runs on ${'and on '.repeat(10)}`
    const removed = [long, ...Array.from({ length: 9 }, (_, i) => `Part ${i + 1}`)]
    const line = factsLine(amended({ removed }), 1, NONE) ?? ''
    assert.ok(line.startsWith(`Compared with v1: 10 sections removed: “${long.slice(0, 59)}…”, “Part 1”, `), line)
    assert.ok(line.endsWith('“Part 7” and 2 more.'), line)
  })

  it('counts a heading’s characters as the service does, never cutting a character in two', () => {
    const cut = factsLine(amended({ added: [`${'x'.repeat(58)}🚀 launch plan`] }), 1, NONE) ?? ''
    assert.equal(
      cut,
      `Compared with v1: 1 section added: “${'x'.repeat(58)}🚀…”.`,
      'the emoji kept whole before the cut',
    )
    assert.doesNotMatch(cut, /[\ud800-\udbff](?![\udc00-\udfff])/, 'no half of a character')
    const whole = `${'x'.repeat(59)}🚀` // 60 characters, 61 UTF-16 units
    assert.equal(factsLine(amended({ added: [whole] }), 1, NONE), `Compared with v1: 1 section added: “${whole}”.`)
  })

  it('never counts the report’s own versions as sources, as a follow-up that listed its base stored them', () => {
    const own = new Set(['v1-source', 'v2-source'])
    // v2 listed its base beside the source it read; v3 listed its own base and not v2's, and kept every citation.
    const second = amended({ revised: ['Recommendations'] }, { added: ['v1-source', 'new'], dropped: ['old'] })
    assert.equal(
      factsLine(second, 1, own),
      'Compared with v1: no section added or removed. Cited sources: 1 dropped, 1 added.',
    )
    const third = {
      ...amended({ revised: ['Summary'] }, { added: ['v2-source'], dropped: ['v1-source'] }),
      changeNote: 'Tightened the summary.',
    }
    assert.equal(factsLine(third, 2, own), 'Compared with v2: no section added or removed.')
    assert.deepEqual([notesNeedFacts(third, own), notesShown(third, own)], [false, 'open'], 'its honest notes in sight')
    assert.equal(notesShown(third, NONE), 'folded', 'the base counted as a source reads as one dropped')
  })

  it('says a version that only adds the PDF shares the text of the one before', () => {
    const pdf = amended({ unchanged: ['Report'] }, {}, { notesFromFacts: true, renditionOnly: true })
    assert.equal(factsLine(pdf, 3, NONE), 'Same text as v3; adds the PDF.')
  })

  it('says nothing for a first version, or without facts; the version before when the list lacks it', () => {
    assert.equal(
      factsLine({ parentId: null, changeFacts: { cited: 2, added: ['a', 'b'], dropped: [] } }, null, NONE),
      null,
    )
    assert.equal(factsLine({ parentId: 'v1' }, 1, NONE), null)
    assert.equal(
      factsLine(amended({ added: ['Pricing'] }), null, NONE),
      'Compared with the version before: 1 section added: “Pricing”.',
    )
    const older = { parentId: 'v1', changeFacts: { cited: 1, added: [], dropped: ['a'] } }
    assert.equal(
      factsLine(older, 1, NONE),
      'Cited sources compared with v1: 1 dropped.',
      'a version published before sections',
    )
    assert.equal(factsLine({ ...older, changeFacts: { ...older.changeFacts, dropped: [] } }, 1, NONE), null)
  })
})

describe('whether a version’s notes fold under its facts (CX-0026)', () => {
  it('folds them when a section was removed with none of its name left, or sources were dropped', () => {
    assert.equal(notesNeedFacts(PILOT, NONE), true)
    assert.equal(notesNeedFacts(amended({ removed: ['Comparison table'], unchanged: ['Summary'] }), NONE), true)
    assert.equal(notesNeedFacts(amended({ revised: ['Summary'] }, { dropped: ['a'] }), NONE), true, 'a source dropped')
  })

  it('keeps them open when a removed heading still names a section, by its anchor as the service reads it', () => {
    assert.equal(notesNeedFacts(amended({ removed: ['Pros'], revised: ['Pros'], unchanged: ['Cons'] }), NONE), false)
    assert.equal(
      notesNeedFacts(amended({ removed: ['**Pros:**'], unchanged: ['Pros'] }), NONE),
      false,
      'markup dropped',
    )
    assert.equal(
      notesNeedFacts(amended({ removed: ['Old pricing'], added: ['New pricing'] }), NONE),
      true,
      'a new name',
    )
    assert.equal(notesNeedFacts(amended({ revised: ['Pricing'] }, { added: ['a'] }), NONE), false, 'a source added')
    assert.equal(notesNeedFacts({ changeFacts: { cited: 1, added: [], dropped: [] } }, NONE), false, 'no sections')
    assert.equal(notesNeedFacts({}, NONE), false, 'no facts')
  })

  it('never folds notes the service wrote from the facts, nor a version that only adds the PDF', () => {
    assert.equal(notesNeedFacts({ changeFacts: { ...PILOT.changeFacts, notesFromFacts: true } }, NONE), false)
    const pdf = amended({ removed: ['Costs'] }, { dropped: ['a'] }, { renditionOnly: true })
    assert.equal(notesNeedFacts(pdf, NONE), false)
  })

  it('shows them open, folded, or not at all when the service wrote them from the facts', () => {
    const notes = { changeNote: 'Revised the recommendations.', retainedNote: 'The rest is unchanged.' }
    assert.equal(notesShown({ ...PILOT, ...notes }, NONE), 'folded')
    assert.equal(
      notesShown({ ...amended({ revised: ['Pricing'] }), changeNote: 'Expanded the pricing.' }, NONE),
      'open',
    )
    assert.equal(
      notesShown({ parentId: 'v1', retainedNote: 'Everything in v1 is kept' }, NONE),
      'open',
      'a kept note alone',
    )
    const fromFacts = { ...PILOT, changeFacts: { ...PILOT.changeFacts, notesFromFacts: true }, ...notes }
    assert.equal(notesShown(fromFacts, NONE), null, 'the facts line says the same')
    assert.equal(notesShown(PILOT, NONE), null, 'no notes')
  })

  it('shows none on a first version, whose note is the service’s own (0027), never Sophia’s', () => {
    const first = { cited: 2, added: ['a', 'b'], dropped: [], notesFromFacts: false, sections: sectionFacts({}) }
    assert.equal(notesShown({ parentId: null, changeNote: 'First version', changeFacts: first }, NONE), null)
    assert.equal(
      notesShown({ parentId: null, changeNote: 'A report on the pricing.' }, NONE),
      null,
      'nor words never checked',
    )
  })
})

/** The topic of a changed conclusion fact whose changed headings are `changed`. */
const topic = (changed: Partial<Record<'added' | 'revised' | 'removed', string[]>>, conclusionChanged = true) =>
  conclusionTopic({ added: [], revised: [], removed: [], ...changed, conclusionChanged })

/** A report whose recommendations read `recommendation`, beside the same conclusion. */
const withRecommendation = (recommendation: string) =>
  `# Report\n\nBody.\n\n## Conclusion\n\nUse A.\n\n## Recommendations\n\n${recommendation}\n`

/** Two options, each with its own '### Conclusion', after recommendations reading `recommendation`. */
const withOptions = (recommendation: string) =>
  `# Report\n\n## Option A\n\n### Conclusion\n\nFast.\n\n## Option B\n\n### Conclusion\n\nQuiet.\n\n## Recommendations\n\n${recommendation}\n`

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

  it('names only the recommendations when a repeated conclusion heading is as it was (0036 pairing)', () => {
    // Each option's '### Conclusion' pairs with its own: under 0027's anchor-only pairing, A's read as revised.
    const facts = compareSections(withOptions('Do X.'), withOptions('Do X and Y.'))
    assert.deepEqual([facts.revised, conclusionTopic(facts)], [['Recommendations'], 'Recommendations'])
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
    assert.equal(sourceTitle({ title: ' ', url: 'https://example.org/a' }), 'example.org', 'a blank title is none')
    assert.equal(sourceTitle({ title: '', url: null }), 'A source from the project')
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
    const pdf = { renditions: [{ format: 'pdf' }] } as never
    const page = { renditions: [{ format: 'html' }] } as never
    assert.equal(pdfMissing('pdf', { renditions: [] }), true)
    assert.equal(pdfMissing('pdf', {}), true, 'a version published before renditions')
    assert.equal(pdfMissing('pdf', pdf), false)
    assert.equal(pdfMissing('pdf', page), true, 'a designed page is not a PDF')
    assert.equal(pdfMissing('markdown', { renditions: [] }), false, 'the Markdown was asked for')
    assert.equal(pdfMissing('pdf', undefined), false, 'not read yet')
  })
})

describe('a designed HTML page (SDD-01)', () => {
  const both = { renditions: [{ format: 'html' }, { format: 'pdf' }] } as never
  it('is a format of the version only when the version stores one, after its Markdown and PDF', () => {
    assert.deepEqual(viewerFormats({ renditions: [] }), ['markdown'])
    assert.deepEqual(viewerFormats(both), ['markdown', 'pdf', 'html'])
    assert.deepEqual(viewerFormats(undefined), ['markdown'])
    assert.equal(renditionOf(both, 'html')?.format, 'html')
  })
  it('asked for and absent, shows the Markdown and says so; never printed from it', () => {
    assert.equal(htmlMissing('html', { renditions: [{ format: 'pdf' }] } as never), true)
    assert.equal(htmlMissing('html', both), false)
    assert.equal(htmlMissing('markdown', { renditions: [] }), false)
    assert.equal(htmlMissing('html', undefined), false, 'not read yet')
  })
  it('leaves the report ready while it is designed, and partly delivered when it could not be', () => {
    const task = { phase: 'result_ready', state: 'succeeded', reason: null } as const
    const md = [{ format: 'markdown' as const }]
    const designing = researchState(task, md, ['markdown', 'html'], { html: { state: 'designing' } })
    assert.deepEqual([designing.state, designing.missing], ['ready', undefined])
    assert.match(designing.note ?? '', /being designed after the research/)
    const failed = researchState(task, md, ['markdown', 'html'], {
      html: { state: 'failed', reason: 'The design hit its limit' },
    })
    assert.deepEqual([failed.state, failed.missing], ['partial', 'html'])
    assert.match(failed.note ?? '', /not designed: The design hit its limit\./)
    const published = researchState(task, [...md, { format: 'html' as const }], ['markdown', 'html'], {
      html: { state: 'published' },
    })
    assert.deepEqual([published.state, published.note], ['ready', null])
    // A missing PDF is still the one that "Try PDF again" answers.
    assert.equal(researchState(task, md, ['markdown', 'pdf', 'html'], { html: { state: 'failed' } }).missing, 'pdf')
  })
  it('says what the design is doing, in its own words', () => {
    assert.equal(designState({ state: 'reviewing' }).label, 'Reviewing')
    assert.equal(designState({ state: 'published' }).label, 'HTML page ready')
    assert.deepEqual(designState({ state: 'failed', reason: 'No capture renderer.' }), {
      label: 'Not designed',
      tone: 'rose',
      note: 'No capture renderer.',
    })
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
