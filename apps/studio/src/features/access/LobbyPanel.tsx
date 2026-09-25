// The lobby, seen from the room: who is waiting to come in, and (for editors and admins) the choice to let
// them in or not. The list is the snapshot's; a decision refreshes it, and every member sees it change.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { LobbyEntry } from '@sophia/contracts'
import { decideLobbyEntry } from '../../api/access.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { snapshotKey } from '../studio/useProjectFeed.ts'

interface Props {
  projectId: string
  identity: Identity
  lobby: readonly LobbyEntry[]
  canDecide: boolean
}

function waitedFor(requestedAt: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(requestedAt)) / 60_000))
  return minutes < 1 ? 'just now' : `${minutes} min`
}

export function LobbyPanel({ projectId, identity, lobby, canDecide }: Props) {
  const queryClient = useQueryClient()
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const waiting = lobby.filter((e) => e.status === 'waiting')
  if (waiting.length === 0) return null

  const decide = async (entry: LobbyEntry, decision: 'admit' | 'deny') => {
    setBusy(entry.id)
    try {
      await decideLobbyEntry(identity.token, entry.id, decision)
    } finally {
      setBusy(null)
      void queryClient.invalidateQueries({ queryKey: snapshotKey(projectId, identity.name) })
    }
  }

  return (
    <aside className="lobby arrive" aria-label="Waiting to come in">
      <p className="lobby-title" role="status">
        {waiting.length === 1 ? 'Someone is waiting to come in' : `${waiting.length} people are waiting to come in`}
      </p>
      {!canDecide && <p className="lobby-note">An editor or admin can let them in.</p>}
      <ul>
        {waiting.map((e) => (
          <li key={e.id}>
            <span className="lobby-name">{e.displayName}</span>
            <span className="lobby-wait">{waitedFor(e.requestedAt, now)}</span>
            {canDecide && (
              <span className="lobby-actions">
                {/* Honest about the effect: a guest turned away cannot knock again from that device. */}
                <button type="button" className="ghost" disabled={busy === e.id} onClick={() => void decide(e, 'deny')}>
                  Turn away
                </button>
                <button
                  type="button"
                  className="pill warm"
                  disabled={busy === e.id}
                  onClick={() => void decide(e, 'admit')}
                >
                  Let in
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}
