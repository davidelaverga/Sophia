// "Try PDF again" (plan §2.8.2, 0032): an editor asks for the PDF of a report published without one. The API prints
// the published version with the same template and queues the render; the card then reads the rendering state from
// the task (research.pdfRendering) and shows the PDF once it is published as the next version. One key per press,
// kept for a retry after no reply, so a press can never queue two renders.
import { useQueryClient } from '@tanstack/react-query'
import type { ResearchRendition } from '@sophia/contracts'
import { Tag } from '@sophia/ui'
import { requestRendition } from '../../api/conversation.ts'
import { useAdmission, type AdmissionState } from '../../api/useAdmission.ts'
import { renditionRefusal, renditionWords } from './report-view.ts'

interface Props {
  projectId: string
  taskId: string
  token: string
}

export function RetryPdf({ projectId, taskId, token }: Props) {
  const queryClient = useQueryClient()
  const admission = useAdmission<null, ResearchRendition>(async (key) => {
    try {
      return await requestRendition(token, projectId, taskId, key)
    } finally {
      // Queued or refused, the card's state may have moved: read the task again.
      void queryClient.invalidateQueries({ queryKey: ['native-task', projectId, taskId] })
    }
  })
  const { state } = admission
  const printable = !(state.status === 'done' && state.result.state === 'rejected')
  return (
    <div className="retry-pdf">
      <button
        type="button"
        className="pill"
        disabled={state.status === 'sending' || !printable}
        onClick={() => void admission.send(null)}
      >
        {state.status === 'unknown' ? 'Try again' : 'Try PDF again'}
      </button>
      <p className="outcome" role="status" aria-live="polite">
        <RetryOutcome state={state} />
      </p>
    </div>
  )
}

function RetryOutcome({ state }: { state: AdmissionState<null, ResearchRendition> }) {
  if (state.status === 'idle') return null
  if (state.status === 'sending') return <span className="muted">Asking for the PDF…</span>
  if (state.status === 'done') return <span>{renditionWords(state.result)}</span>
  if (state.status === 'unknown') {
    return (
      <>
        <Tag tone="amber">Not confirmed</Tag>
        <span>Sophia didn’t answer. It may already be recorded; trying again can’t send it twice.</span>
      </>
    )
  }
  return (
    <>
      <Tag tone="rose">Not accepted</Tag>
      <span>{renditionRefusal(state.error)}</span>
    </>
  )
}
