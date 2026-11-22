import { useState, type ReactNode } from 'react'
import type { Membership, MissionEntry } from '@sophia/contracts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import type { RoomPanel } from '../studio/StudioShell.tsx'
import { ExploreNote } from './ExploreNote.tsx'
import { ManagedExploreSession } from './ManagedExploreSession.tsx'

const enabled = import.meta.env.VITE_SOPHIA_MANAGED_EXPLORE === '1'
const contentOrigin = import.meta.env.VITE_SOPHIA_PREVIEW_ORIGIN ?? ''

interface Props {
  projectId: string
  identity: Identity
  owns: boolean
  membership: Membership | undefined
  panel: RoomPanel
  call: ReactNode
}

/** The room stays mounted while the founder moves from the saved note into a personal workspace. */
export function useStudioExplore({ projectId, identity, owns, membership, panel, call }: Props) {
  const account = accountOf(identity)
  const scope = { projectId, token: identity.token }
  const scopeKey = JSON.stringify([account, projectId])
  const [seed, setSeed] = useState<string | null>(null)
  const [explore, setExplore] = useState<{ scopeKey: string; id: string } | null>(null)
  const [visible, show] = useState(false)
  if (!enabled || !owns || !membership || membership.role === 'viewer') return { note: undefined, session: null }
  const closeConfirmation = () => setSeed(null)
  const openSession = (id: string) => {
    setExplore({ scopeKey, id })
    show(true)
    panel.show(null)
  }
  const room = () => {
    show(false)
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('.studio .panel-toggles [data-panel="brief"]')?.focus(),
    )
  }
  const note = (entry: MissionEntry) => {
    if (entry.actorId !== membership.actorId) return null
    const key = JSON.stringify([scopeKey, entry.id, entry.ledgerRevision])
    return (
      <ExploreNote
        key={key}
        entry={entry}
        scope={scope}
        account={account}
        open={seed === key}
        onConfirm={() => setSeed(key)}
        onCancel={closeConfirmation}
        onSession={openSession}
      />
    )
  }
  const session =
    explore?.scopeKey === scopeKey ? (
      <ManagedExploreSession
        key={JSON.stringify([scopeKey, explore.id])}
        scope={scope}
        account={account}
        sessionId={explore.id}
        visible={visible && !panel.panel}
        contentOrigin={contentOrigin}
        call={call}
        onBack={() => panel.show('brief')}
        onRoom={room}
      />
    ) : null
  return { note, session }
}
