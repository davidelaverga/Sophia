// A thumb that slides to the active option of a segmented control or a navigation. The container gets
// --thumb-x, --thumb-y, --thumb-w and --thumb-h (the active child's offsets and size: a box whose options wrap onto
// a second row has a thumb on that row, under that option) and data-thumb-ready once placed, so the first placement
// is instant and later ones glide. The container must be `position: relative`. The thumb follows the active option
// when it changes size too (the web font arriving), not only the container.
import { useLayoutEffect, useRef } from 'react'

export function useSlidingThumb<T extends HTMLElement>(active: string) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const box = ref.current
    if (!box) return undefined
    const place = () => {
      const el = box.querySelector<HTMLElement>(`[data-thumb="${CSS.escape(active)}"]`)
      box.style.setProperty('--thumb-x', `${el?.offsetLeft ?? 0}px`)
      box.style.setProperty('--thumb-y', `${el?.offsetTop ?? 0}px`)
      box.style.setProperty('--thumb-w', `${el?.offsetWidth ?? 0}px`)
      box.style.setProperty('--thumb-h', `${el?.offsetHeight ?? 0}px`)
    }
    place()
    const ready = requestAnimationFrame(() => box.setAttribute('data-thumb-ready', ''))
    // Placed again when the box or the active option changes size: the web font arriving reshapes every option
    // without always widening the box (a box of a fixed width, one that wraps), which left the thumb 2–3 px short.
    const observer = new ResizeObserver(place)
    observer.observe(box)
    const chosen = box.querySelector<HTMLElement>(`[data-thumb="${CSS.escape(active)}"]`)
    if (chosen) observer.observe(chosen)
    void document.fonts.ready.then(place)
    return () => {
      cancelAnimationFrame(ready)
      observer.disconnect()
    }
  }, [active])
  return ref
}
