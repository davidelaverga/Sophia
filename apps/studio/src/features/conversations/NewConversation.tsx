// Starting a conversation (docs/plans/project-conversation-writes.md; as writing, docs/plans/conversations-start.md,
// C8): its question, then if it helps some context, «Ask Sophia», and Start, which wakes with a question alone (the
// question is then the first message). Under the question, the project's proposals waiting to start from. Its words and
// its intent are held by the view (held-write.ts): put away and opened again, the form finds them, and with no reply
// Start sends the same intent again under its key, never a second conversation. Cancel puts the form away.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, type RefObject } from 'react'
import { startConversation, type ConversationAsk, type ConversationStarted } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Mark } from '../../app/Mark.tsx'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { writeFailure } from './ConversationComposer.tsx'
import { firstWords } from './conversation-list.ts'
import { contextQuery } from './decide.ts'
import { useHeldWrite, type Held } from './held-write.ts'
import { askOf, startable, startersOf } from './new-conversation.ts'

/** How long a conversation's question may be. */
export const QUESTION_MAX = 120

interface Props {
  projectId: string
  identity: Identity
  /** The form's words, kept by the view while the form is away. */
  fields: ConversationAsk
  onFields: (next: ConversationAsk) => void
  held: Held<ConversationAsk> | null
  onHeld: (next: Held<ConversationAsk> | null) => void
  /** The refusal that answered the last Start, kept by the view. */
  refused: string | null
  onRefused: (words: string | null) => void
  onStarted: (started: ConversationStarted, ask: ConversationAsk) => void
  onCancel: () => void
}

/** The start's write: the held intent again, or the form's words as a new one. */
function useStartWrite(props: Props) {
  const { projectId, identity, fields } = props
  const write = useHeldWrite<ConversationAsk, ConversationStarted>(
    props.held,
    props.onHeld,
    (key, ask) => startConversation(identity.token, projectId, key, ask),
    { words: props.refused, onWords: props.onRefused, say: writeFailure },
  )
  const asked = askOf(fields)
  const ready = write.unknown !== null || startable(fields)
  const go = async () => {
    if (write.busy || !ready) return
    const ask = write.unknown ?? asked
    const started = await write.run(asked)
    if (started) props.onStarted(started, ask)
  }
  const words = write.unknown
    ? `Not confirmed: “${firstWords(write.unknown.title)}”. Start sends it again; it won’t be started twice.`
    : write.refused
  // With no reply, the words are the held intent's: shown as sent, and not to be changed.
  const shown = write.unknown ?? fields
  return { busy: write.busy, fixed: write.busy || write.unknown !== null, shown, ready, go, words }
}

/** The proposals waiting to start from: the brief's pending, the same read as the context beside the conversations. */
function useStarters(props: Props): string[] {
  const { projectId, identity } = props
  const brief = useQuery(contextQuery(projectId, identity))
  return startersOf(brief.data?.pending, props.fields.title, QUESTION_MAX)
}

export function NewConversation(props: Props) {
  const { fields, onFields } = props
  const question = useRef<HTMLInputElement>(null)
  const starters = useStarters(props)
  useEffect(() => question.current?.focus(), [])
  const { busy, fixed, shown, ready, go, words } = useStartWrite(props)
  // On its way past a few seconds, the Studio's slow note.
  const slow = useSlow(busy)
  const said = words ?? (slow ? SLOW_NOTE : null)
  return (
    <form
      className="conv-new"
      aria-label="New conversation"
      onSubmit={(e) => {
        e.preventDefault()
        void go()
      }}
    >
      <h3>New conversation</h3>
      <Fields
        question={question}
        shown={shown}
        fixed={fixed}
        starters={fixed ? [] : starters}
        onChange={(change) => onFields({ ...fields, ...change })}
      />
      <div className="conv-compose-acts">
        <button type="submit" className="pill" aria-disabled={!ready || busy || undefined}>
          {busy ? 'Starting…' : 'Start'}
        </button>
        <button
          type="button"
          className="text-button"
          aria-disabled={busy || undefined}
          onClick={() => !busy && props.onCancel()}
        >
          Cancel
        </button>
      </div>
      {said && (
        <p className="conv-note" role="alert">
          {said}
        </p>
      )}
    </form>
  )
}

/**
 * The question (with the proposals waiting to start from under it), context if it helps, and «Ask Sophia»: as sent, and
 * not to be changed, while they are held.
 */
function Fields(props: {
  question: RefObject<HTMLInputElement | null>
  shown: ConversationAsk
  fixed: boolean
  starters: readonly string[]
  onChange: (change: Partial<ConversationAsk>) => void
}) {
  const { question, shown, fixed, onChange } = props
  return (
    <>
      <label className="conv-field conv-question">
        <span className="field-label">Question</span>
        <input
          ref={question}
          maxLength={QUESTION_MAX}
          placeholder="What do you want to figure out?"
          value={shown.title}
          readOnly={fixed}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </label>
      {props.starters.length > 0 && (
        <div className="conv-starters" role="group" aria-label="Start from what’s still open">
          {props.starters.map((s) => (
            <button key={s} type="button" onClick={() => onChange({ title: s })}>
              {s}
            </button>
          ))}
        </div>
      )}
      <label className="conv-field">
        <span className="field-label">Context, if it helps</span>
        <textarea rows={3} value={shown.text} readOnly={fixed} onChange={(e) => onChange({ text: e.target.value })} />
      </label>
      <label className="conv-ask">
        <input
          type="checkbox"
          checked={shown.askSophia}
          disabled={fixed}
          onChange={(e) => onChange({ askSophia: e.target.checked })}
        />
        <span className="conv-ask-box" aria-hidden />
        <Mark />
        Ask Sophia
      </label>
    </>
  )
}
