// The lead's plan in Tasks, under the goal it serves (LFE-07.1): its revision and whether it is accepted, the next
// checkpoint, each item with who does it and when it starts, then what it assumes and what it leaves to someone to
// decide. It reads; nothing here acts yet, so nothing looks like it does (editing a plan revision is a later slice).
import { Tag } from '@sophia/ui'
import { OwnerAvatar } from '../../resources/OwnerAvatar.tsx'
import { ToolLogo } from '../../resources/ToolLogo.tsx'
import { WORK_STATE, type Resource } from '../../resources/resource.ts'
import '../../resources/resources.css'
import { current, planRows, startsWhen, whoDoes, type PlanDecision, type PlanItem, type WorkPlan } from './plan.ts'
import './plan.css'

type Person = Resource['owner']

interface Props {
  plan: WorkPlan | null
  /** Where each item's assignment runs: its session, on someone's resource (LFE-06). */
  resources: readonly Resource[]
  /** The project's people, by id: who decides, and who does an item by hand. */
  people: Record<string, Person>
}

const STATE = {
  accepted: ['teal', 'Accepted'],
  proposed: ['amber', 'Proposed · not accepted yet'],
} as const

function Item({ item, depth, plan, resources, people }: Omit<Props, 'plan'> & ItemProps) {
  const doer = whoDoes(item, resources, people)
  return (
    <li className="plan-item" data-depth={depth}>
      <p className="plan-purpose">
        {item.purpose}
        {doer.state && <Tag tone={WORK_STATE[doer.state][0]}>{WORK_STATE[doer.state][1]}</Tag>}
      </p>
      <p className="plan-who">
        {doer.person && <OwnerAvatar owner={doer.person} />}
        {doer.resource && <ToolLogo tool={doer.resource.tool} size="sm" />}
        <span>{doer.name}</span>
        {doer.role && <span className="muted">{doer.role}</span>}
        {/* When it starts, until it has: then its session says what it is doing. */}
        {!doer.state && <span className="plan-when">{startsWhen(item, plan)}</span>}
      </p>
    </li>
  )
}

interface ItemProps {
  item: PlanItem
  depth: number
  plan: WorkPlan
}

/** A decision the plan reserves: who decides, and its choices, read here, answered where it is asked. */
function Decision({ decision, people }: { decision: PlanDecision; people: Record<string, Person> }) {
  const decider = people[decision.decider_id]
  const chosen = decision.choices.find((c) => c.key === decision.selected_choice)
  return (
    <li className="plan-decision">
      <p>{decision.question}</p>
      <p className="plan-who">
        {decider && <OwnerAvatar owner={decider} />}
        <span>{chosen ? `${decider?.name ?? 'Someone'} chose` : `${decider?.name ?? 'Someone'} decides`}</span>
        <span className="plan-choices">{chosen ? chosen.label : decision.choices.map((c) => c.label).join(' · ')}</span>
      </p>
    </li>
  )
}

function Decisions({ title, list, people }: { title: string; list: PlanDecision[]; people: Props['people'] }) {
  if (list.length === 0) return null
  return (
    <section className="plan-part" aria-label={title}>
      <h4 className="field-label">{title}</h4>
      <ul className="plan-list">
        {list.map((d) => (
          <Decision key={d.decision_id} decision={d} people={people} />
        ))}
      </ul>
    </section>
  )
}

export function PlanView({ plan: given, resources, people }: Props) {
  const plan = current(given)
  if (!plan) return null
  const state = plan.state === 'accepted' ? STATE.accepted : STATE.proposed
  return (
    <section className="plan" aria-labelledby="plan-title">
      <h3 id="plan-title" className="view-subhead plan-head">
        Plan
        <span className="count">r{plan.revision}</span>
        <Tag tone={state[0]}>{state[1]}</Tag>
      </h3>
      {plan.next_checkpoint && (
        <p className="plan-checkpoint">
          <span className="field-label">Next checkpoint</span>
          {plan.next_checkpoint.label}
        </p>
      )}
      <ol className="plan-items" aria-label="Its work">
        {planRows(plan).map(({ item, depth }) => (
          <Item key={item.id} item={item} depth={depth} plan={plan} resources={resources} people={people} />
        ))}
      </ol>
      {plan.assumptions.length > 0 && (
        <section className="plan-part" aria-label="Assumed">
          <h4 className="field-label">Assumed</h4>
          <ul className="plan-list plan-assumed">
            {plan.assumptions.map((a) => (
              <li key={a.id}>{a.text}</li>
            ))}
          </ul>
        </section>
      )}
      <Decisions title="To decide" list={plan.decisions.filter((d) => d.state === 'proposed')} people={people} />
      <Decisions title="Decided" list={plan.decisions.filter((d) => d.state === 'accepted')} people={people} />
    </section>
  )
}
