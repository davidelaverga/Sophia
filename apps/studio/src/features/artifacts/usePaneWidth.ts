// The side pane's width (plan §2.8.3): about 46% of the viewport, 480 to 720px, resizable from its left edge, and
// remembered on this device. It always leaves 400px for the page beside it; below that the CSS lets it cover the page.
import { useEffect, useState } from 'react'

const KEY = 'sophia.reportPane.width'
const MIN = 480
const MAX = 720
const ROOM = 400

/**
 * The width a pane may take in a viewport `vw` wide: `wanted`, at least 480px, and never so wide that less than 400px
 * is left beside it. Where even 480px would leave less, the CSS lets the pane cover the page.
 */
export const clampWidth = (wanted: number, vw: number): number => Math.round(Math.max(MIN, Math.min(wanted, vw - ROOM)))

export const defaultWidth = (vw: number): number => clampWidth(Math.min(MAX, vw * 0.46), vw)

function remembered(): number | null {
  try {
    const v = Number(window.localStorage.getItem(KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

function remember(px: number): void {
  try {
    window.localStorage.setItem(KEY, String(px))
  } catch {
    // Storage blocked: the width lasts for this visit only.
  }
}

export function usePaneWidth() {
  const [px, setPx] = useState(() => {
    const vw = window.innerWidth
    const kept = remembered()
    return kept === null ? defaultWidth(vw) : clampWidth(kept, vw)
  })
  useEffect(() => {
    const onResize = () => setPx((w) => clampWidth(w, window.innerWidth))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // The page beside the pane (and what floats over it) keeps clear of it: artifacts.css reads the width here.
  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--report-w', `${px}px`)
    return () => {
      root.removeProperty('--report-w')
    }
  }, [px])
  /** Drag from the pane's left edge: the pane is as wide as what lies right of the pointer. */
  const drag = (down: React.PointerEvent) => {
    down.preventDefault()
    let last = px
    const move = (e: PointerEvent) => {
      last = clampWidth(window.innerWidth - e.clientX, window.innerWidth)
      setPx(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      remember(last)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return { px, drag }
}
