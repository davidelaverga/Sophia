// The lobby, seen from the room: who is waiting to come in and, for editors and admins, the answer.
// Declining is for now: the guest may ask again in a minute, and "Let in instead" takes back a slip at once.
// Blocking is for good, asks first, and is offered to those who keep asking (the Invite sheet can block or
// unblock anyone). With several waiting, one click answers them all. The list is the snapshot's, so every
// member sees it change.
import { useEffect, useState } from 'react'
import type { LobbyEntry } from '@sophia/contracts'
import { ConfirmButton } from '@sophia/ui'
import type { Identity } from '../../app/dev-identity.ts'
import { knockNote } from './access-view.ts'
import { useLobbyDecision } from './useAccess.ts'
import { lasted } from '../../app/time-words.ts'
import { useNow } from '../../app/use-now.ts'
import { initialOf } from '../conversations/conversation-list.ts'

interface Props {
  projectId: string
  identity: Identity
  lobby: readonly LobbyEntry[]
  canDecide: boolean
}

/** How long "Let in instead" stays after a decline. */
const UNDO_MS = 8000

/** How long they have waited: "just now", then "5 min" (app/time-words.ts). */
function waitedFor(requestedAt: string, now: number): string {
  const waited = now - Date.parse(requestedAt)
  return waited < 60_000 ? 'just now' : lasted(waited)
}

/** The people just declined, for a few seconds: a slip is one click from undone. */
function useJustDeclined(): [readonly LobbyEntry[], (entries: readonly LobbyEntry[]) => void] {
  const [declined, setDeclined] = useState<readonly LobbyEntry[]>([])
  useEffect(() => {
    if (declined.length === 0) return undefined
    const t = setTimeout(() => setDeclined([]), UNDO_MS)
    return () => clearTimeout(t)
  }, [declined])
  return [declined, setDeclined]
}

export function LobbyPanel({ projectId, identity, lobby, canDecide }: Props) {
  const now = useNow(30_000)
  const { busy, error, decide } = useLobbyDecision(projectId, identity)
  const [declined, setDeclined] = useJustDeclined()
  const waiting = lobby.filter((e) => e.status === 'waiting')
  if (waiting.length === 0 && declined.length === 0) return null
  const decline = (entries: readonly LobbyEntry[]) => {
    setDeclined(entries)
    void decide(entries, 'deny')
  }
  return (
    <aside className="lobby arrive" aria-label="Waiting to come in">
      <LobbyHead
        first={waiting[0]?.displayName ?? null}
        count={waiting.length}
        canDecide={canDecide}
        busy={busy}
        onDeclineAll={() => decline(waiting)}
        onAdmitAll={() => void decide(waiting, 'admit')}
      />
      {waiting.length > 0 && (
        <ul>
          {waiting.map((e) => (
            <LobbyRow
              key={e.id}
              entry={e}
              now={now}
              answer={
                canDecide
                  ? {
                      busy,
                      onAdmit: () => void decide([e], 'admit'),
                      onDecline: () => decline([e]),
                      onBlock: () => void decide([e], 'block'),
                    }
                  : null
              }
            />
          ))}
        </ul>
      )}
      {declined.length > 0 && (
        <Undo
          declined={declined}
          onLetIn={() => {
            setDeclined([])
            void decide(declined, 'admit')
          }}
        />
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </aside>
  )
}

interface HeadProps {
  /** The first one waiting: named when they are the only one. */
  first: string | null
  count: number
  canDecide: boolean
  busy: boolean
  onDeclineAll: () => void
  onAdmitAll: () => void
}

function LobbyHead({ first, count, canDecide, busy, onDeclineAll, onAdmitAll }: HeadProps) {
  if (count === 0) return null
  return (
    <>
      <div className="lobby-head">
        <p className="lobby-title" role="status">
          {count === 1 ? 'At the door' : `${String(count)} at the door`}
          {/* The row names them to the eye; the status, heard alone, names the one waiting too. */}
          {count === 1 && first && <span className="sr-only">: {first}</span>}
        </p>
        {canDecide && count > 1 && (
          <span className="lobby-all">
            <button type="button" className="ghost" disabled={busy} onClick={onDeclineAll}>
              Decline all
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={onAdmitAll}>
              Let in all
            </button>
          </span>
        )}
      </div>
      {!canDecide && <p className="lobby-note">An editor or admin can let them in.</p>}
    </>
  )
}

interface Answer {
  busy: boolean
  onAdmit: () => void
  onDecline: () => void
  onBlock: () => void
}

/** One person at the door. Block appears once they have asked more than once, and asks before it acts. */
function LobbyRow({ entry, now, answer }: { entry: LobbyEntry; now: number; answer: Answer | null }) {
  const asked = knockNote(entry.knocks)
  return (
    <li>
      <span className="lobby-face" aria-hidden>
        {initialOf(entry.displayName)}
      </span>
      <span className="lobby-who">
        <span className="lobby-name">{entry.displayName}</span>
        <span className="lobby-wait">
          {asked && `${asked} · `}
          {waitedFor(entry.requestedAt, now)}
        </span>
      </span>
      {answer && (
        <span className="lobby-actions">
          {entry.knocks > 1 && (
            <ConfirmButton
              label="Block"
              warning="They can’t ask again from this device."
              confirm="Block"
              disabled={answer.busy}
              onConfirm={answer.onBlock}
            />
          )}
          <button type="button" className="text-button lobby-decline" disabled={answer.busy} onClick={answer.onDecline}>
            Decline
          </button>
          <button type="button" className="pill warm" disabled={answer.busy} onClick={answer.onAdmit}>
            Let in
          </button>
        </span>
      )}
    </li>
  )
}

function Undo({ declined, onLetIn }: { declined: readonly LobbyEntry[]; onLetIn: () => void }) {
  const [only] = declined
  const who = declined.length === 1 && only ? only.displayName : `${declined.length} people`
  return (
    <p className="lobby-undo" role="status">
      Declined {who}. They can ask again in a minute.{' '}
      <button type="button" className="text-button" onClick={onLetIn}>
        Let in instead
      </button>
    </p>
  )
}
