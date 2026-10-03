// A decision the plan leaves to someone, raised above its tasks (decision.v1). Its decider answers it here: each choice
// is a button, and both resolve the same pending decision, once (05_CAPACITY_STEERING_HANDOVER: silence never chooses,
// so neither is preselected). The answer is said as its receipt comes back: sent, or refused because the decision
// changed since it was read (LFE-07 PLAN-02), or not confirmed. It shows as decided only once the plan records it.
// Anyone else reads who decides and the choices, as words, not buttons.
import { useState } from 'react'
import { Avatar } from '../../../app/Avatar.tsx'
import { expiry, type Resource } from '../../resources/resource.ts'
import { actionable, type PlanDecision } from './plan.ts'

type Person = Resource['owner']

/** What came back for an answer: recorded, refused as stale, refused as not the decider's, or not confirmed. */
export type Disposition = 'recorded' | 'conflict' | 'denied' | 'unknown'
export type Decide = (decision: PlanDecision, choice: string) => Promise<Disposition>

const SAID: Record<Disposition | 'sending', (choice: string, decider: string) => string> = {
  sending: () => 'Sending your choice…',
  recorded: (choice) => `Sent: ${choice}. It shows as decided once the lead records it.`,
  conflict: () => 'This decision changed since you read it. Nothing was chosen: read it again.',
  denied: (_, decider) => `Only ${decider} can decide this.`,
  unknown: () => 'Not confirmed. Nothing is assumed: check before choosing again.',
}

/**
 * Whether a choice can be pressed: not while one is on its way or recorded; after a refusal, any; after an unconfirmed
 * one, only the same again (unknown stays unknown until resolved: choosing otherwise could decide twice). A revised
 * decision is a new one: its component starts afresh (keyed by its revision).
 */
function pressable(state: Disposition | 'sending' | null, chosen: string | null, key: string): boolean {
  if (state === 'sending' || state === 'recorded') return false
  return state !== 'unknown' || chosen === key
}

interface Props {
  decision: PlanDecision
  people: Record<string, Person>
  now: Date
  /** Who is looking: the decider answers; anyone else reads. */
  viewerId: string | null
  /** Where an answer goes; absent, every choice is read only. */
  onDecide?: Decide | undefined
}

const face = (p: Person) => ({ name: p.name, displayName: p.name, avatarUrl: p.avatarUrl ?? null })

export function Decision({ decision, people, now, viewerId, onDecide }: Props) {
  const [state, setState] = useState<Disposition | 'sending' | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const decider = people[decision.decider_id]
  const name = decider?.name ?? 'Someone'
  // Its decider answers it while it can be answered: past its expiry, the choices are words for everyone.
  const mine = !!onDecide && viewerId === decision.decider_id && actionable(decision, now)
  const choose = (key: string) => {
    if (!onDecide || !pressable(state, chosen, key)) return
    setChosen(key)
    setState('sending')
    onDecide(decision, key).then(setState, () => setState('unknown'))
  }
  const label = (key: string | null) => decision.choices.find((c) => c.key === key)?.label ?? ''
  return (
    <section className="plan-ask" aria-label={`${name} decides`} data-mine={mine || undefined}>
      {decider && <Avatar identity={face(decider)} />}
      <div className="plan-ask-body">
        <p className="plan-ask-head">
          <span className="field-label">{mine ? 'You decide' : `${name} decides`}</span>
          <span className="plan-ask-due">{expiry(decision.expires_at, now)}</span>
        </p>
        <p className="plan-ask-question">{decision.question}</p>
        {mine ? (
          <div className="plan-choices" role="group" aria-label="Your choice">
            {decision.choices.map((c) => (
              <button
                key={c.key}
                type="button"
                className="pill plan-choice"
                data-chosen={chosen === c.key || undefined}
                disabled={!pressable(state, chosen, c.key)}
                onClick={() => choose(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="plan-ask-choices">{decision.choices.map((c) => c.label).join('  or  ')}</p>
        )}
        {state && (
          <p className="plan-ask-said" role="status" data-state={state}>
            {SAID[state](label(chosen), name)}
          </p>
        )}
      </div>
    </section>
  )
}
