// A new decision waiting on the viewer, heard while the tab is hidden (decision-alert.md): as the door's knock, the
// first look is the baseline (those open on arrival are not news), and the look moves on with every change. No sound:
// a decision is not someone at the door.
import { useEffect, useRef } from 'react'
import { notifyHidden } from '../../../app/notify.ts'
import { decisionNote, newSince, type OpenDecision } from './decision-alert.ts'

export function useDecisionAlert(open: readonly OpenDecision[] | undefined, projectId: string, projectTitle: string) {
  const seen = useRef<ReadonlySet<string> | null>(null)
  // The list is a new array on every render, its decisions are not: the effect runs when they change (`ids`).
  const latest = useRef(open)
  latest.current = open
  const ids = open?.map((d) => d.id).join(',')
  useEffect(() => {
    const now = latest.current
    // Before the board is read there is no baseline: nothing yet is news.
    if (!now) return
    const before = seen.current
    seen.current = new Set(now.map((d) => d.id))
    if (before === null) return
    const arrived = newSince(before, now)
    if (arrived.length === 0) return
    const note = decisionNote(arrived, projectTitle)
    notifyHidden(note.title, note.body, `decision:${projectId}`)
  }, [ids, projectTitle, projectId])
}
