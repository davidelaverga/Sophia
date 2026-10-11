// A research task as the team sees it (plan §2.8.2): its state in words, how long and how much of its allowance it
// has used, the question, and once delivered one row per output. The whole row opens the viewer; a separate
// Download saves that version. An HTML page asked for is designed after the research (SDD-01): until it is published
// its row says what the design is doing (designing, reviewing) or why there is none; once published it is an output
// row like the others, with how it was reviewed. The footer opens the viewer on its sources and limitations. A report
// delivered without the PDF it asked for offers editors "Try PDF again" (RetryPdf). Hold and Stop live on its goal
// (WorkControls), as for every task, a PDF rendering again included.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import type { ArtifactVersion, NativeTask, NativeTaskDetail, ResearchProgress } from '@sophia/contracts'
import { Card, Icon, Tag } from '@sophia/ui'
import { listArtifactVersions } from '../../api/artifacts.ts'
import { getNativeTask } from '../../api/conversation.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useDocumentViewer, type OpenRequest } from './DocumentViewer.tsx'
import { downloadSource } from './download.ts'
import { reviewTag } from './HtmlView.tsx'
import { RetryPdf } from './RetryPdf.tsx'
import {
  elapsedText,
  formatBytes,
  progressRatio,
  progressText,
  reportFilename,
  researchState,
  spendText,
  type DetailRead,
  type StateWords,
} from './report-view.ts'
import { useTransientStatus } from './useTransientStatus.ts'
import './artifacts.css'
import { WORKING_PHASES } from '../voice/room-view.ts'
import { clock } from '../../app/time-words.ts'
import { useNow } from '../../app/use-now.ts'
import { TASK } from '../resources/link.ts'
import { useAddressed } from '../resources/useAddressed.ts'

type Output = NonNullable<NonNullable<NativeTaskDetail['result']>['outputs']>[number]

interface Props {
  task: NativeTask
  projectId: string
  identity: Identity
  /** Editors and admins may ask for a missing PDF again; viewers read. */
  canAct?: boolean
}

/** A task still at work: the room's set, so the two never disagree. */
const ACTIVE = WORKING_PHASES

/** How often the detail is read again: while the task runs, and faster while its PDF renders again. */
const pollEvery = (task: NativeTask, detail: NativeTaskDetail | undefined): number | false => {
  if (ACTIVE.has(task.phase)) return 15_000
  return detail?.research?.pdfRendering ? 5_000 : false
}

/** Whether the detail is in hand: still being read, not readable (the reply's own words), or read. */
const detailRead = (q: { isPending: boolean; error: Error | null }): DetailRead => {
  if (q.error) return { status: 'failed', message: q.error.message }
  return q.isPending ? { status: 'reading' } : { status: 'read' }
}

/**
 * The task's detail (question, spend, outputs), read again while it runs or its PDF renders, and whenever its phase
 * or result changes; its state in words, which say whether that detail is still being read or could not be; and the
 * delivered version the footer describes (a rendition publishes a new one). Outputs read before a read again failed
 * stay shown.
 */
function useResearch({ task, projectId, identity }: Props) {
  const detail = useQuery({
    queryKey: ['native-task', projectId, task.id, task.phase, task.resultSourceId, identity.name],
    queryFn: () => getNativeTask(identity.token, projectId, task.id),
    refetchInterval: (q) => pollEvery(task, q.state.data),
  })
  const outputs = detail.data?.result?.outputs ?? []
  const research = detail.data?.research
  const latest = outputs[0]?.artifactVersionId
  // A version published since (an amendment, Try PDF again) reaches an open viewer at once: it offers it (ART-02).
  // Only on a change: a card mounting or a phase moving reads nothing again.
  const client = useQueryClient()
  const seen = useRef(latest)
  useEffect(() => {
    const before = seen.current
    seen.current = latest
    if (latest && before && latest !== before && task.artifactId) {
      void client.invalidateQueries({ queryKey: ['report-versions', task.artifactId] })
    }
  }, [client, latest, task.artifactId])
  const versions = useQuery({
    queryKey: ['report-versions', task.artifactId, latest, identity.name],
    queryFn: () => listArtifactVersions(identity.token, task.artifactId ?? ''),
    enabled: task.artifactId !== undefined && outputs.length > 0,
  }).data
  return {
    research,
    outputs,
    versions,
    words: researchState(task, outputs, research?.outputs ?? ['markdown'], research ?? {}, detailRead(detail)),
    current: versions?.find((v) => v.id === latest),
  }
}

/** Opens this task's report in the viewer; null where there is no viewer or no report yet. */
function useOpen(artifactId: string | undefined): Open | null {
  const viewer = useDocumentViewer()
  return viewer && artifactId ? (r) => viewer.open({ artifactId, ...r }) : null
}

/** "Try PDF again" is offered to editors on a report missing its PDF, while that PDF is not already rendering again. */
const offersRetry = (canAct: boolean, words: StateWords, research: ResearchProgress | undefined) =>
  canAct && words.missing === 'pdf' && research !== undefined && !research.pdfRendering

