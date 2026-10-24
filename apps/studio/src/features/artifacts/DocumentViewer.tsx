// The report viewer's state (plan §2.8.3–§2.8.4). ProjectShell owns it, so a report opens the same way from the
// Work page, Knowledge and the room. The open report lives in the address bar (report-link.ts): each intent (open,
// enlarge) adds one history entry, so Back steps down, and Esc does the same (full → side → closed). One pane at a
// time: opening a report closes the side panel, and opening the side panel closes the report.
import type { TaskPerson } from './PassageTask.tsx'
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Identity } from '../../app/dev-identity.ts'
import { ShortcutScope } from '../../app/shortcuts.ts'
import { DocumentPane } from './DocumentPane.tsx'
import type { ShowRender } from '../voice/ShowEveryone.tsx'
import type { Passage } from './PassageBar.tsx'
import type { SectionAsk } from './useSectionArrival.ts'
import { openedLink, readReportLink, withReportLink, type ReportLink, type ViewerTab } from './report-link.ts'
import { ViewerContext, type OpenRequest, type ViewerApi } from './viewer-context.ts'
import { keptFragment } from '../resources/useAddressed.ts'
import './artifacts.css'

export { useDocumentViewer, type OpenRequest } from './viewer-context.ts'

const here = () => readReportLink(window.location.search)

const urlWith = (link: ReportLink | null) =>
  `${window.location.pathname}${withReportLink(window.location.search, link)}${window.location.hash}`
const withFragment = (hash: string) => `${window.location.pathname}${window.location.search}${hash}`

/**
 * How many of the viewer's own intents (open, enlarge) the current history entry stands on: each entry the viewer
 * pushes carries its depth in `history.state`. An entry anyone else wrote (the router's, a deep link) carries none,
 * so Back from it is never the viewer's to take.
 */
function viewerDepth(): number {
  const state: unknown = window.history.state
  if (typeof state !== 'object' || state === null || !('sophiaReport' in state)) return 0
  return typeof state.sophiaReport === 'number' ? state.sophiaReport : 0
}

