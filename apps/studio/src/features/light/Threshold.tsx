// The threshold, formed (docs/plans/signin-threshold.md): once someone is through, Sophia's light condenses and Umbral
// forms where it rests (SophiaLight places it, with the light's own numbers). Her half grows from the light; yours
// rises from where the address was written and meets hers across the line between you, in one gesture. Then it holds,
// her halo breathing slowly. With less motion asked for, the mark is simply there, formed and still.
import { useLayoutEffect, useRef } from 'react'
import type { LightTarget } from './engine.ts'
import type { Point } from './motion.ts'
import { markSize, UMBRAL } from './threshold.ts'

/**
 * Your half rises from where you wrote, in the mark's own units, its centre arriving at its disc's; Sophia's grows from
 * her light. One gesture, returned so it can be undone.
 */
function form(svg: SVGSVGElement, from: Point | null, at: LightTarget): Animation[] {
  const size = markSize(at.radius)
  const unit = size / 48
  const you = svg.querySelector('.umbral-you')
  const sophia = svg.querySelector('.umbral-sophia')
  if (!you || !sophia) return []
  const rise = from
    ? {
        x: (from.x - (at.x - size / 2 + UMBRAL.you.x * unit)) / unit,
        y: (from.y - (at.y - size / 2 + UMBRAL.you.y * unit)) / unit,
      }
    : { x: 0, y: 24 }
  const grows = sophia.animate(
    [
      { opacity: 0, transform: 'scale(0.35)' },
      { opacity: 1, transform: 'scale(1)' },
    ],
    { duration: 700, delay: 120, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' },
  )
  const rises = you.animate(
    [
      { opacity: 0, transform: `translate(${String(rise.x)}px, ${String(rise.y)}px) scale(0.7)` },
      { opacity: 1, offset: 0.35 },
      { opacity: 1, transform: 'translate(0, 0) scale(1)' },
    ],
    { duration: 950, delay: 200, easing: 'cubic-bezier(0.22, 1.12, 0.36, 1)', fill: 'both' },
  )
  return [grows, rises]
}

export function Threshold({ at, from }: { at: LightTarget; from: Point | null }) {
  const svg = useRef<SVGSVGElement>(null)
  // It forms once, when it arrives; a later move of the light (a resized window) only places it. Mounted again (React's
  // StrictMode), the first gesture is undone, so one forms, not two stacked.
  useLayoutEffect(() => {
    if (!svg.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const gesture = form(svg.current, from, at)
    return () => {
      for (const a of gesture) a.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- formed once, on arrival
  }, [])
  const size = markSize(at.radius)
  return (
    <svg
      ref={svg}
      className="threshold"
      data-mark="umbral"
      viewBox="0 0 48 48"
      style={{ left: at.x - size / 2, top: at.y - size / 2, width: size, height: size }}
    >
      <path className="umbral-you" d={UMBRAL.you.path} />
      <path className="umbral-sophia" d={UMBRAL.her.path} />
    </svg>
  )
}
