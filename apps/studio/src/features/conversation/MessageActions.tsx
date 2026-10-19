// A member's own message in the room's chat, corrected or withdrawn (docs/plans/message-acts.md, A36; the
// MESSAGE_ACTS flag's). Edit puts the words in a field; Save asks the service what it would do, and goes at once unless
// work read the words, when the member decides first. Withdraw always asks first. Every act carries its preview's
// proof: one the service no longer recognises is refused, the chat is read again, and the draft stays. A reply lost on
// the way is asked again with the same key, so it is never done twice.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import type { ContributionActPreview, ContributionActReceipt, DiscussionEntry, WithdrawnEntry } from '@sophia/contracts'
import { ApiError } from '../../api/client.ts'
import { correctMessage, previewMessageAct, proofOf, withdrawMessage } from '../../api/message-acts.ts'
import { accountOf } from '../../app/auth-callback.ts'
import { stillSignedIn } from '../../app/signed-in.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { asksFirst, effectWords, failureOf, type MessageAct } from './message-acts.ts'
import { BAR_MOST, barFits, barLength } from './bar-length.ts'

/** What an act changed, for the chat to show before its next read: the new words, the withdrawal, or a reread. */
export type Acted =
  { type: 'corrected'; entry: DiscussionEntry } | { type: 'withdrawn'; withdrawn: WithdrawnEntry } | { type: 'reread' }

type Step =
  | { at: 'idle'; problem?: string | undefined }
  | { at: 'editing'; draft: string; problem?: string | undefined }
  | {
      at: 'asking'
      act: MessageAct
      preview: ContributionActPreview
      draft?: string | undefined
      problem?: string | undefined
    }
  /** The service is asked what the act would do: nothing is written yet, so it can still be called off. */
  | { at: 'previewing'; act: MessageAct; draft?: string | undefined }
  | { at: 'working'; act: MessageAct; draft?: string | undefined }

/** An act sent and not answered yet: retried with this key and these words. */
interface Pending {
  act: MessageAct
  key: string
  draft?: string | undefined
  preview: ContributionActPreview
}

interface Acting {
  projectId: string
  identity: Identity
  entry: DiscussionEntry
  onActed: (acted: Acted) => void
}

const codeOf = (err: unknown) => (err instanceof ApiError ? err.code : 'unavailable')

/** Whether the focus is in this message's act (its field or its question), so it goes on with the act. */
const focusWithin = (id: string) => (document.activeElement?.closest(`[data-message-acts="${id}"]`) ?? null) !== null

/** Whether the focus is nowhere (the page itself): a control of the act that went with it let it drop. */
const focusLost = () => document.activeElement === null || document.activeElement === document.body

/**
 * Whether a done act may still hand its focus on: only one it holds, or one its own control let drop, never one the
 * person has put on another control since (Codex P2 on #409, r4312346262).
 */
const focusStillOurs = (id: string) => focusWithin(id) || focusLost()

/**
 * A done act hands the focus it held on (Codex on #396): a correction's to its message's Edit, a withdrawal's to the
 * place the message now shows, which takes it. Never taken from somewhere else on the page.
 */
function handFocus(act: MessageAct, id: string) {
  // What takes it shows once the chat draws it, and takes it as it mounts (useHandedFocus).
  handed.set(id, act === 'withdraw' ? 'place' : 'edit')
}

/** Messages whose act held the focus, by id, and what takes it: their withdrawn place, or their Edit. */
const handed = new Map<string, 'place' | 'edit'>()

/** The withdrawn place or the Edit of a message takes the focus its own act held, once. */
export function useHandedFocus(id: string, taker: 'place' | 'edit', el: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (handed.get(id) !== taker || !el.current) return
    handed.delete(id)
    // Taken only while nothing else has it: a handoff left over (a chat closed and opened again) never steals it.
    if (focusStillOurs(id)) el.current.focus()
  }, [id, taker, el])
}

/** What the chat shows of a done act before its next read. Identical words changed nothing. */
function actedOf(
  entry: DiscussionEntry,
  act: MessageAct,
  draft: string | undefined,
  receipt: ContributionActReceipt,
): Acted | null {
  const now = new Date().toISOString()
  if (act === 'withdraw') {
    const { id, actorId, createdAt } = entry
    return {
      type: 'withdrawn',
      withdrawn: { id, actorId, authorName: entry.authorName ?? null, createdAt, withdrawnAt: now },
    }
  }
  if (!receipt.changed) return null
  return {
    type: 'corrected',
    entry: { ...entry, text: draft ?? entry.text, revision: receipt.revision, correctedAt: now },
  }
}

