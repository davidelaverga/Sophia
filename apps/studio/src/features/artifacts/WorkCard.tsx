// A research task as the team sees it (plan §2.8.2): its state in words, how long and how much of its allowance it
// has used, the question, and once delivered one row per output. The whole row opens the viewer; a separate
// Download saves that version. The footer opens the viewer on its sources and limitations. A report delivered
// without the PDF it asked for offers editors "Try PDF again" (RetryPdf). Hold and Stop live on its goal
// (WorkControls), as for every task, a PDF rendering again included.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { ArtifactVersion, NativeTask, NativeTaskDetail, ResearchProgress } from '@sophia/contracts'
import { Icon, Tag } from '@sophia/ui'
import { listArtifactVersions } from '../../api/artifacts.ts'
import { getNativeTask } from '../../api/conversation.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useDocumentViewer, type OpenRequest } from './DocumentViewer.tsx'
import { downloadSource } from './download.ts'
import { RetryPdf } from './RetryPdf.tsx'
import {
  elapsedText,
  formatBytes,
  progressRatio,
  progressText,
  reportFilename,
  researchState,
  spendText,
  type StateWords,
} from './report-view.ts'
import { useTransientStatus } from './useTransientStatus.ts'
import './artifacts.css'

type Output = NonNullable<NonNullable<NativeTaskDetail['result']>['outputs']>[number]

interface Props {
  task: NativeTask
  projectId: string
  identity: Identity
  /** Editors and admins may ask for a missing PDF again; viewers read. */
  canAct?: boolean
}

const ACTIVE: ReadonlySet<NativeTask['phase']> = new Set(['queued', 'dispatched', 'running', 'holding', 'stopping'])

/** How often the detail is read again: while the task runs, and faster while its PDF renders again. */
const pollEvery = (task: NativeTask, detail: NativeTaskDetail | undefined): number | false => {
  if (ACTIVE.has(task.phase)) return 15_000
  return detail?.research?.pdfRendering ? 5_000 : false
}

/**
 * The task's detail (question, spend, outputs), read again while it runs or its PDF renders, and whenever its phase
 * or result changes; its state in words; and the delivered version the footer describes (a rendition publishes a
 * new one).
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
  const versions = useQuery({
    queryKey: ['report-versions', task.artifactId, latest, identity.name],
    queryFn: () => listArtifactVersions(identity.token, task.artifactId ?? ''),
    enabled: task.artifactId !== undefined && outputs.length > 0,
  }).data
  return {
    research,
    outputs,
    versions,
    words: researchState(task, outputs, research?.outputs ?? ['markdown'], research ?? {}),
    current: versions?.find((v) => v.id === latest),
  }
}

/** Opens this task's report in the viewer; null where there is no viewer or no report yet. */
function useOpen(artifactId: string | undefined): Open | null {
  const viewer = useDocumentViewer()
  return viewer && artifactId ? (r) => viewer.open({ artifactId, ...r }) : null
}

/** A clock that moves once a minute while the task runs, for the elapsed time. */
function useMinute(running: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return undefined
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [running])
  return now
}

/** "Try PDF again" is offered to editors on a partly delivered report whose PDF is not already rendering again. */
const offersRetry = (canAct: boolean, words: StateWords, research: ResearchProgress | undefined) =>
  canAct && words.state === 'partial' && research !== undefined && !research.pdfRendering

export function WorkCard(props: Props) {
  const { task, identity, projectId, canAct = false } = props
  const { research, outputs, versions, words, current } = useResearch(props)
  const now = useMinute(ACTIVE.has(task.phase))
  const open = useOpen(task.artifactId)
  const retry = offersRetry(canAct, words, research)
  return (
    <li className="task work-card" data-state={words.state}>
      <CardHead words={words} task={task} research={research} now={now} />
      <p className="work-card-question">{research?.question ?? 'Research'}</p>
      {words.state === 'researching' && research && <Progress research={research} />}
      <Outputs outputs={outputs} versions={versions} token={identity.token} open={open} />
      {words.note && <p className="goal-outcome">{words.note}</p>}
      {retry && <RetryPdf projectId={projectId} taskId={task.id} token={identity.token} />}
      {current && open && <CardFoot version={current} open={open} />}
    </li>
  )
}

type Open = (r: Omit<OpenRequest, 'artifactId'>) => void

interface OutputsProps {
  outputs: readonly Output[]
  versions: readonly ArtifactVersion[] | undefined
  token: string
  open: Open | null
}

/** One row per delivered output, side by side (stacked in a narrow card). */
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
  const asked = new Date(task.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
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

/** "Markdown · 8.1 KB · v2". */
const outputMeta = (output: Output, version: ArtifactVersion | undefined) =>
  [
    output.format === 'pdf' ? 'PDF' : 'Markdown',
    formatBytes(output.byteLength),
    version?.versionNumber ? `v${version.versionNumber}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

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
        aria-label={`Open ${name}`}
      >
        <span className="report-tile" data-format={output.format} aria-hidden>
          {output.format === 'pdf' ? 'PDF' : 'MD'}
        </span>
        <span className="output-name">{name}</span>
        <span className="output-meta">{outputMeta(output, version)}</span>
        <span className="output-hint" aria-hidden>
          Open
        </span>
      </button>
      <button type="button" className="ghost" onClick={() => void download()} aria-label={`Download ${name}`}>
        <Icon name="download" />
        <span className="output-download-label">Download</span>
      </button>
      {status.text && (
        <p className="output-status" role="status" data-error={status.error || undefined}>
          {status.text}
        </p>
      )}
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
        <button type="button" className="text-button" onClick={() => open({ versionId: version.id, tab: 'document' })}>
          {limits} {limits === 1 ? 'limitation' : 'limitations'}
        </button>
      )}
    </div>
  )
}
