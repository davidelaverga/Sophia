// An HTML page design (SDD-01) as the team sees it: designed after the research, from the report version it names. Its
// state in words (designing, with its separate reviewer, published, or why there is no page), the version it designs,
// and once published its page: the row opens the stored page in the viewer, and Download saves the same bytes after
// their hash is checked. Hold and Stop live on its goal (WorkControls), as for every task.
import { useQuery } from '@tanstack/react-query'
import type { NativeTask, NativeTaskDetail } from '@sophia/contracts'
import { Icon, Tag } from '@sophia/ui'
import { getNativeTask } from '../../api/conversation.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useDocumentViewer } from './DocumentViewer.tsx'
import { downloadSource } from './download.ts'
import { reviewTag } from './HtmlView.tsx'
import { designState, formatBytes } from './report-view.ts'
import { useTransientStatus } from './useTransientStatus.ts'
import './artifacts.css'

interface Props {
  task: NativeTask
  projectId: string
  identity: Identity
}

type Output = NonNullable<NonNullable<NativeTaskDetail['result']>['outputs']>[number]

const ACTIVE: ReadonlySet<NativeTask['phase']> = new Set(['queued', 'dispatched', 'running', 'holding', 'stopping'])

/** The design's detail, read again while it runs; its words; and its published page, once there is one. */
function useDesign({ task, projectId, identity }: Props) {
  const detail = useQuery({
    queryKey: ['native-task', projectId, task.id, task.phase, task.resultSourceId, identity.name],
    queryFn: () => getNativeTask(identity.token, projectId, task.id),
    refetchInterval: ACTIVE.has(task.phase) ? 15_000 : false,
  }).data
  const design = detail?.design
  const words = design ? designState(design) : { label: 'Designing', tone: 'lav' as const, note: null }
  return { design, words, page: detail?.result?.outputs?.find((o) => o.format === 'html') }
}

/** "HTML page design · from report v2". */
const designOf = (design: NativeTaskDetail['design']) =>
  `HTML page design${design?.baseVersionNumber ? ` · from report v${design.baseVersionNumber}` : ''}`

export function DesignCard(props: Props) {
  const { task, identity } = props
  const { design, words, page } = useDesign(props)
  return (
    <li className="task work-card" data-state={design?.state ?? 'designing'} tabIndex={-1}>
      <div className="goal-meta work-card-head">
        <Tag tone={words.tone}>{words.label}</Tag>
        <span className="muted">{designOf(design)}</span>
      </div>
      {words.note && <p className="goal-outcome">{words.note}</p>}
      {page && task.artifactId && <PageRow page={page} artifactId={task.artifactId} token={identity.token} />}
    </li>
  )
}

function PageRow({ page, artifactId, token }: { page: Output; artifactId: string; token: string }) {
  const viewer = useDocumentViewer()
  const status = useTransientStatus()
  const download = async () => {
    try {
      const saved = await downloadSource(token, page.sourceId, page.sha256)
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