/**
 * Named in the address (`#task-<id>`, as a line of Updates names it): the card takes the focus and comes into view,
 * as a plan's tile would open its sheet (useOpenTask); a card has no sheet of its own.
 */
function useNamedCard(taskId: string) {
  const named = useAddressed(TASK)
  useEffect(() => {
    if (named.id !== taskId) return
    const card = document.querySelector<HTMLElement>(`.work-card[data-task="${CSS.escape(taskId)}"]`)
    card?.focus({ preventScroll: true })
    card?.scrollIntoView({ block: 'center' })
  }, [named, taskId])
}

export function WorkCard(props: Props) {
  const { task, identity, projectId, canAct = false } = props
  useNamedCard(task.id)
  const { research, outputs, versions, words, current } = useResearch(props)
  const now = useNow()
  const open = useOpen(task.artifactId)
  const retry = offersRetry(canAct, words, research)
  return (
    // The card takes the focus when a control inside it goes (Try PDF again, once the PDF renders again).
    <Card as="li" className="task work-card" data-state={words.state} data-task={task.id} tabIndex={-1}>
      <CardHead words={words} task={task} research={research} now={now} />
      <p className="work-card-question">{research?.question ?? 'Research'}</p>
      {words.state === 'researching' && research && <Progress research={research} />}
      <Outputs outputs={outputs} versions={versions} token={identity.token} open={open} />
      <DesignRow html={research?.html} projectId={projectId} identity={identity} researchTaskId={task.id} />
      {words.note && <p className="goal-outcome">{words.note}</p>}
      {retry && <RetryPdf projectId={projectId} taskId={task.id} token={identity.token} />}
      {current && open && <CardFoot version={current} open={open} />}
    </Card>
  )
}

type Open = (r: Omit<OpenRequest, 'artifactId'>) => void

interface OutputsProps {
  outputs: readonly Output[]
  versions: readonly ArtifactVersion[] | undefined
  token: string
  open: Open | null
}

/** One row per delivered output, side by side (stacked in a narrow card): only what the task actually stored. */
function Outputs({ outputs, versions, token, open }: OutputsProps) {
  if (outputs.length === 0) return null
  return (
    <div className="work-card-outputs">
      {outputs.map((o) => (
        <OutputRow
          key={`${o.artifactVersionId}:${o.format}`}
          output={o}
          version={versions?.find((v) => v.id === o.artifactVersionId)}
          token={token}
          onOpen={open ? () => open({ versionId: o.artifactVersionId, format: o.format }) : null}
        />
      ))}
    </div>
  )
}

type HtmlProgress = NonNullable<ResearchProgress['html']>

/** How often an HTML design is read again while it runs: often enough to see it move from designing to reviewing. */
const DESIGN_POLL = 15_000

/** The design states after which the research's own record says what became of the page. */
const DESIGN_ENDED: ReadonlySet<string> = new Set(['published', 'failed', 'cancelled', 'superseded'])

/**
 * The design task's own state, while the research's says it is designing: designing, or with its reviewer. Once the
 * design has ended the research's record is read again, so the card shows the page (or why there is none) without a
 * reload (B-19, B-24): the research task's own phase does not move when its page is published.
 */
function useDesignState(html: HtmlProgress, rest: { projectId: string; identity: Identity; researchTaskId: string }) {
  const { projectId, identity, researchTaskId } = rest
  const live = html.state === 'designing' && html.designTaskId !== undefined
  const detail = useQuery({
    queryKey: ['native-task', projectId, html.designTaskId, identity.name],
    queryFn: () => getNativeTask(identity.token, projectId, html.designTaskId ?? ''),
    enabled: live,
    refetchInterval: live ? DESIGN_POLL : false,
  })
  const state = live ? detail.data?.design?.state : undefined
  const client = useQueryClient()
  useEffect(() => {
    if (state && DESIGN_ENDED.has(state))
      void client.invalidateQueries({ queryKey: ['native-task', projectId, researchTaskId] })
  }, [client, state, projectId, researchTaskId])
  return state
}

/** The HTML page's row before it is published: what the design is doing, or why there is no page. */
function designWords(html: HtmlProgress, design: string | undefined): { tag: string; meta: string } {
  if (html.state === 'failed' || html.state === 'not_started') return { tag: 'Not designed', meta: html.reason ?? '' }
  if (html.state === 'requested') return { tag: 'Asked for', meta: 'Designed once the research is published' }
  if (design === 'reviewing') return { tag: 'Reviewing', meta: 'A separate visual reviewer is checking the page' }
  return { tag: 'Designing', meta: 'Designed after the research, from its published report' }
}

interface DesignRowProps {
  projectId: string
  identity: Identity
  /** The research task whose page it is: read again when the design ends. */
  researchTaskId: string
}

/** The HTML page asked for, until it is published (then it is an output row); nothing when none was asked for. */
function DesignRow({ html, ...rest }: DesignRowProps & { html: HtmlProgress | undefined }) {
  return html && html.state !== 'published' ? <DesignState html={html} {...rest} /> : null
}

