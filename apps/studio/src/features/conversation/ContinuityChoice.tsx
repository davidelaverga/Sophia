import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Identity } from '../../app/dev-identity.ts'
import { getMission, setNoteConsent } from '../../api/mission.ts'
import { missionKey } from '../mission/mission-view.ts'

function useContinuity({
  projectId,
  identity,
  cursor,
}: {
  projectId: string
  identity: Identity
  cursor: string | undefined
}) {
  const cache = useQueryClient()
  const mission = useQuery({
    queryKey: [...missionKey(projectId), identity.name, cursor],
    queryFn: () => getMission(identity.token, projectId),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const choose = async (consent: 'accepted' | 'declined') => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await setNoteConsent(identity.token, projectId, consent)
    } catch {
      setError('Your choice is unconfirmed. Check the brief before trying again.')
    } finally {
      await cache.invalidateQueries({ queryKey: missionKey(projectId) })
      setBusy(false)
    }
  }
  return { mission, busy, error, choose }
}

/**
 * Team defaults never manufacture an individual's consent: while notes are on and this person hasn't chosen, the
 * choice sits above the message bar. Otherwise nothing: the brief says where notes stand.
 */
export function ContinuityChoice(props: { projectId: string; identity: Identity; cursor: string | undefined }) {
  const { mission, busy, error, choose } = useContinuity(props)
  const policy = mission.data?.notePolicy
  if (!policy || policy.capture === 'off' || policy.consent !== 'unset') return null
  return (
    <div className="continuity-choice">
      <p>Keep notes from your turns? Members can read them.</p>
      <button
        type="button"
        className="pill"
        aria-label="Allow shared notes from my turns"
        disabled={busy}
        onClick={() => void choose('accepted')}
      >
        Allow
      </button>
      <button
        type="button"
        className="text-button"
        aria-label="Keep no notes from my turns"
        disabled={busy}
        onClick={() => void choose('declined')}
      >
        No thanks
      </button>
      {error && <p role="status">{error}</p>}
    </div>
  )
}
