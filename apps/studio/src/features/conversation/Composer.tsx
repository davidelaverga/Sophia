// The chat's foot, at the bottom of the side panel: one message bar with its Send inside, as a chat has it. It writes
// to the room's discussion always, and to Sophia while the person can talk to her now; a switch at its start says
// which (docs/plans/room-discussion.md). Until her conversation is open, the way in (Chat with Sophia) sits above it
// (chat-view.ts). Whatever comes and goes (the consent, the status line, an error) sits above too, so the bar keeps
// its place, level with the dock. Enter sends; Shift+Enter starts a new line.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Snapshot, SophiaPresence } from '@sophia/contracts'
import { Icon, Tip } from '@sophia/ui'
import { startChat } from './chat-start.ts'
import { chatEntry, chatLine, footError, waitsOnRoom, type ChatEntry, type ChatMoment } from './chat-view.ts'
import { ContinuityChoice } from './ContinuityChoice.tsx'
import { HELD_WORDS, TARGET_WORDS, type Target } from './discussion-view.ts'
import { ReplyingTo, useReplyBar, type Replying } from './ReplyingTo.tsx'
import { useBarTarget, useRoomMessage } from './useRoomMessage.ts'
import { getSnapshot } from '../../api/client.ts'
import { startExchange } from '../../api/exchange.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { snapshotKey } from '../studio/useProjectFeed.ts'
import type { ProjectRoom } from '../voice/useProjectRoom.ts'

interface Props {
  projectId: string
  identity: Identity
  snapshot: Snapshot | undefined
  room: ProjectRoom
  draft: string
  onDraft: (text: string) => void
  /** Closes the panel, so the room's dock shows: where the panel covers it, its controls are out of reach. */
  onShowRoom: () => void
  /** The room's message being answered (A20, the vision flag's), and how to stop answering it. */
  replying?: Replying | null
  onStopReplying?: () => void
}

const NOTHING = () => undefined

/** The room's message being answered, if any (A20): the bar moves to the room, and the reply goes with the message. */
function useReply(
  props: Props,
  bar: { target: Target; choose: (target: Target) => void },
  field: RefObject<HTMLTextAreaElement | null>,
) {
  const replying = props.replying ?? null
  const stop = props.onStopReplying ?? NOTHING
  useReplyBar(replying, bar, field, stop)
  return { replying, stop, underWay: { id: replying?.id ?? null, done: stop } }
}

function useChatStart({ projectId, identity, room }: Pick<Props, 'projectId' | 'identity' | 'room'>) {
  const queryClient = useQueryClient()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const askSophia = async () => {
    const fresh = await getSnapshot(identity.token, projectId)
    if (fresh.room.sophia.exchange !== 'none') return
    await startExchange(identity.token, fresh.room.id, crypto.randomUUID(), {
      expectedRoomRevision: fresh.room.revision,
      allowVision: false,
    })
  }
  /**
   * Joins in text mode and opens Sophia's exchange if none is open (chat-start.ts). Resolves to whether it went
   * through. Not in the call: the room says why (its note shows above this button too), and Sophia is not asked in.
   */
  const start = async (): Promise<boolean> => {
    if (starting) return false
    setStarting(true)
    setError(null)
    try {
      const { textMode, setTextMode, textModeNow, join } = room
      const ports = { textMode, setTextMode, textModeNow, join, askSophia }
      if (!(await startChat(ports))) return false
      await queryClient.invalidateQueries({ queryKey: snapshotKey(projectId, identity.name) })
      return true
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'The conversation could not start.')
      return false
    } finally {
      setStarting(false)
    }
  }
  return { starting, start, error }
}

function useChatSend({ snapshot, room, draft, onDraft }: Props) {
  const [sending, setSending] = useState(false)
  // A failed send belongs to its call: the next call doesn't show it.
  const [error, setError] = useState<{ text: string; call: number } | null>(null)
  const presence = snapshot?.room.sophia
  const me = room.participants.find((p) => p.local)?.identity
  const busy = sending || room.chat.some((t) => t.state === 'sending' || t.state === 'responding')
  const ready =
    room.status === 'live' &&
    presence?.exchange === 'open' &&
    presence.voice === 'ready' &&
    presence.inputActorId === me
  const send = async () => {
    if (!ready || busy || !draft.trim() || !presence.exchangeId || presence.inputEpoch === null) return
    setSending(true)
    setError(null)
    try {
      await room.setTextMode(true)
      await room.sendChat({
        kind: 'input',
        id: crypto.randomUUID(),
        exchangeId: presence.exchangeId,
        inputEpoch: presence.inputEpoch,
        text: draft.trim(),
      })
      onDraft('')
    } catch (e: unknown) {
      const text = e instanceof Error ? e.message : 'Delivery is unconfirmed; nothing is resent automatically.'
      setError({ text, call: room.call })
    } finally {
      setSending(false)
    }
  }
  const shown = error?.call === room.call ? error.text : null
  return { presence, busy, ready, mine: !!presence && presence.inputActorId === me, error: shown, send }
}

