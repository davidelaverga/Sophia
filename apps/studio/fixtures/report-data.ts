// Labelled fixture data for the report viewer's checks (e2e/report.spec.ts, SMC-M03): one research report with a
// first version and, once the check publishes it, a second (or, with `history=pilot`, a first and second in the shape
// of the pilot's, CX-0026); the finished research task a chat notice names; and the API's answers for them, typed
// against the contracts. Nothing here is live.
import type {
  ArtifactVersion,
  LobbyEntry,
  NativeTaskDetail,
  ReportList,
  ReportSourceList,
  ReportSummary,
  SourceContent,
} from '@sophia/contracts'
import { PROJECT } from './data.ts'
import {
  DEMO,
  DEMO_DESCRIPTION,
  DEMO_FILE,
  DEMO_HEADINGS,
  DEMO_PROJECT,
  DEMO_QUESTION,
  DEMO_SHA,
  DEMO_SOURCES,
  DEMO_TITLE,
  DEMO_V1,
  DEMO_V2,
} from './demo.ts'
import { LIBRARY, libraryContent } from './demo-library.ts'
import { DEMO_PAGE_SHA, demoPage } from './demo-page.ts'

export const REPORT = '00000000-0000-4000-8000-0000000000b1'
export const TASK = '00000000-0000-4000-8000-0000000000b2'
/** The design task of the research's HTML page (SDD-01). */
export const DESIGN_TASK = '00000000-0000-4000-8000-0000000000e2'
const EXCHANGE = '00000000-0000-4000-8000-0000000000ae'
const AT = '2026-10-02T00:00:00.000Z'

/** What the research was asked (the demo's question, with `demo`). */
const QUESTION = DEMO ? DEMO_QUESTION : 'A labelled fixture question.'

/** The project's title on Knowledge's cards. */
const PROJECT_TITLE = DEMO ? DEMO_PROJECT : 'Fixture project'

/** The one page every version cites. */
const CITED = '00000000-0000-4000-8000-0000000000c9'
/** An id that is none of a version's sources, which version 3 names in a link (CX-0019). */
const STRAY = '00000000-0000-4000-8000-0000000000ca'

/** The fixture report's title (the demo's, with `demo`). */
export const TITLE = DEMO ? DEMO_TITLE : 'Fixture report'
/**
 * A title far wider than the side pane at every width (`title=long`): the head must cut it, never widen the pane
 * (CX-0019).
 */
export const LONG_TITLE =
  'A labelled fixture report whose title runs on far past the width of the side pane, so that its head has to cut it short'

interface Text {
  sourceId: string
  sha256: string
  text: string
}

/**
 * Each version's Markdown, with its SHA-256 (the viewer shows nothing that does not match it). The second revises its
 * recommendations and keeps its conclusion; the third writes its citation as a link, as the pilot's model did, and
 * links an id that is none of its sources (CX-0019).
 */
const FIXTURE_TEXTS: readonly Text[] = [
  {
    sourceId: '00000000-0000-4000-8000-0000000000c1',
    sha256: 'd0c34bb26c92f59495bc2ae33604e871cdb98c31febf5b54b09fcc233cced80b',
    text: `# Fixture report\n\nThe first version of a labelled fixture report.\n\nIt cites one page [${CITED}].\n\n## Conclusion\n\nThe fixture holds.\n\n## Recommendations\n\nRead it once.\n`,
  },
  {
    sourceId: '00000000-0000-4000-8000-0000000000c2',
    sha256: 'e5f81a3936fc9f20ab857429698a823fddf4cc8aa75d9a73d1987a477fc50a26',
    text: `# Fixture report\n\nThe second version of a labelled fixture report, published while the first was read.\n\nIt cites one page [${CITED}].\n\n## Conclusion\n\nThe fixture holds.\n\n## Recommendations\n\nRead it once, then again.\n`,
  },
  {
    sourceId: '00000000-0000-4000-8000-0000000000c3',
    sha256: 'd18be2f23ecd7956104984c56804d6de22996f7f683fd6b8fc59335d4296c5ac',
    text: `# Fixture report\n\nThe third version of a labelled fixture report, its citation written as a link.\n\nIt cites one page [1](<${CITED}>) and names an id that is none of its sources [2](${STRAY}).\n`,
  },
]

/** The demo's two versions (`demo`), in place of the fixture's, under the same sources. */
const DEMO_TEXTS: readonly Text[] = [
  { sourceId: '00000000-0000-4000-8000-0000000000c1', sha256: DEMO_SHA.v1, text: DEMO_V1 },
  { sourceId: '00000000-0000-4000-8000-0000000000c2', sha256: DEMO_SHA.v2, text: DEMO_V2 },
]

