// "Try PDF again" (plan §2.8.2, 0032): an editor asks for the PDF of a report published without one. The API prints
// the published version with the same template and queues the render; the card then reads the rendering state from
// the task (research.pdfRendering) and shows the PDF once it is published as the next version. One key per press,
// kept for a retry after no reply, so a press can never queue two renders. While asking, the button keeps the focus
// (aria-disabled, never disabled); once the card moves on (the PDF renders again) and this goes, the card has it.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
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

/** The focus inside this when it goes (the card moved on) is handed to the card, never dropped to the page. */
function useFocusToCard() {
  const root = useRef<HTMLDivElement>(null)
  const inside = useRef(false)
  useEffect(() => {
    const card = root.current?.closest<HTMLElement>('.work-card')
    return () => {
      if (inside.current && (document.activeElement === null || document.activeElement === document.body)) card?.focus()
    }
  }, [])
  return {
    ref: root,
    onFocus: () => {
      inside.current = true
    },
    onBlur: () => {
      // The window losing the focus is no move: the button still has it within the page.
      if (document.hasFocus()) inside.current = false
    },
  }
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
  const held = state.status === 'sending' || !printable
  const focus = useFocusToCard()
  return (
    <div className="retry-pdf" {...focus}>
      <button
        type="button"
        className="pill"
        aria-disabled={held || undefined}
        onClick={() => {
          if (!held) void admission.send(null)
        }}
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
