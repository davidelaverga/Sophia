// A decision waiting on the viewer, heard beyond the view (docs/plans/decision-alert.md; informe-25 DL-07): counted in
// the tab's number, as the door is, and one that arrives while the tab is hidden told by a browser notification, as a
// knock is. Pure: which are open, which are news, and how they are said.
import { expiry } from '../../resources/resource.ts'
import type { BoardDecision } from './board-view.ts'
import { actionable, latestDecisions } from './plan.ts'

/** A decision waiting on the viewer: its id, its question, and when it ends («expires in 2 h»). */
export interface OpenDecision {
  id: string
  question: string
  due: string
}

/**
 * The decisions the viewer can answer now: each one's latest revision, still proposed, not past its expiry, theirs.
 * Proposed plans count too: the admission of one's own proposal is the decision production serves.
 */
export function openDecisions(decisions: readonly BoardDecision[], viewerId: string | null, now: Date): OpenDecision[] {
  if (viewerId === null) return []
  return latestDecisions(decisions)
    .filter((d) => d.decider_id === viewerId && actionable(d, now))
    .map((d) => ({ id: d.decision_id, question: d.question, due: expiry(d.expires_at, now) }))
}

/** Every goal's open decisions together; undefined while the board hasn't been read. */
export function openAcross(
  plans: Readonly<Record<string, { toDecide?: readonly OpenDecision[] }>> | undefined,
): OpenDecision[] | undefined {
  return plans && Object.values(plans).flatMap((p) => p.toDecide ?? [])
}

/** The ones not there at the last look: news. */
export const newSince = (seen: ReadonlySet<string>, open: readonly OpenDecision[]) =>
  open.filter((d) => !seen.has(d.id))

/** How a notification says them: one by its question and when it ends, several by how many. */
export function decisionNote(arrived: readonly OpenDecision[], projectTitle: string): { title: string; body: string } {
  const [one] = arrived
  if (arrived.length === 1 && one)
    return { title: `A decision waits on you: ${one.question}`, body: `${projectTitle} · ${one.due}` }
  return { title: `${String(arrived.length)} decisions wait on you`, body: projectTitle }
}
