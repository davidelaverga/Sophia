// Labelled fixture data for the report viewer's checks (e2e/report.spec.ts, SMC-M03): one research report with a
// first version and, once the check publishes it, a second; the finished research task a chat notice names; and the
// API's answers for them, typed against the contracts. Nothing here is live.
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

export const REPORT = '00000000-0000-4000-8000-0000000000b1'
export const TASK = '00000000-0000-4000-8000-0000000000b2'
const EXCHANGE = '00000000-0000-4000-8000-0000000000ae'
const AT = '2026-10-02T00:00:00.000Z'

/** The one page every version cites. */
const CITED = '00000000-0000-4000-8000-0000000000c9'
/** An id that is none of a version's sources, which version 3 names in a link (CX-0019). */
const STRAY = '00000000-0000-4000-8000-0000000000ca'

/** The fixture report's title. */
export const TITLE = 'Fixture report'
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
const TEXTS: readonly Text[] = [
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

/** A text's size in bytes, as the API counts it. */
const byteLengthOf = (text: string) => new TextEncoder().encode(text).byteLength

/** What 0027 section_facts gives for the second version against the first: its recommendations revised, alone. */
const V2_FACTS: NonNullable<ArtifactVersion['changeFacts']> = {
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
}

/** The id of version `n` (1-based). */
export const versionId = (n: number) => `00000000-0000-4000-8000-0000000000d${String(n)}`

function version(n: number, title: string): ArtifactVersion {
  const text = TEXTS[n - 1]
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
    ...(n === 2 ? { changeFacts: V2_FACTS } : {}),
  }
}

/** The report's versions as the API lists them, newest first: `published` of them. */
export const versions = (published: number, title = TITLE): ArtifactVersion[] =>
  Array.from({ length: published }, (_, i) => version(published - i, title))

/** What a version cites, as `GET …/versions/{id}/sources` answers it: the one page, read in full. */
export const citedSources: ReportSourceList = {
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

/**
 * A version's Markdown, inline, as `GET /sources/{id}/content` answers it; null for a source it does not hold.
 * `tampered` (`tamper=text`): the text with one space more and the record's sha256 kept, bytes no record names.
 */
export function content(sourceId: string, tampered = false): SourceContent | null {
  const text = TEXTS.find((t) => t.sourceId === sourceId)
  if (!text) return null
  const served = tampered ? `${text.text} ` : text.text
  return {
    sourceId,
    sha256: text.sha256,
    mime: 'text/markdown',
    byteLength: byteLengthOf(served),
    filename: 'fixture-report.md',
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
  instruction: 'A labelled fixture question.',
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

/**
 * The same task's record once its result is revised (`window.fixture.noticeRevised`, CX-0022): its result is version
 * `n`'s Markdown, the files a card opens and saves.
 */
export function researchTaskAt(n: 1 | 2): NativeTaskDetail {
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
  return {
    ...researchTask,
    task: { ...researchTask.task, resultSourceId: text.sourceId },
    result: { ...result, outputs: [file] },
  }
}

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
  displayName: 'Fixture guest',
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
  text: 'A labelled fixture report, as Sophia described it.',
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

/** An older report on Knowledge's second page (`cursor=page-2`): More reports brings it. */
const OLDER: ReportList['reports'][number] = {
  artifactId: '00000000-0000-4000-8000-0000000000e1',
  projectId: PROJECT,
  projectTitle: 'Fixture project',
  title: 'An older fixture report',
  summary: null,
  summaryAuthorId: null,
  summaryRevision: 1,
  summaryUpdatedAt: null,
  currentVersionId: '00000000-0000-4000-8000-0000000000e2',
  currentVersionNumber: 1,
  versionCount: 1,
  updatedAt: AT,
  // Printed before PDFs were turned off: Knowledge offers its format filter once such a report is in the list.
  formats: ['markdown', 'pdf'],
  latestChange: { note: null, retained: null },
}

/** A text's searchable words: letters and digits only, lower case. */
const wordsOf = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

/**
 * Knowledge's Reports, as `GET /knowledge/reports` answers it: the fixture report's card (`published` versions in) on
 * the first page, and an older report, with a PDF, on the second. Words and a format filter as the API does (each word
 * a prefix, all of them required, over the title, the description and the latest notes; `pdf` or `markdown_only`), in
 * one page; a project is listed only with at least one report.
 */
export function reportList(
  published: number,
  d: Description,
  cursor: string | null,
  filter: { q: string | null; format: string | null } = { q: null, format: null },
): ReportList {
  const s = summaryOf(d)
  const current: ReportList['reports'][number] = {
    artifactId: REPORT,
    projectId: PROJECT,
    projectTitle: 'Fixture project',
    title: 'Fixture report',
    summary: s.summary,
    summaryAuthorId: s.summaryAuthorId,
    summaryRevision: s.summaryRevision,
    summaryUpdatedAt: s.summaryUpdatedAt,
    currentVersionId: versionId(published),
    currentVersionNumber: published,
    versionCount: published,
    updatedAt: AT,
    formats: ['markdown'],
    latestChange: { note: null, retained: null },
  }
  const words = wordsOf(filter.q ?? '').slice(0, 8)
  const format = filter.format ?? 'any'
  if (words.length > 0 || format !== 'any') {
    const kept = [current, OLDER].filter((r) => {
      const text = wordsOf(
        `${r.title} ${r.summary ?? ''} ${r.latestChange.note ?? ''} ${r.latestChange.retained ?? ''}`,
      )
      const pdf = r.formats.includes('pdf')
      const found = words.every((w) => text.some((t) => t.startsWith(w)))
      return found && (format === 'any' || (format === 'pdf') === pdf)
    })
    const projects = kept.length > 0 ? [{ projectId: PROJECT, title: 'Fixture project', count: kept.length }] : []
    return { reports: kept, projects, nextCursor: null }
  }
  const projects = [{ projectId: PROJECT, title: 'Fixture project', count: 2 }]
  if (cursor === 'page-2') return { reports: [OLDER], projects, nextCursor: null }
  return { reports: [current], projects, nextCursor: 'page-2' }
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
