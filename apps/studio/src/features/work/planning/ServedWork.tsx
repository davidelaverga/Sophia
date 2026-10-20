// Tasks with the board Sophia serves (WBC-02 G5): each goal's plan from the project's work board, read by the board's
// own reader (board-view.ts) and shown with the goal it serves, and the source-review pilot's entry under a goal. The
// board is read again whenever the project's feed applies an event, and every half minute; a board the reader refuses,
// or another project's, is a failed read (Tasks says so with Try again). Its ports are Sophia's (served.ts): nothing
// here reaches Paperclip, and nothing derives a grant: each action is as the board's view allows it to the viewer.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Goal, ProjectMember } from '@sophia/contracts'
import { getProjectMembers } from '../../../api/client.ts'
import { answerDecision, commandWork, operationReceipt, readBoard, workResult } from '../../../api/work.ts'
import { tokenSubject } from '../../../app/auth-callback.ts'
import type { Identity } from '../../../app/dev-identity.ts'
import type { Feed } from '../../../projectors/projection.ts'
import type { Resource } from '../../resources/resource.ts'
import type { GoalPlan } from '../GoalList.tsx'
import { boardPeople, viewerOf } from './board-people.ts'
import { readBoardView, type BoardView } from './board-view.ts'
import { openDecisions } from './decision-alert.ts'
import { Decision, type Decide } from './Decision.tsx'
import { PlanBoard } from './PlanBoard.tsx'
import { PlanNext } from './PlanNext.tsx'
import { PlanTab } from './PlanTab.tsx'
import { actionable, boardOf, forYou, glancedOf, type GoalView } from './plan.ts'
import { proposals, proposalViewer } from './review-proposal.ts'
import { ReviewSources } from './ReviewSources.tsx'
import { commandWith, decideWith, readResultWith } from './served.ts'

type Person = Resource['owner']

/** No resource does Sophia's own review: who does it is "Sophia · Source reviewer", with no capacity to read. */
const NO_RESOURCES: readonly Resource[] = []

export const boardKey = (projectId: string, viewer: string) => ['work-board', projectId, viewer] as const

/** The newest event the feed applied (not a cursor advance): a change of server state, the board's cue to look again. */
const newestEvent = (feed: Feed | null) => feed?.recent.find((f) => 'eventId' in f)?.sequence ?? null

/** Now, a minute at a time: ages and a decision's expiry read against it. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(tick)
  }, [])
  return now
}

/**
 * The served board as its reader accepts it, and only this project's: anything else throws, so the read fails as a reply
 * that breaks its contract does (callApi's `contract_violation`), never a success with nothing to show (silent-views.md).
 */
const servedBoard =
  (projectId: string) =>
  (value: unknown): BoardView => {
    const read = readBoardView(value)
    if (!read.ok) throw new Error(read.problems.join('; '))
    if (read.value.project_id !== projectId) throw new Error('$.project_id: another project’s board')
    return read.value
  }

/**
 * The project's board as served and read, or null while none can be shown; whether its first read is under way, and
 * whether it failed with nothing read, refused by its reader included (a board read once stays through a later failure:
 * the query keeps its data).
 */
function useBoard(projectId: string, identity: Identity, feed: Feed | null, enabled: boolean) {
  const board = useQuery({
    queryKey: boardKey(projectId, identity.name),
    queryFn: ({ signal }) => readBoard(identity.token, projectId, servedBoard(projectId), signal),
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    enabled,
  })
  const cue = newestEvent(feed)
  const { refetch } = board
  useEffect(() => {
    if (cue !== null && enabled) void refetch()
  }, [cue, refetch, enabled])
  const unread = enabled && board.data === undefined
  return {
    view: board.data ?? null,
    reading: unread && !board.isError,
    failed: unread && board.isError,
    retry: () => void refetch(),
  }
}

interface Shared {
  board: BoardView
  people: Record<string, Person>
  viewerId: string | null
  now: Date
  ports: ReturnType<typeof portsOf>
}

function portsOf(token: string, projectId: string) {
  return {
    decide: decideWith((answer) => answerDecision(token, projectId, answer)),
    command: commandWith({
      send: (body) => commandWork(token, projectId, body),
      receipt: (operationId) => operationReceipt(token, projectId, operationId),
    }),
    readResult: readResultWith((workId, versionId) => workResult(token, projectId, workId, versionId)),
  }
}

/** One goal's slot in Tasks: its board, its next checkpoint, its tab in the goals' rail, what finds it. */
function slotOf(goal: GoalView, { board, people, viewerId, now, ports }: Shared): GoalPlan {
  const shown = boardOf(goal, { resources: NO_RESOURCES, people, viewerId, project: board.project_id })
  const rows = shown?.rows ?? []
  return {
    view: (
      <PlanBoard
        projectId={board.project_id}
        goal={goal}
        coverage={board.coverage}
        observedAt={board.observed_at}
        resources={NO_RESOURCES}
        people={people}
        viewerId={viewerId}
        now={now}
        onDecide={ports.decide}
        onCommand={ports.command}
        readResult={ports.readResult}
      />
    ),
    next: <PlanNext goal={goal} now={now} people={people} viewerId={viewerId} />,
    tab: <PlanTab goal={goal} resources={NO_RESOURCES} people={people} viewerId={viewerId} now={now} />,
    words: rows.map((r) => r.item.purpose).join(' '),
    tasks: rows.map((r) => r.item.id),
    ...glancedOf(goal, rows, shown?.operable ?? false, viewerId, now),
    decisions: goal.decisions.map((d) => d.decision_id),
    attention: (shown?.operable ?? false) && forYou(rows, goal.decisions, viewerId, now),
    toDecide: openDecisions(goal.decisions, viewerId, now),
  }
}

