// An HTML page design (SDD-01) as the team sees it: designed after the research, from the report version it names. Its
// state in words (designing, with its separate reviewer, published, or why there is no page), the version it designs,
// and once published its page: the row opens the stored page in the viewer, and Download saves the same bytes after
// their hash is checked. Hold and Stop live on its goal (WorkControls), as for every task.
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TaskRefused } from './TaskRefused.tsx'
import { useOwnedTaskDetail } from './task-detail.ts'
import { ReportRefused } from './ReportRefused.tsx'
import { useReportFence } from './report-read.ts'
import type { NativeTask, NativeTaskDetail } from '@sophia/contracts'
import { Button, Card, Icon, Tag } from '@sophia/ui'
import { retryFailedDesign } from '../../api/artifacts.ts'
import { ApiError } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useDocumentViewer } from './DocumentViewer.tsx'
import { downloadSource } from './download.ts'
import { reviewTag } from './HtmlView.tsx'
import { designState, formatBytes } from './report-view.ts'
import { useTransientStatus } from './useTransientStatus.ts'
import './artifacts.css'
import { WORKING_PHASES } from '../voice/room-view.ts'

interface Props {
  task: NativeTask
  projectId: string
  identity: Identity
}

type Output = NonNullable<NonNullable<NativeTaskDetail['result']>['outputs']>[number]

/** A task still at work: the room's set, as the work card uses it. */
const ACTIVE = WORKING_PHASES

/** The design's detail, read again while it runs; its words; and its published page, once there is one. */
function useDesign({ task, projectId, identity }: Props) {
  // The task's own refusal (task-detail-read.ts) withholds its detail: design state, base version, page.
  const { detail, refused } = useOwnedTaskDetail({
    queryKey: ['native-task', projectId, task.id, task.phase, task.resultSourceId, identity.name],
    projectId,
    taskId: task.id,
    identity,
    refetchInterval: ACTIVE.has(task.phase) ? 15_000 : false,
  })
  const design = detail?.design
  const words = design ? designState(design) : { label: 'Designing', tone: 'lav' as const, note: null }
  return { refused, design, words, page: detail?.result?.outputs?.find((o) => o.format === 'html') }
}

/** "HTML page design · from report v2". */
const designOf = (design: NativeTaskDetail['design']) =>
  `HTML page design${design?.baseVersionNumber ? ` · from report v${design.baseVersionNumber}` : ''}`

export function DesignCard(props: Props) {
  const { task, identity } = props
  const { refused, design, words, page } = useDesign(props)
  // Its own detail refused (task-detail-read.ts): only that refusal and its retry, never the normal Designing status.
  if (refused)
    return (
      <Card as="li" className="task work-card" data-state="refused" data-task={props.task.id} tabIndex={-1}>
        <TaskRefused projectId={props.projectId} taskId={task.id} identity={identity} />
      </Card>
    )
  return (
    <Card
      as="li"
      className="task work-card"
      data-state={design?.state ?? 'designing'}
      data-task={props.task.id}
      tabIndex={-1}
    >
      <div className="goal-meta work-card-head">
        <Tag tone={words.tone}>{words.label}</Tag>
        <span className="muted">{designOf(design)}</span>
      </div>
      {words.note && <p className="goal-outcome">{words.note}</p>}
      {design?.state === 'failed' && (
        <RetryDesign design={design} projectId={props.projectId} taskId={task.id} identity={identity} />
      )}
      {page && task.artifactId && <PageRow page={page} artifactId={task.artifactId} identity={identity} />}
    </Card>
  )
}

type Retrying = { state: 'idle' | 'sending' | 'sent'; failed: string | null }

/**
 * A failed design tried again (A42): its editor is offered Try again only under the owner's fresh spend approval, which
 * the retry names; otherwise the card says what it needs, with Check again to read the design once the owner has acted.
 * One key per card, so a resend is the same retry.
 */
