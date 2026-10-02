// How the places move (direction C). A door grows into its space and the space shrinks back into its door; the Personal
// door's light rises and spreads until it is the light of the room; Personal and Work slide past each other across the
// line. Both places stay rendered while they move, then only the arrived one. Reduced motion: the same steps, at once.
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { Place } from '../../app/route.ts'

const EASE = 'cubic-bezier(0.2, 0, 0, 1)'
const FULL = 'inset(0px 0px 0px 0px round 0px)'
const BAR = 52

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

function play(el: Element | null, frames: Keyframe[], ms: number, delay = 0): Animation | null {
  if (!el) return null
  const fast = reduced()
  return el.animate(frames, { duration: fast ? 1 : ms, delay: fast ? 0 : delay, easing: EASE, fill: 'both' })
}

/** The door's rectangle as a clip on the full-size space, so the space can start as the door. */
function clipOf(root: HTMLElement, door: Element): string {
  const s = root.getBoundingClientRect()
  const r = door.getBoundingClientRect()
  return `inset(${r.top - s.top - BAR}px ${s.right - r.right}px ${s.bottom - r.bottom}px ${r.left - s.left}px round 12px)`
}

const view = (root: HTMLElement, place: Place) => root.querySelector(`[data-place-view="${place}"]`)
const door = (root: HTMLElement, place: Place) => root.querySelector(`[data-door="${place}"]`)

/** The door's light becomes the room's: a glow leaves the orb, rises to the top and spreads out. */
function glow(root: HTMLElement): Array<Animation | null> {
  const orb = root.querySelector('[data-door="personal"] .c2-orb')?.getBoundingClientRect()
  if (!orb) return []
  const s = root.getBoundingClientRect()
  const fly = document.createElement('div')
  fly.className = 'c3-glowfly'
  Object.assign(fly.style, {
    left: `${orb.left - s.left}px`,
    top: `${orb.top - s.top}px`,
    width: `${orb.width}px`,
    height: `${orb.height}px`,
  })
  root.append(fly)
  const tx = s.width / 2 - (orb.left - s.left + orb.width / 2)
  const ty = 60 - (orb.top - s.top + orb.height / 2)
  const flight = play(
    fly,
    [
      { transform: 'none', opacity: 1 },
      { transform: `translate(${tx}px, ${ty}px) scale(7)`, opacity: 0 },
    ],
    720,
  )
  void flight?.finished.finally(() => fly.remove())
  return [flight, play(root.querySelector('.c3-ambient'), [{ opacity: 0 }, { opacity: 1 }], 600, 260)]
}

function enter(root: HTMLElement, to: Place): Array<Animation | null> {
  const space = view(root, to)
  const from = door(root, to)
  const rise = [...(space?.querySelectorAll('.c3-head, .msgs, .ps-composer, .c3-projects') ?? [])].map((el) =>
    play(
      el,
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'none' },
      ],
      360,
      200,
    ),
  )
  return [
    from
      ? play(
          space,
          [
            { clipPath: clipOf(root, from), opacity: 0.5 },
            { clipPath: FULL, opacity: 1 },
          ],
          520,
        )
      : null,
    play(view(root, 'home'), [{ opacity: 1 }, { opacity: 0 }], 220),
    ...(to === 'personal' ? glow(root) : []),
    ...rise,
  ]
}

function leave(root: HTMLElement, from: Place): Array<Animation | null> {
  const into = door(root, from)
  return [
    play(view(root, 'home'), [{ opacity: 0 }, { opacity: 1 }], 360, 120),
    into
      ? play(
          view(root, from),
          [
            { clipPath: FULL, opacity: 1 },
            { clipPath: clipOf(root, into), opacity: 0.4 },
          ],
          440,
        )
      : null,
  ]
}

function cross(root: HTMLElement, from: Place, to: Place): Array<Animation | null> {
  const dir = to === 'work' ? -1 : 1
  return [
    play(
      view(root, from),
      [
        { transform: 'none', opacity: 1 },
        { transform: `translateX(${dir * 5}%)`, opacity: 0 },
      ],
      300,
    ),
    play(
      view(root, to),
      [
        { transform: `translateX(${-dir * 5}%)`, opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      380,
      80,
    ),
  ]
}

function motion(root: HTMLElement, from: Place, to: Place): Array<Animation | null> {
  if (from === 'home') return enter(root, to)
  if (to === 'home') return leave(root, from)
  return cross(root, from, to)
}

/** The places on screen: the current one, and while moving, the one it left. */
export function usePlaceMotion(place: Place, root: RefObject<HTMLElement | null>): readonly Place[] {
  const [shown, setShown] = useState<readonly Place[]>([place])
  const last = useRef(place)
  const running = useRef<Animation[]>([])

  useLayoutEffect(() => {
    const from = last.current
    last.current = place
    if (from !== place) setShown([from, place])
  }, [place])

  useLayoutEffect(() => {
    // Whatever moved before stops where it is; once only the arrived place shows, its motion is dropped (before the
    // next paint, so nothing flashes back to where it started).
    for (const a of running.current) a.cancel()
    running.current = []
    const [from, to] = shown
    const el = root.current
    if (!from || !to || !el) return undefined
    const now = motion(el, from, to).filter((a): a is Animation => a !== null)
    running.current = now
    let alive = true
    const arrive = () => {
      if (alive) setShown([to])
      alive = false
    }
    void Promise.allSettled(now.map((a) => a.finished)).then(arrive)
    // A page in the background runs no frames, so its motion never finishes: the place arrives anyway.
    const late = setTimeout(arrive, 1500)
    return () => {
      alive = false
      clearTimeout(late)
    }
  }, [shown, root])

  return shown
}
