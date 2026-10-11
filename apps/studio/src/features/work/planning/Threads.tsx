// The threads between a hovered task and the tasks it waits on: a line of light from each of those to it, edge to edge
// through the board's free space (thread-route.ts), and a spark travelling along it, so a dependency is seen, not
// read. Drawn over the lanes, never over a tile's words, never in the way of a press.
import { useLayoutEffect, useState } from 'react'
import { rounded, route, type Box } from './thread-route.ts'

interface Props {
  /** The lanes' box, which the threads are drawn over. */
  box: React.RefObject<HTMLElement | null>
  /** The hovered task, and the tasks it waits on. */
  to: string | null
  from: readonly string[]
  /** How many lanes stand: the layout's revision, so a lane coming or going re-measures the threads. */
  lanes: number
}

/** An element's box, measured from the lanes' own corner. */
const within = (el: Element, origin: DOMRect): Box => {
  const r = el.getBoundingClientRect()
  return {
    left: r.left - origin.left,
    right: r.right - origin.left,
    top: r.top - origin.top,
    bottom: r.bottom - origin.top,
  }
}

/** The free band over the tiles: halfway between the lanes' heads and their first tiles. */
function bandOf(root: HTMLElement, origin: DOMRect): number {
  const head = root.querySelector('.lane-head')
  const tile = root.querySelector('.task-grid, .lane-empty')
  if (!head || !tile) return 0
  return (within(head, origin).bottom + within(tile, origin).top) / 2
}

export function Threads({ box, to, from, lanes }: Props) {
  const [paths, setPaths] = useState<string[]>([])
  const key = from.join()
  // The tiles move without the hover changing (a lane comes or goes, the window is resized): the threads are measured
  // again whenever the lanes' boxes change (Codex on #236).
  const [moved, setMoved] = useState(0)
  useLayoutEffect(() => {
    const root = box.current
    if (!root) return undefined
    const watch = new ResizeObserver(() => setMoved((n) => n + 1))
    watch.observe(root)
    for (const lane of root.querySelectorAll('.lane')) watch.observe(lane)
    return () => watch.disconnect()
  }, [box, lanes])
  useLayoutEffect(() => {
    const root = box.current
    if (!root || !to) {
      setPaths([])
      return
    }
    const origin = root.getBoundingClientRect()
    const tile = (id: string) => root.querySelector(`[data-task="${CSS.escape(id)}"]`)
    const target = tile(to)
    if (!target) return
    const boxes = [...root.querySelectorAll('.lane')].map((l) => within(l, origin))
    const band = bandOf(root, origin)
    setPaths(
      key
        .split(',')
        .filter(Boolean)
        .flatMap((id) => {
          const source = tile(id)
          return source ? [rounded(route(within(source, origin), within(target, origin), boxes, band))] : []
        }),
    )
  }, [box, to, key, lanes, moved])
  if (paths.length === 0) return null
  return (
    <svg className="threads" aria-hidden>
      {paths.map((d) => (
        <g key={d}>
          <path className="thread" d={d} pathLength={1} />
          <circle className="thread-spark" r={2.5} style={{ offsetPath: `path('${d}')` }} />
        </g>
      ))}
    </svg>
  )
}