function RetryDesign(props: {
  design: NonNullable<NativeTaskDetail['design']>
  projectId: string
  taskId: string
  identity: Identity
}) {
  const { design, projectId, taskId, identity } = props
  const key = useRef(crypto.randomUUID())
  const [sending, setSending] = useState<Retrying>({ state: 'idle', failed: null })
  const client = useQueryClient()
  const retry = design.retry
  // Once admitted, the failed design offers nothing more (a later one exists): what was asked stays said.
  if (sending.state === 'sent')
    return (
      <p className="output-status" role="status">
        Sophia designs this page again from the same report.
      </p>
    )
  if (!retry) return null
  if (retry.approval !== 'fresh' || retry.grantRevision === undefined || retry.approvalRef === undefined)
    return <AwaitingApproval approval={retry.approval} projectId={projectId} taskId={taskId} />
  const body = { versionId: design.baseVersionId, grantRevision: retry.grantRevision, approvalRef: retry.approvalRef }
  const send = async () => {
    setSending({ state: 'sending', failed: null })
    try {
      await retryFailedDesign(identity.token, projectId, taskId, key.current, body)
      setSending({ state: 'sent', failed: null })
      await client.invalidateQueries({ queryKey: ['native-task', projectId] })
    } catch (err: unknown) {
      setSending({
        state: 'idle',
        failed: err instanceof Error ? err.message : 'Couldn’t try again. Try again in a moment.',
      })
      // A refusal of the approval named (the owner approved again, or a retry used it): the failed card is not polled,
      // so read its detail again, and the next press names what is current. Nothing is sent again by itself, and the
      // key stays: nothing was admitted under it. A lost or unknown reply is not this, and keeps what it named.
      if (err instanceof ApiError && err.code === 'stale_revision')
        await client.invalidateQueries({ queryKey: ['native-task', projectId, taskId] })
    }
  }
  return (
    <div className="work-card-retry" data-retry="fresh">
      <Button kind="ghost" size="sm" disabled={sending.state !== 'idle'} onClick={() => void send()}>
        Try again
      </Button>
      <p className="output-status" role="status" data-error={sending.failed ? true : undefined}>
        {sending.failed}
      </p>
    </div>
  )
}

/**
 * A failed design waiting on its owner: what they must do, and Check again. Their approval changes nothing the page
 * watches (the failed card is not polled), so the person reads the design again when they choose. A read only: Try
 * again, if it is then offered, is still theirs to press.
 */
function AwaitingApproval(props: { approval: 'fresh' | 'stale' | 'closed'; projectId: string; taskId: string }) {
  const { approval, projectId, taskId } = props
  const [checking, setChecking] = useState<{ busy: boolean; failed: string | null }>({ busy: false, failed: null })
  const client = useQueryClient()
  const check = async () => {
    setChecking({ busy: true, failed: null })
    try {
      await client.refetchQueries({ queryKey: ['native-task', projectId, taskId] }, { throwOnError: true })
      setChecking({ busy: false, failed: null })
    } catch (err: unknown) {
      setChecking({
        busy: false,
        failed: err instanceof Error ? err.message : 'Couldn’t check. Try again in a moment.',
      })
    }
  }
  return (
    <div className="work-card-retry" data-retry={approval}>
      <p className="goal-outcome muted">
        {approval === 'closed'
          ? 'Trying again needs the project owner to switch research on.'
          : 'Trying again needs a new spend approval from the project owner.'}
      </p>
      <Button kind="ghost" size="sm" disabled={checking.busy} onClick={() => void check()}>
        Check again
      </Button>
      <p className="output-status" role="status" data-error={checking.failed ? true : undefined}>
        {checking.busy ? 'Checking…' : checking.failed}
      </p>
    </div>
  )
}

/** The design's page, the report's own published rendition (its task writes into `artifactId`): obeys its fence. */
function PageRow(props: { page: Output; artifactId: string; identity: Identity }) {
  const refused = useReportFence(props.artifactId)
  if (refused) return <ReportRefused artifactId={props.artifactId} identity={props.identity} />
  return <ShownPageRow {...props} />
}

function ShownPageRow({ page, artifactId, identity }: { page: Output; artifactId: string; identity: Identity }) {
  const viewer = useDocumentViewer()
  const status = useTransientStatus()
  const client = useQueryClient()
  const download = async () => {
    try {
      // The report's own output: its content read is that report's (download.ts ownedContent).
      const saved = await downloadSource(identity.token, page.sourceId, page.sha256, undefined, { client, artifactId })
      status.show(`Downloading ${saved.filename} · ${formatBytes(saved.byteLength)}`)
    } catch (err: unknown) {
      status.show(err instanceof Error ? err.message : 'The download didn’t start. Try again.', true)
    }
  }
  const open = viewer ? () => viewer.open({ artifactId, versionId: page.artifactVersionId, format: 'html' }) : undefined
  return (
    <div className="work-card-outputs">
      <div className="output-row">
        <button type="button" className="output-open" onClick={open} disabled={!open} aria-label="Open the HTML page">
          <span className="report-tile" data-format="html" aria-hidden>
            HTML
          </span>
          <span className="output-name">HTML page</span>
          <span className="output-meta">{[formatBytes(page.byteLength), reviewTag(page.reviewState)].join(' · ')}</span>
          <span className="output-hint" aria-hidden>
            Open
          </span>
        </button>
        <button type="button" className="ghost" onClick={() => void download()} aria-label="Download the HTML page">
          <Icon name="download" />
          <span className="output-download-label">Download</span>
        </button>
        <p className="output-status" role="status" data-error={status.error || undefined}>
          {status.text}
        </p>
      </div>
    </div>
  )
}
