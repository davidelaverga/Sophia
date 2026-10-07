// A report's description on its Knowledge card (plan §2.9): Sophia's from publication, or a member's edit with its
// date. An editor's change is saved against the revision they saw when they began (summaryEdit): when someone else
// changed it first, theirs is shown and nothing is overwritten, even after the cards were read again meanwhile. A save
// with no reply is never sent again by itself (it may have landed). Edit moves the focus to the text, and leaving the
// form (Cancel, Esc, a save) hands it back to Edit. Sophia's own description opens with her mark, which says so to a
// screen reader and under the pointer; a member's edit is said in words (docs/plans/knowledge-quiet.md). Edit sits at the
// tile's foot, after what the tile puts there (History).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ReportCard } from '@sophia/contracts'
import { editReportSummary } from '../../api/artifacts.ts'
import { ApiError } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Mark } from '../../app/Mark.tsx'
import { summaryEdit, type SummaryDraft } from './report-view.ts'
import { dayOf } from '../../app/time-words.ts'

const LIMIT = 240

interface Props {
  card: ReportCard
  identity: Identity
  editable: boolean
  /** The description changed (saved here, or found newer): read the cards again. */
  onSaved: () => void
  /** What the tile puts at its foot, before Edit. */
  children?: ReactNode
}

/** A member's edit, said in words (Sophia's own is said by her mark). */
function attribution(card: ReportCard): string {
  const when = card.summaryUpdatedAt ? dayOf(card.summaryUpdatedAt, Date.now()) : null
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

/** An edit under way, and leaving it: the focus goes back to Edit once the form is gone. */
function useDraft() {
  const [draft, setDraft] = useState<SummaryDraft | null>(null)
  const edit = useRef<HTMLButtonElement>(null)
  const back = useRef(false)
  useEffect(() => {
    if (draft !== null || !back.current) return
    back.current = false
    // Only when the form had it (it went with the form): never taken from where the person moved it meanwhile.
    const at = document.activeElement
    if (at === null || at === document.body) edit.current?.focus()
  }, [draft])
  const stop = () => {
    back.current = true
    setDraft(null)
  }
  const write = (text: string) => setDraft((d) => (d ? { ...d, text } : d))
  return { draft, start: setDraft, write, stop, edit }
}

/** Sophia's mark before her own description: «Description by Sophia» to a screen reader and under the pointer. */
function SophiasMark() {
  return (
    <span className="report-by">
      <Mark />
      <span className="sr-only">Description by Sophia: </span>
    </span>
  )
}

export function SummaryEditor({ card, identity, editable, onSaved, children = null }: Props) {
  const { draft, start, write, stop, edit } = useDraft()
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const save = async (begun: SummaryDraft) => {
    setSaving(true)
    try {
      await editReportSummary(identity.token, card.artifactId, summaryEdit(begun))
      stop()
      setProblem(null)
    } catch (err: unknown) {
      setProblem(problemOf(err))
      if (err instanceof ApiError && err.code === 'stale_revision') stop()
    } finally {
      setSaving(false)
      onSaved()
    }
  }
  if (draft === null) {
    // No description is no one's: only one that exists is credited.
    const sophias = card.summary !== null && card.summaryAuthorId === null
    return (
      <div className="report-summary">
        <p className="report-summary-text">
          {sophias && <SophiasMark />}
          {card.summary ?? 'No description yet.'}
        </p>
        {card.summary !== null && !sophias && <p className="report-attribution">{attribution(card)}</p>}
        <Problem text={problem} />
        {/* One key in both forms: the foot, and History in it, stay as the form comes and goes (its focus too). */}
        <div key="foot" className="report-foot">
          {children}
          {editable && (
            <button
              ref={edit}
              type="button"
              className="text-button"
              onClick={() => start({ text: card.summary ?? '', base: card.summaryRevision })}
            >
              Edit
            </button>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="report-summary">
      <SummaryForm
        draft={draft.text}
        saving={saving}
        problem={problem}
        onDraft={(text) => (text === null ? stop() : write(text))}
        onSave={() => void save(draft)}
      />
      <div key="foot" className="report-foot">
        {children}
      </div>
    </div>
  )
}

interface FormProps {
  draft: string
  saving: boolean
  problem: string | null
  /** A new draft, or null to stop editing. */
  onDraft: (draft: string | null) => void
  onSave: () => void
}

function SummaryForm({ draft, saving, problem, onDraft, onSave }: FormProps) {
  const text = draft.trim()
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => field.current?.focus(), [])
  return (
    <form
      className="report-summary-edit"
      onSubmit={(e) => {
        e.preventDefault()
        if (text && !saving) onSave()
      }}
    >
      <textarea
        ref={field}
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
