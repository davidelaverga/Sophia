// The chat's composer, at the foot of the side panel: how to reach Sophia by text, then one message bar with its
// Send inside, as a chat has it. Enter sends; Shift+Enter starts a new line.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Snapshot } from '@sophia/contracts'
import { Icon, Tip } from '@sophia/ui'
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
  const start = async () => {
    if (starting) return
    setStarting(true)
    setError(null)
    try {
      await room.setTextMode(true)
      await room.join({ textOnly: true })
      const fresh = await getSnapshot(identity.token, projectId)
      if (fresh.room.sophia.exchange === 'none') {
        await startExchange(identity.token, fresh.room.id, crypto.randomUUID(), {
          expectedRoomRevision: fresh.room.revision,
          allowVision: false,
        })
      }
      await queryClient.invalidateQueries({ queryKey: snapshotKey(projectId, identity.name) })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'The conversation could not start.')
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
  return { presence, busy, ready, error, send }
}

interface LineProps {
  room: ProjectRoom
  presence: Snapshot['room']['sophia'] | undefined
  starting: boolean
  ready: boolean
  busy: boolean
  start: () => Promise<void>
}

/** What the line under the bar says, before any button: the step under way, or what the chat waits for. */
function lineText({ room, presence, starting, ready }: LineProps): string | null {
  if (starting) return 'Connecting to Sophia…'
  if (ready) return room.textMode ? 'Typing to Sophia' : null
  if (presence?.exchange !== 'open') return null
  return presence.voice === 'ready' ? 'Take the input floor to message Sophia.' : 'Waiting for Sophia to connect…'
}

/**
 * One line under the message bar: how the chat reaches Sophia. Typing to her needs the room live with her exchange
 * open; from outside, Chat with Sophia joins in text mode. Voice mode leads back once in text.
 */
function ChatLine(props: LineProps) {
  const { room, presence, starting, ready, busy, start } = props
  const text = lineText(props)
  const canStart = !starting && !ready && presence?.exchange !== 'open'
  if (!text && !canStart) return null
  return (
    <p className="chat-line" role="status">
      {text}
      {canStart && (
        <button type="button" className="pill" onClick={() => void start()}>
          Chat with Sophia
        </button>
      )}
      {room.textMode && !starting && (
        <button type="button" className="text-button" disabled={busy} onClick={() => void room.setTextMode(false)}>
          Voice mode
        </button>
      )}
    </p>
  )
}

/** Typed turns use the same admitted exchange and lifecycle handlers as voice, with no microphone required. */
export function Composer({ projectId, identity, snapshot, room, draft, onDraft }: Props) {
  const { starting, start, error: startError } = useChatStart({ projectId, identity, room })
  const {
    presence,
    busy,
    ready,
    error: sendError,
    send,
  } = useChatSend({ projectId, identity, snapshot, room, draft, onDraft })
  const error = sendError ?? startError
  return (
    <div className="composer">
      <ContinuityChoice projectId={projectId} identity={identity} cursor={snapshot?.cursor} />
      <div className="message-bar">
        <label htmlFor="converse-draft" className="sr-only">
          Message Sophia
        </label>
        <textarea
          id="converse-draft"
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
        <button
          type="button"
          className="send has-tip"
          aria-label="Send"
          disabled={!ready || busy || !draft.trim()}
          onClick={() => void send()}
        >
          <Icon name="send" />
          <Tip label="Send" keys="Enter" side="top" align="end" />
        </button>
      </div>
      <ChatLine room={room} presence={presence} starting={starting} ready={ready} busy={busy} start={start} />
      {error && (
        <p className="outcome" role="status">
          {error}
        </p>
      )}
    </div>
  )
}
