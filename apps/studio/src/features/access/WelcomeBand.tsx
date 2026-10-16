// The newcomer's welcome, once, under the project's bar (docs/plans/newcomer-welcome.md): who brought them and as what,
// what the project is for, its goals; «See the goals» opens Goals, «Got it» ends it. Either ends it for good.
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { Snapshot } from '@sophia/contracts'
import { Button } from '@sophia/ui'
import { getMission } from '../../api/mission.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { missionKey } from '../mission/mission-view.ts'
import { endWelcome, readWelcome, welcomeFor, welcomeWords, type Welcome } from './welcome.ts'

interface Props {
  projectId: string
  identity: Identity
  snapshot: Snapshot | undefined
  onGoals: () => void
}

function Band({ welcome, onEnd, onGoals, ...at }: Props & { welcome: Welcome; onEnd: () => void }) {
  const mission = useQuery({
    queryKey: missionKey(at.projectId),
    queryFn: () => getMission(at.identity.token, at.projectId),
  }).data?.mission
  const words = welcomeWords(welcome, {
    title: at.snapshot?.title ?? 'the project',
    purpose: mission ? (mission.purpose ?? mission.statement) : null,
    goals: at.snapshot?.goals.length ?? 0,
  })
  return (
    <section className="welcome-band arrive" aria-label="Welcome">
      <div className="welcome-words">
        <p className="welcome-title">{words.title}</p>
        <p className="welcome-line">
          {words.who} {words.goals}.
        </p>
        {words.forWhat && <p className="welcome-for">{words.forWhat}</p>}
      </div>
      <div className="welcome-presses">
        <Button
          kind="primary"
          onClick={() => {
            onEnd()
            onGoals()
          }}
        >
          See the goals
        </Button>
        <Button kind="pill" onClick={onEnd}>
          Got it
        </Button>
      </div>
    </section>
  )
}

export function WelcomeBand(props: Props) {
  const [welcome, setWelcome] = useState(() => welcomeFor(readWelcome(), props.projectId, Date.now()))
  if (!welcome) return null
  const end = () => {
    endWelcome()
    setWelcome(null)
  }
  return <Band {...props} welcome={welcome} onEnd={end} />
}
