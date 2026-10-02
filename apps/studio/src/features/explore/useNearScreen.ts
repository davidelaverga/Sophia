// Whether an element has come near the screen (within 200 px): a tile's image is read only then. Once near, it stays
// so, and a tile that never scrolls into view is never read.
import { useEffect, useState } from 'react'

export function useNearScreen(): [(el: Element | null) => void, boolean] {
  const [el, setEl] = useState<Element | null>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    if (!el || near) return undefined
    const watch = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), {
      rootMargin: '200px',
    })
    watch.observe(el)
    return () => watch.disconnect()
  }, [el, near])
  return [setEl, near]
}