const TEXTS = DEMO ? DEMO_TEXTS : FIXTURE_TEXTS

/** How many versions the fixture can publish: one text each. */
export const VERSIONS_HELD = TEXTS.length

/** The pilot-shaped first version's own source, which its second cites in place of the five sources it dropped. */
const PILOT_V1_SOURCE = '00000000-0000-4000-8000-0000000000c4'
/** The pilot-shaped second version's own source, which its third cites, as its base, in place of the first's. */
const PILOT_V2_SOURCE = '00000000-0000-4000-8000-0000000000c5'
/** The five sources the pilot-shaped first version cites: the one page, and four more. */
const PILOT_CITED = [CITED, ...['cb', 'cc', 'cd', 'ce'].map((id) => `00000000-0000-4000-8000-0000000000${id}`)]

/** The first lines under the pilot-shaped title, the same in both its versions. */
const PILOT_INTRO =
  'A labelled fixture report in the shape of the pilot’s: seven sections under its title, one of them a table.'

/**
 * A heading of 59 characters with nowhere a line may break (no space, hyphen or slash), which the facts line names
 * whole: it must wrap in the pane all the same.
 */
export const LONG_HEADING = 'Measured_charging_times_for_each_charger_in_the_fixture_set'

/**
 * The pilot's shape (CX-0026), in the fixture's own words (`history=pilot`): a first version of seven sections under
 * its title, one of them a table, and a second that keeps the title alone and adds two sections. It replaces the
 * first two versions of the fixture report. A third (`versions=3`) adds one section, headed LONG_HEADING.
 */
const PILOT_TEXTS: readonly Text[] = [
  {
    sourceId: PILOT_V1_SOURCE,
    sha256: '40983c8fd78ce1ad588ab4edcecf7adddad0b0102ec0e8852c6d3864598c9850',
    text: `# Fixture report\n\n${PILOT_INTRO}\n\n## Summary\n\nWhat the fixture compares, in short.\n\n## Compatibility and standards\n\nWhich standard each fixture product follows.\n\n## Charging speed in practice\n\nHow fast each one charges, as the fixture measured it.\n\n## Product claims vs. evidence\n\nWhat each product claims, beside what was found.\n\n## Comparison table\n\n| Product | Standard | Speed |\n| --- | --- | --- |\n| A | One | Fast |\n| B | Two | Slow |\n\n## Recommendations for buyers\n\nBuy A for speed.\n\n## Limitations of this review\n\nThe fixture measures nothing real.\n`,
  },
  {
    sourceId: PILOT_V2_SOURCE,
    sha256: 'aa629f71da26a81d735109a3a4b4fe3e061fa31290d6cc223b3141fc1d1cc940',
    text: `# Fixture report\n\n${PILOT_INTRO}\n\n## Revised recommendations\n\nBuy A for speed, or B to spend less.\n\n## Sources\n\n- The first version of this report.\n`,
  },
  {
    sourceId: '00000000-0000-4000-8000-0000000000c6',
    sha256: 'f8bf61e64c78d32705f52d620c94c182e0bf211619df0f7a355cd9c1f89c404f',
    text: `# Fixture report\n\n${PILOT_INTRO}\n\n## Revised recommendations\n\nBuy A for speed, or B to spend less.\n\n## Sources\n\n- The first version of this report.\n\n## ${LONG_HEADING}\n\nHow long each fixture charger took to fill, from empty.\n`,
  },
]

/** A text's size in bytes, as the API counts it. */
const byteLengthOf = (text: string) => new TextEncoder().encode(text).byteLength

type VersionNotes = Pick<ArtifactVersion, 'changeFacts' | 'changeNote' | 'retainedNote'>

/**
 * A first version as 0027 research_publish stores it: every source it cites added, every section added (0036
 * section_facts against no text), no kept note, and the service's own change note, "First version".
 */
const firstVersion = (cited: readonly string[], headings: readonly string[]): VersionNotes => ({
  changeNote: 'First version',
  changeFacts: {
    cited: cited.length,
    added: cited,
    dropped: [],
    notesFromFacts: false,
    sections: { added: headings, revised: [], removed: [], unchanged: [], conclusionChanged: false },
  },
})

/**
 * The second version: what 0027 section_facts gives against the first (its introduction and recommendations revised),
 * and notes that agree with it.
 */
