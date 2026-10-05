// A passage of the open report, asked about or kept (docs/plans/room-passage.md). Selecting text in the report's
// Markdown shows a small bar above it: «Ask Sophia», where the room's chat is, puts the passage in the chat's message;
// «Keep», where the brief allows this person a note, writes it there as their own note, with Undo for a few seconds.
// The words are the member's selection, never paraphrased, and go to the shared brief only by their press.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { ArtifactVersion, MissionReceipt, MissionWithdrawalRequest } from '@sophia/contracts'
import { getMission, previewMissionWithdrawal, recordMissionEntry, withdrawMissionEntry } from '../../api/mission.ts'
import { useAdmission } from '../../api/useAdmission.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { modalOnScreen } from '../../app/shortcuts.ts'
import { forgetReach, missionKey } from '../mission/mission-view.ts'
import { keptLine, keptText, passageText, undoable, type Check, type PassageSource } from './passage.ts'

/** A passage and where it came from, as Ask Sophia hands it to the chat. */
export interface Passage {
  text: string
  source: PassageSource
}

/** The selected passage, and where it is in the pane: its top and bottom, its middle, and the top of the pane's body. */
interface Spot {
  text: string
  top: number
  bottom: number
  middle: number
  floor: number
}

/** Blocks MarkdownView renders side by side: a passage across two keeps a space between them. */
const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote'

/** The selected words as the member sees them: a citation's number is not in them, and blocks keep a space between. */
function wordsOf(range: Range): string | null {
  const copy = range.cloneContents()
  for (const cite of copy.querySelectorAll('sup.cite')) cite.remove()
  for (const block of copy.querySelectorAll(BLOCKS)) block.append(' ')
  return passageText(copy.textContent)
}

/**
 * The selection, when it lies in the report's text (never its head, tabs or sources) and in sight in the pane's body:
 * scrolled under the head or past the foot, nothing is offered.
 */
function selectedIn(pane: HTMLElement | null): Spot | null {
  const range = pane ? rangeIn(pane) : null
  const passage = range ? wordsOf(range) : null
  if (!pane || !range || !passage) return null
  const at = range.getBoundingClientRect()
  const frame = pane.getBoundingClientRect()
  const floor = (pane.querySelector('.report-pane-body')?.getBoundingClientRect().top ?? frame.top) - frame.top
  const spot = { top: at.top - frame.top, bottom: at.bottom - frame.top, middle: at.left + at.width / 2 - frame.left }
  return spot.bottom < floor || spot.top > frame.height ? null : { text: passage, ...spot, floor }
}

/** The selection's range, when it lies in the report's text. */
function rangeIn(pane: HTMLElement): Range | null {
  const text = pane.querySelector('.report-pane-body .md')
  const selection = window.getSelection()
  if (!text || !selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  return text.contains(range.commonAncestorContainer) ? range : null
}

/** The selection as it moves, read once a frame. */
function useSpot(pane: RefObject<HTMLElement | null>): Spot | null {
  const [spot, setSpot] = useState<Spot | null>(null)
  useEffect(() => {
    let frame = 0
    const read = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setSpot(selectedIn(pane.current)))
    }
    document.addEventListener('selectionchange', read)
    document.addEventListener('scroll', read, true)
    window.addEventListener('resize', read)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('selectionchange', read)
      document.removeEventListener('scroll', read, true)
      window.removeEventListener('resize', read)
    }
  }, [pane])
  return spot
}

/**
 * Esc takes the bar away (the selection goes) before the pane steps down, unless a field or a dialog owns the key. The
 * focus, if it was on the bar, goes to the report's title.
 */
function useEscapeBar(shown: boolean, bar: RefObject<HTMLDivElement | null>, pane: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!shown) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.repeat || owned(e.target)) return
      e.preventDefault() // the pane's own Esc steps down only for a key nobody took
      if (bar.current?.contains(document.activeElement)) {
        pane.current?.querySelector<HTMLElement>('#report-pane-title')?.focus({ preventScroll: true })
      }
      window.getSelection()?.removeAllRanges()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [shown, bar, pane])
}

/** A field, an editable text or a dialog has the key: its Esc is its own. */
const owned = (target: EventTarget | null) =>
  modalOnScreen() ||
  (target instanceof HTMLElement &&
    (target.isContentEditable || !!target.closest('[role="dialog"], input, textarea, select')))

const GAP = 8
const EDGE = 12

/** Above the selection, inside the pane; below it when the pane's top would cover it. Again whenever the bar renders. */
function usePlaced(bar: RefObject<HTMLDivElement | null>, pane: RefObject<HTMLElement | null>, spot: Spot | null) {
  useLayoutEffect(() => {
    const el = bar.current
    const width = pane.current?.clientWidth
    if (!el || !spot || width === undefined) return
    const left = Math.min(Math.max(spot.middle - el.offsetWidth / 2, EDGE), width - el.offsetWidth - EDGE)
    const above = spot.top - el.offsetHeight - GAP
    el.style.left = `${String(left)}px`
    el.style.top = `${String(above >= spot.floor ? above : spot.bottom + GAP)}px`
  })
}

/** Whether the brief allows this person a note: read once there is a passage to keep, so a pane never read for nothing. */
function useNoteAllowed(projectId: string, identity: Identity, wanted: boolean): boolean {
  const [asked, setAsked] = useState(false)
  if (wanted && !asked) setAsked(true)
  return (
    useQuery({
      queryKey: [...missionKey(projectId), identity.name, 'note'],
      queryFn: () => getMission(identity.token, projectId),
      select: (ctx) => ctx.capabilities.recordNote.available,
      enabled: asked,
      staleTime: 30_000,
    }).data ?? false
  )
}

