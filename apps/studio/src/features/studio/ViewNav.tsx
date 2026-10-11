// Project views as real links: they can be opened in a new tab, and a plain click navigates in place.
// A thin line slides under the current view. On a narrow screen the row scrolls: the current view stays in
// sight, and an edge fades only where more views hide.
import { useEffect, type RefObject } from 'react'
import { useSlidingThumb } from '@sophia/ui'
import { routePath, viewsShown, type View } from '../../app/route.ts'
import { VISION } from '../../app/vision.ts'

const LABEL: Record<View, string> = {
  studio: 'Studio',
  conversations: 'Conversations',
  goals: 'Goals',
  work: 'Tasks',
  knowledge: 'Knowledge',
  updates: 'Updates',
  resources: 'Resources',
}

/** Conversations is the vision flag's (Davide's chapter 2): elsewhere its tab isn't there, and its address says «Coming». */
const SHOWN = viewsShown(VISION)

interface Props {
  projectId: string
  view: View
  onShow: (view: View) => void
}

/** The share of the row an end's fade covers (theme.css: the mask's 18 % and 82 %). */
const FADE = 0.18

/**
 * A row that scrolls keeps its current item in sight and clear of the fades, and marks the ends that hide more items
 * (data-more-start, data-more-end) for the CSS fade. Both run again when the row or the current item changes size, as
 * when the font arrives after the first layout.
 */
function useScrollRow(ref: RefObject<HTMLElement | null>, current: string) {
  useEffect(() => {
    const row = ref.current
    if (!row) return undefined
    // An end hides more only when its outermost item is cut, not when a few pixels of padding are left to scroll.
    const mark = () => {
      const box = row.getBoundingClientRect()
      const first = row.firstElementChild?.getBoundingClientRect()
      const last = row.lastElementChild?.getBoundingClientRect()
      row.toggleAttribute('data-more-start', first !== undefined && first.left < box.left - 1)
      row.toggleAttribute('data-more-end', last !== undefined && last.right > box.right + 1)
    }
    const item = row.querySelector('[aria-current="page"]')
    // Into sight, and out of a fade: an end that hides more fades 18 % of the row, where the current view must not stand
    // (Codex on #233: Updates at 1024, in sight but under the fade before Resources).
    const settle = () => {
      if (item) {
        const box = row.getBoundingClientRect()
        const r = item.getBoundingClientRect()
        const fade = box.width * FADE
        const moreEnd = row.scrollLeft + row.clientWidth < row.scrollWidth - 1
        const overEnd = r.right - (box.right - fade)
        const overStart = box.left + fade - r.left
        if (moreEnd && overEnd > 0) row.scrollLeft += overEnd
        else if (row.scrollLeft > 0 && overStart > 0) row.scrollLeft -= overStart
      }
      mark()
    }
    settle()
    row.addEventListener('scroll', mark, { passive: true })
    const observer = new ResizeObserver(settle)
    observer.observe(row)
    if (item) observer.observe(item)
    return () => {
      row.removeEventListener('scroll', mark)
      observer.disconnect()
    }
  }, [ref, current])
}

export function ViewNav({ projectId, view, onShow }: Props) {
  const thumb = useSlidingThumb<HTMLElement>(view)
  useScrollRow(thumb, view)
  const follow = (event: React.MouseEvent, next: View) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onShow(next)
  }
  return (
    <nav ref={thumb} className="view-nav" aria-label="Project views">
      {SHOWN.map((v) => (
        <a
          key={v}
          href={routePath({ projectId, view: v })}
          data-thumb={v}
          aria-current={v === view ? 'page' : undefined}
          onClick={(e) => follow(e, v)}
        >
          {LABEL[v]}
        </a>
      ))}
    </nav>
  )
}
