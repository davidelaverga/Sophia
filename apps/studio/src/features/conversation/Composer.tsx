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

function ConversationMode({
  room,
  starting,
  ready,
  busy,
  start,
}: {
  room: ProjectRoom
  starting: boolean
  ready: boolean
  busy: boolean
  start: () => Promise<void>
}) {
  return (
    <div className="control-row" aria-label="Conversation mode">
      <button
        type="button"
        className="pill"
        aria-pressed={room.textMode}
        disabled={starting}
        onClick={() => void start()}
      >
        {starting ? 'Connecting…' : ready && room.textMode ? 'Text mode' : 'Chat with Sophia'}
      </button>
      <button
        type="button"
        className="text-button"
        aria-pressed={!room.textMode}
        disabled={busy}
        onClick={() => void room.setTextMode(false)}
      >
        Voice mode
      </button>
    </div>
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
      <ConversationMode room={room} starting={starting} ready={ready} busy={busy} start={start} />
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
      {!ready && presence?.exchange === 'open' && (
        <p className="muted">
          {presence.voice === 'ready' ? 'Take the input floor to message Sophia.' : 'Waiting for Sophia to connect…'}
        </p>
      )}
      {error && (
        <p className="outcome" role="status">
          {error}
        </p>
      )}
    </div>
  )
}
