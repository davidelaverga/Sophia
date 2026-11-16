// A long report's «On this page» (docs/plans/report-on-this-page.md): its sections as links to the headings' anchors,
// the one being read marked. Enlarged with room beside the column, the list stands in the margin (artifacts.css);
// elsewhere it folds under one button. The app's routes are paths, so a press brings the heading to the top and gives
// it the focus, as a search hit's arrival does (useSectionArrival), and leaves the address alone.
import { useEffect, useId, useState, type RefObject } from 'react'
import { Icon } from '@sophia/ui'
import type { IndexSection } from './page-index.ts'

/** A heading this far under the top of the reading area, or above it, is the one being read. */
const READ_LINE = 48

interface Props {
  sections: readonly IndexSection[]
  /** The report's text (`.md`), whose section headings carry their place (`data-section`). */
  column: RefObject<HTMLElement | null>
}

const headingAt = (column: HTMLElement | null, n: number) =>
  column?.querySelector<HTMLElement>(`[data-section="${String(n)}"]`) ?? null

/** The section whose heading last passed the top of the reading area (the first before any has; the last at the end). */
function sectionRead(column: HTMLElement, scroller: HTMLElement, count: number): number {
  const top = scroller.getBoundingClientRect().top + READ_LINE
  if (scroller.scrollTop > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2)
    return count - 1
  let read = 0
  for (let n = 0; n < count; n += 1) {
    const heading = headingAt(column, n)
    if (heading && heading.getBoundingClientRect().top <= top) read = n
  }
  return read
}

/** The section being read, followed on the reading area's scroll, once a frame. */
function useSectionRead(column: RefObject<HTMLElement | null>, count: number): number {
  const [read, setRead] = useState(0)
  useEffect(() => {
    const text = column.current
    const scroller = text?.closest<HTMLElement>('.report-pane-body')
    if (!text || !scroller) return undefined
    let frame = 0
    const follow = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setRead(sectionRead(text, scroller, count)))
    }
    follow()
    scroller.addEventListener('scroll', follow, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      scroller.removeEventListener('scroll', follow)
    }
  }, [column, count])
  return read
}

/** A plain press goes in the page; one asking for a new tab or window is left to the browser. */
const plainPress = (e: React.MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey

export function OnThisPage({ sections, column }: Props) {
  const [open, setOpen] = useState(false)
  const read = useSectionRead(column, sections.length)
  const list = useId()
  const go = (e: React.MouseEvent, n: number) => {
    const heading = headingAt(column.current, n)
    if (!plainPress(e) || !heading) return
    e.preventDefault()
    heading.tabIndex = -1
    heading.scrollIntoView({ block: 'start' })
    heading.focus({ preventScroll: true })
    setOpen(false)
  }
  return (
    <nav className="md-toc" aria-label="On this page" data-open={open || undefined}>
      <button
        type="button"
        className="text-button md-toc-toggle"
        aria-expanded={open}
        aria-controls={list}
        onClick={() => setOpen(!open)}
      >
        On this page
        <Icon name="chevron" size={12} />
      </button>
      <ol id={list}>
        {sections.map((s, n) => (
          <li key={s.at}>
            <a
              href={`#md-${s.anchor || '_'}`}
              aria-current={n === read ? 'location' : undefined}
              onClick={(e) => go(e, n)}
            >
              {s.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
