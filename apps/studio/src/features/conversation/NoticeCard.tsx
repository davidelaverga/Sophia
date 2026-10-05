// A finished result's card in the chat, for every member, whether they hear Sophia or read her (SMC-M03 S6, plan
// §2.8, CX-0022): the words are Studio's, by the task's kind, never a report's title or anything a page said. Open
// shows the primary file in the viewer (the PDF when there is one, named explicitly: the viewer's own default is the
// Markdown), Download saves that same file after its hash is checked, and Markdown opens the Markdown beside a PDF
// (noticeActions, RF-0020). When the task has a designed HTML page (SDD-01), HTML page opens that stored page in the
// viewer, whose Download saves the same bytes (without a viewer, it saves them); a task without one offers none.
// The files come from the task's own record, read with this person's rights; until it is read, Open and Download keep
// their place and the focus but do nothing (aria-disabled, never disabled).
import { useQuery } from '@tanstack/react-query'
import { Icon } from '@sophia/ui'
import { getNativeTask } from '../../api/conversation.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useDocumentViewer } from '../artifacts/DocumentViewer.tsx'
import { downloadSource } from '../artifacts/download.ts'
import { formatBytes } from '../artifacts/report-view.ts'
import { useTransientStatus } from '../artifacts/useTransientStatus.ts'
import { noticeActions, noticeOpenRequest, noticeTitle, type ChatNoticeItem } from './chat-view.ts'

interface Props {
  notice: ChatNoticeItem
  projectId: string
  identity: Identity
}

/** The task's delivered files and its report, as this person may read them. */
function useDelivered({ notice, projectId, identity }: Props) {
  const detail = useQuery({
    queryKey: ['native-task', projectId, notice.taskId, 'notice', notice.resultRevision, identity.name],
    queryFn: () => getNativeTask(identity.token, projectId, notice.taskId),
  }).data
  return { artifactId: detail?.task.artifactId, ...noticeActions(detail?.result?.outputs ?? []) }
}

type Delivered = ReturnType<typeof useDelivered>
type File = NonNullable<Delivered['primary']>
type Show = (text: string, error?: boolean) => void

/** Save one delivered file after its hash is checked, and say so (or why not). */
async function save(token: string, file: File, show: Show): Promise<void> {
  try {
    const saved = await downloadSource(token, file.sourceId, file.sha256)
    show(`Downloading ${saved.filename} · ${formatBytes(saved.byteLength)}`)
  } catch (err: unknown) {
    show(err instanceof Error ? err.message : 'The download didn’t start. Try again.', true)
  }
}

export function NoticeCard(props: Props) {
  const { notice, identity } = props
  const viewer = useDocumentViewer()
  const status = useTransientStatus()
  const { artifactId, primary, markdown, page } = useDelivered(props)
  const open = viewer && artifactId ? (file: File) => viewer.open(noticeOpenRequest(artifactId, file)) : null
  const title = noticeTitle(notice.taskKind)
  const download = () => (primary ? save(identity.token, primary, status.show) : Promise.resolve())
  return (
    <div className="chat-notice" role="group" aria-label={title}>
      <p className="chat-notice-title">
        <Icon name="brief" />
        <strong>{title}</strong>
      </p>
      <div className="chat-notice-actions">
        <button type="button" onClick={() => primary && open?.(primary)} aria-disabled={!open || !primary || undefined}>
          Open
        </button>
        <button type="button" className="ghost" onClick={() => void download()} aria-disabled={!primary || undefined}>
          <Icon name="download" />
          Download
        </button>
        {markdown && open && (
          <button type="button" className="ghost" onClick={() => open(markdown)}>
            Markdown
          </button>
        )}
        {page && (
          <button
            type="button"
            className="ghost"
            onClick={() => (open ? open(page) : void save(identity.token, page, status.show))}
          >
            HTML page
          </button>
        )}
      </div>
      {/* There before it speaks: a live region added with its words is often not read. */}
      <p className="chat-status" role="status" data-error={status.error || undefined}>
        {status.text}
      </p>
    </div>
  )
}
