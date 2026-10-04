// A decision the plan leaves to someone, raised above its tasks (decision.v1, WBC-01 G4). It is bound to the work, plan
// revision and candidate it is about, and says so. Its decider answers it here: each choice is a button, and both
// resolve the same pending decision, once (05_CAPACITY_STEERING_HANDOVER: silence never chooses, so neither is
// preselected, and an expiry chooses nothing). An answer is one operation: if its reply is lost, only the same choice
// goes again, with the same operation, and no other choice can be sent until it is reconciled. The choice is the
// person's, recorded when the service commits it; the plan taking it in is the lead's, a separate state, said apart
// ("The plan is updating"). The answer outlives the component (answers.ts). Anyone else reads who decides and the
// choices, as words, not buttons.
import { Avatar } from '../../../app/Avatar.tsx'
import { expiry, type Resource } from '../../resources/resource.ts'
import { answerKey, operationFor, setAnswer, useAnswer, type Disposition } from './answers.ts'
import { actionable, type BoardDecision } from './plan.ts'

type Person = Resource['owner']

/** One answer, exactly: the decision at its revision, what it is about, the choice, and the operation it goes as. */
export interface DecisionAnswer {
  operation_id: string
  decision_id: string
  revision: number
  choice: string
  work_id: string
  plan_id: string
  plan_revision: number
  candidate_version_ref: string | null
}

export type Decide = (answer: DecisionAnswer) => Promise<Disposition>

const SAID: Record<Disposition | 'sending', (decider: string) => string> = {
  sending: () => 'Sending your choice…',
  recorded: () => 'Your choice is recorded. The plan is updating.',
  conflict: () => 'This decision changed. Nothing was chosen; review the current choices.',
  denied: (decider) => `Only ${decider} can decide this.`,
  expired: () => 'This decision expired. Nothing was chosen.',
  unknown: () => 'Checking whether your choice was recorded. Do not choose again yet.',
}

/** A decision decided, as the service committed it: the choice, and whether the plan has taken it in yet. */
function decidedSaid(decision: BoardDecision, name: string, mine: boolean): string | null {
  if (decision.state !== 'accepted' || !decision.selected_choice) return null
  const label = decision.choices.find((c) => c.key === decision.selected_choice)?.label ?? decision.selected_choice
  const who = mine ? 'Your choice is recorded' : `${name} chose ${label}`
  return decision.plan_reaction === 'pending' || decision.plan_reaction === 'unknown'
    ? `${who}. The plan is updating.`
    : `${who}.`
}

interface Props {
  decision: BoardDecision
  people: Record<string, Person>
  now: Date
  /** Who is looking: the decider answers; anyone else reads. */
  viewerId: string | null
  /** What it is about, in words: its task, and the candidate when it names one. */
  about?: string | null
  /** Where an answer goes; absent, every choice is read only. */
  onDecide?: Decide | undefined
  newId?: () => string
}

/** No answer given yet. */
const UNANSWERED = { state: null, chosen: null }

const face = (p: Person) => ({ name: p.name, displayName: p.name, avatarUrl: p.avatarUrl ?? null })

function useChoose({ decision, onDecide, viewerId, newId = () => crypto.randomUUID() }: Props) {
  const key = answerKey(decision.decision_id, decision.revision, viewerId)
  const answer = useAnswer(key)
  const pressable = (choice: string) => operationFor(answer, choice, () => 'probe') !== null
  const choose = (choice: string) => {
    const operation = operationFor(answer, choice, newId)
    if (!onDecide || operation === null) return
    setAnswer(key, { state: 'sending', chosen: choice, operation_id: operation })
    const { decision_id, revision, work_id, plan_id, plan_revision, candidate_version_ref } = decision
    const sent = {
      operation_id: operation,
      decision_id,
      revision,
      choice,
      work_id,
      plan_id,
      plan_revision,
      candidate_version_ref,
    }
    onDecide(sent).then(
      (said) => setAnswer(key, { state: said, chosen: choice, operation_id: operation }),
      () => setAnswer(key, { state: 'unknown', chosen: choice, operation_id: operation }),
    )
  }
  return { answer: answer ?? UNANSWERED, pressable, choose }
}

interface ChoicesProps {
  decision: BoardDecision
  /** The viewer decides it now: its choices are buttons. */
  mine: boolean
  chosen: string | null
  pressable: (choice: string) => boolean
  choose: (choice: string) => void
}

/** Its choices: buttons for its decider while it can be answered; words for anyone else, or past its expiry. */
function Choices({ decision, mine, chosen, pressable, choose }: ChoicesProps) {
  if (!mine) return <p className="plan-ask-choices">{decision.choices.map((c) => c.label).join('  or  ')}</p>
  return (
    <div className="plan-choices" role="group" aria-label="Your choice">
      {decision.choices.map((c) => (
        <button
          key={c.key}
          type="button"
          className="pill plan-choice"
          data-chosen={chosen === c.key || undefined}
          disabled={!pressable(c.key)}
          onClick={() => choose(c.key)}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}

/** What a decision says to the viewer: who decides, whether it is theirs to answer now, and what is known of it. */
function useDecisionView(props: Props) {
  const { decision, people, now, viewerId, onDecide } = props
  const chosen = useChoose(props)
  const decider = people[decision.decider_id] ?? null
  const name = decider?.name ?? 'Someone'
  // Its decider answers it while it can be answered: past its expiry, the choices are words for everyone.
  const mine = !!onDecide && viewerId === decision.decider_id && actionable(decision, now)
  const decided = decidedSaid(decision, name, viewerId === decision.decider_id)
  const { state } = chosen.answer
  const said = decided ?? (state ? SAID[state](name) : null)
  return { ...chosen, decider, name, mine, decided, said, saidState: decided ? 'decided' : (state ?? undefined) }
}

export function Decision(props: Props) {
  const { decision, now, about } = props
  const { answer, pressable, choose, decider, name, mine, decided, said, saidState } = useDecisionView(props)
  return (
    <section
      className="plan-ask"
      aria-label={`${name} decides`}
      data-decision={decision.decision_id}
      data-mine={mine || undefined}
    >
      {decider && <Avatar identity={face(decider)} />}
      <div className="plan-ask-body">
        <p className="plan-ask-head">
          <span className="field-label">{mine ? 'You decide' : `${name} decides`}</span>
          {!decided && <span className="plan-ask-due">{expiry(decision.expires_at, now)}</span>}
        </p>
        <p className="plan-ask-question">{decision.question}</p>
        {about && <p className="plan-ask-about muted">{about}</p>}
        {!decided && (
          <Choices decision={decision} mine={mine} chosen={answer.chosen} pressable={pressable} choose={choose} />
        )}
        {/* One status from the start, its words changed in place: a screen reader hears each step, the last too. */}
        <p className="plan-ask-said" role="status" data-state={saidState}>
          {said && <span key={saidState}>{said}</span>}
        </p>
      </div>
    </section>
  )
}
