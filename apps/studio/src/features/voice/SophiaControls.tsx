// finishExchange / stopSpeaking / stopLooking → Sophia in the dock (S1-05A §6.2–§6.5): ask her in, Stop
// Speaking, Show Sophia this, Stop Looking, Resume and End. Each changes only the conversation; a brief that
// is running carries on whatever is pressed here. The server decides (a guest in the room refuses Resume);
// a refusal is said in its own words.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Snapshot } from '@sophia/contracts'
import { Tip } from '@sophia/ui'
import type { Identity } from '../../app/dev-identity.ts'
import { ApiError } from '../../api/client.ts'
import { controlExchange, showSophia, startExchange, type ExchangeControl } from '../../api/exchange.ts'
import { snapshotKey } from '../studio/useProjectFeed.ts'
import type { RoomParticipant } from './room-view.ts'
import type { SophiaView } from './sophia-view.ts'
import { DockWord } from './DockWord.tsx'

interface Props {
  view: SophiaView
  snapshot: Snapshot
  projectId: string
  identity: Identity
  me: RoomParticipant | undefined
  onAllowAudio: () => void
}

/** One control call at a time, the snapshot refreshed after it, a refusal kept until the next try. */
function useControl(projectId: string, identity: Identity) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err: unknown) {
      setError(err instanceof ApiError && err.status > 0 ? err.message : 'No reply from Sophia. Try again.')
    } finally {
      setBusy(false)
      void queryClient.invalidateQueries({ queryKey: snapshotKey(projectId, identity.name) })
    }
  }
  return { busy, error, run }
}

/** What this person can show: their own shared screen first, else their camera; null when neither is on. */
function showable(me: RoomParticipant | undefined): 'screen' | 'camera' | null {
  if (me?.screenOn) return 'screen'
  return me?.cameraOn ? 'camera' : null
}

type Run = (action: () => Promise<unknown>) => Promise<void>

/** Ask Sophia in: she joins the conversation and hears whoever holds the floor. */
function AskIn({ snapshot, identity, busy, run }: { snapshot: Snapshot; identity: Identity; busy: boolean; run: Run }) {
  const ask = () =>
    run(() =>
      startExchange(identity.token, snapshot.room.id, crypto.randomUUID(), {
        expectedRoomRevision: snapshot.room.revision,
        allowVision: true,
      }),
    )
  return (
    <button type="button" className="pill warm has-tip" disabled={busy} onClick={() => void ask()}>
      <DockWord icon="sophia">Speak with Sophia</DockWord>
      <Tip label="Sophia joins the conversation and hears whoever holds the floor" />
    </button>
  )
}

interface ShowProps {
  exchangeId: string
  source: 'screen' | 'camera'
  identity: Identity
  busy: boolean
  run: Run
}

function ShowSophia({ exchangeId, source, identity, busy, run }: ShowProps) {
  return (
    <button
      type="button"
      className="pill has-tip"
      disabled={busy}
      onClick={() => void run(() => showSophia(identity.token, exchangeId, source))}
    >
      <DockWord icon="eye">Show Sophia your {source}</DockWord>
      <Tip label="She sees at most one still a second, until anyone presses Stop looking" />
    </button>
  )
}

interface ConversationProps extends Props {
  exchangeId: string
  busy: boolean
  run: Run
}

/** While she is in the conversation: Stop speaking, Show Sophia this, Stop looking, Resume, End. */
function Conversation({ view, snapshot, identity, me, exchangeId, busy, run }: ConversationProps) {
  const presence = snapshot.room.sophia
  const control = (action: ExchangeControl) => () => void run(() => controlExchange(identity.token, exchangeId, action))
  const source = showable(me)
  const mine = presence.looking?.participantIdentity === me?.identity && presence.looking?.source === source
  const canShow = view.exchange === 'open' && presence.allowVision && source !== null && !mine
  return (
    <>
      {view.speaking && (
        <button type="button" className="pill has-tip" disabled={busy} onClick={control('stop-speaking')}>
          <DockWord icon="speakerOff">Stop speaking</DockWord>
          <Tip label="Sophia stops talking; her work carries on" />
        </button>
      )}
      {canShow && <ShowSophia exchangeId={exchangeId} source={source} identity={identity} busy={busy} run={run} />}
      {presence.looking && (
        <button type="button" className="pill" disabled={busy} onClick={control('stop-looking')}>
          <DockWord icon="eyeOff" said="Sophia stops looking">
            Stop looking
          </DockWord>
        </button>
      )}
      {view.exchange === 'paused' && (
        <button type="button" className="pill warm" disabled={busy} onClick={control('resume')}>
          <DockWord icon="play" said="Resume with Sophia">
            Resume
          </DockWord>
        </button>
      )}
      <button type="button" className="pill has-tip" disabled={busy} onClick={control('end')}>
        <DockWord icon="stop">End</DockWord>
        <Tip label="Sophia leaves the conversation; her work carries on" />
      </button>
    </>
  )
}

export function SophiaControls(props: Props) {
  const { view, snapshot, projectId, identity, onAllowAudio } = props
  const { busy, error, run } = useControl(projectId, identity)
  const exchangeId = snapshot.room.sophia.exchangeId
  return (
    <div className="floor sophia-controls">
      {/* "Speak with Sophia" names her; once she is in, the label says whose controls these are. */}
      {view.exchange !== 'none' && <span className="floor-label">Sophia</span>}
      {view.exchange === 'none' && <AskIn snapshot={snapshot} identity={identity} busy={busy} run={run} />}
      {view.needsAudio && (
        <button type="button" className="pill warm" onClick={onAllowAudio}>
          <DockWord icon="speaker" said="Allow Sophia’s audio">
            Allow audio
          </DockWord>
        </button>
      )}
      {view.exchange !== 'none' && exchangeId && (
        <Conversation {...props} exchangeId={exchangeId} busy={busy} run={run} />
      )}
      {error && (
        <span className="floor-error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

/** The observation indicator: visible in the dock and the mini dock while Sophia is looking at anything. */
/** `quiet`: a copy for the eye where the announced one is covered (the panel's head over the dock). */
export function LookingIndicator({ text, quiet = false }: { text: string | null; quiet?: boolean }) {
  if (!text) return null
  return (
    <span className="sophia-looking" role={quiet ? undefined : 'status'} aria-hidden={quiet || undefined}>
      <span className="sophia-looking-dot" aria-hidden />
      {text}
    </span>
  )
}
