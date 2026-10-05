// The passage a link names (docs/plans/room-passage-link.md), found as the version it named arrives with its sources
// (until they come, a citation is drawn as its label and the words differ from the ones the link was made from): the
// link's locator is read once, as the pane opens, and taken out of the address once it is decided, so a reload or
// another version never looks for it again. The decision lives with the pane, so the Sources tab and back keep it. Found, its block is marked, its words lit (CSS Custom Highlight API),
// and it is brought into view and focused, once; lit again as the text re-renders (its sources arriving). The light
// goes with the version, or the pane.
import { useLayoutEffect, useRef, useState } from 'react'
import type { ArtifactVersion } from '@sophia/contracts'
import { blockText, rangeIn, type BlockText } from '../voice/useVoiceTrail.ts'
import { findLocated, PASSAGE_BLOCKS, readLocator, type Located, type Locator } from './passage-link.ts'
import { PASSAGE_PARAM, readReportLink } from './report-link.ts'

/** The highlight's name, which artifacts.css styles as `::highlight(report-passage)`. */
const LINKED = 'report-passage'

/** What the address asked for as the pane opened: the passage, and the version it is in. */
function askedHere(): { at: Locator; versionId: string | null } | null {
  const at = readLocator(window.location.search)
  return at ? { at, versionId: readReportLink(window.location.search)?.versionId ?? null } : null
}

/** The address without the passage, in place: decided, it is not looked for again. */
function dropFromAddress() {
  const q = new URLSearchParams(window.location.search)
  q.delete(PASSAGE_PARAM)
  const search = q.toString()
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
  )
}

const blocksIn = (root: Element) => [...root.querySelectorAll<HTMLElement>(PASSAGE_BLOCKS)]
const textRoot = () => document.querySelector('.report-pane-body .md')
const lights = () => ('highlights' in CSS && 'Highlight' in globalThis ? CSS.highlights : null)

/** Decides once, for the version the link named: where the passage is, or that it isn't there. */
function useDecision(version: ArtifactVersion | undefined, text: unknown, settled: boolean, shown: boolean) {
  const asked = useRef(askedHere())
  // Bound to the version it was decided on: found (its locator, re-found as the text re-renders), or not there (at
  // null); another version has neither.
  const [found, setFound] = useState<{ versionId: string; at: Locator | null } | null>(null)
  useLayoutEffect(() => {
    const ask = asked.current
    const root = textRoot()
    if (!ask || !shown || !root || !text || !version || !settled) return
    asked.current = null
    dropFromAddress()
    // The reader is on another version now: nothing to look for.
    if (!ask.versionId || ask.versionId === version.id) setFound(decide(root, ask.at, version.id))
  }, [version, text, settled, shown])
  return found
}

/** Where the passage is in the text on screen, or that it isn't there; found, it is brought into view and focused. */
function decide(root: Element, ask: Locator, versionId: string): { versionId: string; at: Locator | null } {
  const blocks = blocksIn(root)
  const at = findLocated(
    blocks.map((b) => blockText(b).text),
    ask,
  )
  const block = at ? blocks[at.block] : undefined
  if (!block) return { versionId, at: null }
  block.scrollIntoView({ block: 'center' })
  block.tabIndex = -1
  block.focus({ preventScroll: true })
  return { versionId, at: ask }
}

/** Where the located passage is in the text on screen now: re-found each time, as a re-render may move its offsets. */
function placeIn(root: Element, at: Locator): { block: HTMLElement; shape: BlockText; run: Located } | null {
  const blocks = blocksIn(root)
  const shapes = blocks.map(blockText)
  const run = findLocated(
    shapes.map((s) => s.text),
    at,
  )
  const block = run ? blocks[run.block] : undefined
  const shape = run ? shapes[run.block] : undefined
  return run && block && shape ? { block, shape, run } : null
}

/** Whether the linked passage was found in the version it named: null while there is none to look for. */
export function usePassageArrival(
  version: ArtifactVersion | undefined,
  text: unknown,
  /** The version's sources were read (or failed): its citations are drawn as they will stay. */
  settled: boolean,
  /** The Document tab shows the text: the light goes on again as it comes back from another tab. */
  shown: boolean,
): 'found' | 'missing' | null {
  const found = useDecision(version, text, settled, shown)
  const selected = useRef(false)
  const decided = found?.versionId === version?.id ? found : null
  const here = decided?.at ?? null
  useLayoutEffect(() => {
    const root = textRoot()
    const place = here && root ? placeIn(root, here) : null
    if (!place) return undefined
    const { block, shape, run } = place
    block.setAttribute('data-linked', '')
    const range = rangeIn(shape, run.start, run.end)
    const registry = lights()
    if (registry && range) registry.set(LINKED, new Highlight(range))
    // Without the Highlight API (Safari before 17.2), the exact words are selected, once: the block's mark alone
    // wouldn't say which sentence of it.
    if (!registry && range && !selected.current) {
      selected.current = true
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
    }
    return () => {
      block.removeAttribute('data-linked')
      registry?.delete(LINKED)
    }
  }, [here, text, shown])
  if (!decided) return null
  return here ? 'found' : 'missing'
}
