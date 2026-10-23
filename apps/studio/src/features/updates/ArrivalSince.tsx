// What changed since you last looked, said as the person arrives in a project (docs/plans/project-arrival-since.md):
// under the bar, where the newcomer's welcome goes, once per window, project, account and device, with Home's words and
// memory. Open Updates opens Updates, which says it all; Dismiss ends it. The status is mounted all along, so the line
// is announced as it comes and never takes the focus.
import { useState } from 'react'
import { Icon, Tip } from '@sophia/ui'
import type { Identity } from '../../app/dev-identity.ts'
import { readWelcome, welcomeFor } from '../access/welcome.ts'
import { useArrivalSince, type ArrivalOptions } from '../personal/useSinceNews.ts'

interface Props extends Omit<ArrivalOptions, 'welcomed' | 'enabled'> {
  projectId: string
  identity: Identity
  onUpdates: () => void
}

export function ArrivalSince({ projectId, identity, onUpdates, ...at }: Props) {
  // The welcome holds the place for a newcomer, as the project opens (WelcomeBand reads it the same way).
  const [welcomed] = useState(() => welcomeFor(readWelcome(), projectId, Date.now()) !== null)
  const { arrival, dismiss } = useArrivalSince(identity, projectId, { ...at, welcomed })
  return (
    <div className="arrival-status" role="status">
      {arrival && (
        <div className="welcome-band arrival-band arrive">
          <p className="welcome-line">
            {arrival.words}{' '}
            <button type="button" className="text-button" onClick={onUpdates}>
              Open Updates
            </button>
          </p>
          <button type="button" className="round has-tip" aria-label="Dismiss" onClick={dismiss}>
            <Icon name="close" />
            <Tip label="Dismiss" side="bottom" align="end" />
          </button>
        </div>
      )}
    </div>
  )
}
