// A knock at the door, heard (docs/plans/knock-alert.md): for those who can let people in, a short chime for each new
// arrival and, while the tab is hidden and notifications are allowed, a browser notification that brings the tab back.
// Those already waiting when the page read its snapshot are not news.
import { useEffect, useRef } from 'react'
import type { LobbyEntry } from '@sophia/contracts'
import { notifyHidden } from '../../app/notify.ts'
import { arrivals, knockWords } from './knock-alert.ts'

export { canNotify } from '../../app/notify.ts'

let context: AudioContext | null = null

/** Two soft notes, made in the browser: no file to fetch, nothing loud. A browser that refuses sound stays quiet. */
function chime(): void {
  try {
    context ??= new AudioContext()
    const ctx = context
    void ctx.resume()
    for (const [i, pitch] of [660, 880].entries()) {
      const at = ctx.currentTime + i * 0.14
      const tone = ctx.createOscillator()
      const level = ctx.createGain()
      tone.type = 'sine'
      tone.frequency.value = pitch
      level.gain.setValueAtTime(0.08, at)
      level.gain.exponentialRampToValueAtTime(0.0001, at + 0.3)
      tone.connect(level).connect(ctx.destination)
      tone.start(at)
      tone.stop(at + 0.3)
    }
  } catch {
    // No sound here: the door's panel and the tab's title still say it.
  }
}

interface Options {
  projectId: string
  projectTitle: string
  canDecide: boolean
  /** The snapshot has been read: before it, an empty door is not yet the door. */
  loaded: boolean
}

export function useKnockAlert(waiting: readonly LobbyEntry[], { projectId, projectTitle, canDecide, loaded }: Options) {
  const seen = useRef<ReadonlySet<string> | null>(null)
  // The list is a new array on every render, its people are not: the effect runs when they change (`ids`).
  const latest = useRef(waiting)
  latest.current = waiting
  const ids = waiting.map((e) => e.id).join(',')
  useEffect(() => {
    if (!loaded) return
    const people = latest.current
    const before = seen.current
    // The first look is the baseline: those already waiting are not news.
    if (before === null) {
      seen.current = new Set(people.map((e) => e.id))
      return
    }
    // While the role is unread (or isn't one that answers), the look doesn't move on: a knock meanwhile is still news
    // once the role says they can answer (Codex P2 on #362).
    if (!canDecide) return
    seen.current = new Set(people.map((e) => e.id))
    const arrived = arrivals(before, people)
    if (arrived.length === 0) return
    chime()
    notifyHidden(knockWords(arrived), projectTitle, `knock:${projectId}`)
  }, [ids, loaded, canDecide, projectTitle, projectId])
}
