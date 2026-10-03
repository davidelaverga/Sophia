// The lead's plan in Tasks, under the goal it serves (LFE-07.1). One thing to read first, then one line per task:
// - its head: PLAN r2 and whether it is accepted, a tally of where its tasks stand, each with its mark; the head folds
//   the plan away to that tally, for a project with several goals;
// - the next checkpoint, as its lead sentence;
// - what waits on someone's decision, raised, with who decides; its decider answers it there (Decision.tsx);
// - its tasks, one line each, ordered by what moves: a mark, the task, where it stands in words, and who does it (a
//   picture with their tool's logo on it). Hovering a task lights the tasks it waits on;
// - what it assumes and what was decided, folded into one quiet line.
import { useId, useState } from 'react'
import { Icon, Tag, Tip } from '@sophia/ui'
import { Avatar } from '../../../app/Avatar.tsx'
import { ToolLogo } from '../../resources/ToolLogo.tsx'
import type { Resource } from '../../resources/resource.ts'
import '../../resources/resources.css'
import { Decision, type Decide } from './Decision.tsx'
import { current, planRows, tally, waitsOn, type Doer, type Mark, type PlanRow, type WorkPlan } from './plan.ts'
import './plan.css'

type Person = Resource['owner']

interface Props {
  plan: WorkPlan | null
  /** Where each item's assignment runs: its session, on someone's resource (LFE-06). */
  resources: readonly Resource[]
  /** The project's people, by id: who decides, and who does an item by hand. */
  people: Record<string, Person>
  now: Date
  /** Who is looking: a decision's decider answers it. */
  viewerId?: string | null
  /** Where a decider's answer goes; absent, decisions are read only. */
  onDecide?: Decide
}

const MARK_WORDS: Record<Mark, string> = {
  waiting: 'waiting',
  working: 'working',
  queued: 'queued',
  later: 'not started',
  free: 'free',
}

/** Where a task stands, as a mark: filled when it runs, hollow before it starts, dashed when no one has it. */
const StatusMark = ({ mark }: { mark: Mark }) => <span className="plan-mark" data-mark={mark} aria-hidden />

const face = (p: Person) => ({ name: p.name, displayName: p.name, avatarUrl: p.avatarUrl ?? null })

/** Who does it: their picture with their tool's logo on it, named on hover; an empty ring when no one does. */
function Who({ doer }: { doer: Doer }) {
  const label = doer.role ? `${doer.name} · ${doer.role}` : doer.name
  return (
    <span className="plan-who has-tip" aria-label={label}>
      {doer.person ? (
        <Avatar identity={face(doer.person)} />
      ) : (
        // Assigned to a session not running yet: a quiet ring. No one at all: a dashed one, free to take.
        <span className="plan-nobody" data-free={doer.name === 'Unassigned' || undefined} />
      )}
      {doer.resource && <ToolLogo tool={doer.resource.tool} size="sm" />}
      <Tip label={label} side="top" align="end" />
    </span>
  )
}

function Row({ row, lit, onLight }: { row: PlanRow; lit: boolean; onLight: (id: string | null) => void }) {
  const { item, doer, status, depth } = row
  return (
    <li
      className="plan-row"
      data-mark={status.mark}
      data-depth={depth}
      data-lit={lit || undefined}
      onPointerEnter={() => onLight(item.id)}
      onPointerLeave={() => onLight(null)}
    >
      <StatusMark mark={status.mark} />
      <span className="plan-task">{item.purpose}</span>
      <span className="plan-status">{status.text}</span>
      <Who doer={doer} />
    </li>
  )
}

interface HeadProps {
  plan: WorkPlan
  rows: PlanRow[]
  id: string
  open: boolean
  onToggle: () => void
}

/** PLAN r2 Accepted, which folds the plan to its tally, and the tally itself. */
function Head({ plan, rows, id, open, onToggle }: HeadProps) {
  return (
    <header className="plan-head">
      <h3 id={id} className="plan-title">
        <button
          type="button"
          className="plan-toggle"
          aria-label={`Plan r${plan.revision}`}
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className="field-label">Plan</span>
          <span className="count">r{plan.revision}</span>
          <Icon name="chevron" size={12} />
        </button>
        {plan.state === 'accepted' ? (
          <Tag tone="teal">Accepted</Tag>
        ) : (
          <Tag tone="amber">Proposed · not accepted yet</Tag>
        )}
      </h3>
      <ul className="plan-tally" aria-label="Where its tasks stand">
        {tally(rows).map(({ mark, count }) => (
          <li key={mark} data-mark={mark}>
            <StatusMark mark={mark} />
            {count} {MARK_WORDS[mark]}
          </li>
        ))}
      </ul>
    </header>
  )
}

export function PlanView({ plan: given, resources, people, now, viewerId = null, onDecide }: Props) {
  const [lit, setLit] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  const id = useId()
  const plan = current(given)
  if (!plan) return null
  const rows = planRows(plan, resources, people)
  const lighting = rows.find((r) => r.item.id === lit)?.item
  const linked = new Set(lighting ? waitsOn(lighting) : [])
  return (
    <section className="plan" aria-labelledby={id} data-open={open || undefined}>
      <Head plan={plan} rows={rows} id={id} open={open} onToggle={() => setOpen(!open)} />
      {open && (
        <>
          {plan.next_checkpoint && (
            <p className="plan-checkpoint">
              <span className="field-label">Next</span>
              {plan.next_checkpoint.label}
            </p>
          )}
          {plan.decisions
            .filter((d) => d.state === 'proposed')
            .map((d) => (
              <Decision
                key={d.decision_id}
                decision={d}
                people={people}
                now={now}
                viewerId={viewerId}
                onDecide={onDecide}
              />
            ))}
          <ol className="plan-rows" aria-label="Its tasks">
            {rows.map((row) => (
              <Row key={row.item.id} row={row} lit={linked.has(row.item.id)} onLight={setLit} />
            ))}
          </ol>
          <Folded plan={plan} people={people} />
        </>
      )}
    </section>
  )
}

/** What the plan assumes and what was decided: one quiet line, opened on request. */
function Folded({ plan, people }: { plan: WorkPlan; people: Record<string, Person> }) {
  const [open, setOpen] = useState(false)
  const decided = plan.decisions.filter((d) => d.state === 'accepted')
  if (plan.assumptions.length === 0 && decided.length === 0) return null
  const said = [
    plan.assumptions.length > 0 && `${plan.assumptions.length} assumed`,
    decided.length > 0 && `${decided.length} decided`,
  ].filter(Boolean)
  return (
    <div className="plan-fold">
      {/* Keyed on what it says: a new decision lands with the line arriving again. */}
      <button
        key={said.join()}
        type="button"
        className="ghost plan-fold-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {said.join(' · ')}
        <Icon name="chevron" size={12} />
      </button>
      {open && (
        <div className="plan-fold-body">
          {plan.assumptions.length > 0 && (
            <ul className="plan-assumed" aria-label="Assumed">
              {plan.assumptions.map((a) => (
                <li key={a.id}>{a.text}</li>
              ))}
            </ul>
          )}
          {decided.length > 0 && (
            <ul className="plan-decided" aria-label="Decided">
              {decided.map((d) => (
                <li key={d.decision_id}>
                  {d.question}{' '}
                  <span className="muted">
                    {people[d.decider_id]?.name ?? 'Someone'} chose{' '}
                    {d.choices.find((c) => c.key === d.selected_choice)?.label ?? 'one'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
