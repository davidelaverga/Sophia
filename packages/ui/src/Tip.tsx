// A hint that appears on hover and keyboard focus: what a control does, and its key. It is decorative for
// assistive technology: the control carries its own name (aria-label), so nothing is announced twice.
// The control needs the `has-tip` class. Controls at an edge align the tip to their end (at a left edge, their
// start), so it never reaches past the edge (and never widens a scrolling panel).

interface Props {
  label: string
  keys?: string | undefined
  side?: 'top' | 'bottom'
  align?: 'center' | 'end' | 'start'
  /** For a control whose description the tip is (`aria-describedby`): read by reference, though hidden from the tree. */
  id?: string | undefined
}

export function Tip({ label, keys, side = 'top', align = 'center', id }: Props) {
  return (
    <span id={id} className="tip" data-side={side} data-align={align} aria-hidden>
      {label}
      {keys && <kbd>{keys}</kbd>}
    </span>
  )
}
