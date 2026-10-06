// The report's next version shown from the pane's offer (docs/plans/room-live-version.md): what was on screen is kept
// for the comparison, the sections changed since are marked, the facts are said in words, and the heading being read
// keeps its place. The marks go once another version is chosen.
import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { ArtifactVersion } from '@sophia/contracts'
import { headingAt, marksOf, placedHeadings, type Mark, type Placed } from './live-version.ts'
import { compareSections, type ParsedReport } from './markdown.ts'
import { factsLine } from './report-view.ts'

/** What was on screen when the offer was pressed, and the version it led to. */
interface Since {
  from: ArtifactVersion
  to: string
  text: string
  /** The heading being read, until the new version is placed under it. */
  place: Placed | null
  /** The new version has been on screen: leaving it ends the marks. */
  arrived: boolean
}

export interface LiveChanges {
  marks: ReadonlyMap<string, Mark> | null
  /** The facts of the change in words, when the new version replaced the one that was on screen. */
  facts: string | null
}

/** The version on screen, as the pane holds it: its record, its text, and that text parsed with its sources. */
export interface Shown {
  version: ArtifactVersion | undefined
  text: string | undefined
  parsed: ParsedReport | null
  /** Its sources were read: its citations are drawn as they will stay. (A failed read can be tried again.) */
  sourcesSettled: boolean
  /** Its sources' read is over, read or failed: the text will not re-flow on its own any more. */
  sourcesDone: boolean
  /** The Document tab shows its text: what is placed in it can only be placed then. */
  inSight: boolean
}

const bodyOf = (pane: HTMLElement | null) => pane?.querySelector<HTMLElement>('.report-pane-body') ?? null

/** The headings of the report on screen, each with its top against the reading area's, keyed by occurrence. */
function headingsIn(body: HTMLElement): Placed[] {
  const top = body.getBoundingClientRect().top
  const found = [...body.querySelectorAll<HTMLElement>('.md [id^="md-"]')]
  return placedHeadings(
    found.map((h) => ({ anchor: h.id.slice('md-'.length), top: h.getBoundingClientRect().top - top })),
  )
}

/**
 * Under the heading that was being read, at the same height; elsewhere, the scroll stays where it was. Placed again as
 * the text re-flows (its citations come with its sources), and no more once they have.
 */
function useKeptPlace(pane: RefObject<HTMLElement | null>, place: Placed | null | undefined, shown: Shown) {
  const done = useRef<Placed | null>(null)
  const { parsed, sourcesDone, inSight } = shown
  useLayoutEffect(() => {
    const body = bodyOf(pane.current)
    // Another tab has the body: the place waits for the text to be in sight again.
    if (!place || !parsed || !body || !inSight || done.current === place) return
    const now = headingsIn(body).find((h) => h.anchor === place.anchor)
    if (now) body.scrollTop += now.top - place.top
    if (sourcesDone) done.current = place
  }, [pane, place, parsed, sourcesDone, inSight])
}

/** The arrival of the version the offer led to: marked once on screen; leaving it, or another one shown first, ends it. */
function useSince(shownId: string | undefined) {
  const [since, setSince] = useState<Since | null>(null)
  const next = since ? step(since, shownId) : null
  if (since && next === 'arrived') setSince({ ...since, arrived: true })
  if (next === 'over') setSince(null)
  return { since, setSince }
}

/** What the version now on screen does to the comparison: the new one arrives, or the comparison is over. */
function step(since: Since, shownId: string | undefined): 'arrived' | 'over' | null {
  if (shownId === since.to) return since.arrived ? null : 'arrived'
  const elsewhere = shownId !== undefined && shownId !== since.from.id
  return since.arrived || elsewhere ? 'over' : null
}

export function useLiveVersion(
  pane: RefObject<HTMLElement | null>,
  shown: Shown,
  versions: readonly ArtifactVersion[] | undefined,
) {
  const { version, text, parsed } = shown
  const { since, setSince } = useSince(version?.id)
  const on = !!since && version?.id === since.to
  useKeptPlace(pane, on ? since.place : null, shown)
  const changes = useMemo<LiveChanges>(() => {
    if (!on || text === undefined || !parsed) return { marks: null, facts: null }
    const own = new Set((versions ?? []).map((v) => v.sourceId))
    return {
      marks: marksOf(compareSections(since.text, text), parsed),
      facts: version.parentId === since.from.id ? factsLine(version, since.from.versionNumber ?? null, own) : null,
    }
  }, [since, on, version, text, parsed, versions])
  /** The offer pressed: what is on screen now is what the next version is compared with. */
  const showing = (to: string) => {
    const body = bodyOf(pane.current)
    if (!version || text === undefined) return
    setSince({ from: version, to, text, place: body ? headingAt(headingsIn(body)) : null, arrived: false })
  }
  return { changes, showing }
}
