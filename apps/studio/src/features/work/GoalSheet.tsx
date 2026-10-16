// A goal's sheet (docs/plans/goals-overview.md): its health, its outcome, what in it waits on the viewer (with the
// presses), what else stands in its way, how far it has gone and what comes next, what done means, and the way to its
// plan in Tasks; and its notes (goal-notes.md).
import type { ArtifactVersion, Goal } from '@sophia/contracts'
import { Button } from '@sophia/ui'
import { Sheet } from '../../app/Sheet.tsx'
import { useDocumentViewer } from '../artifacts/viewer-context.ts'
import { GoalNotes, type NotesFor } from './GoalNotes.tsx'
import { GoalTargetSection } from './GoalTargets.tsx'
import { Asks } from './GoalParts.tsx'
import { Criteria } from './Criteria.tsx'
import { HEALTH_LABEL, healthOf, stateLine, wayLine, type Glanced } from './goals-glance.ts'
import { progressOf, type Ask } from './planning/plan.ts'

interface Props {
  goal: Goal
  plan: Glanced | undefined
  notes: NotesFor
  /** The reports its work made, newest first (goal-reports.md). */
  reports?: readonly ArtifactVersion[]
  onClose: () => void
  onOpenAsk: ((ask: Ask) => void) | undefined
  /** Tasks, with this goal chosen; undefined while it has no plan there. */
  onOpenTasks: (() => void) | undefined
}

/** How far it has gone, and what comes next. */
function Progress({ plan }: { plan: Glanced | undefined }) {
  const { done, total } = progressOf(plan?.glance?.lanes ?? [])
  if (total === 0) return null
  return (
    <div className="goal-sheet-progress">
      <p>
        <span>
          <b>
            {done} of {total}
          </b>{' '}
          tasks done
        </span>
        {plan?.checkpoint && <span className="goal-sheet-next">Next · {plan.checkpoint}</span>}
      </p>
      <span className="goal-track" aria-hidden>
        <span style={{ width: `${((done / total) * 100).toFixed(1)}%` }} />
      </span>
    </div>
  )
}

/** The reports this goal's work made (goal-reports.md): a title opens it in the viewer; none, or no viewer, no section. */
function GoalReports({ reports }: { reports: readonly ArtifactVersion[] }) {
  const viewer = useDocumentViewer()
  if (!viewer || reports.length === 0) return null
  return (
    <section className="goal-sheet-section goal-reports" aria-label="Reports">
      <h3 className="field-label">Reports</h3>
      <ul>
        {reports.map((r) => (
          <li key={r.artifactId}>
            <button type="button" className="text-button" onClick={() => viewer.open({ artifactId: r.artifactId })}>
              {r.title ?? 'Untitled report'}
            </button>
            {r.versionNumber !== undefined && <span className="goal-report-version">v{r.versionNumber}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function GoalSheet({ goal, plan, notes, reports = [], onClose, onOpenAsk, onOpenTasks }: Props) {
  const health = healthOf(goal, plan)
  const way = wayLine(plan?.glance)
  const asks = (plan?.asks ?? []).map((ask) => ({ ask, goal }))
  return (
    <Sheet id={`goal-sheet-${goal.id}`} title={goal.title} onClose={onClose}>
      <div className="goal-sheet" data-health={health}>
        <p className="goal-sheet-health">
          <span className="goal-health">{HEALTH_LABEL[health]}</span>
          {health === 'paused' && ` · ${stateLine(goal, plan?.glance)}`}
        </p>
        <p className="goal-outcome">{goal.outcome}</p>
        <GoalTargetSection goalId={goal.id} at={notes} />
        <Asks asks={asks} onOpen={onOpenAsk} inGoal />
        {way && (
          <p className="goal-sheet-way">
            {asks.length > 0 ? 'Also in the way' : 'In the way'} · {way}
          </p>
        )}
        <Progress plan={plan} />
        <GoalReports reports={reports} />
        <GoalNotes goalId={goal.id} {...notes} />
        {goal.criteria.length > 0 && (
          <section className="goal-sheet-section" aria-label="Done when">
            <h3 className="field-label">Done when</h3>
            <Criteria goal={goal} />
          </section>
        )}
        {onOpenTasks && (
          <div className="goal-sheet-foot">
            <Button kind="pill" onClick={onOpenTasks}>
              Open in Tasks
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  )
}