/** The open report as the address bar holds it, and the history entries the viewer added for it. */
function useReportHistory(projectId: string) {
  const [link, setLink] = useState<ReportLink | null>(here)
  // Where a Back must land when the viewer added fewer entries than the step needs (a deep link then enlarged).
  const landing = useRef<{ link: ReportLink | null } | null>(null)
  useEffect(() => {
    const onPop = () => {
      const then = landing.current
      landing.current = null
      if (then) window.history.replaceState(null, '', urlWith(then.link))
      // The viewer's own step Back: the fragment on screen when it stepped, so only the report changes.
      const kept = keptFragment.take()
      if (kept !== null) window.history.replaceState(window.history.state, '', withFragment(kept))
      setLink(then ? then.link : here())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  // Another project: the router dropped the report's parameters. The project back in sight after the places, where it
  // was kept for its call: the address is the places' then, and a report it no longer names stays closed (LFE-02.1).
  const inSight = useContext(ShortcutScope)
  useEffect(() => {
    if (inSight) setLink(here())
  }, [projectId, inSight])

  const write = useCallback((next: ReportLink | null, push: boolean) => {
    if (push) window.history.pushState({ sophiaReport: viewerDepth() + 1 }, '', urlWith(next))
    else window.history.replaceState(next ? window.history.state : null, '', urlWith(next))
    setLink(next)
  }, [])

  /** Back as far as `steps` of the viewer's own entries, or in place when the current entry is not one of them. */
  const back = useCallback(
    (steps: number, otherwise: ReportLink | null) => {
      const n = Math.min(steps, viewerDepth())
      if (n === 0) {
        write(otherwise, false)
        return
      }
      if (n < steps) landing.current = { link: otherwise }
      // Where the step lands: its depth among the viewer's entries (an entry of anyone else's is 0).
      const lands = viewerDepth() - n
      keptFragment.note(window.location.hash, () => viewerDepth() === lands)
      window.history.go(-n)
    },
    [write],
  )
  /** Out of the address in the link's entry, not one of the viewer's own: a later close never steps back over it. */
  const leave = useCallback((push: boolean) => {
    if (push) window.history.pushState(null, '', urlWith(null))
    else window.history.replaceState(null, '', urlWith(null))
    setLink(null)
  }, [])
  return { link, write, back, leave }
}

/**
 * Leaving the report for elsewhere in the project: where it covers the page (a phone, the full page) it closes first.
 * Closing steps Back over the viewer's own entries: what comes after waits for that, or Back would take it away.
 */
function useLeaveFor(link: ReportLink | null, close: () => void) {
  return useCallback(
    (after: () => void) => {
      const covers = link?.size === 'full' || window.matchMedia('(width <= 760px)').matches
      if (!link || !covers) return after()
      const depth = viewerDepth()
      if (depth > 0) window.addEventListener('popstate', () => after(), { once: true })
      close()
      if (depth === 0) after()
    },
    [link, close],
  )
}

/** What the viewer gives the page (viewer-context.ts). */
function useViewerApi(
  open: ViewerApi['open'],
  link: ReportLink | null,
  close: () => void,
  leave: ViewerApi['leave'],
): ViewerApi {
  const leaveFor = useLeaveFor(link, close)
  const shown = link?.artifactId ?? null
  return useMemo(() => ({ open, shown, leaveFor, leave }), [open, shown, leaveFor, leave])
}

interface Props {
  projectId: string
  identity: Identity
  /** Whether the side panel (chat or brief) is open: it and the report never show together. */
  panelOpen: boolean
  /** Closes the side panel, when a report opens. */
  closePanel: () => void
  /** In the room: swaps the report for the chat (the pane covers the room's own toggles). */
  openChat?: (() => void) | undefined
  /** Something new in the chat since it was last in view (the pane's Chat says so). */
  chatUnread?: boolean
  /** The call's switches and its note, for the pane's head where it covers the dock or the mini dock. */
  call?: ReactNode
  note?: string | null
  /** «Show everyone» for the report on screen, where it is offered (showRenderOf); shown, the pane closes. */
  show?: ShowRender | undefined
  /** Where the project's feed is: the open report's versions are read again when it moves. */
  cursor?: string | undefined
  /** In the room: a passage of the report, asked about in the chat (PassageBar). */
  askAbout?: ((passage: Passage) => void) | undefined
  /** In a call: the members in it, whom a task may be for (PassageTask). */
  people?: readonly TaskPerson[] | undefined
  children: ReactNode
}

/**
 * What opened the report, read before the side panel closes and takes it out of sight: the focus returns there. And how
 * many times one was asked for: the report on screen asked for again keeps its pane, which reads again where the focus
 * goes back to if that opener leaves the page (Codex P2 on #448).
 */
function useOpener() {
  const opener = useRef<HTMLElement | null>(null)
  const [asked, setAsked] = useState(0)
  const noteOpener = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setAsked((n) => n + 1)
  }, [])
  return { opener, asked, noteOpener }
}

export function DocumentViewerProvider(props: Props) {
  const { projectId, identity, panelOpen, closePanel, openChat, chatUnread, call, note, askAbout, children } = props
  const { link, write, back, leave } = useReportHistory(projectId)
  const [tab, setTab] = useState<ViewerTab>('document')
  // The section asked for with the report on screen: none once the report closes or opens without one.
  const [section, setSection] = useState<SectionAsk | null>(null)
  const asks = useRef(0)
  if (!link && section) setSection(null)
  const { noteOpener, ...openedBy } = useOpener()
  const open = useCallback(
    (r: OpenRequest) => {
      noteOpener()
      closePanel()
      setTab(r.tab ?? 'document')
      // A first open is an intent of its own (Back closes it); another report replaces the one on screen. A section is
      // placed in the Markdown, so it opens there; each ask is the pane's to place once (useSectionArrival).
      write(openedLink(link, r.section ? { ...r, format: 'markdown' } : r), link === null)
      setSection(r.section ? { anchor: r.section, versionId: r.versionId ?? null, n: (asks.current += 1) } : null)
    },
    [closePanel, link, noteOpener, write],
  )
  const close = useCallback(() => back(link?.size === 'full' ? 2 : 1, null), [back, link?.size])
  const api = useViewerApi(open, link, close, leave)
  // One pane at a time, by what changed: the side panel opened over the report, so the report gives way; a report came
  // (Back or Forward) while the panel was open, so the panel gives way.
  const panelWas = useRef(panelOpen)
  useEffect(() => {
    const opened = panelOpen && !panelWas.current
    panelWas.current = panelOpen
    if (!panelOpen || !link) return
    if (opened) write(null, false)
    else closePanel()
  }, [panelOpen, link, write, closePanel])
  return (
    <ViewerContext.Provider value={api}>
      {children}
      {link && (
        <DocumentPane
          key={link.artifactId}
          projectId={projectId}
          identity={identity}
          link={link}
          {...openedBy}
          tab={tab}
          onTab={setTab}
          onVersion={(versionId) => write({ ...link, versionId }, false)}
          onFormat={(format) => write({ ...link, format }, false)}
          onEnlarge={() => write({ ...link, size: 'full' }, true)}
          onStepDown={() => (link.size === 'full' ? back(1, { ...link, size: 'side' }) : close())}
          onClose={close}
          onChat={openChat}
          chatUnread={chatUnread ?? false}
          call={call}
          note={note ?? null}
          onAsk={askAbout}
          people={props.people}
          cursor={props.cursor}
          show={props.show}
          section={section}
        />
      )}
    </ViewerContext.Provider>
  )
}