const SHOWN_MS = 8000

interface Withdrawal {
  entryId: string
  request: MissionWithdrawalRequest
}

/**
 * Keep and its Undo, each with its own Idempotency-Key (useAdmission): after no reply, only the same write goes again.
 * While one is open no other Keep is offered, so a retry never carries another note's key.
 */
function useKeep(projectId: string, identity: Identity) {
  const queryClient = useQueryClient()
  const refreshed =
    <A, R>(send: (key: string, args: A) => Promise<R>) =>
    async (key: string, args: A) => {
      try {
        return await send(key, args)
      } finally {
        void queryClient.invalidateQueries({ queryKey: missionKey(projectId) })
      }
    }
  const write = useAdmission<string, MissionReceipt>(
    refreshed((key, text) =>
      recordMissionEntry(identity.token, projectId, key, { kind: 'observation', epistemic: 'reported', text }),
    ),
  )
  const withdraw = useAdmission<Withdrawal, MissionReceipt>(
    refreshed((key, w) => withdrawMissionEntry(identity.token, projectId, w.entryId, key, w.request)),
  )
  const [check, setCheck] = useState<Check>('none')
  const said = keptLine(write.state.status, check, withdraw.state.status)
  const [shown, setShown] = useState(false)
  // Said and done, it goes after a while; a failure or an unconfirmed write stays with its way on.
  useEffect(() => {
    if (!shown || !said.settled) return undefined
    const timer = setTimeout(() => setShown(false), SHOWN_MS)
    return () => clearTimeout(timer)
  }, [shown, said])
  const keep = (text: string) => {
    if (said.busy) return
    withdraw.reset()
    setCheck('none')
    setShown(true)
    void write.submit(text)
  }
  const undo = async () => {
    const entryId = write.state.status === 'done' ? write.state.result.entryId : null
    if (!entryId) return
    setCheck('checking')
    try {
      const preview = await previewMissionWithdrawal(identity.token, projectId, entryId)
      setCheck(undoable(preview) ? 'none' : 'built')
      if (undoable(preview)) void withdraw.submit({ entryId, request: forgetReach(preview).request })
    } catch {
      setCheck('unreadable')
    }
  }
  const act = { retry: () => void write.retry(), undo: () => void undo(), 'retry-undo': () => void withdraw.retry() }
  return { said, shown, keep, act, refusal: refusalOf(withdraw.state, write.state) }
}

/** A refusal's own words, the API's: the withdrawal's first, as the line says it first. */
function refusalOf(...states: readonly { status: string; error?: { message: string } }[]): string | null {
  for (const state of states) if (state.status === 'rejected' && state.error) return state.error.message
  return null
}

interface Props {
  pane: RefObject<HTMLElement | null>
  /** The version on screen; until it is known, nothing is offered. */
  version: ArtifactVersion | undefined
  viewer: {
    projectId: string
    identity: Identity
    /** In the room: puts the passage in the chat's message and opens Chat. Absent elsewhere, so Ask isn't offered. */
    onAsk: ((passage: Passage) => void) | undefined
  }
}

/** The report and version a selected passage came from; null until the version is known. */
const sourceOf = (version: ArtifactVersion | undefined): PassageSource | null =>
  version?.versionNumber === undefined ? null : { title: version.title ?? 'Report', version: version.versionNumber }

/** The bar over a selected passage, and the line saying what Keep did. */
export function PassageBar({ pane, version, viewer }: Props) {
  const { projectId, identity, onAsk } = viewer
  const source = sourceOf(version)
  const spot = useSpot(pane)
  const bar = useRef<HTMLDivElement>(null)
  usePlaced(bar, pane, spot)
  const allowed = useNoteAllowed(projectId, identity, !!spot)
  const kept = useKeep(projectId, identity)
  const keeps = allowed && !kept.said.busy
  const offered = spot && source && (onAsk || keeps) ? { text: spot.text, source } : null
  useEscapeBar(!!offered, bar, pane)
  // A press keeps the selection (some engines clear it on a button's mousedown); once used, it goes.
  const pressed = (act: (passage: Passage) => void) => () => {
    if (!offered) return
    act(offered)
    window.getSelection()?.removeAllRanges()
  }
  return (
    <>
      {offered && (
        <div ref={bar} className="passage-bar" role="toolbar" aria-label="The selected passage">
          {onAsk && (
            <button
              type="button"
              className="passage-ask"
              onMouseDown={(e) => e.preventDefault()}
              onClick={pressed(onAsk)}
            >
              Ask Sophia
            </button>
          )}
          {keeps && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={pressed((p) => kept.keep(keptText(p.text, p.source)))}
            >
              Keep
            </button>
          )}
        </div>
      )}
      <KeptLine {...kept} />
    </>
  )
}

const ACTION_LABEL = { retry: 'Try again', undo: 'Undo', 'retry-undo': 'Try again' } as const

/** What Keep did, and its one way on; mounted all along, so what it says is announced. */
function KeptLine({
  said,
  shown,
  act,
  refusal,
}: Pick<ReturnType<typeof useKeep>, 'said' | 'shown' | 'act' | 'refusal'>) {
  const action = said.action
  return (
    <p className="passage-kept" role="status" data-error={(shown && said.error) || undefined}>
      {shown && (
        <>
          {said.error && refusal ? `${said.words} ${refusal}` : said.words}
          {action && (
            <button type="button" className="text-button" onClick={act[action]}>
              {ACTION_LABEL[action]}
            </button>
          )}
        </>
      )}
    </p>
  )
}