/** Where a failed act leaves the member: asked again (a lost reply), in the field with the draft, or at the message. */
function stepAfter(
  act: MessageAct,
  failure: { words: string; sameKey: boolean },
  draft: string | undefined,
  preview: ContributionActPreview | undefined,
): Step {
  if (failure.sameKey && preview) return { at: 'asking', act, preview, draft, problem: failure.words }
  if (draft !== undefined) return { at: 'editing', draft, problem: failure.words }
  return { at: 'idle', problem: failure.words }
}

/** The act's flow: preview, the member's decision, the act, and what a failure leaves. */
function useMessageAct({ projectId, identity, entry, onActed }: Acting) {
  const [step, setStep] = useState<Step>({ at: 'idle' })
  const pending = useRef<Pending | null>(null)
  /** Which preview is awaited: one called off (or followed by another) answers to nothing (r4296732968). */
  const asking = useRef(0)
  const failed = (act: MessageAct, err: unknown, draft?: string, preview?: ContributionActPreview) => {
    const failure = failureOf(codeOf(err))
    if (!failure.sameKey) pending.current = null
    if (failure.reread) onActed({ type: 'reread' })
    setStep(stepAfter(act, failure, draft, preview))
  }
  const send = async (act: MessageAct, preview: ContributionActPreview, draft?: string) => {
    // Nothing new goes under an account that has left this page (signed-in.ts; R-C3-ACT-01).
    if (!stillSignedIn(accountOf(identity))) return
    const again = pending.current
    const key = again && again.act === act && again.draft === draft ? again.key : crypto.randomUUID()
    pending.current = { act, key, draft, preview }
    const focused = focusWithin(entry.id)
    setStep({ at: 'working', act, draft })
    const { token } = identity
    try {
      const receipt =
        act === 'correct'
          ? await correctMessage(token, projectId, entry.id, key, { ...proofOf(preview), text: draft ?? '' })
          : await withdrawMessage(token, projectId, entry.id, key, proofOf(preview))
      pending.current = null
      setStep({ at: 'idle' })
      const acted = actedOf(entry, act, draft, receipt)
      if (acted) onActed(acted)
      if (focused && focusStillOurs(entry.id)) handFocus(act, entry.id)
    } catch (err) {
      failed(act, err, draft, preview)
    }
  }
  const begin = async (act: MessageAct, draft?: string) => {
    // A reply lost on the way: the same act, the same words, the same key.
    const again = pending.current
    if (again && again.act === act && again.draft === draft) return send(act, again.preview, draft)
    // Only a read so far: nothing is written until the act is sent, so it isn't «working» (r4296732968).
    const ask = ++asking.current
    // The account that asked: if it leaves this page while the preview is on its way (another account, or signing
    // out), the answer starts nothing for it (signed-in.ts; R-C3-ACT-01).
    const account = accountOf(identity)
    const current = () => asking.current === ask && stillSignedIn(account)
    setStep({ at: 'previewing', act, draft })
    try {
      const preview = await previewMessageAct(identity.token, projectId, entry.id, act)
      if (!current()) return undefined
      if (asksFirst(preview)) setStep({ at: 'asking', act, preview, draft })
      else await send(act, preview, draft)
    } catch (err) {
      if (current()) failed(act, err, draft)
    }
    return undefined
  }
  /** Called off: an act waiting to be asked again is let go, and a preview still on its way answers to nothing. */
  const forget = () => {
    pending.current = null
    asking.current += 1
  }
  /** An act was sent and its answer never came: until it is asked again, it may or may not have been done. */
  const unresolved = () => pending.current !== null
  return { step, setStep, send, begin, forget, unresolved }
}

/** The words in the field: while the member edits, and while their correction is checked or sent. */
const fieldDraft = (step: Step): string | undefined =>
  step.at === 'editing' || step.at === 'working' || step.at === 'previewing' ? step.draft : undefined

interface Props extends Acting {
  acts: readonly MessageAct[]
  /** The message's words as the chat draws them. */
  children: ReactNode
}

