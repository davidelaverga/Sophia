// Your tile's presses on a phone's strip (docs/plans/phone-tiles-follow-ups.md): a tile a fifth of a phone holds one
// press, so with your camera on and two cameras that press opens the kit's menu of both, Switch camera and Hide my tile
// (Luis 2026-10-18). The tile clips what it holds, and its arrival leaves it the box of anything fixed inside it: the
// menu hangs from a layer in the top layer (a manual popover) that stands over the press, so no clip, scroll or room
// layer holds it. It opens over the tile, at the press's end, or at its start where the end would run off the screen.
// Drawn only where the browser has that top layer (hasTopLayer); Safari before 17 keeps Switch camera.
import { useLayoutEffect, useRef, useState } from 'react'
import { Icon, MENU, Menu, MenuItem, Tip, usePopover, type MenuAlign } from '@sophia/ui'

/** Where the layer stands (the press's box) and how the menu aligns to it; null while it is closed. */
interface Over {
  left: number
  top: number
  width: number
  height: number
  align: MenuAlign
}

/** A phone's gutter: the menu at the press's end keeps this clear of the screen's left edge, or goes at its start. */
const EDGE = 16

/** Over the press, as it is now; null once it has no box (turned past a phone's width, the press is hidden). */
function over(press: HTMLElement | null): Over | null {
  const r = press?.getBoundingClientRect()
  if (!r || r.width === 0) return null
  const align = r.right - MENU.minWidth >= EDGE ? 'end' : 'start'
  return { left: r.left, top: r.top, width: r.width, height: r.height, align }
}

export function TileMenu({ onFlip, onHide }: { onFlip: () => void; onHide: () => void }) {
  const [at, setAt] = useState<Over | null>(null)
  const open = at !== null
  const menu = usePopover(open, () => setAt(null))
  const { opener } = menu
  const layer = useRef<HTMLDivElement>(null)
  // Into the top layer before the kit's hook gives the first item the focus (its effect runs after this one), then
  // after the press as the page scrolls or turns under it.
  useLayoutEffect(() => {
    const el = layer.current
    if (!open || !el) return undefined
    if (!el.matches(':popover-open')) el.showPopover()
    const follow = () => setAt(over(opener.current))
    window.addEventListener('resize', follow)
    window.addEventListener('scroll', follow, true)
    return () => {
      window.removeEventListener('resize', follow)
      window.removeEventListener('scroll', follow, true)
    }
  }, [open, opener])
  // The chosen item leaves with the menu: the focus goes back to the press first, as Escape's does.
  const choose = (act: () => void) => () => {
    opener.current?.focus()
    setAt(null)
    act()
  }
  return (
    <span ref={menu.wrap} className="tile-menu">
      <button
        ref={opener}
        type="button"
        className="round tile-pin has-tip"
        aria-label="Your tile"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => setAt(open ? null : over(e.currentTarget))}
      >
        <Icon name="more" />
        <Tip label="Your tile" align="end" />
      </button>
      {at && (
        <div
          ref={layer}
          className="tile-menu-layer"
          popover="manual"
          style={{ left: at.left, top: at.top, width: at.width, height: at.height }}
        >
          <Menu popover={menu} label="Your tile" side="top" align={at.align}>
            <MenuItem onClick={choose(onFlip)}>Switch camera</MenuItem>
            <MenuItem onClick={choose(onHide)}>Hide my tile</MenuItem>
          </Menu>
        </div>
      )}
    </span>
  )
}
