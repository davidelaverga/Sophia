// Starting a conversation (docs/plans/project-conversation-writes.md; as writing, docs/plans/conversations-start.md,
// C8): its question, then if it helps some context, «Ask Sophia», and Start, which wakes with a question alone (the
// question is then the first message). Under the question, the project's proposals waiting to start from. Its words and
// its intent are held by the view (held-write.ts): put away and opened again, the form finds them, and with no reply
// Start sends the same intent again under its key, never a second conversation. Cancel puts the form away.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, type RefObject } from 'react'
import { Icon } from '@sophia/ui'
import {
  startConversation,
  type ConversationAsk,
  type ConversationStarted,
  type ConversationSummary,
} from '../../api/conversations.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Mark } from '../../app/Mark.tsx'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { usesAddressedInput } from '../../app/vision.ts'
import { artifactWords, useConversationArtifact, visibleArtifact } from './conversation-artifact.ts'
import { writeFailure } from './ConversationComposer.tsx'
import { HeldConversationRetry } from './HeldConversationRetry.tsx'
import { useComposerMentions } from './composer-mentions.tsx'
import { firstWords } from './conversation-list.ts'
import { briefNow, contextQuery } from './decide.ts'
import { isAddressedWrite, useHeldWrite, type Held } from './held-write.ts'
import { askOf, QUESTION_LIMIT, sameQuestion, startable, startersOf } from './new-conversation.ts'
import { sameQuestionLine } from './same-question-view.ts'
import { START, useKept } from './talk-store.ts'

/** How long a conversation's question may be. */
export const QUESTION_MAX = QUESTION_LIMIT

interface Props {
  projectId: string
  identity: Identity
  me: string
  writer: boolean | undefined
  /** The form's words, kept by the view while the form is away. */
  fields: ConversationAsk
  artifactVersionId: string | null
  onClearArtifact: () => void
  cursor: string | undefined
  onFields: (next: ConversationAsk) => void
  held: Held<ConversationAsk> | null
  onHeld: (next: Held<ConversationAsk> | null) => void
  /** The refusal that answered the last Start, kept by the view. */
  refused: string | null
  onRefused: (words: string | null) => void
  onStarted: (started: ConversationStarted, ask: ConversationAsk) => void
  onCancel: () => void
  /** The saved-text notice, before the reader's first message in the project; null after it. */
  notice: string | null
  /**
   * Sophia answers here now (the list's `capability.ask`). Where she doesn't, «Ask Sophia» still records the request, and
   * the form says before Start that she won't answer, and why, as the open conversation's composer does.
   */
  answers: boolean
  /** Why she doesn't, where she doesn't (the list's `capability.askReason`, askUnansweredWords). */
  unanswered: string
  /** The conversations here, for the one that already asks the question (docs/plans/same-question.md). */
  conversations: readonly ConversationSummary[]
  /** Opens one of them instead of starting another. */
  onOpenExisting: (conversationId: string) => void
}

type RetryProps = Pick<Props, 'projectId' | 'identity' | 'me' | 'onHeld' | 'onStarted' | 'refused' | 'onRefused'> & {
  held: Held<ConversationAsk>
}

export function HeldStartRetry({ projectId, identity, me, held, onHeld, onStarted, refused, onRefused }: RetryProps) {
  const slot = held.ask.artifactVersionId ?? null
  const mentions = useComposerMentions({ projectId, identity, me, conversationId: START, slot }, false, held)
  return (
    <HeldConversationRetry
      label="Start"
      held={held}
      onHeld={onHeld}
      refusal={{ words: refused, onWords: onRefused }}
      send={(key, ask) => startConversation(identity.token, projectId, key, ask)}
      onRecorded={(receipt, ask) => {
        mentions.clearIf(mentions.ids)
        onStarted(receipt, ask)
      }}
    />
  )
}

/** A retry keeps the sent version even if its source is no longer readable. Fresh writes require the exact version. */
function useStartWrite(props: Props, addressed: boolean, artifact: ReturnType<typeof useConversationArtifact>) {
  const { projectId, identity, fields } = props
  const mentions = useComposerMentions(
    { projectId, conversationId: START, slot: artifact.versionId, me: props.me, identity },
    addressed && props.writer === true && artifact.ready,
    props.held,
  )
  const write = useHeldWrite<ConversationAsk, ConversationStarted>(
    props.held,
    props.onHeld,
    (key, ask) =>
      startConversation(identity.token, projectId, key, ask).catch((error: unknown) => {
        if (ask.artifactVersionId) artifact.refresh()
        throw error
      }),
    { words: props.refused, onWords: props.onRefused, say: writeFailure },
    isAddressedWrite(props.held),
  )
  const asked = askOf(fields)
  const ready =
    props.writer === true && (write.unknown !== null || (artifact.ready && mentions.ready && startable(fields)))
  const go = async () => {
    if (write.busy || !ready) return
    const ask = write.unknown ?? asked
    const started = await write.run(
      addressed
        ? {
            ...asked,
            askSophia: false,
            addressingVersion: 1,
            mentions: mentions.ids,
            ...(artifact.versionId ? { artifactVersionId: artifact.versionId } : {}),
          }
        : asked,
    )
    if (started) {
      if (addressed) mentions.clearIf(mentions.ids)
      props.onStarted(started, ask)
    }
  }
  const words = write.unknown
    ? artifact.versionId && !artifact.version
      ? 'Not confirmed. Start retries the same request.'
      : `Not confirmed: “${firstWords(write.unknown.title)}”. Start sends it again; it won’t be started twice.`
    : write.refused
  // With no reply, the words are the held intent's: shown as sent, and not to be changed.
  const shown = write.unknown ?? fields
  return {
    busy: write.busy,
    fixed: write.busy || write.unknown !== null,
    shown,
    ready,
    go,
    words,
    mentions: mentions.controls,
  }
}