interface StartProps {
  starting: boolean
  /**
   * The project has loaded and no join is under way: until then the button waits (a second join for the same person
   * would make LiveKit drop the first).
   */
  ready: boolean
  onStart: () => void
}

/** The way in, above the message bar: it joins in text mode and asks Sophia into the conversation. */
function ChatStart({ starting, ready, onStart }: StartProps) {
  return (
    <button type="button" className="pill warm chat-start" disabled={starting || !ready} onClick={onStart}>
      {starting ? 'Connecting to Sophia…' : 'Chat with Sophia'}
    </button>
  )
}

interface BarProps {
  field: RefObject<HTMLTextAreaElement | null>
  /** Who it writes to, and the other one it can switch to (null: the room is the only one). */
  target: Target
  other: Target | null
  onSwitch: (target: Target) => void
  draft: string
  onDraft: (text: string) => void
  canSend: boolean
  send: () => Promise<void>
}

/** Who the bar writes to: a switch when there are two, words when the room is the only one. */
function TargetSwitch({ target, other, onSwitch }: Pick<BarProps, 'target' | 'other' | 'onSwitch'>) {
  const words = TARGET_WORDS[target].label
  if (!other) return <span className="bar-target">{words}</span>
  return (
    <button
      type="button"
      className="bar-target has-tip"
      aria-label={`${words}. Send ${TARGET_WORDS[other].label.toLowerCase()} instead`}
      onClick={() => onSwitch(other)}
    >
      {words}
      <Tip label={`Send ${TARGET_WORDS[other].label.toLowerCase()} instead`} side="top" />
    </button>
  )
}

function MessageBar({ field, draft, onDraft, canSend, send, target, other, onSwitch }: BarProps) {
  return (
    <div className="message-bar" data-target={target}>
      <TargetSwitch target={target} other={other} onSwitch={onSwitch} />
      <label htmlFor="converse-draft" className="sr-only">
        {TARGET_WORDS[target].placeholder.replace('…', '')}
      </label>
      <textarea
        ref={field}
        id="converse-draft"
        data-chat-entry
        // Stray typing lands here (shortcuts.ts): a message begun without clicking the bar is still a message.
        data-typing-sink
        rows={1}
        maxLength={2000}
        value={draft}
        placeholder={TARGET_WORDS[target].placeholder}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            if (canSend) void send()
          }
        }}
      />
      <button type="button" className="send has-tip" aria-label="Send" disabled={!canSend} onClick={() => void send()}>
        <Icon name="send" />
        <Tip label="Send" keys="Enter" side="top" align="end" />
      </button>
    </div>
  )
}

interface LineProps {
  /** Sophia's presence while the bar is the way in, else undefined: the line is the bar's. */
  presence: SophiaPresence | undefined
  moment: ChatMoment
  /** The way back to voice: offered in the call only, since outside it there is no voice to go back to. */
  voice: boolean
  busy: boolean
  onVoice: () => void
  onShowRoom: () => void
}

/**
 * One line above the foot's control: why Send waits or that typing reaches Sophia, and the way back to voice. A line
 * that waits on the dock (waitsOnRoom) offers to show the room, where the panel covers it.
 */
function ChatLine({ presence, moment, voice, busy, onVoice, onShowRoom }: LineProps) {
  const text = presence ? chatLine(presence, moment) : null
  if (!text && !voice) return null
  return (
    <p className="chat-line" role="status">
      {text}
      {presence && waitsOnRoom(presence, moment) && (
        <button type="button" className="text-button chat-show-room" onClick={onShowRoom}>
          Show the room
        </button>
      )}
      {voice && (
        <button type="button" className="text-button" disabled={busy} onClick={onVoice}>
          Voice mode
        </button>
      )}
    </p>
  )
}

/** The foot's error (footError): announced when it is the chat's own, shown for the eye when it is the room's. */
function FootError({ error }: { error: { text: string; live: boolean } | null }) {
  if (!error) return null
  return (
    <p className="outcome" role={error.live ? 'status' : undefined} aria-hidden={error.live ? undefined : true}>
      {error.text}
    </p>
  )
}

/** After Chat with Sophia, the bar that takes the button's place takes the focus too: the person asked to type. */
function useTypeNext(entry: ChatEntry, field: RefObject<HTMLTextAreaElement | null>) {
  const asked = useRef(false)
  useEffect(() => {
    if (entry !== 'bar' || !asked.current) return
    asked.current = false
    field.current?.focus({ preventScroll: true })
  }, [entry, field])
  return asked
}