function DesignState({ html, ...rest }: DesignRowProps & { html: HtmlProgress }) {
  const words = designWords(html, useDesignState(html, rest))
  return (
    <div className="output-row" data-design={html.state}>
      <div className="output-open" aria-live="polite">
        <span className="report-tile" data-format="html" aria-hidden>
          HTML
        </span>
        <span className="output-name">HTML page · {words.tag}</span>
        <span className="output-meta">{words.meta}</span>
      </div>
    </div>
  )
}

function CardHead({
  words,
  task,
  research,
  now,
}: {
  words: StateWords
  task: NativeTask
  research: ResearchProgress | undefined
  now: number
}) {
  const asked = clock(task.createdAt)
  return (
    <div className="goal-meta work-card-head">
      <Tag tone={words.tone}>{words.label}</Tag>
      <span className="muted">Research report · asked {asked}</span>
      <span className="work-card-spend">
        {words.state === 'researching' && <span>{elapsedText(task.createdAt, now)}</span>}
        {research && <span>{spendText(research)}</span>}
      </span>
    </div>
  )
}

function Progress({ research }: { research: ResearchProgress }) {
  const ratio = progressRatio(research)
  return (
    <div className="work-card-progress">
      <div
        className="work-card-bar"
        role="progressbar"
        aria-label="Allowance used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <span style={{ width: `${(ratio * 100).toFixed(1)}%` }} />
      </div>
      <span className="muted">{progressText(research)}</span>
    </div>
  )
}

interface RowProps {
  output: Output
  version: ArtifactVersion | undefined
  token: string
  onOpen: (() => void) | null
}

/** The row's file name, as it downloads, once the version is known. */
const nameOf = (output: Output, version: ArtifactVersion | undefined) =>
  version ? reportFilename(version.title ?? 'report', version.versionNumber ?? null, output.format) : 'Report'

/** "Markdown · 8.1 KB · v2"; a designed page also says how it was reviewed. */
const outputMeta = (output: Output, version: ArtifactVersion | undefined) =>
  [
    formatName(output.format),
    formatBytes(output.byteLength),
    version?.versionNumber ? `v${version.versionNumber}` : null,
    output.format === 'html' ? reviewTag(output.reviewState) : null,
  ]
    .filter(Boolean)
    .join(' · ')

const FORMAT_NAME: Record<Output['format'], string> = { markdown: 'Markdown', pdf: 'PDF', html: 'HTML page' }
const TILE: Record<Output['format'], string> = { markdown: 'MD', pdf: 'PDF', html: 'HTML' }

/** A row's format, said: two rows of one report differ by it (the name alone is "Report" until the versions load). */
const formatName = (format: Output['format']) => FORMAT_NAME[format]

function OutputRow({ output, version, token, onOpen }: RowProps) {
  const status = useTransientStatus()
  const name = nameOf(output, version)
  const download = async () => {
    try {
      const saved = await downloadSource(token, output.sourceId, output.sha256)
      status.show(`Downloading ${saved.filename} · ${formatBytes(saved.byteLength)}`)
    } catch (err: unknown) {
      status.show(err instanceof Error ? err.message : 'The download didn’t start. Try again.', true)
    }
  }
  return (
    <div className="output-row">
      <button
        type="button"
        className="output-open"
        onClick={onOpen ?? undefined}
        disabled={!onOpen}
        aria-label={`Open ${name}, ${formatName(output.format)}`}
      >
        <span className="report-tile" data-format={output.format} aria-hidden>
          {TILE[output.format]}
        </span>
        <span className="output-name">{name}</span>
        <span className="output-meta">{outputMeta(output, version)}</span>
        <span className="output-hint" aria-hidden>
          Open
        </span>
      </button>
      <button
        type="button"
        className="ghost"
        onClick={() => void download()}
        aria-label={`Download ${name}, ${formatName(output.format)}`}
      >
        <Icon name="download" />
        <span className="output-download-label">Download</span>
      </button>
      {/* There before it speaks: a live region added with its words is often not read. */}
      <p className="output-status" role="status" data-error={status.error || undefined}>
        {status.text}
      </p>
    </div>
  )
}

function CardFoot({ version, open }: { version: ArtifactVersion; open: Open }) {
  const cited = version.changeFacts?.cited ?? null
  const limits = version.limitations?.length ?? 0
  return (
    <div className="work-card-foot">
      {cited !== null && (
        <button type="button" className="text-button" onClick={() => open({ versionId: version.id, tab: 'sources' })}>
          {cited} {cited === 1 ? 'source' : 'sources'}
        </button>
      )}
      {limits > 0 && (
        // The limitations head the Markdown (the PDF view shows the pages only), so they open it.
        <button
          type="button"
          className="text-button"
          onClick={() => open({ versionId: version.id, tab: 'document', format: 'markdown' })}
        >
          {limits} {limits === 1 ? 'limitation' : 'limitations'}
        </button>
      )}
    </div>
  )
}
