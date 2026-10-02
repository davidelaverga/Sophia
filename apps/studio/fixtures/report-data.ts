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

/** The one page both versions cite. */
const CITED = '00000000-0000-4000-8000-0000000000c9'

interface Text {
  sourceId: string
  sha256: string
  text: string
}

/** Each version's Markdown, with its SHA-256 (the viewer shows nothing that does not match it). */
const TEXTS: readonly Text[] = [
  {
    sourceId: '00000000-0000-4000-8000-0000000000c1',
    sha256: '9bc1b3fd2e5c11db643ae254a7967db35a33b83021c3f4e7aa4125e96a71af24',
    text: `# Fixture report\n\nThe first version of a labelled fixture report.\n\nIt cites one page [${CITED}].\n`,
  },
  {
    sourceId: '00000000-0000-4000-8000-0000000000c2',
    sha256: '666e6cd2c53cc82d83793d89e2cb1bb08180214cdf0e1628182da645a9e081af',
    text: `# Fixture report\n\nThe second version of a labelled fixture report, published while the first was read.\n\nIt cites one page [${CITED}].\n`,
  },
]

/** The id of version `n` (1-based). */
export const versionId = (n: number) => `00000000-0000-4000-8000-0000000000d${String(n)}`

function version(n: number): ArtifactVersion {
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
    title: 'Fixture report',
    versionNumber: n,
    createdAt: AT,
    renditions: [],
    limitations: [],
  }
}

/** The report's versions as the API lists them, newest first: `published` of them. */
export const versions = (published: number): ArtifactVersion[] =>
  Array.from({ length: published }, (_, i) => version(published - i))

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

/** A version's Markdown, inline, as `GET /sources/{id}/content` answers it; null for a source it does not hold. */
export function content(sourceId: string): SourceContent | null {
  const text = TEXTS.find((t) => t.sourceId === sourceId)
  if (!text) return null
  return {
    sourceId,
    sha256: text.sha256,
    mime: 'text/markdown',
    byteLength: new TextEncoder().encode(text.text).byteLength,
    filename: 'fixture-report.md',
    disposition: 'inline',
    text: text.text,
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
        byteLength: 125,
        limitations: [],
      },
    ],
  },
}

/** The bridge's notice for that task, as it reaches a reader in the room's chat. */
export const researchNotice = {
  kind: 'notice' as const,
  id: '00000000-0000-4000-8000-0000000000b7',
  exchangeId: EXCHANGE,
  taskId: TASK,
  taskKind: 'research',
  resultRevision: 1,
}

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
  formats: ['markdown'],
  latestChange: { note: null, retained: null },
}

/**
 * Knowledge's Reports, as `GET /knowledge/reports` answers it: the fixture report's card (`published` versions in) on
 * the first page, and an older report on the second.
 */
export function reportList(published: number, d: Description, cursor: string | null): ReportList {
  const projects = [{ projectId: PROJECT, title: 'Fixture project', count: 2 }]
  if (cursor === 'page-2') return { reports: [OLDER], projects, nextCursor: null }
  const s = summaryOf(d)
  return {
    reports: [
      {
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
      },
    ],
    projects,
    nextCursor: 'page-2',
  }
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