const V2: VersionNotes = {
  changeNote: 'Expanded the introduction and the recommendations.',
  retainedNote: 'The conclusion is unchanged.',
  changeFacts: {
    cited: 1,
    added: [],
    dropped: [],
    notesFromFacts: false,
    sections: {
      added: [],
      revised: ['Fixture report', 'Recommendations'],
      removed: [],
      unchanged: ['Conclusion'],
      conclusionChanged: true,
    },
  },
}

/**
 * The pilot-shaped second version: what 0036 section_facts gives for its two texts (seven sections removed, two
 * added, the title alone unchanged), its five sources dropped and the first version cited in their place (a version of
 * the report, never counted as a source added), and notes that say the rest was kept, as the pilot's did (synthetic
 * words). They passed the truth gate as it stood (0036).
 */
const PILOT_V2: VersionNotes = {
  changeNote: 'Revised the recommendations; the rest of the report is unchanged.',
  retainedNote: 'Compatibility, charging speed, product claims and limitations are kept as they were.',
  changeFacts: {
    cited: 1,
    added: [PILOT_V1_SOURCE],
    dropped: PILOT_CITED,
    notesFromFacts: false,
    sections: {
      added: ['Revised recommendations', 'Sources'],
      revised: [],
      removed: [
        'Summary',
        'Compatibility and standards',
        'Charging speed in practice',
        'Product claims vs. evidence',
        'Comparison table',
        'Recommendations for buyers',
        'Limitations of this review',
      ],
      unchanged: ['Fixture report'],
      conclusionChanged: true,
    },
  },
}

/**
 * The pilot-shaped third version: what 0036 section_facts gives against the second (LONG_HEADING added, the rest
 * unchanged), and notes that agree with it, one of them naming a file a line cannot break in. It lists its own base,
 * the second version, among its citations, and not the first, as stored before 0037 left versions out (CX-0026): the
 * report's own versions, neither a source added nor one dropped.
 */
const PILOT_V3: VersionNotes = {
  changeNote:
    'Added the charging times, from measured_charging_times_for_each_charger_in_the_labelled_fixture_set_from_empty_to_full.csv.',
  retainedNote: 'The recommendations and the sources are unchanged.',
  changeFacts: {
    cited: 1,
    added: [PILOT_V2_SOURCE],
    dropped: [PILOT_V1_SOURCE],
    notesFromFacts: false,
    sections: {
      added: [LONG_HEADING],
      revised: [],
      removed: [],
      unchanged: ['Fixture report', 'Revised recommendations', 'Sources'],
      conclusionChanged: false,
    },
  },
}

/** The demo's second version: the second region added, the recommendations revised, the conclusion kept. */
const DEMO_V2_NOTES: VersionNotes = {
  changeNote: 'Added the second region’s five teams and revised the recommendations with them.',
  retainedNote: 'The measures, what kept teams and the conclusion are unchanged.',
  changeFacts: {
    cited: DEMO_SOURCES.length,
    added: [],
    dropped: [],
    notesFromFacts: false,
    sections: {
      added: ['The second region'],
      revised: ['Recommendations'],
      removed: [],
      unchanged: DEMO_HEADINGS.filter((h) => h !== 'Recommendations'),
      conclusionChanged: false,
    },
  },
}

/** Each version's notes and facts, by number: the fixture report's, and the pilot-shaped ones (`history=pilot`). */
const NOTES: readonly VersionNotes[] = DEMO
  ? [
      firstVersion(
        DEMO_SOURCES.map((s) => s.id),
        DEMO_HEADINGS,
      ),
      DEMO_V2_NOTES,
    ]
  : [firstVersion([CITED], ['Fixture report', 'Conclusion', 'Recommendations']), V2]
const PILOT_NOTES: readonly VersionNotes[] = [
  firstVersion(PILOT_CITED, [
    'Fixture report',
    'Summary',
    'Compatibility and standards',
    'Charging speed in practice',
    'Product claims vs. evidence',
    'Comparison table',
    'Recommendations for buyers',
    'Limitations of this review',
  ]),
  PILOT_V2,
  PILOT_V3,
]

/** The id of version `n` (1-based). */
export const versionId = (n: number) => `00000000-0000-4000-8000-0000000000d${String(n)}`

/**
 * A designed HTML page of version 1 (SDD-01), with `designed=on`: a labelled static page standing in for one Sophia
 * designed and a separate reviewer checked, stored as the version's `html` rendition. Its hash is the page's bytes'.
 */
