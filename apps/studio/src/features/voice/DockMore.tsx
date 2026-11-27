// The dock's extras where its row runs out (docs/plans/dock-fold.md): Share your screen, React, Raise hand and the
// picture-in-picture stand in the row while it fits. When even its icons don't fit one row, the dock is marked
// `data-fold` (useDockFit) and they wait behind one press, More controls, which opens them in a small tray above it.
// The same controls either way: the CSS lays them in the row or in the tray, so their state and keys never move.
import { useEffect, useId, useState, type ReactNode } from 'react'
import { Icon, Tip, usePopover } from '@sophia/ui'

/**
 * The focus on a control the fold just hid goes to its counterpart in sight (focus-kept.md): an extra put away in the
 * closed tray, to More controls; More controls gone from a row that fits again, to the first extra, back in the row.
 */
function handOver(folded: boolean, opener: HTMLElement | null, tray: HTMLElement | null) {
  const at = document.activeElement
  if (!opener || !tray || !(at instanceof HTMLElement)) return
  if (folded && tray.contains(at)) opener.focus()
  else if (!folded && at === opener) tray.querySelector<HTMLElement>('button:not([disabled])')?.focus()
}

export function DockMore({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const more = usePopover(open, () => setOpen(false))
  const tray = useId()
  // The row folds or fits again: a tray open behind controls back in the row closes, and the focus on a control that
  // goes out of sight moves to the one that takes its place. Read as the mark changes, before the page draws again.
  useEffect(() => {
    const dock = more.wrap.current?.closest('.dock')
    if (!dock) return undefined
    let was = dock.hasAttribute('data-fold')
    const watch = new MutationObserver(() => {
      const folded = dock.hasAttribute('data-fold')
      // The mark written again with the same value is no change: a focus in the open tray (React's menu) stays put.
      if (folded === was) return
      was = folded
      if (!folded) setOpen(false)
      if (!more.wrap.current?.hasAttribute('data-open')) handOver(folded, more.opener.current, more.panel.current)
    })
    watch.observe(dock, { attributes: true, attributeFilter: ['data-fold'] })
    return () => watch.disconnect()
  }, [more.wrap, more.opener, more.panel])
  return (
    <div ref={more.wrap} className="dock-more" data-open={open || undefined}>
      <button
        ref={more.opener}
        type="button"
        className="round has-tip dock-more-open"
        aria-label="More controls"
        aria-expanded={open}
        aria-controls={tray}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="more" />
        <Tip label="More controls" />
      </button>
      <div
        ref={more.panel}
        id={tray}
        className="dock-tray"
        role="group"
        aria-label="More controls"
        // Only while it is open: in the row, its controls' keys are theirs and Escape goes on to the view. A menu inside it
        // (React's) closes on its own Escape first; the tray waits for the next one.
        onKeyDown={(e) => {
          if (open && !e.defaultPrevented) more.onKeyDown(e)
        }}
      >
        {children}
      </div>
    </div>
  )
}
