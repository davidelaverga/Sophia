// A detail: two Claude Code tiles side by side in a row notice each other. Their marks greet with a small hop and a
// wave when they come together, then rest leaning toward each other; hovering one makes the other hop back. Only
// neighbours in the same row, as the grid lays them out at its current width; a mark between two Claude Codes greets
// both and leans to neither.
import { useLayoutEffect, useState, type RefObject } from 'react'

export type Buddy = 'right' | 'left' | 'both'

export interface Cell {
  id: string
  tool: string
  /** The cell's row, as its offset from the grid's top: neighbours share it. */
  top: number
}

const CLAUDE = 'claude-code'

/** Which tiles look at a Claude Code neighbour, and which way: to its right, its left, or both. */
export function buddiesOf(cells: readonly Cell[]): Map<string, Buddy> {
  const looks = new Map<string, Set<'left' | 'right'>>()
  const look = (id: string, way: 'left' | 'right') => looks.set(id, (looks.get(id) ?? new Set()).add(way))
  cells.forEach((cell, i) => {
    const next = cells[i + 1]
    if (!next || cell.tool !== CLAUDE || next.tool !== CLAUDE || Math.abs(cell.top - next.top) > 1) return
    look(cell.id, 'right')
    look(next.id, 'left')
  })
  return new Map(
    [...looks].map(([id, ways]): [string, Buddy] => [
      id,
      ways.size > 1 ? 'both' : ways.has('right') ? 'right' : 'left',
    ]),
  )
}

/** The cells of a grid as laid out now: each tile's resource and tool, and its row (layout, not its arrival's motion). */
function cellsOf(grid: HTMLElement): Cell[] {
  return [...grid.querySelectorAll<HTMLElement>(':scope > li')].flatMap((li) => {
    const tile = li.querySelector<HTMLElement>('.resource-tile')
    const id = tile?.dataset.resource
    const tool = tile?.dataset.tool
    return id && tool ? [{ id, tool, top: li.offsetTop }] : []
  })
}

const same = (a: Map<string, Buddy>, b: Map<string, Buddy>) =>
  a.size === b.size && [...a].every(([id, way]) => b.get(id) === way)

/** Measures the grid when its tiles change (`layout` names them in order) and whenever its width does. */
export function useBuddies(grid: RefObject<HTMLElement | null>, layout: string): Map<string, Buddy> {
  const [buddies, setBuddies] = useState<Map<string, Buddy>>(() => new Map())
  useLayoutEffect(() => {
    const el = grid.current
    if (!el) return undefined
    const measure = () => {
      const next = buddiesOf(cellsOf(el))
      setBuddies((now) => (same(now, next) ? now : next))
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [grid, layout])
  return buddies
}