/**
 * The proposals waiting to start from: the brief's pending, the same read as the context beside the conversations, and
 * only as it may show now (`briefNow`): none from a read set out before the latest refusal (PR #199 r4239851727).
 */
function useStarters(props: Props): string[] {
  const { projectId, identity } = props
  const brief = useQuery(contextQuery(projectId, identity))
  const { kept } = useKept(projectId, accountOf(identity))
  return startersOf(briefNow(brief.data, kept)?.pending, props.fields.title, QUESTION_MAX)
}

function useStartArtifact(props: Props, addressed: boolean) {
  const versionId = props.held?.ask.artifactVersionId ?? props.artifactVersionId
  return useConversationArtifact(props, versionId, addressed && props.writer === true)
}

export function NewConversation(props: Props) {
  const addressed = usesAddressedInput(props.held)
  const artifact = useStartArtifact(props, addressed)
  const write = useStartWrite(props, addressed, artifact)
  const slow = useSlow(write.busy)
  const said = write.words ?? (slow ? SLOW_NOTE : null)
  return (
    <form
      className="conv-new"
      aria-label="New conversation"
      onSubmit={(e) => {
        e.preventDefault()
        void write.go()
      }}
    >
      <h3>New conversation</h3>
      {props.notice && <p className="conv-note conv-notice">{props.notice}</p>}
      <StartArtifact artifact={artifact} fixed={write.fixed} onClear={props.onClearArtifact} />
      {visibleArtifact(artifact) && (
        <>
          <StartFields {...props} addressed={addressed} shown={write.shown} fixed={write.fixed} />
          {write.mentions}
        </>
      )}
      <div className="conv-compose-acts">
        <button type="submit" className="pill" aria-disabled={!write.ready || write.busy || undefined}>
          {write.busy ? 'Starting…' : 'Start'}
        </button>
        <button
          type="button"
          className="text-button"
          aria-disabled={write.busy || undefined}
          onClick={() => !write.busy && props.onCancel()}
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

function StartArtifact({
  artifact,
  fixed,
  onClear,
}: {
  artifact: ReturnType<typeof useConversationArtifact>
  fixed: boolean
  onClear: () => void
}) {
  if (!artifact.versionId) return null
  const words = artifactWords(artifact)
  return (
    <div className="conv-artifact">
      <p className="conv-note" role="status">
        {words}
      </p>
      {!fixed && (
        <button className="text-button" type="button" onClick={onClear}>
          Clear version
        </button>
      )}
    </div>
  )
}

function StartFields(props: Props & { addressed: boolean; shown: ConversationAsk; fixed: boolean }) {
  const { addressed, shown, fixed, fields, onFields, answers, unanswered } = props
  const question = useRef<HTMLInputElement>(null)
  const starters = useStarters(props)
  useEffect(() => question.current?.focus(), [])
  const same = fixed || props.artifactVersionId ? null : sameQuestion(shown.title, props.conversations)
  return (
    <Fields
      {...{ question, shown, fixed, addressed, answers, unanswered }}
      starters={fixed ? [] : starters}
      onChange={(change) => onFields({ ...fields, ...change })}
      same={same && { title: same.title, open: () => props.onOpenExisting(same.id) }}
    />
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
  addressed: boolean
  starters: readonly string[]
  onChange: (change: Partial<ConversationAsk>) => void
  /** A conversation here that already asks it, and the press that opens it. */
  same: { title: string; open: () => void } | null
  answers: boolean
  unanswered: string
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
      {props.same && (
        <p className="conv-same" role="status">
          {sameQuestionLine(props.same.title).lead}{' '}
          <button type="button" className="text-button" onClick={props.same.open}>
            {sameQuestionLine(props.same.title).press}
            <Icon name="forward" size={12} />
          </button>
        </p>
      )}
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
      <AskSophia
        addressed={props.addressed}
        asked={shown.askSophia}
        fixed={fixed}
        answers={props.answers}
        unanswered={props.unanswered}
        onAsked={(askSophia) => onChange({ askSophia })}
      />
    </>
  )
}

/** «Ask Sophia», and where she doesn't answer here, saying so and why before Start (as the open composer's hint does). */
function AskSophia(props: {
  addressed: boolean
  asked: boolean
  fixed: boolean
  answers: boolean
  unanswered: string
  onAsked: (asked: boolean) => void
}) {
  const unanswered = props.asked && !props.answers
  const note = useId()
  if (props.addressed) return <p className="conv-note">Visible to project members</p>
  return (
    <>
      <label className="conv-ask">
        <input
          type="checkbox"
          checked={props.asked}
          disabled={props.fixed}
          aria-describedby={unanswered ? note : undefined}
          onChange={(e) => props.onAsked(e.target.checked)}
        />
        <span className="conv-ask-box" aria-hidden />
        <Mark />
        Ask Sophia
      </label>
      {unanswered && (
        <p id={note} className="conv-note conv-ask-unanswered">
          {props.unanswered}: the question goes to the team.
        </p>
      )}
    </>
  )
}
