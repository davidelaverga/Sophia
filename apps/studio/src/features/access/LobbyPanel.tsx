// The lobby, seen from the room: who is waiting to come in and, for editors and admins, the answer.
// Declining is for now: the guest may ask again in a minute, and "Let in instead" takes back a slip at once.
// Blocking is for good, asks first, and is offered to those who keep asking (the Invite sheet can block or
// unblock anyone). With several waiting, one click answers them all. The list is the snapshot's, so every
// member sees it change. A new knock chimes for those who can answer, and notifies while the tab is hidden
// (knock-alert.md).
import { useEffect, useState } from 'react'
import type { LobbyEntry } from '@sophia/contracts'
import { Button, ConfirmButton } from '@sophia/ui'
import type { Identity } from '../../app/dev-identity.ts'
import { knockNote } from './access-view.ts'
import { useLobbyDecision } from './useAccess.ts'
import { lasted } from '../../app/time-words.ts'
import { useNow } from '../../app/use-now.ts'
import { initialOf } from '../../app/profile.ts'
import { useKnockAlert } from './useKnockAlert.ts'

interface Props {
  projectId: string
  identity: Identity
  /** Who is at the door; undefined until the snapshot is read (those waiting before it are not news). */
  lobby: readonly LobbyEntry[] | undefined
  canDecide: boolean
  /** The project's title, for a knock's notification. */
  projectTitle: string | undefined
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

export function LobbyPanel({ projectId, identity, lobby, canDecide, projectTitle = '' }: Props) {
  const now = useNow(30_000)
  const { busy, error, decide } = useLobbyDecision(projectId, identity)
  const [declined, setDeclined] = useJustDeclined()
  const waiting = (lobby ?? []).filter((e) => e.status === 'waiting')
  useKnockAlert(waiting, { projectId, projectTitle, canDecide, loaded: lobby !== undefined })
  if (waiting.length === 0 && declined.length === 0) return null
  const decline = (entries: readonly LobbyEntry[]) => {
    setDeclined(entries)
    void decide(entries, 'deny')
  }
  return (
    <aside className="lobby arrive" aria-label="Waiting to come in">
      <LobbyHead
        names={waiting.map((e) => e.displayName).join(', ') || null}
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
  /** Who waits, by name, for the status a screen reader hears. */
  names: string | null
  count: number
  canDecide: boolean
  busy: boolean
  onDeclineAll: () => void
  onAdmitAll: () => void
}

function LobbyHead({ names, count, canDecide, busy, onDeclineAll, onAdmitAll }: HeadProps) {
  if (count === 0) return null
  return (
    <>
      <div className="lobby-head">
        <p className="lobby-title" role="status">
          {count === 1 ? 'At the door' : `${String(count)} at the door`}
          {/* The rows name them to the eye; the status, heard alone, names who waits too. */}
          {names && <span className="sr-only">: {names}</span>}
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
      {canDecide && <NotifyOffer />}
    </>
  )
}

/** While notifications have never been asked for, one offer to hear of the next knock in another tab. */
/** Where a dismissed prompt is remembered on this device: the browser's choice stays «default», and the offer away. */
const NOTIFY_ASKED = 'sophia.knock.notify.asked'

const askedBefore = () => {
  try {
    return localStorage.getItem(NOTIFY_ASKED) === '1'
  } catch {
    return false
  }
}

const rememberAsked = () => {
  try {
    localStorage.setItem(NOTIFY_ASKED, '1')
  } catch {
    // Storage refused: the offer may come back after a reload, nothing worse.
  }
}

function NotifyOffer() {
  const [asked, setAsked] = useState(
    () => typeof Notification === 'undefined' || Notification.permission !== 'default' || askedBefore(),
  )
  if (asked) return null
  return (
    <button
      type="button"
      className="text-button lobby-notify"
      onClick={() => {
        setAsked(true)
        // Asked once, the browser's answer is final here, even a prompt closed with no choice (Codex P2 on #362).
        rememberAsked()
        void Notification.requestPermission()
      }}
    >
      Notify me when someone knocks
    </button>
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
        {initialOf(entry.displayName, '')}
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
          {/* The kit's quiet press at its 28 px, as tall as Let in beside it (docs/plans/room-phone-floor.md). */}
          <Button kind="ghost" className="lobby-decline" disabled={answer.busy} onClick={answer.onDecline}>
            Decline
          </Button>
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
