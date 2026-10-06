// A section of the report asked for (a search hit's, docs/plans/room-search.md): the viewer hands each ask to the pane
// with its own number, so a second ask in the same open report is placed too. Once the version asked for is on
// screen in Markdown, its heading is brought to the top and takes the focus, so a screen reader reads on from it.
// A repeated heading is named by its occurrence (`evidence#1`, the second), as the live version names it.
import { useEffect, useRef } from 'react'

export interface SectionAsk {
  /** The heading's anchor, with `#n` for its n-th repeat (0 the first). */
  anchor: string
  /** The version it is in; null for the report's current one. */
  versionId: string | null
  /** Which ask this is: each is placed once. */
  n: number
}

/** The heading an anchor names: the first with that id, or its n-th repeat. */
function headingOf(anchor: string): HTMLElement | null {
  const [id = '', nth = '0'] = anchor.split('#')
  const all = document.querySelectorAll<HTMLElement>(`.report-pane-body .md [id="md-${CSS.escape(id)}"]`)
  return all[Number(nth)] ?? null
}

export function useSectionArrival(
  ask: SectionAsk | null | undefined,
  on: { text: unknown; inSight: boolean; versionId: string | undefined },
) {
  const placed = useRef<number | null>(null)
  const { text, inSight, versionId } = on
  useEffect(() => {
    if (!ask || placed.current === ask.n || !text || !inSight) return
    // Another version asked for: its own text, not the one still on screen.
    if (ask.versionId !== null && ask.versionId !== versionId) return
    placed.current = ask.n
    // After the pane's own focus as it opens: the section is where the reader was sent.
    requestAnimationFrame(() => {
      const heading = headingOf(ask.anchor)
      if (!heading) return
      heading.tabIndex = -1
      heading.scrollIntoView({ block: 'start' })
      heading.focus({ preventScroll: true })
    })
  }, [ask, text, inSight, versionId])
}
