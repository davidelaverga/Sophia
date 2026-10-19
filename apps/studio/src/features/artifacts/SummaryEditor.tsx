// A report's description on its Knowledge card (plan §2.9): Sophia's from publication, or a member's edit with its
// date. An editor's change is saved against the revision they saw when they began (summaryEdit): when someone else
// changed it first, the person is told whose words are there and their typed words stay, and nothing is overwritten
// unless they save again, even after the cards were read again meanwhile. A save with no reply is never sent again by
// itself (it may have landed): when the cards read again bring back any words sent, or a stale refusal finds them
// there, it was saved, said politely, never blamed on a teammate, and only while it stays true
// (docs/plans/description-reply-lost.md). «Edit description» moves the focus to the text, and leaving the form (Cancel,
// Esc, a save) hands it back to it. Sophia's own description opens with her mark, which says so to a screen reader and
// under the pointer; a member's edit is said in words (docs/plans/knowledge-quiet.md). Edit sits at the tile's foot,
// after what the tile puts there (History).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ReportCard } from '@sophia/contracts'
import { editReportSummary } from '../../api/artifacts.ts'
import { ApiError } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Mark } from '../../app/Mark.tsx'
import {
  draftFrom,
  liveNote,
  settleUnheard,
  summaryEdit,
  summaryProblem,
  unheardWith,
  type SummaryDraft,
  type SummaryNote,
  type UnheardSave,
} from './report-view.ts'
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

/** A save the cards read again settle (settleUnheard): its reply was lost, or the API refused it as stale. */
const unheardBy = (code: string | null): boolean => code === 'outcome_unknown' || code === 'stale_revision'

/** The line under the description: a problem as an alert, a save that went through after all as a status. */
function Note({ note }: { note: SummaryNote | null }) {
  if (!note) return null
  if (note.polite) {
    return (
      <p className="report-saved" role="status">
        {note.words}
      </p>
    )
  }
  return (
    <p className="report-problem" role="alert">
      {note.words}
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
  const stop = useCallback(() => {
    back.current = true
    setDraft(null)
  }, [])
  const write = (text: string) => setDraft((d) => (d ? { ...d, text } : d))
  /** The typed words stay, saved next against `base` (the person was told why). */
  const rebase = useCallback((base: number) => setDraft((d) => (d ? { ...d, base } : d)), [])
  return { draft, start: setDraft, write, stop, rebase, edit }
}

type Draft = ReturnType<typeof useDraft>

/**
 * Saving the draft, and the line it leaves. Saves whose reply was lost, or refused as stale, wait together for the
 * cards read again to say whose words are there (settleUnheard): the person's own close the form as saved, someone
 * else's are named and keep the typed words. Edit takes the line away, so each is said once, but never what is still
 * unheard.
 */
function useSave({ card, identity, onSaved }: Pick<Props, 'card' | 'identity' | 'onSaved'>, form: Draft) {
  const [note, setNote] = useState<SummaryNote | null>(null)
  const [saving, setSaving] = useState(false)
  const [unheard, setUnheard] = useState<UnheardSave | null>(null)
  const { stop, rebase } = form
  const typed = form.draft?.text ?? null
  useEffect(() => {
    const settled = unheard && settleUnheard(unheard, card, typed)
    if (!settled) return
    setUnheard(null)
    setNote(settled.note)
    if (settled.close) stop()
    else rebase(settled.base)
  }, [unheard, card, typed, stop, rebase])
  const save = async (begun: SummaryDraft) => {
    const edit = summaryEdit(begun)
    setSaving(true)
    try {
      await editReportSummary(identity.token, card.artifactId, edit)
      stop()
      setNote(null)
      setUnheard(null)
    } catch (err: unknown) {
      const code = err instanceof ApiError ? err.code : null
      const words = summaryProblem(code)
      setNote(words === null ? null : { words, polite: false })
      if (unheardBy(code)) setUnheard((prev) => unheardWith(prev, edit))
    } finally {
      setSaving(false)
      onSaved()
    }
  }
  const begin = () => {
    setNote(null)
    form.start(draftFrom(card, unheard))
  }
  /** Cancel or Esc: the form's line goes with it, unless a save still waits to be heard. */
  const leave = () => {
    stop()
    if (!unheard) setNote(null)
  }
  return { note: liveNote(note, card.summary), saving, save, begin, leave }
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
  const form = useDraft()
  const { note, saving, save, begin, leave } = useSave({ card, identity, onSaved }, form)
  const { draft, write, edit } = form
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
        <Note note={note} />
        {/* One key in both forms: the foot, and History in it, stay as the form comes and goes (its focus too). */}
        <div key="foot" className="report-foot">
          {children}
          {editable && (
            <button ref={edit} type="button" className="text-button" onClick={begin}>
              Edit description
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
        note={note}
        onDraft={(text) => (text === null ? leave() : write(text))}
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
  note: SummaryNote | null
  /** A new draft, or null to stop editing. */
  onDraft: (draft: string | null) => void
  onSave: () => void
}

function SummaryForm({ draft, saving, note, onDraft, onSave }: FormProps) {
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
      <Note note={note} />
    </form>
  )
}
