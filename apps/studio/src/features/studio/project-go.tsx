// One way across a project's views (docs/plans/knowledge-origins.md): a view is shown with something in it open, a
// conversation in Conversations, a meeting's recap in Updates, the brief in the Studio view, a task in Tasks (named
// in the address, as a link followed: the board that holds it opens it). The shell shows the view and keeps what to
// open; the view takes it once, so Back or a later visit opens nothing by itself.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { View } from '../../app/route.ts'
import { showInAddress, TASK } from '../resources/link.ts'

export type Arrival =
  | { view: 'conversations'; conversationId: string }
  | { view: 'updates'; meetingId: string }
  | { view: 'studio'; brief: true }
  | { view: 'work'; taskId: string }

interface Go {
  go: (to: Arrival) => void
  arrival: Arrival | null
  arrived: () => void
}

const ProjectGo = createContext<Go | null>(null)

/** Goes to a view with something open in it; null outside a project's shell. */
export const useProjectGo = (): ((to: Arrival) => void) | null => useContext(ProjectGo)?.go ?? null

export function ProjectGoProvider({ onShow, children }: { onShow: (view: View) => void; children: ReactNode }) {
  const [arrival, setArrival] = useState<Arrival | null>(null)
  const go = useCallback(
    (to: Arrival) => {
      // A task is named in the address: the board that holds it opens it (useOpenTask), as a link followed does.
      if (to.view === 'work') showInAddress(to.taskId, TASK)
      else setArrival(to)
      onShow(to.view)
    },
    [onShow],
  )
  const arrived = useCallback(() => setArrival(null), [])
  const value = useMemo(() => ({ go, arrival, arrived }), [go, arrival, arrived])
  return <ProjectGo.Provider value={value}>{children}</ProjectGo.Provider>
}

/** What this view was asked to open, given to `open` once and then forgotten. */
export function useArrival<V extends Arrival['view']>(view: V, open: (to: Extract<Arrival, { view: V }>) => void) {
  const shell = useContext(ProjectGo)
  const to = shell?.arrival
  useEffect(() => {
    if (!shell || !to || to.view !== view) return
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowed by its view just above
    open(to as Extract<Arrival, { view: V }>)
    shell.arrived()
  }, [shell, to, view, open])
}
