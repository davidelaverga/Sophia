// The dock's extras where its row runs out (docs/plans/dock-fold.md): Share your screen, React, Raise hand and the
// picture-in-picture stand in the row while it fits. When even its icons don't fit one row, the dock is marked
// `data-fold` (useDockFit) and they wait behind one press, More controls, which opens them in a small tray above it.
// The same controls either way: the CSS lays them in the row or in the tray, so their state and keys never move.
import { useEffect, useId, useState, type ReactNode } from 'react'
import { Icon, Tip, usePopover } from '@sophia/ui'

export function DockMore({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const more = usePopover(open, () => setOpen(false))
  const tray = useId()
  // The row widened while the tray was open: its controls are back in the row, and the tray is not open behind them.
  useEffect(() => {
    if (!open) return undefined
    const dock = more.wrap.current?.closest('.dock')
    if (!dock) return undefined
    const watch = new MutationObserver(() => {
      if (!dock.hasAttribute('data-fold')) setOpen(false)
    })
    watch.observe(dock, { attributes: true, attributeFilter: ['data-fold'] })
    return () => watch.disconnect()
  }, [open, more.wrap])
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
        // A menu inside it (React's) closes on its own Escape first; the tray waits for the next one.
        onKeyDown={(e) => {
          if (!e.defaultPrevented) more.onKeyDown(e)
        }}
      >
        {children}
      </div>
    </div>
  )
}