export function MessageActions({ acts, children, ...acting }: Props) {
  const { entry } = acting
  const { step, setStep, send, begin, forget, unresolved } = useMessageAct(acting)
  const edit = useRef<HTMLButtonElement>(null)
  const cancel = () => {
    forget()
    setStep({ at: 'idle' })
    requestAnimationFrame(() => edit.current?.focus())
  }
  const save = (draft: string) => {
    if (draft.trim() === '') return setStep({ at: 'editing', draft, problem: 'A message needs words.' })
    if (draft === entry.text) return setStep({ at: 'idle' })
    return void begin('correct', draft)
  }
  const draft = fieldDraft(step)
  return (
    <>
      {draft !== undefined ? (
        <EditForm
          id={entry.id}
          draft={draft}
          working={step.at === 'working'}
          checking={step.at === 'previewing'}
          problem={step.at === 'editing' ? step.problem : undefined}
          onDraft={(text) => setStep({ at: 'editing', draft: text })}
          onSave={() => save(draft)}
          onCancel={cancel}
        />
      ) : (
        children
      )}
      {step.at === 'idle' && (
        <ActButtons
          id={entry.id}
          acts={acts}
          edit={edit}
          onEdit={() => setStep({ at: 'editing', draft: entry.text })}
          onWithdraw={() => void begin('withdraw')}
        />
      )}
      <ActStatus step={step} />
      {step.at === 'previewing' && step.draft === undefined && <Checking id={entry.id} onCancel={cancel} />}
      {step.at === 'asking' && (
        <Confirm
          id={entry.id}
          act={step.act}
          preview={step.preview}
          problem={step.problem}
          editing={step.draft !== undefined}
          unresolved={step.problem !== undefined && unresolved()}
          onConfirm={() => void send(step.act, step.preview, step.draft)}
          onBack={() => (step.draft === undefined ? cancel() : setStep({ at: 'editing', draft: step.draft }))}
        />
      )}
    </>
  )
}

/** A withdrawal under way, or why the last act didn't go. */
function ActStatus({ step }: { step: Step }) {
  if (step.at === 'working' && step.act === 'withdraw')
    return (
      <span className="chat-status" role="status">
        Withdrawing…
      </span>
    )
  if (step.at !== 'idle' || !step.problem) return null
  return (
    <p className="chat-status" role="alert">
      {step.problem}
    </p>
  )
}

/** A withdrawal's preview on its way: said plainly, and it can be called off (Cancel, or Escape on it). */
function Checking({ id, onCancel }: { id: string; onCancel: () => void }) {
  const button = useRef<HTMLButtonElement>(null)
  // The Withdraw pressed is gone while it is asked: the focus goes on to the way back.
  useEffect(() => button.current?.focus(), [])
  return (
    <span className="chat-status" role="status" data-message-acts={id}>
      Checking first…{' '}
      <button
        ref={button}
        type="button"
        className="text-button"
        onClick={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
        }}
      >
        Cancel
      </button>
    </span>
  )
}

/** Escape in the field: the edit goes, not the panel. A correction already sent is not undone by it. */
function escaped(e: KeyboardEvent<HTMLTextAreaElement>, working: boolean, cancel: () => void) {
  if (e.key !== 'Escape' || e.nativeEvent.isComposing) return
  e.preventDefault()
  e.stopPropagation()
  if (!working) cancel()
}

/** The message's words in a field: Save, Cancel, Escape. */
/** Past the room's most, how far: Save waits until the message fits again. */
function TooLong({ draft }: { draft: string }) {
  if (barFits('room', draft)) return null
  return (
    <span className="bar-count" role="status">
      {barLength('room', draft)} of {BAR_MOST.room} characters: too long to save.
    </span>
  )
}