export const DESIGNED = {
  sourceId: '00000000-0000-4000-8000-0000000000e1',
  sha256: '315a02d313f9fcdf875a09526b85b817ef79f2b1ead83cc68fa9ee0454d928fe',
  text: `${[
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'\">",
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Fixture report</title>',
    '<style>body{margin:0;font:18px/1.5 Georgia,serif;color:#1d1b16;background:#fbf7ef}main{max-width:40rem;margin:0 auto;padding:2rem 1.25rem}h1{font-size:2rem;line-height:1.15}</style>',
    '</head>',
    '<body>',
    '<main data-section="s1">',
    '<h1 data-block="b1">A labelled fixture designed page</h1>',
    '<p data-block="b2">It stands in for a page Sophia designed from the report\'s first version. Nothing here is live.</p>',
    '</main>',
    '</body>',
    '</html>',
  ].join('\n')}\n`,
}

/** The demo's designed pages (`demo`), one for each version: charts, figures and the findings, as a page. */
const DEMO_PAGES = [
  { sourceId: '00000000-0000-4000-8000-0000000000e5', sha256: DEMO_PAGE_SHA.v1, text: demoPage(1) },
  { sourceId: '00000000-0000-4000-8000-0000000000e6', sha256: DEMO_PAGE_SHA.v2, text: demoPage(2) },
]

/** The designed page version `n` carries: the fixture's on version 1, the demo's on each. */
const pageOf = (n: number) => (DEMO ? (DEMO_PAGES[n - 1] ?? DEMO_PAGES[0]) : DESIGNED)

/** Version `n`'s designed page as the version lists it. */
const designedRendition = (n = 1) => ({
  format: 'html' as const,
  sourceId: pageOf(n)?.sourceId ?? DESIGNED.sourceId,
  sha256: pageOf(n)?.sha256 ?? DESIGNED.sha256,
  byteLength: new TextEncoder().encode(pageOf(n)?.text ?? DESIGNED.text).byteLength,
  mime: 'text/html',
  pageCount: null,
  reviewState: 'reviewed' as const,
  limitations: [],
})

function version(n: number, title: string, pilot: boolean): ArtifactVersion {
  const text = (pilot ? PILOT_TEXTS[n - 1] : undefined) ?? TEXTS[n - 1]
  if (!text) throw new Error(`no fixture version ${String(n)}`)
  return {
    id: versionId(n),
    artifactId: REPORT,
    projectId: PROJECT,
    parentId: n > 1 ? versionId(n - 1) : null,
    sourceId: text.sourceId,
    sourceHash: text.sha256,
    state: 'stable',
    previewId: null,
    format: 'markdown',
    exportEditability: 'source_editable',
    title,
    versionNumber: n,
    createdAt: AT,
    renditions: [],
    limitations: [],
    ...(pilot ? PILOT_NOTES : NOTES)[n - 1],
  }
}

/**
 * The report's versions as the API lists them, newest first: `published` of them (with `pilot`, as in PILOT_TEXTS;
 * with `designed`, version 1 carries its designed page).
 */
export const versions = (published: number, title = TITLE, pilot = false, designed = false): ArtifactVersion[] =>
  Array.from({ length: published }, (_, i) => {
    const v = version(published - i, title, pilot)
    const paged = designed && (DEMO || v.versionNumber === 1)
    return paged ? { ...v, renditions: [designedRendition(v.versionNumber)] } : v
  })

/** What a version cites, as `GET …/versions/{id}/sources` answers it: the one page, read in full. */
const fixtureSources: ReportSourceList = {
  sources: [
    {
      sourceId: CITED,
      kind: 'web_read',
      provider: 'jina',
      title: 'A labelled fixture page',
      url: 'https://example.org/fixture',
      coverage: 'complete',
      originHttpStatus: 200,
      limitations: [],
      mime: 'text/markdown',
      retrievedAt: AT,
    },
  ],
}

/** The demo's (`demo`): the project's own records, read in full. */
const demoSources: ReportSourceList = {
  sources: DEMO_SOURCES.map((s) => ({
    sourceId: s.id,
    kind: 'input' as const,
    provider: null,
    title: s.title,
    url: null,
    coverage: 'complete' as const,
    originHttpStatus: null,
    limitations: [],
    mime: 'text/markdown',
    retrievedAt: AT,
  })),
}

export const citedSources: ReportSourceList = DEMO ? demoSources : fixtureSources

/**
 * A version's Markdown, inline, as `GET /sources/{id}/content` answers it; null for a source it does not hold.
 * `tampered` (`tamper=text`): the text with one space more and the record's sha256 kept, bytes no record names.
 */
