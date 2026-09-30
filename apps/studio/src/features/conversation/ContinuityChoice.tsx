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

/** Team defaults never manufacture an individual's consent. Make the actual choice visible before chatting. */
export function ContinuityChoice(props: { projectId: string; identity: Identity; cursor: string | undefined }) {
  const { mission, busy, error, choose } = useContinuity(props)
  if (!mission.data)
    return (
      <p className="composer-note">{mission.isError ? 'Continuity status is unavailable.' : 'Checking continuity…'}</p>
    )
  const policy = mission.data.notePolicy
  if (policy.capture === 'off')
    return <p className="composer-note">Project note capture is off. Existing notes remain in the brief.</p>
  if (policy.consent !== 'unset')
    return (
      <p className="composer-note">
        {policy.consent === 'accepted'
          ? 'Shared project notes are enabled for your turns.'
          : 'No notes are kept from your turns.'}{' '}
        Manage this in the brief.
      </p>
    )
  return (
    <div className="continuity-choice">
      <p>
        Allow Sophia to keep structured notes from your turns for continuity? Existing project members can read them.
        You can stop capture or forget notes in the brief.
      </p>
      <div className="control-row">
        <button type="button" className="pill" disabled={busy} onClick={() => void choose('accepted')}>
          Allow shared notes
        </button>
        <button type="button" className="text-button" disabled={busy} onClick={() => void choose('declined')}>
          Keep no notes
        </button>
      </div>
      {error && <p role="status">{error}</p>}
    </div>
  )
}
