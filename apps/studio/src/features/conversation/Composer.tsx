// submitContribution → the composer (frontend bindings). Sending records attributed discussion; it never starts
// work. The draft stays on this device until the server confirms, and an unconfirmed send retries with the same
// key, so it can never be recorded twice.
import { useQueryClient } from '@tanstack/react-query'
import type { ContributionReceipt } from '@sophia/contracts'
import { Tag } from '@sophia/ui'
import { submitContribution } from '../../api/conversation.ts'
import { useAdmission, type AdmissionState } from '../../api/useAdmission.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { snapshotKey } from '../studio/useProjectFeed.ts'

interface Props {
  projectId: string
  identity: Identity
  draft: string
  onDraft: (text: string) => void
}

export function Composer({ projectId, identity, draft, onDraft }: Props) {
  const queryClient = useQueryClient()
  const admission = useAdmission<string, ContributionReceipt>(async (key, text) => {
    try {
      const body = { source: null, text, threadId: null, artifactVersionId: null, intent: 'discuss' as const }
      return await submitContribution(identity.token, projectId, key, body)
    } finally {
      void queryClient.invalidateQueries({ queryKey: snapshotKey(projectId, identity.name) })
    }
  })
  const text = draft.trim()
  const busy = admission.state.status === 'sending'
  const send = async () => {
    if (!text || busy) return
    if (await admission.submit(text)) onDraft('')
  }
  const retry = async () => {
    if (await admission.retry()) onDraft('')
  }
  return (
    <div className="composer">
      <label htmlFor="converse-draft" className="sr-only">
        Your message to the project
      </label>
      <textarea
        id="converse-draft"
        rows={1}
        value={draft}
        placeholder="What should Sophia and the team think about next?"
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send()
        }}
      />
      <div className="composer-row">
        <p className="composer-note">
          Until you send it, your draft stays on this device. Sending shares it with the project; it never starts work.
        </p>
        <button type="button" className="pill primary" disabled={!text || busy} onClick={() => void send()}>
          Send
        </button>
      </div>
      <p className="outcome" role="status" aria-live="polite">
        <SendOutcome state={admission.state} onRetry={() => void retry()} />
      </p>
    </div>
  )
}

function SendOutcome({ state, onRetry }: { state: AdmissionState<string, ContributionReceipt>; onRetry: () => void }) {
  if (state.status === 'idle') return null
  if (state.status === 'sending') return <span className="muted">Sending…</span>
  if (state.status === 'done') return <Tag tone="teal">Shared with the project</Tag>
  if (state.status === 'unknown') {
    return (
      <>
        <Tag tone="amber">Not confirmed</Tag>
        <span>Your draft is kept. Trying again can’t post it twice.</span>
        <button type="button" className="text-button" onClick={onRetry}>
          Try again
        </button>
      </>
    )
  }
  return (
    <>
      <Tag tone="rose">Not sent</Tag>
      <span>{state.error.message}</span>
    </>
  )
}
