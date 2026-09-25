// A hint that appears on hover and keyboard focus: what a control does, and its key. It is decorative for
// assistive technology: the control carries its own name (aria-label), so nothing is announced twice.
// The control needs the `has-tip` class. Controls at an edge align the tip to their end, so it never
// reaches past the edge (and never widens a scrolling panel).

interface Props {
  label: string
  keys?: string
  side?: 'top' | 'bottom'
  align?: 'center' | 'end'
}

export function Tip({ label, keys, side = 'top', align = 'center' }: Props) {
  return (
    <span className="tip" data-side={side} data-align={align} aria-hidden>
      {label}
      {keys && <kbd>{keys}</kbd>}
    </span>
  )
}
