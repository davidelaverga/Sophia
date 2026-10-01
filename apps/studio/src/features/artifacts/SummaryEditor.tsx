// A report's description on its Knowledge card (plan §2.9): Sophia's from publication, or a member's edit with its
// date. An editor's change is saved against the revision they saw: when someone else changed it first, theirs is
// shown and nothing is overwritten. A save with no reply is never sent again by itself (it may have landed).
import { useState } from 'react'
import type { ReportCard } from '@sophia/contracts'
import { editReportSummary } from '../../api/artifacts.ts'
import { ApiError } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'

const LIMIT = 240

interface Props {
  card: ReportCard
  identity: Identity
  editable: boolean
  /** The description changed (saved here, or found newer): read the cards again. */
  onSaved: () => void
}

function attribution(card: ReportCard): string {
  if (card.summaryAuthorId === null) return 'Description by Sophia'
  const when = card.summaryUpdatedAt
    ? new Date(card.summaryUpdatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : null
  return when ? `Edited by a member · ${when}` : 'Edited by a member'
}

/** What a refused or unanswered save tells the person. */
function problemOf(err: unknown): string {
  if (err instanceof ApiError && err.code === 'stale_revision') {
    return 'Someone changed this description since you opened it. Theirs is shown; edit again if you need to.'
  }
  if (err instanceof ApiError && err.code === 'forbidden') return 'Only editors and admins can change it.'
  if (err instanceof ApiError && err.code === 'outcome_unknown') {
    return 'No reply from Sophia: it may have been saved. It will show here when the list reads again.'
  }
  return 'The description wasn’t saved. Try again.'
}

function Problem({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <p className="report-problem" role="alert">
      {text}
    </p>
  )
}

export function SummaryEditor({ card, identity, editable, onSaved }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const save = async (text: string) => {
    setSaving(true)
    try {
      await editReportSummary(identity.token, card.artifactId, {
        summary: text,
        expectedRevision: card.summaryRevision,
      })
      setDraft(null)
      setProblem(null)
    } catch (err: unknown) {
      setProblem(problemOf(err))
      if (err instanceof ApiError && err.code === 'stale_revision') setDraft(null)
    } finally {
      setSaving(false)
      onSaved()
    }
  }
  if (draft === null) {
    return (
      <div className="report-summary">
        <p>{card.summary ?? 'No description yet.'}</p>
        <p className="report-attribution">
          {attribution(card)}
          {editable && (
            <button type="button" className="text-button" onClick={() => setDraft(card.summary ?? '')}>
              Edit
            </button>
          )}
        </p>
        <Problem text={problem} />
      </div>
    )
  }
  return (
    <SummaryForm
      draft={draft}
      saving={saving}
      problem={problem}
      onDraft={setDraft}
      onSave={(text) => void save(text)}
    />
  )
}

interface FormProps {
  draft: string
  saving: boolean
  problem: string | null
  /** A new draft, or null to stop editing. */
  onDraft: (draft: string | null) => void
  onSave: (text: string) => void
}

function SummaryForm({ draft, saving, problem, onDraft, onSave }: FormProps) {
  const text = draft.trim()
  return (
    <form
      className="report-summary-edit"
      onSubmit={(e) => {
        e.preventDefault()
        if (text && !saving) onSave(text)
      }}
    >
      <textarea
        aria-label="Description"
        value={draft}
        maxLength={LIMIT}
        rows={3}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onDraft(null)
          }
        }}
      />
      <div className="control-row">
        <span className="count">{LIMIT - draft.length}</span>
        <button type="button" className="ghost" onClick={() => onDraft(null)}>
          Cancel
        </button>
        {/* A press being answered keeps its focus: aria-disabled, never disabled. */}
        <button type="submit" className="pill primary" disabled={!text} aria-disabled={saving || undefined}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <Problem text={problem} />
    </form>
  )
}
