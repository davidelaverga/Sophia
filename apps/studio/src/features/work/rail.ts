// How the goals' rail moves (GoalTabs): it says which ends have more beyond them, a wheel turns it sideways, and a
// press-and-drag slides it like a strip, without the drag's release choosing the goal under it.
import { useEffect, useState } from 'react'

export interface Edges {
  before: boolean
  after: boolean
}

/** Which ends of the rail have more beyond them, kept as it scrolls or resizes. */
export function useEdges(rail: React.RefObject<HTMLElement | null>): Edges {
  const [edges, setEdges] = useState<Edges>({ before: false, after: false })
  useEffect(() => {
    const el = rail.current
    if (!el) return undefined
    const mark = () =>
      setEdges({ before: el.scrollLeft > 2, after: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 })
    mark()
    const observer = new ResizeObserver(mark)
    observer.observe(el)
    el.addEventListener('scroll', mark, { passive: true })
    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', mark)
    }
  }, [rail])
  return edges
}

/** A vertical wheel turns the rail sideways while it has somewhere to go; at its ends the page scrolls as usual. */
export function useWheel(rail: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = rail.current
    if (!el) return undefined
    const turn = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      const room = e.deltaY > 0 ? el.scrollWidth - el.clientWidth - el.scrollLeft : el.scrollLeft
      if (room <= 0) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', turn, { passive: false })
    return () => el.removeEventListener('wheel', turn)
  }, [rail])
}

/**
 * Press and drag slides the rail. While it slides, its goals take no press (board.css), so the release that ends a drag
 * lands on the rail, never on the goal under it.
 */
export function useDrag(rail: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = rail.current
    if (!el) return undefined
    let from: { x: number; left: number } | null = null
    let dragged = false
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      from = { x: e.clientX, left: el.scrollLeft }
      dragged = false
    }
    const move = (e: PointerEvent) => {
      if (!from) return
      const by = e.clientX - from.x
      if (Math.abs(by) > 4) {
        dragged = true
        el.setAttribute('data-dragging', '')
      }
      if (dragged) el.scrollLeft = from.left - by
    }
    const up = () => {
      from = null
      el.removeAttribute('data-dragging')
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [rail])
}
