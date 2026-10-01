// A finished result in the chat, for someone who reads Sophia instead of hearing her (SMC-M03 S6, plan §2.8): the
// words are Studio's, by the task's kind, never a report's title or anything a page said. Open shows the report in the
// viewer (its PDF when it has one), Download saves that file after its hash is checked, and Markdown opens the
// Markdown when the PDF is what Open shows. The files come from the task's own record, read with this person's rights.
import { useQuery } from '@tanstack/react-query'
import { Icon } from '@sophia/ui'
import { getNativeTask } from '../../api/conversation.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useDocumentViewer } from '../artifacts/DocumentViewer.tsx'
import { downloadSource } from '../artifacts/download.ts'
import { formatBytes } from '../artifacts/report-view.ts'
import { useTransientStatus } from '../artifacts/useTransientStatus.ts'
import { noticeTitle, type ChatNoticeItem } from './chat-view.ts'

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
  const outputs = detail?.result?.outputs ?? []
  return {
    artifactId: detail?.task.artifactId,
    pdf: outputs.find((o) => o.format === 'pdf'),
    markdown: outputs.find((o) => o.format === 'markdown'),
  }
}

export function NoticeCard(props: Props) {
  const { notice, identity } = props
  const viewer = useDocumentViewer()
  const status = useTransientStatus()
  const { artifactId, pdf, markdown } = useDelivered(props)
  const primary = pdf ?? markdown
  const open =
    viewer && artifactId ? (format?: 'markdown') => viewer.open({ artifactId, ...(format ? { format } : {}) }) : null
  const title = noticeTitle(notice.taskKind)
  const download = async () => {
    if (!primary) return
    try {
      const saved = await downloadSource(identity.token, primary.sourceId, primary.sha256)
      status.show(`Downloading ${saved.filename} · ${formatBytes(saved.byteLength)}`)
    } catch (err: unknown) {
      status.show(err instanceof Error ? err.message : 'The download didn’t start. Try again.', true)
    }
  }
  return (
    <div className="chat-notice" role="group" aria-label={title}>
      <p className="chat-notice-title">
        <Icon name="brief" />
        <strong>{title}</strong>
      </p>
      <div className="chat-notice-actions">
        <button type="button" onClick={() => open?.()} disabled={!open}>
          Open
        </button>
        <button type="button" className="ghost" onClick={() => void download()} disabled={!primary}>
          <Icon name="download" />
          Download
        </button>
        {pdf && markdown && open && (
          <button type="button" className="ghost" onClick={() => open('markdown')}>
            Markdown
          </button>
        )}
      </div>
      {status.text && (
        <p className="chat-status" role="status" data-error={status.error || undefined}>
          {status.text}
        </p>
      )}
    </div>
  )
}
