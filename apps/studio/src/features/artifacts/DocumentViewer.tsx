// The report viewer's state (plan §2.8.3–§2.8.4). ProjectShell owns it, so a report opens the same way from the
// Work page, Knowledge and the room. The open report lives in the address bar (report-link.ts): each intent (open,
// enlarge) adds one history entry, so Back steps down, and Esc does the same (full → side → closed). One pane at a
// time: opening a report closes the side panel, and opening the side panel closes the report.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Identity } from '../../app/dev-identity.ts'
import { DocumentPane } from './DocumentPane.tsx'
import { readReportLink, withReportLink, type ReportLink, type ViewerTab } from './report-link.ts'
import './artifacts.css'

export interface OpenRequest {
  artifactId: string
  /** A version; omitted for the report's current one. */
  versionId?: string | null
  tab?: ViewerTab
}

interface ViewerApi {
  open: (request: OpenRequest) => void
}

const ViewerContext = createContext<ViewerApi | null>(null)

/** Opens a report in the viewer; null outside a project (nothing there shows the open action). */
export const useDocumentViewer = (): ViewerApi | null => useContext(ViewerContext)

const here = () => readReportLink(window.location.search)

const urlWith = (link: ReportLink | null) =>
  `${window.location.pathname}${withReportLink(window.location.search, link)}${window.location.hash}`

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
      setLink(then ? then.link : here())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  // Another project: the router dropped the report's parameters.
  useEffect(() => setLink(here()), [projectId])

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
      window.history.go(-n)
    },
    [write],
  )
  return { link, write, back }
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
  children: ReactNode
}

export function DocumentViewerProvider({ projectId, identity, panelOpen, closePanel, openChat, children }: Props) {
  const { link, write, back } = useReportHistory(projectId)
  const [tab, setTab] = useState<ViewerTab>('document')
  const open = useCallback(
    (r: OpenRequest) => {
      closePanel()
      setTab(r.tab ?? 'document')
      const next: ReportLink = { artifactId: r.artifactId, versionId: r.versionId ?? null, size: link?.size ?? 'side' }
      // A first open is an intent of its own (Back closes it); another report replaces the one on screen.
      write(next, link === null)
    },
    [closePanel, link, write],
  )
  const api = useMemo(() => ({ open }), [open])
  const close = useCallback(() => back(link?.size === 'full' ? 2 : 1, null), [back, link?.size])
  // The side panel opened over the report: the report gives way.
  useEffect(() => {
    if (panelOpen && link) write(null, false)
  }, [panelOpen, link, write])
  return (
    <ViewerContext.Provider value={api}>
      {children}
      {link && (
        <DocumentPane
          key={link.artifactId}
          identity={identity}
          link={link}
          tab={tab}
          onTab={setTab}
          onVersion={(versionId) => write({ ...link, versionId }, false)}
          onEnlarge={() => write({ ...link, size: 'full' }, true)}
          onStepDown={() => (link.size === 'full' ? back(1, { ...link, size: 'side' }) : close())}
          onClose={close}
          onChat={openChat}
        />
      )}
    </ViewerContext.Provider>
  )
}
