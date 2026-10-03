// The board by keys: Up and Down move within a lane, Left and Right to the next lane with tiles, at the nearest place;
// Home and End to its first and last task. Enter opens the task (its tile is a button).
const STEP: Record<string, [number, number] | undefined> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}

const lanesOf = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.lane')]
    .map((lane) => [...lane.querySelectorAll<HTMLButtonElement>('.task-tile')])
    .filter((tiles) => tiles.length > 0)

/** Moves the focus from the focused tile by an arrow key; true when the key was one of the board's. */
/** Home and End: the board's first task and its last. */
function toEnd(lanes: HTMLButtonElement[][], key: string): boolean {
  const all = lanes.flat()
  ;(key === 'Home' ? all[0] : all.at(-1))?.focus()
  return all.length > 0
}

export function moveOnBoard(root: HTMLElement, key: string): boolean {
  const lanes = lanesOf(root)
  if (key === 'Home' || key === 'End') return toEnd(lanes, key)
  const step = STEP[key]
  if (!step) return false
  const lane = lanes.findIndex((tiles) => tiles.some((t) => t === document.activeElement))
  if (lane < 0) return false
  const place = lanes[lane]?.findIndex((t) => t === document.activeElement) ?? 0
  const [across, along] = step
  const to = lanes[lane + across]
  const next = across === 0 ? lanes[lane]?.[place + along] : to?.[Math.min(place, to.length - 1)]
  next?.focus()
  return true
}