export function content(sourceId: string, tampered = false, pageTampered = false): SourceContent | null {
  if (sourceId === DESIGNED.sourceId) return designedContent(pageTampered)
  const demoPageAt = DEMO ? DEMO_PAGES.findIndex((p) => p.sourceId === sourceId) : -1
  if (demoPageAt >= 0) return demoPageContent(demoPageAt, pageTampered)
  const shelved = DEMO ? libraryContent(sourceId) : null
  if (shelved) return shelved
  const text = [...TEXTS, ...PILOT_TEXTS, OLDER_TEXT].find((t) => t.sourceId === sourceId)
  if (!text) return null
  const served = tampered ? `${text.text} ` : text.text
  return {
    sourceId,
    sha256: text.sha256,
    mime: 'text/markdown',
    byteLength: byteLengthOf(served),
    filename: DEMO ? `${DEMO_FILE}.md` : 'fixture-report.md',
    disposition: 'inline',
    text: served,
    downloadUrl: null,
    expiresAt: null,
  }
}

/** The demo's designed page of version `i + 1`, as the content read answers it; `tamper=html`: one byte more. */
function demoPageContent(i: number, tampered: boolean): SourceContent | null {
  const page = DEMO_PAGES[i]
  if (!page) return null
  const served = tampered ? `${page.text} ` : page.text
  return {
    sourceId: page.sourceId,
    sha256: page.sha256,
    mime: 'text/html',
    byteLength: byteLengthOf(served),
    filename: `${DEMO_FILE}-v${String(i + 1)}.html`,
    disposition: 'inline',
    text: served,
    downloadUrl: null,
    expiresAt: null,
  }
}

/** The designed page as the content read answers it; `tamper=html`: one byte more, the record's hash kept. */
function designedContent(tampered: boolean): SourceContent {
  const served = tampered ? `${DESIGNED.text} ` : DESIGNED.text
  return {
    sourceId: DESIGNED.sourceId,
    sha256: DESIGNED.sha256,
    mime: 'text/html',
    byteLength: byteLengthOf(served),
    filename: 'fixture-report-v1.html',
    disposition: 'inline',
    text: served,
    downloadUrl: null,
    expiresAt: null,
  }
}

/** The finished research task a notice names: its result is version 1's Markdown. */
export const researchTask: NativeTaskDetail = {
  task: {
    id: TASK,
    kind: 'research',
    goalId: '00000000-0000-4000-8000-0000000000b3',
    attemptId: '00000000-0000-4000-8000-0000000000b4',
    commandId: '00000000-0000-4000-8000-0000000000b5',
    actorId: '00000000-0000-4000-8000-0000000000a1',
    state: 'succeeded',
    phase: 'result_ready',
    createdAt: AT,
    contextSourceId: '00000000-0000-4000-8000-0000000000b6',
    inputSourceIds: [],
    resultSourceId: TEXTS[0]?.sourceId ?? null,
    reason: null,
    artifactId: REPORT,
  },
  instruction: QUESTION,
  result: {
    sourceId: TEXTS[0]?.sourceId ?? '',
    sha256: TEXTS[0]?.sha256 ?? '',
    markdown: TEXTS[0]?.text ?? '',
    provider: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    capturedAt: AT,
    outputs: [
      {
        artifactVersionId: versionId(1),
        format: 'markdown',
        sourceId: TEXTS[0]?.sourceId ?? '',
        sha256: TEXTS[0]?.sha256 ?? '',
        byteLength: byteLengthOf(TEXTS[0]?.text ?? ''),
        limitations: [],
      },
    ],
  },
}

/** The same research task while it runs (`research=running`, room-work checks): no result yet, `reads` sources read. */
export function researchRunning(reads: number): NativeTaskDetail {
  return {
    ...researchTask,
    task: { ...researchTask.task, state: 'running', phase: 'running', resultSourceId: null },
    result: null,
    research: {
      question: QUESTION,
      specialist: 'sophia-researcher-v1',
      outputs: ['markdown', 'pdf'],
      rootTaskId: TASK,
      capUsd: 5,
      committedUsd: 0.4,
      spentUsd: 0.3,
      searches: { used: 2, max: 5 },
      reads: { used: reads, max: 8 },
    },
  }
}

/**
 * The same task's record once its result is revised (`window.fixture.noticeRevised`, CX-0022): its result is version
 * `n`'s Markdown, the files a card opens and saves.
 */
