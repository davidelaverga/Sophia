// Project views as real links: they can be opened in a new tab, and a plain click navigates in place.
// A thin line slides under the current view. On a narrow screen the row scrolls: the current view stays in
// sight, and an edge fades only where more views hide.
import { useEffect, type RefObject } from 'react'
import { useSlidingThumb } from '@sophia/ui'
import { routePath, VIEWS, type View } from '../../app/route.ts'
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
const SHOWN: readonly View[] = VISION ? VIEWS : VIEWS.filter((v) => v !== 'conversations')

interface Props {
  projectId: string
  view: View
  onShow: (view: View) => void
}

/**
 * A row that scrolls keeps its current item in sight and marks the ends that hide more items (data-more-start,
 * data-more-end) for the CSS fade. Both run again when the row or the current item changes size, as when the
 * font arrives after the first layout.
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
    const settle = () => {
      item?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
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