/**
 * What Send does and whether it can: to Sophia once she can take it; to the room once a message is written. A held
 * message (begun for Sophia, who can't take it now) sends nowhere until the person moves it.
 */
function sendingTo(
  bar: { target: Target; held: boolean },
  at: {
    chat: { ready: boolean; busy: boolean; send: () => Promise<void> }
    toRoom: { state: string; send: () => Promise<void> }
    starting: boolean
    draft: string
  },
) {
  const written = !!at.draft.trim()
  if (bar.held) return { can: false, send: () => Promise.resolve() }
  if (bar.target === 'sophia') {
    return { can: at.chat.ready && !at.chat.busy && !at.starting && written, send: at.chat.send }
  }
  return { can: at.toRoom.state !== 'sending' && written, send: at.toRoom.send }
}

interface FootLineProps {
  /** The room's message, when it didn't simply go: not sent (with Try again, that same message), or refused. */
  words: string | null
  unknown: boolean
  onRetry: () => void
  /** A message held for Sophia: why it waits, and moving it to the room. */
  held: boolean
  onMove: () => void
}

/** One line above the bar for what the room's message or a held one needs. */
function FootLine({ words, unknown, onRetry, held, onMove }: FootLineProps) {
  if (held) {
    return (
      <p className="outcome" role="status">
        {HELD_WORDS}{' '}
        <button type="button" className="text-button" onClick={onMove}>
          Move it to the room
        </button>
      </p>
    )
  }
  if (!words) return null
  return (
    <p className="outcome" role="status">
      {words}{' '}
      {unknown && (
        <button type="button" className="text-button" onClick={onRetry}>
          Try again
        </button>
      )}
    </p>
  )
}

/**
 * Typed turns use the same admitted exchange and lifecycle handlers as voice, with no microphone required. The same
 * bar writes to the room's discussion, always (useRoomMessage).
 */
export function Composer(props: Props) {
  const { projectId, identity, snapshot, room, draft, onDraft, onShowRoom } = props
  const { starting, start, error: startError } = useChatStart({ projectId, identity, room })
  const chat = useChatSend({ projectId, identity, snapshot, room, draft, onDraft, onShowRoom })
  const field = useRef<HTMLTextAreaElement>(null)
  const inRoom = room.status === 'live' || room.status === 'reconnecting'
  const entry = chatEntry(inRoom, chat.presence)
  const asked = useTypeNext(entry, field)
  const bar = entry === 'bar'
  const target = useBarTarget(bar && chat.mine, draft, field)
  const reply = useReply(props, target, field)
  const toRoom = useRoomMessage(projectId, identity, draft, onDraft, reply.underWay)
  const begin = async () => {
    asked.current = true
    if (!(await start())) asked.current = false
  }
  const moment = { starting, live: room.status === 'live', mine: chat.mine, textMode: room.textMode }
  // The room's own trouble (a join that failed, a call that ended) is said here too, before the chat's own: on a phone
  // this panel covers the dock, and a button that falls back to "Chat with Sophia" without a word reads as broken. A
  // start that failed is said while starting is still the way in.
  const error = footError(room.error, inRoom, chat.error, bar ? null : startError)
  const voice = () => {
    void room.setTextMode(false)
    field.current?.focus({ preventScroll: true }) // the pressed link goes; the focus stays at the bar
  }
  const sophia = target.target === 'sophia'
  const sending = sendingTo(target, { chat, toRoom, starting, draft })
  return (
    <div className="composer">
      <ContinuityChoice projectId={projectId} identity={identity} cursor={snapshot?.cursor} withBar={bar} />
      <ChatLine
        presence={bar && sophia ? chat.presence : undefined}
        moment={moment}
        voice={room.textMode && !starting && inRoom}
        busy={chat.busy}
        onVoice={voice}
        onShowRoom={onShowRoom}
      />
      <FootError error={error} />
      <FootLine
        words={toRoom.words}
        unknown={toRoom.state === 'unknown'}
        onRetry={() => void toRoom.send()}
        held={target.held}
        onMove={target.moveToRoom}
      />
      {!bar && (
        <ChatStart starting={starting} ready={room.ready && room.status !== 'joining'} onStart={() => void begin()} />
      )}
      <ReplyingTo replying={reply.replying} onStop={reply.stop} />
      <MessageBar
        field={field}
        draft={draft}
        onDraft={onDraft}
        canSend={sending.can}
        send={sending.send}
        target={target.target}
        other={target.other}
        onSwitch={target.choose}
      />
    </div>
  )
}