export function researchTaskAt(n: 1 | 2, designed = false, designing = false): NativeTaskDetail {
  const text = TEXTS[n - 1]
  if (!text || !researchTask.result) throw new Error(`no fixture version ${String(n)}`)
  const file = {
    artifactVersionId: versionId(n),
    format: 'markdown' as const,
    sourceId: text.sourceId,
    sha256: text.sha256,
    byteLength: new TextEncoder().encode(text.text).byteLength,
    limitations: [],
  }
  const result = { ...researchTask.result, sourceId: text.sourceId, sha256: text.sha256, markdown: text.text }
  // With `designed=on` the HTML page asked for is published on version 1, as the API lists it after the Markdown.
  const page = { ...designedRendition(n), artifactVersionId: versionId(DEMO ? n : 1) }
  const html = { format: 'html' as const, ...pick(page) }
  return {
    ...researchTask,
    task: { ...researchTask.task, resultSourceId: text.sourceId },
    result: { ...result, outputs: designed && (DEMO || n === 1) ? [file, html] : [file] },
    ...(designed ? { research: designedResearch } : designing ? { research: designingResearch } : {}),
  }
}

/** An output's fields of a rendition. */
const pick = (r: ReturnType<typeof designedRendition> & { artifactVersionId: string }) => ({
  artifactVersionId: r.artifactVersionId,
  sourceId: r.sourceId,
  sha256: r.sha256,
  byteLength: r.byteLength,
  limitations: r.limitations,
  reviewState: r.reviewState,
})

/** The research's request and progress once its HTML page is published (`designed=on`). */
const designedResearch: NonNullable<NativeTaskDetail['research']> = {
  question: QUESTION,
  specialist: 'sophia-research-md-v1',
  outputs: ['markdown', 'html'],
  rootTaskId: TASK,
  capUsd: 5,
  committedUsd: 0.4,
  spentUsd: 0.4,
  searches: { used: 1, max: 5 },
  reads: { used: 1, max: 8 },
  html: { state: 'published', designTaskId: DESIGN_TASK },
}

/** The same research while its page is still being designed (`design=designing`, B-19). */
const designingResearch: NonNullable<NativeTaskDetail['research']> = {
  ...designedResearch,
  html: { state: 'designing', designTaskId: DESIGN_TASK },
}

/** The design task of that page, as its own record reads while it is designed (`design=designing`, B-19). */
export const designingTask = (state: 'designing' | 'published' = 'designing'): NativeTaskDetail => ({
  task: {
    ...researchTask.task,
    id: DESIGN_TASK,
    kind: 'design',
    state: 'running',
    phase: 'running',
    resultSourceId: null,
  },
  instruction: 'Design the HTML page of the published report.',
  result: null,
  design: {
    researchTaskId: TASK,
    artifactId: REPORT,
    baseVersionId: versionId(1),
    baseVersionNumber: 1,
    state,
    targets: ['w1280-light', 'w390-light'],
    revisions: 1,
    renders: 1,
    candidates: [],
    maxRepairs: 2,
    mode: 'create',
  },
})

/** The bridge's notice for that task, as it reaches a member in the room's chat. */
export const researchNotice = {
  kind: 'notice' as const,
  id: '00000000-0000-4000-8000-0000000000b7',
  exchangeId: EXCHANGE,
  taskId: TASK,
  taskKind: 'research',
  resultRevision: 1,
}

/** The notice for the task's revised result (CX-0022): the same task, at revision 2. */
export const revisedNotice = { ...researchNotice, id: '00000000-0000-4000-8000-0000000000bc', resultRevision: 2 }

/**
 * A brief's notice, synthetic: the fixture's task told as a draft_brief, so its record still names a Markdown file and
 * only the card's kind differs (the HTML page is a research report's, html-report-v2).
 */
export const briefNotice = { ...researchNotice, id: '00000000-0000-4000-8000-0000000000bd', taskKind: 'draft_brief' }

/** Someone at the door while a report is open (`lobby=waiting`): the lobby card must stay in reach over the pane. */
export const waitingAtTheDoor: LobbyEntry = {
  id: '00000000-0000-4000-8000-0000000000b8',
  displayName: DEMO ? 'Ana Ruiz' : 'Fixture guest',
  status: 'waiting',
  requestedAt: AT,
  decidedAt: null,
  knocks: 1,
}

/** The report's description as the API holds it: Sophia's at revision 1, and each member's edit a revision more. */
export interface Description {
  text: string
  revision: number
  /** Who edited it last; null for Sophia's. */
  author: string | null
}

