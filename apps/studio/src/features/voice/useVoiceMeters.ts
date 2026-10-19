// Each speaker's meter and ring follow their voice (docs/plans/voice-meters.md): while anyone in the box speaks, under
// full motion, one frame loop writes `--level` on each speaking element (`[data-actor][data-speaking]`), through the same
// envelope as Sophia's light (motion.ts); one that stops speaking loses it. Keyed on whether anyone speaks, not on who,
// so a re-render mid-speech restarts nothing; out of sight (a box with no size) nothing is read.
import { useEffect, useRef, type RefObject } from 'react'
import { envelope } from '../light/motion.ts'
import type { RoomParticipant } from './room-view.ts'

/** One frame: each speaker's level followed and written, and what stopped speaking let go. */
function frame(root: HTMLElement, levels: Map<HTMLElement, number>, level: (identity: string) => number, dt: number) {
  const speakers = new Set(root.querySelectorAll<HTMLElement>('[data-actor][data-speaking]'))
  for (const el of levels.keys()) {
    if (speakers.has(el)) continue
    el.style.removeProperty('--level')
    levels.delete(el)
  }
  for (const el of speakers) {
    const next = envelope(levels.get(el) ?? 0, level(el.dataset.actor ?? ''), dt)
    levels.set(el, next)
    const said = next.toFixed(2)
    if (el.style.getPropertyValue('--level') !== said) el.style.setProperty('--level', said)
  }
}

export function useVoiceMeters(
  box: RefObject<HTMLElement | null>,
  people: readonly RoomParticipant[],
  level: (identity: string) => number,
): void {
  const speaking = people.some((p) => p.speaking)
  const levels = useRef(new Map<HTMLElement, number>())
  useEffect(() => {
    if (!speaking || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const followed = levels.current
    let id = 0
    let last = performance.now()
    const tick = (now: number) => {
      id = requestAnimationFrame(tick)
      // The clock's own time, however few frames draw it: the envelope is exact at any step (8 a second on a loaded CI).
      const dt = Math.max(0, (now - last) / 1000)
      last = now
      const root = box.current
      if (root && root.clientWidth > 0) frame(root, followed, level, dt)
    }
    id = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(id)
      for (const el of followed.keys()) el.style.removeProperty('--level')
      followed.clear()
    }
  }, [box, speaking, level])
}
