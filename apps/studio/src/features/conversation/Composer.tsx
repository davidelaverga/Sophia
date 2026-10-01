// The chat's foot, at the bottom of the side panel. It offers one thing at a time (chat-view.ts decides which):
// until there is a conversation to type into, the way in (Chat with Sophia); once there is, one message bar with
// its Send inside, as a chat has it. Whatever comes and goes (the consent, the status line, an error) sits above,
// so the control keeps its place, level with the dock. Enter sends; Shift+Enter starts a new line.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Snapshot } from '@sophia/contracts'
import { Icon, Tip } from '@sophia/ui'
import { startChat } from './chat-start.ts'
import { chatEntry, chatLine, footError, type ChatEntry } from './chat-view.ts'
import { ContinuityChoice } from './ContinuityChoice.tsx'
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
      const ports = { textMode: room.textMode, setTextMode: room.setTextMode, join: room.join, askSophia }
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
  const [error, setError] = useState<string | null>(null)
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
      setError(e instanceof Error ? e.message : 'Delivery is unconfirmed; nothing is resent automatically.')
    } finally {
      setSending(false)
    }
  }
  return { presence, busy, ready, mine: !!presence && presence.inputActorId === me, error, send }
}

interface StartProps {
  starting: boolean
  /** The project has loaded: until then there is no room to join, and the button waits. */
  ready: boolean
  onStart: () => void
}

/** The way in, in the message bar's place and size: it joins in text mode and asks Sophia into the conversation. */
function ChatStart({ starting, ready, onStart }: StartProps) {
  return (
    <button
      type="button"
      className="pill warm chat-start"
      data-chat-entry
      // Stray typing stops here, before the chat starts (shortcuts.ts): a letter is not a camera or a screen share.
      data-typing-sink
      disabled={starting || !ready}
      onClick={onStart}
    >
      {starting ? 'Connecting to Sophia…' : 'Chat with Sophia'}
    </button>
  )
}

interface BarProps {
  field: RefObject<HTMLTextAreaElement | null>
  draft: string
  onDraft: (text: string) => void
  canSend: boolean
  send: () => Promise<void>
}

function MessageBar({ field, draft, onDraft, canSend, send }: BarProps) {
  return (
    <div className="message-bar">
      <label htmlFor="converse-draft" className="sr-only">
        Message Sophia
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
        placeholder="Message Sophia…"
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void send()
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
  text: string | null
  room: ProjectRoom
  starting: boolean
  inRoom: boolean
  busy: boolean
}

/** One line above the foot's control: why Send waits or that typing reaches Sophia, and the way back to voice. */
function ChatLine({ text, room, starting, inRoom, busy }: LineProps) {
  // The way back to voice is offered in the call only: outside it there is no voice to go back to.
  const voice = room.textMode && !starting && inRoom
  if (!text && !voice) return null
  return (
    <p className="chat-line" role="status">
      {text}
      {voice && (
        <button type="button" className="text-button" disabled={busy} onClick={() => void room.setTextMode(false)}>
          Voice mode
        </button>
      )}
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

/** Typed turns use the same admitted exchange and lifecycle handlers as voice, with no microphone required. */
export function Composer({ projectId, identity, snapshot, room, draft, onDraft }: Props) {
  const { starting, start, error: startError } = useChatStart({ projectId, identity, room })
  const chat = useChatSend({ projectId, identity, snapshot, room, draft, onDraft })
  const { presence, busy, ready, send } = chat
  const field = useRef<HTMLTextAreaElement>(null)
  const inRoom = room.status === 'live' || room.status === 'reconnecting'
  const entry = chatEntry(inRoom, presence)
  const asked = useTypeNext(entry, field)
  const begin = async () => {
    asked.current = true
    if (!(await start())) asked.current = false
  }
  const moment = { starting, live: room.status === 'live', mine: chat.mine, textMode: room.textMode }
  const line = entry === 'bar' && presence ? chatLine(presence, moment) : null
  // The room's own trouble (a join that failed, a call that ended) is said here too, before the chat's own: on a phone
  // this panel covers the dock, and a button that falls back to "Chat with Sophia" without a word reads as broken.
  const error = footError(room.error, inRoom, chat.error, startError)
  return (
    <div className="composer">
      <ContinuityChoice projectId={projectId} identity={identity} cursor={snapshot?.cursor} withBar={entry === 'bar'} />
      <ChatLine text={line} room={room} starting={starting} inRoom={inRoom} busy={busy} />
      {error && (
        <p className="outcome" role={error.live ? 'status' : undefined} aria-hidden={error.live ? undefined : true}>
          {error.text}
        </p>
      )}
      {entry === 'bar' ? (
        <MessageBar
          field={field}
          draft={draft}
          onDraft={onDraft}
          canSend={ready && !busy && !!draft.trim()}
          send={send}
        />
      ) : (
        <ChatStart starting={starting} ready={room.ready} onStart={() => void begin()} />
      )}
    </div>
  )
}