export const SOPHIAS_DESCRIPTION: Description = {
  text: DEMO ? DEMO_DESCRIPTION : 'A labelled fixture report, as Sophia described it.',
  revision: 1,
  author: null,
}

/** A teammate's edit, made elsewhere while this viewer has Knowledge open. */
export const TEAMMATE = '00000000-0000-4000-8000-0000000000a2'

const summaryOf = (d: Description): ReportSummary => ({
  artifactId: REPORT,
  summary: d.text,
  summaryAuthorId: d.author,
  summaryRevision: d.revision,
  summaryUpdatedAt: d.author ? AT : null,
})

/** The older report's one version, its Markdown kept inline (its cover on Knowledge reads it); `demo`: the pilot's plan. */
const OLDER_TEXT = DEMO
  ? {
      sourceId: '00000000-0000-4000-8000-0000000000e7',
      sha256: '8b82929553227202235c6e4a7fbbd680de9ed3201ab4e018334d3ce45b59c090',
      text: '# Pilot plan: fourteen teams, two regions\n\nHow the pilot runs: fourteen customer teams in two regions, four weeks each, and one measure that matters, a first shared report inside the first week.\n\n## Who takes part\n\nNine teams in the first region and five in the second, chosen by the size of their setup.\n\n## What we measure\n\nActive teams each week, days to a first shared report, and setup tickets per team.\n',
    }
  : {
      sourceId: '00000000-0000-4000-8000-0000000000e7',
      sha256: '339cb171b4a537d415d8859b142ace55d92952cd01b31518cce98de9dd60917d',
      text: '# An older fixture report\n\nA labelled fixture report from before PDFs were turned off.\n\n## Conclusion\n\nThe older fixture holds.\n',
    }

/** An older report on Knowledge's second page (`cursor=page-2`): More reports brings it. */
const OLDER: ReportList['reports'][number] = {
  artifactId: '00000000-0000-4000-8000-0000000000e1',
  projectId: PROJECT,
  projectTitle: PROJECT_TITLE,
  title: DEMO ? 'Pilot plan: fourteen teams, two regions' : 'An older fixture report',
  summary: null,
  summaryAuthorId: null,
  summaryRevision: 1,
  summaryUpdatedAt: null,
  currentVersionId: '00000000-0000-4000-8000-0000000000e2',
  currentVersionNumber: 1,
  versionCount: 1,
  // In the demo, older than its library's shelf (Sep 20 to 29): the list stays newest first across its pages.
  updatedAt: DEMO ? '2026-09-15T10:00:00.000Z' : AT,
  // Printed before PDFs were turned off: Knowledge offers its format filter once such a report is in the list.
  formats: ['markdown', 'pdf'],
  latestChange: { note: null, retained: null },
}

/** The older report's versions as the API lists them: its one version, Markdown only. */
export const olderVersions = (): ArtifactVersion[] => [
  {
    id: OLDER.currentVersionId,
    artifactId: OLDER.artifactId,
    projectId: PROJECT,
    parentId: null,
    sourceId: OLDER_TEXT.sourceId,
    sourceHash: OLDER_TEXT.sha256,
    state: 'stable',
    previewId: null,
    format: 'markdown',
    exportEditability: 'source_editable',
    title: OLDER.title,
    versionNumber: 1,
    createdAt: OLDER.updatedAt,
    renditions: [],
    limitations: [],
  },
]

export const OLDER_REPORT = OLDER.artifactId

/** The older report as filed in another project the reader is in (`reports=elsewhere`). */
export const ELSEWHERE_REPORT = '00000000-0000-4000-8000-0000000000a8'
const ELSEWHERE_VERSION = '00000000-0000-4000-8000-0000000000a7'

/** A report filed in another project the reader is in (`reports=elsewhere`): the older report's words, its own ids. */
export const elsewhereCard = (projectId: string, projectTitle: string): ReportList['reports'][number] => ({
  ...OLDER,
  artifactId: ELSEWHERE_REPORT,
  currentVersionId: ELSEWHERE_VERSION,
  projectId,
  projectTitle,
  title: 'Rollout notes from another team',
})

/** That report's one version, as the API lists it. */
export const elsewhereVersions = (projectId: string): ArtifactVersion[] =>
  olderVersions().map((v) => ({
    ...v,
    id: ELSEWHERE_VERSION,
    artifactId: ELSEWHERE_REPORT,
    projectId,
    title: 'Rollout notes from another team',
  }))

