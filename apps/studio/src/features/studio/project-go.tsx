// One way across a project's views (docs/plans/knowledge-origins.md): a view is shown with something in it open, a
// conversation in Conversations, a meeting's recap in Updates, the brief in the Studio view, a task in Tasks (named
// in the address, as a link followed: the board that holds it opens it). The shell shows the view and keeps what to
// open; the view takes it once, so Back or a later visit opens nothing by itself.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { View } from '../../app/route.ts'
import { VISION } from '../../app/vision.ts'
import { ADDRESS_NAMED } from '../resources/useAddressed.ts'
import { GOAL, showInAddress, TASK } from '../resources/link.ts'

export type Arrival =
  | { view: 'conversations'; conversationId: string }
  /** A new conversation, its question these words and Sophia asked (docs/plans/ask-instead.md). */
  | { view: 'conversations'; ask: string }
  | { view: 'updates'; meetingId: string }
  | { view: 'studio'; brief: true }
  | { view: 'work'; taskId?: string | undefined }
  /** A goal's sheet in Goals, named in the address (report-origin.md). */
  | { view: 'goals'; goalId: string }

interface Go {
  go: (to: Arrival) => void
  arrival: Arrival | null
  arrived: () => void
}

const ProjectGo = createContext<Go | null>(null)

/** Goes to a view with something open in it; null outside a project's shell. */
export const useProjectGo = (): ((to: Arrival) => void) | null => useContext(ProjectGo)?.go ?? null

/**
 * Asks Sophia in a new conversation, its question the words given (docs/plans/ask-instead.md): only inside a project's
 * shell with Conversations among its views (the vision flag); null elsewhere, so nothing is offered that leads nowhere.
 */
export function useAskSophia(): ((question: string) => void) | null {
  const go = useProjectGo()
  if (!go || !VISION) return null
  return (question) => go({ view: 'conversations', ask: question })
}

export function ProjectGoProvider({ onShow, children }: { onShow: (view: View) => void; children: ReactNode }) {
  const [arrival, setArrival] = useState<Arrival | null>(null)
  const go = useCallback(
    (to: Arrival) => {
      if (to.view !== 'work' && to.view !== 'goals') setArrival(to)
      onShow(to.view)
      // A task or a goal is named in the address after the view's own push (which carries no fragment): the board or
      // Goals opens it (useOpenTask, useOpenGoal), as a link followed does.
      if (to.view === 'work' && to.taskId !== undefined) showInAddress(to.taskId, TASK)
      if (to.view === 'goals') {
        showInAddress(to.goalId, GOAL)
        window.dispatchEvent(new Event(ADDRESS_NAMED))
      }
    },
    [onShow],
  )
  const arrived = useCallback(() => setArrival(null), [])
  const value = useMemo(() => ({ go, arrival, arrived }), [go, arrival, arrived])
  return <ProjectGo.Provider value={value}>{children}</ProjectGo.Provider>
}

/**
 * What this view was asked to open, given to `open` once and then forgotten. `open` answering `false` keeps it for a
 * later render (what it needs is still being read).
 */
export function useArrival<V extends Arrival['view']>(view: V, open: (to: Extract<Arrival, { view: V }>) => unknown) {
  const shell = useContext(ProjectGo)
  const to = shell?.arrival
  useEffect(() => {
    if (!shell || !to || to.view !== view) return
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowed by its view just above
    if (open(to as Extract<Arrival, { view: V }>) === false) return
    shell.arrived()
  }, [shell, to, view, open])
}
