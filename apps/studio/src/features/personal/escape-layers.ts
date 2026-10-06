// Which open layer Escape asks (useEscape): the one opened last, unless one holds Escape above the others (a package
// mid-step, which a layer opened again after it, as the notes' on coming back to Personal, must not pass over).

export interface Layer {
  close: () => void
  /** Higher holds Escape over lower, whenever each opened; equal ones go by which opened last. */
  priority: number
}

/** The layer Escape asks: the highest priority, and of those, the one opened last. */
export function topOf<L extends Pick<Layer, 'priority'>>(layers: readonly L[]): L | undefined {
  let top: L | undefined
  for (const layer of layers) if (!top || layer.priority >= top.priority) top = layer
  return top
}