/** A text's searchable words: letters and digits only, lower case. */
const wordsOf = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

/** The fixture report's card: its current version (the first of `published`, newest first) with that version's notes. */
function fixtureCard(published: readonly ArtifactVersion[], d: Description): ReportList['reports'][number] {
  const latest = published[0]
  if (!latest) throw new Error('the fixture report has no version')
  const s = summaryOf(d)
  return {
    artifactId: REPORT,
    projectId: PROJECT,
    projectTitle: PROJECT_TITLE,
    title: TITLE,
    summary: s.summary,
    summaryAuthorId: s.summaryAuthorId,
    summaryRevision: s.summaryRevision,
    summaryUpdatedAt: s.summaryUpdatedAt,
    currentVersionId: latest.id,
    currentVersionNumber: latest.versionNumber ?? null,
    versionCount: published.length,
    updatedAt: AT,
    formats: ['markdown', ...(latest.renditions ?? []).map((r) => r.format)],
    latestChange: { note: latest.changeNote ?? null, retained: latest.retainedNote ?? null },
  }
}

/** Whether a card passes the words and the format asked for, as the API reads them. */
export function matchesFilter(r: ReportList['reports'][number], filter: { q: string | null; format: string | null }) {
  const words = wordsOf(filter.q ?? '').slice(0, 8)
  const format = filter.format ?? 'any'
  const text = wordsOf(`${r.title} ${r.summary ?? ''} ${r.latestChange.note ?? ''} ${r.latestChange.retained ?? ''}`)
  const found = words.every((w) => text.some((t) => t.startsWith(w)))
  return found && (format === 'any' || (format === 'pdf') === r.formats.includes('pdf'))
}

/**
 * Knowledge's Reports, as `GET /knowledge/reports` answers it: the fixture report's card (fixtureCard) on the first
 * page, and an older report, with a PDF, on the second. Words and a format filter as the API does (each word a prefix,
 * all of them required, over the title, the description and the latest notes; `pdf` or `markdown_only`), in one page;
 * a project is listed only with at least one report.
 */
export function reportList(
  published: readonly ArtifactVersion[],
  d: Description,
  cursor: string | null,
  filter: { q: string | null; format: string | null } = { q: null, format: null },
): ReportList {
  const current = fixtureCard(published, d)
  const words = wordsOf(filter.q ?? '').slice(0, 8)
  const format = filter.format ?? 'any'
  if (words.length > 0 || format !== 'any') {
    const kept = [current, OLDER, ...(DEMO ? LIBRARY : [])].filter((r) => matchesFilter(r, filter))
    const projects = kept.length > 0 ? [{ projectId: PROJECT, title: PROJECT_TITLE, count: kept.length }] : []
    return { reports: kept, projects, nextCursor: null }
  }
  // The demo's library (demo-library.ts): five more on the first page.
  const first = DEMO ? LIBRARY : []
  const projects = [{ projectId: PROJECT, title: PROJECT_TITLE, count: 2 + first.length }]
  if (cursor === 'page-2') return { reports: [OLDER], projects, nextCursor: null }
  return { reports: [current, ...first], projects, nextCursor: 'page-2' }
}

/** The edit a request's body carries, or null when it carries none. */
function editOf(body: unknown): { summary: string; expectedRevision: number } | null {
  if (typeof body !== 'string') return null
  const parsed: unknown = JSON.parse(body)
  if (typeof parsed !== 'object' || parsed === null || !('summary' in parsed) || !('expectedRevision' in parsed)) {
    return null
  }
  const { summary, expectedRevision } = parsed
  return typeof summary === 'string' && typeof expectedRevision === 'number' ? { summary, expectedRevision } : null
}

/**
 * A description edit, as `PATCH /artifacts/{id}/summary` answers it: saved when it names the revision the API holds,
 * else refused as stale (someone changed it first), as the API does.
 */
export function editDescription(d: Description, body: unknown, author: string): { next: Description; reply: Response } {
  const edit = editOf(body)
  if (!edit || edit.expectedRevision !== d.revision) {
    const refusal = {
      code: 'stale_revision',
      message: 'The description changed',
      requestId: '00000000-0000-4000-8000-0000000000b9',
      retry: 'never',
    }
    return { next: d, reply: new Response(JSON.stringify(refusal), { status: 409 }) }
  }
  const next = { text: edit.summary, revision: d.revision + 1, author }
  return {
    next,
    reply: new Response(JSON.stringify(summaryOf(next)), { headers: { 'content-type': 'application/json' } }),
  }
}