export interface ServedWork {
  /** Each goal's plan from the served board, by the goal's id; undefined while no board can be shown. */
  plans: Readonly<Record<string, GoalPlan>> | undefined
  /** The source-review pilot's entry under a goal, for whoever can act on the work; undefined otherwise. */
  entry: ((goal: Goal) => React.ReactNode) | undefined
  /** The board's first read is under way: its tasks may still come (search-honest.md). */
  boardReading: boolean
  /** The board's reads failed with none read: its plans can't be shown, which is not «no plan» (silent-views.md). */
  boardFailed: boolean
  /** Reads the board again (Try again). */
  retryBoard: () => void
}

export interface ServedFor {
  projectId: string
  identity: Identity
  feed: Feed | null
  /** Editors and admins propose reviews; viewers read the board. */
  canAct: boolean
  /** False where the project can't be shown, or a page brings its own plans (a fixture): nothing is read then. */
  enabled: boolean
}

const NO_MEMBERS: readonly ProjectMember[] = []

/**
 * The project's members, to name the board's people (board-people.ts): the board's own `enabled`, so a page that brings
 * its plans or a closed door reads nothing. The key is Goals' (GoalTargets.tsx `useMembers`), which InProject.tsx
 * invalidates after a removal or a role change: one read names both views.
 */
function useMembersNamed(projectId: string, identity: Identity, enabled: boolean): readonly ProjectMember[] {
  const read = useQuery({
    queryKey: ['members', projectId, identity.name],
    queryFn: () => getProjectMembers(identity.token, projectId),
    staleTime: 60_000,
    enabled,
  })
  return read.data?.members ?? NO_MEMBERS
}

/**
 * A review proposed under a goal with no plan in force, waiting on the viewer's choice: the board shows a plan only
 * proposed read only (WBC-01), so its admission is answered where it was proposed, at the pilot's entry. Once a plan is
 * in force, its board answers the next proposal's decision itself.
 */
export function pendingAdmission(board: BoardView | null, goalId: string, viewerId: string | null, now: Date) {
  const goal = board?.goals.find((g) => g.goal_id === goalId)
  if (!goal || goal.current_plan !== null || viewerId === null) return null
  const proposed = new Set(goal.proposed_plans.map((p) => p.plan_id))
  return goal.decisions.find((d) => proposed.has(d.plan_id) && d.decider_id === viewerId && actionable(d, now)) ?? null
}

/**
 * Whether the board shows a plan proposed for this goal waiting on the viewer's own decision, whether or not a plan is
 * in force: a proposal of theirs Sophia recorded.
 */
export function proposalShown(board: BoardView | null, goalId: string, viewerId: string | null, now: Date): boolean {
  const goal = board?.goals.find((g) => g.goal_id === goalId)
  if (!goal || viewerId === null) return false
  const proposed = new Set(goal.proposed_plans.map((p) => p.plan_id))
  return goal.decisions.some((d) => proposed.has(d.plan_id) && d.decider_id === viewerId && actionable(d, now))
}

/**
 * The viewer's proposal on the board, waiting on its decision: Sophia recorded it, so no proposal of this goal is kept
 * unanswered (review-proposal.ts). Answered there, the form after it starts afresh, never on the old request.
 */
function Recorded({
  viewer,
  project,
  goal,
  children,
}: {
  viewer: string
  project: string
  goal: string
  children: ReactNode
}) {
  useEffect(() => proposals.forget({ viewer, project, goal }), [viewer, project, goal])
  return children
}

/** Tasks' plans and pilot entry from the board Sophia serves for this project, as this viewer sees it. */
export function useServedWork({ projectId, identity, feed, canAct, enabled }: ServedFor): ServedWork {
  const read = useBoard(projectId, identity, feed, enabled)
  const board = read.view
  const now = useMinute()
  const queryClient = useQueryClient()
  const viewerId = tokenSubject(identity.token) ?? null
  const ports = useMemo(() => portsOf(identity.token, projectId), [identity.token, projectId])
  const members = useMembersNamed(projectId, identity, enabled)
  const people = useMemo(() => boardPeople(viewerOf(identity, viewerId), members), [identity, viewerId, members])
  const plans = useMemo(() => {
    if (!board) return undefined
    const shared: Shared = { board, people, viewerId, now, ports }
    const shown = board.goals.filter(
      (g) => boardOf(g, { resources: NO_RESOURCES, people, viewerId }) || g.items.length > 0,
    )
    return Object.fromEntries(shown.map((g) => [g.goal_id, slotOf(g, shared)]))
  }, [board, people, viewerId, now, ports])
  const refresh = () => void queryClient.invalidateQueries({ queryKey: boardKey(projectId, identity.name) })
  const decide: Decide = async (answer) => {
    const said = await ports.decide(answer)
    refresh()
    return said
  }
  const entry =
    canAct && enabled
      ? (goal: Goal) => {
          const pending = pendingAdmission(board, goal.id, viewerId, now)
          if (pending) {
            return (
              <Recorded viewer={proposalViewer(identity)} project={projectId} goal={goal.id}>
                <Decision decision={pending} people={people} now={now} viewerId={viewerId} onDecide={decide} />
              </Recorded>
            )
          }
          return (
            <ReviewSources
              projectId={projectId}
              identity={identity}
              goal={goal}
              onProposed={refresh}
              shown={proposalShown(board, goal.id, viewerId, now)}
            />
          )
        }
      : undefined
  return { plans, entry, boardReading: read.reading, boardFailed: read.failed, retryBoard: read.retry }
}
