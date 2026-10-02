// The Resources view's motion, kept small: a filter's change glides the tiles to their new places (View Transitions,
// where the browser has them), and a tile's light follows the pointer. Someone who asked for less motion gets the same
// changes, at once.
import { flushSync } from 'react-dom'

const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Runs a change that rearranges the tiles so they glide there; a plain update where that can't or shouldn't be. */
export function moving(change: () => void): void {
  if (still() || typeof document.startViewTransition !== 'function') {
    change()
    return
  }
  document.startViewTransition(() => flushSync(change))
}

/** A tile's name for the glide: unique per resource, and a valid CSS identifier whatever its id holds. */
export const glideName = (id: string) => `resource-${id.replaceAll(/[^\w-]/g, '-')}`

/** Where the pointer is on the tile it moves over, for the tile's light (CSS `--mx`, `--my`). */
export function followPointer(e: React.PointerEvent<HTMLElement>): void {
  const tile = e.currentTarget
  const box = tile.getBoundingClientRect()
  tile.style.setProperty('--mx', `${String(Math.round(e.clientX - box.left))}px`)
  tile.style.setProperty('--my', `${String(Math.round(e.clientY - box.top))}px`)
}
