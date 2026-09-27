// A thumb that slides to the active option of a segmented control or a navigation. The container gets
// --thumb-x and --thumb-w (the active child's offset and width) and data-thumb-ready once placed, so the
// first placement is instant and later ones glide. The container must be `position: relative`.
import { useLayoutEffect, useRef } from 'react'

export function useSlidingThumb<T extends HTMLElement>(active: string) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const box = ref.current
    if (!box) return undefined
    const place = () => {
      const el = box.querySelector<HTMLElement>(`[data-thumb="${CSS.escape(active)}"]`)
      box.style.setProperty('--thumb-x', `${el?.offsetLeft ?? 0}px`)
      box.style.setProperty('--thumb-w', `${el?.offsetWidth ?? 0}px`)
    }
    place()
    const ready = requestAnimationFrame(() => box.setAttribute('data-thumb-ready', ''))
    const observer = new ResizeObserver(place)
    observer.observe(box)
    return () => {
      cancelAnimationFrame(ready)
      observer.disconnect()
    }
  }, [active])
  return ref
}