function EditForm(props: {
  id: string
  draft: string
  working: boolean
  /** The preview is on its way: Save waits for it, nothing is saved yet, and Cancel and Escape still go back. */
  checking: boolean
  problem: string | undefined
  onDraft: (text: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => field.current?.focus(), [])
  // The room's own count, in characters (bar-length.ts), never the field's maxLength, which counts UTF-16 units and
  // would refuse a message of fewer characters made of astral ones (Codex P2 on #409, r4313394205).
  const over = !barFits('room', props.draft)
  const held = props.working || props.checking
  return (
    <form
      className="message-edit"
      data-message-acts={props.id}
      onSubmit={(e) => {
        e.preventDefault()
        if (!held && !over) props.onSave()
      }}
    >
      <label className="sr-only" htmlFor={`edit-${props.id}`}>
        Edit your message
      </label>
      <textarea
        ref={field}
        id={`edit-${props.id}`}
        value={props.draft}
        rows={2}
        aria-invalid={over || undefined}
        readOnly={props.working || props.checking}
        onChange={(e) => props.onDraft(e.target.value)}
        onKeyDown={(e) => escaped(e, props.working, props.onCancel)}
      />
      <span className="message-edit-actions">
        <TooLong draft={props.draft} />
        <button className="pill primary" type="submit" aria-disabled={held || over || undefined}>
          {props.working ? 'Saving…' : 'Save'}
        </button>
        <button
          className="text-button"
          type="button"
          aria-disabled={props.working || undefined}
          onClick={() => {
            // Sent is sent: Cancel can't call a correction back, so it waits for the answer (Codex on #396).
            if (!props.working) props.onCancel()
          }}
        >
          Cancel
        </button>
      </span>
      {props.problem && (
        <p className="chat-status" role="alert">
          {props.problem}
        </p>
      )}
    </form>
  )
}

/** Edit and Withdraw after the message's words, as its acts allow. */
function ActButtons(props: {
  id: string
  acts: readonly MessageAct[]
  edit: RefObject<HTMLButtonElement | null>
  onEdit: () => void
  onWithdraw: () => void
}) {
  useHandedFocus(props.id, 'edit', props.edit)
  if (props.acts.length === 0) return null
  return (
    <span className="message-acts">
      {props.acts.includes('correct') && (
        <button
          ref={props.edit}
          id={`message-edit-${props.id}`}
          type="button"
          className="text-button"
          onClick={props.onEdit}
        >
          Edit
        </button>
      )}
      {props.acts.includes('withdraw') && (
        <button type="button" className="text-button" onClick={props.onWithdraw}>
          Withdraw
        </button>
      )}
    </span>
  )
}

/** What the act will do, said before it goes, and the member's decision. */
function Confirm(props: {
  id: string
  act: MessageAct
  preview: ContributionActPreview
  problem: string | undefined
  editing: boolean
  /** Sent, its answer lost: it may have been done, so the only way on is to ask again with the same key. */
  unresolved: boolean
  onConfirm: () => void
  onBack: () => void
}) {
  const decide = useRef<HTMLButtonElement>(null)
  useEffect(() => decide.current?.focus(), [])
  const title = props.act === 'withdraw' ? 'Withdraw your message?' : 'Save your edit?'
  const go = props.act === 'withdraw' ? 'Withdraw message' : 'Save anyway'
  return (
    <div
      className="message-confirm"
      data-message-acts={props.id}
      role="group"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        // The question goes, not the panel; an act whose answer was lost stays to be asked again.
        e.preventDefault()
        e.stopPropagation()
        if (!props.unresolved) props.onBack()
      }}
    >
      <p className="message-confirm-title">{title}</p>
      <ul>
        {effectWords(props.preview).map((words) => (
          <li key={words}>{words}</li>
        ))}
      </ul>
      {props.problem && (
        <p className="chat-status" role="alert">
          {props.problem}
        </p>
      )}
      <span className="message-edit-actions">
        <button
          ref={decide}
          className={`pill ${props.act === 'withdraw' ? 'danger' : 'primary'}`}
          type="button"
          onClick={props.onConfirm}
        >
          {props.problem ? 'Try again' : go}
        </button>
        {!props.unresolved && (
          <button className="text-button" type="button" onClick={props.onBack}>
            {props.editing ? 'Keep editing' : 'Cancel'}
          </button>
        )}
      </span>
    </div>
  )
}

/** «Edited» by a message whose words were corrected. */
export function EditedMark({ entry }: { entry: DiscussionEntry }) {
  return entry.correctedAt ? <span className="contribution-edited">Edited</span> : null
}

/** Where a withdrawn message stood: never its words. */
export function WithdrawnWords({ mine }: { mine: boolean }) {
  return (
    <span className="contribution-withdrawn">
      {mine ? 'You withdrew this message.' : 'This message was withdrawn.'}
    </span>
  )
}
