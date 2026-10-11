// The report viewer (plan §2.8.3–§2.8.6): a side pane that can be enlarged to a full page in the same frame. Its head
// names the version on screen (format, version, words or pages, size, short hash) and downloads exactly those bytes;
// its tabs are the Document, the Sources it cites and its History. A version with a PDF shows either its Markdown or
// its PDF (S5b); one with a designed HTML page (SDD-01) also shows that page, in an isolated frame (HtmlView). Every
// file is checked against its hash before it is shown, so what is read is what downloads. A non-modal complementary
// region: focus moves to its title on open and back to the opener on close; Esc steps down, F toggles the full page.
import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ArtifactVersion } from '@sophia/contracts'
import { reportLanguage } from '@sophia/report/language'
import { Icon, ReadNote, Segmented, Tabs, Tip } from '@sophia/ui'
import { listArtifactVersions, listReportSources } from '../../api/artifacts.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { modalOnScreen, onScreen as isVisible, ShortcutScope, useShortcuts } from '../../app/shortcuts.ts'
import {
  checkedBlob,
  HashMismatch,
  loadReportBytes,
  loadReportText,
  saveBlob,
  utf8,
  type LoadedBytes,
  type LoadedText,
} from './download.ts'
import { parseMarkdown, wordCount, type ParsedReport } from './markdown.ts'
import { HtmlView, reviewTag } from './HtmlView.tsx'
import { MarkdownView } from './MarkdownView.tsx'
import { PassageBar, type Passage } from './PassageBar.tsx'
import { usePassageArrival } from './usePassageArrival.ts'
import { useSectionArrival, type SectionAsk } from './useSectionArrival.ts'
import { offerWords } from './live-version.ts'
import { useLiveVersion, type LiveChanges, type Shown } from './useLiveVersion.ts'
import type { ShowRender } from '../voice/ShowEveryone.tsx'
import type { ReportLink, ViewerFormat, ViewerTab } from './report-link.ts'
import {
  currentOffer,
  escapeStepsDown,
  failedOutright,
  focusFree,
  focusReturn,
  formatBytes,
  htmlMissing,
  pdfMissing,
  pinTo,
  renditionOf,
  rereadFor,
  shortHash,
  versionMissing,
  versionReadFailure,
  viewerFormats,
} from './report-view.ts'
import { ReportHistory } from './ReportHistory.tsx'
import { ReviewRow } from './ReviewRow.tsx'
import { TaskList, useTasks } from './TaskList.tsx'
import { openCount } from './task-view.ts'
import type { TaskPerson } from './PassageTask.tsx'
import { VISION } from '../../app/vision.ts'
import { SourcesTab } from './SourcesList.tsx'
import { usePaneWidth } from './usePaneWidth.ts'
import { useTransientStatus } from './useTransientStatus.ts'

interface Props {
  projectId: string
  identity: Identity
  link: ReportLink
  /** What opened the report, as the viewer read it at the click; null for a deep link. */
  opener: React.RefObject<HTMLElement | null>
  tab: ViewerTab
  onTab: (tab: ViewerTab) => void
  onVersion: (versionId: string) => void
  onFormat: (format: ViewerFormat) => void
  onEnlarge: () => void
  /** Esc and "Back to side panel": full → side → closed. */
  onStepDown: () => void
  /** A section asked for (a search hit's), placed once it is on screen (useSectionArrival). */
  section?: SectionAsk | null
  onClose: () => void
  /** In the room: the chat in the report's place. */
  onChat?: (() => void) | undefined
  /**
   * Something new in the chat since it was last in view: the pane's Chat says so, as the corner toggle it covers on a
   * phone and in the full page does.
   */
  chatUnread?: boolean
  /**
   * The call's switches (empty out of a call) and its note. The pane shows them under its head where it covers the dock
   * or the mini dock (a phone, the full page), as the side panel's head does: what this person sends stays in sight.
   */
  call?: ReactNode
  note: string | null
  /** Where the project's feed is: when it moves, the report's versions are read again (a new one may be there). */
  cursor: string | undefined
  /** «Show everyone», in the room where it is offered: shown, the report goes to the stage and the pane closes. */
  show?: ShowRender | undefined
  /** In the room: a selected passage goes to the chat's message (PassageBar). */
  onAsk: ((passage: Passage) => void) | undefined
  /** In a call: the members in it, whom a task made from a passage may be for (PassageTask). */
  people?: readonly TaskPerson[] | undefined
}

/** pdf.js loads with the first PDF opened, never with the Studio. */
const PdfView = lazy(() => import('./PdfView.tsx').then((m) => ({ default: m.PdfView })))

/** The version the link names, else the report's current one (the history reads newest first). */
const pick = (versions: readonly ArtifactVersion[] | undefined, id: string | null) =>
  versions?.find((v) => v.id === id) ?? (id === null ? versions?.[0] : undefined)

/** The data on screen: the report's versions, the one shown, its checked text and its sources. */
function usePaneData(identity: Identity, link: ReportLink, cursor: string | undefined, tab: ViewerTab) {
  const versions = useQuery({
    queryKey: ['report-versions', link.artifactId, identity.name],
    queryFn: () => listArtifactVersions(identity.token, link.artifactId),
  })
  const version = pick(versions.data, link.versionId)
  // A link to a version the list does not hold (one published since it was read) reads the list again, once per
  // version, before the pane may say it is not available, or that it could not be read: an error left by an earlier
  // read is not this version's.
  const [reread, setReread] = useState<string | null>(null)
  const absent =
    versions.data !== undefined && versions.fetchStatus === 'idle' && link.versionId !== null && version === undefined
  const { refetch } = versions
  useFeedRead(cursor, refetch)
  useEffect(() => {
    const target = rereadFor(absent, reread, link.versionId)
    if (target === null) return
    setReread(target)
    void refetch()
  }, [absent, reread, link.versionId, refetch])
  const versionSettled = link.versionId === null || reread === link.versionId
  const text = useQuery({
    // A source's bytes never change (content-addressed), so a version's text is read once.
    queryKey: ['report-text', version?.sourceId, identity.name],
    queryFn: () => loadReportText(identity.token, version?.sourceId ?? '', version?.sourceHash ?? ''),
    enabled: version !== undefined,
    staleTime: Infinity,
    retry: (n, error) => !(error instanceof HashMismatch) && n < 2,
  })
  const sources = useQuery({
    queryKey: ['report-sources', link.artifactId, version?.id, identity.name],
    queryFn: () => listReportSources(identity.token, link.artifactId, version?.id ?? ''),
    enabled: version !== undefined,
  })
  // A link to a source's id is a citation only when the version cites that source (CX-0019), never a link to any other
  // id; until the sources arrive, such a link reads as its label.
  const listed = sources.data?.sources
  const parsed = useMemo(
    () => (text.data ? parseMarkdown(text.data.text, { citable: (listed ?? []).map((s) => s.sourceId) }) : null),
    [text.data, listed],
  )
  // The report's own language: the viewer names a citation in it.
  const language = useMemo(() => (text.data ? reportLanguage(text.data.text) : 'und'), [text.data])
  const renditions = useRenditions(identity, link, version)
  // The Markdown is in sight on the Document tab unless the PDF or the designed page is shown there instead.
  const shown = shownOf(version, text.data, parsed, {
    sources: sources.status,
    inSight: tab === 'document' && !renditions.showPdf && !renditions.showHtml,
  })
  // A linked passage is decided for the pane, so the Sources tab and back keep it (usePassageArrival).
  const arrival = usePassageArrival(version, parsed, shown.sourcesSettled, tab === 'document')
  return {
    versions,
    version,
    versionSettled,
    text,
    sources,
    parsed,
    language,
    ...renditions,
    shown,
    arrival,
  }
}

type PaneData = ReturnType<typeof usePaneData>

const retryRead = (n: number, error: Error) => !(error instanceof HashMismatch) && n < 2

/** The version's PDF and designed page, each read (and checked) only while it is the format on screen. */
function useRenditions(identity: Identity, link: ReportLink, version: ArtifactVersion | undefined) {
  const rendition = renditionOf(version, 'pdf')
  const page = renditionOf(version, 'html')
  const showPdf = link.format === 'pdf' && rendition !== undefined
  const showHtml = link.format === 'html' && page !== undefined
  const pdf = useQuery({
    queryKey: ['report-pdf', rendition?.sourceId, identity.name],
    queryFn: () => loadReportBytes(identity.token, rendition?.sourceId ?? '', rendition?.sha256 ?? ''),
    enabled: showPdf,
    staleTime: Infinity,
    retry: retryRead,
  })
  // The designed page's text, checked against the rendition's hash: the frame shows exactly what downloads.
  const html = useQuery({
    queryKey: ['report-html', page?.sourceId, identity.name],
    queryFn: () => loadReportText(identity.token, page?.sourceId ?? '', page?.sha256 ?? ''),
    enabled: showHtml,
    staleTime: Infinity,
    retry: retryRead,
  })
  const noPdf = pdfMissing(link.format, version)
  const noHtml = htmlMissing(link.format, version)
  return { rendition, page, showPdf, showHtml, noPdf, noHtml, pdf, html }
}

/** The version on screen as useLiveVersion reads it: its sources settled once their read is no longer pending. */
const shownOf = (
  version: ArtifactVersion | undefined,
  loaded: { text: string } | undefined,
  parsed: ParsedReport | null,
  at: { sources: 'pending' | 'error' | 'success'; inSight: boolean },
): Shown => ({
  version,
  text: loaded?.text,
  parsed,
  sourcesSettled: at.sources === 'success',
  sourcesDone: at.sources !== 'pending',
  inSight: at.inSight,
})

/** The project's feed moved (a version may have been published there): the list is read again, as on focus. */
function useFeedRead(cursor: string | undefined, refetch: () => unknown) {
  const read = useRef(cursor)
  useEffect(() => {
    if (cursor === undefined || cursor === read.current) return
    read.current = cursor
    void refetch()
  }, [cursor, refetch])
}

/**
 * A report opened without a version keeps the one first read (pinTo): from then on the link names it, in place, so a
 * version published while it is read never replaces it, and the head offers the current one instead (ART-02).
 */
function usePinnedVersion(link: ReportLink, versions: PaneData['versions'], onVersion: (versionId: string) => void) {
  // Only in sight: out of it (kept for its call) the address is the places', never the pane's to write.
  const inSight = useContext(ShortcutScope)
  const pin = pinTo(link.versionId, versions)
  const show = useRef(onVersion)
  useEffect(() => {
    show.current = onVersion
  })
  useEffect(() => {
    if (pin !== null && inSight) show.current(pin)
  }, [pin, inSight])
}

/** Esc steps down while the pane is open and its project in sight, unless a field, a dialog or a modal sheet has it. */
function useEscape(onStepDown: () => void) {
  const inSight = useContext(ShortcutScope)
  const step = useRef(onStepDown)
  useEffect(() => {
    step.current = onStepDown
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const t = e.target instanceof HTMLElement ? e.target : null
      const owned = !!t && (t.isContentEditable || !!t.closest('[role="dialog"], input, textarea, select'))
      const at = { defaultPrevented: e.defaultPrevented, repeat: e.repeat, owned }
      if (!escapeStepsDown(at, inSight, modalOnScreen())) return
      e.preventDefault()
      step.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inSight])
}

/**
 * How tall the pane's top is (its head, the call's switches, the note, the tabs), as --report-top-h: where the pane
 * covers the room, someone at the door is shown under it, never over Close, a switch or a tab. Its height, not its place
 * on screen: the pane's top is always the bar's, and the enlarging animation would skew a measured place.
 */
function usePaneTop() {
  const top = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = top.current
    if (!el) return undefined
    const root = document.documentElement.style
    const observer = new ResizeObserver(() => root.setProperty('--report-top-h', `${String(el.offsetHeight)}px`))
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.removeProperty('--report-top-h')
    }
  }, [])
  return top
}

interface TopProps {
  topRef: React.RefObject<HTMLDivElement | null>
  head: ReactNode
  /** The version's review (A16, the vision flag's), under the head. */
  review?: ReactNode
  call: ReactNode
  note: string | null
  tabs: ReactNode
}

/**
 * The pane's top: its head, then (where the pane covers the dock or the mini dock) the call's switches and the note,
 * then its tabs.
 */
function PaneTop({ topRef, head, review, call, note, tabs }: TopProps) {
  return (
    <div ref={topRef} className="report-pane-top">
      {head}
      {review}
      {/* Its own row, which wraps: the head keeps Download and Close whatever is on (a phone's 390 px). */}
      <div className="report-pane-call">{call}</div>
      {/* For the eye only: the dock's own note, still in the accessibility tree under the pane, is announced. */}
      {note && (
        <p className="report-pane-note" aria-hidden>
          {note}
        </p>
      )}
      {tabs}
    </div>
  )
}

/** Still in the page and on screen: somewhere the focus can go back to. */
const shownNow = (el: HTMLElement) => el.isConnected && isVisible(el)

/** The corner toggle of the side panel `el` sits in (Chat for a chat notice's Open), or null. */
function panelToggleOf(el: HTMLElement): HTMLElement | null {
  const panel = el.closest('.side-panel-body')?.id.replace(/^side-/, '')
  return panel ? document.querySelector<HTMLElement>(`.panel-toggles [data-panel="${panel}"]`) : null
}

/**
 * Focus moves to the title on open. On close it returns to what opened the pane, or to the toggle of the side panel
 * that held it (focusReturn), unless it already went somewhere: the side panel opening in the pane's place moves it in.
 */
function useFocusHandoff(opener: React.RefObject<HTMLElement | null>) {
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    // A deep link has no opener: what had the focus as the pane came.
    const atMount = document.activeElement instanceof HTMLElement ? document.activeElement : null
    title.current?.focus({ preventScroll: true })
    return () => {
      // Read at the close, on purpose: the same report opened again from elsewhere names its latest opener.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      const from = opener.current ?? atMount
      const free = focusFree(document.activeElement, document.body)
      focusReturn(free, from, from ? panelToggleOf(from) : null, shownNow)?.focus({ preventScroll: true })
    }
  }, [opener])
  return title
}

/**
 * A citation shows its source once (SourcesList focuses it); a tab chosen afterwards, or any move off Sources (an open
 * of the same report from elsewhere), shows the list as it is.
 */
function useCitation(tab: ViewerTab, onTab: (tab: ViewerTab) => void) {
  const [focusSource, setFocusSource] = useState<string | null>(null)
  useEffect(() => {
    if (tab !== 'sources') setFocusSource(null)
  }, [tab])
  return {
    focusSource,
    cite: (sourceId: string) => {
      setFocusSource(sourceId)
      onTab('sources')
    },
    choose: (next: ViewerTab) => {
      setFocusSource(null)
      onTab(next)
    },
  }
}

/** What the pane does around what it shows: the version it pins, its keys, the focus and its top's height. */
function usePaneBehaviour(
  { link, opener, onVersion, onStepDown, onEnlarge }: Props,
  data: PaneData,
  showing: (to: string) => void,
) {
  usePinnedVersion(link, data.versions, onVersion)
  useEscape(onStepDown)
  useShortcuts({ f: link.size === 'full' ? onStepDown : onEnlarge })
  const title = useFocusHandoff(opener)
  // Back to the side pane with the focus on a call switch: beside the room the dock has them and the row is hidden,
  // so the focus goes to the title rather than stay on a button nobody sees.
  useEffect(() => {
    const at = document.activeElement
    if (at instanceof HTMLElement && at.closest('.report-pane-call') && !isVisible(at)) {
      title.current?.focus({ preventScroll: true })
    }
  }, [link.size, title])
  // "Show it" goes with the offer once pressed, as the unavailable report's buttons go: the focus goes to the title.
  const toTitle = () => title.current?.focus({ preventScroll: true })
  const recover: Recover = {
    show: (versionId) => {
      onVersion(versionId)
      toTitle()
    },
    retry: () => {
      void data.versions.refetch()
      toTitle()
    },
  }
  const current = currentOffer(data.versions.data, data.version)
  // Offered once the text on screen is read (or its read failed), so what changed is compared with it (useLiveVersion).
  const offer =
    current && (data.text.data || data.text.isError)
      ? {
          words: offerWords(current, data.version?.id ?? ''),
          onShow: () => {
            showing(current.id)
            recover.show(current.id)
          },
        }
      : null
  // Whether the version on screen is the report's current one: only that one is shown to everyone.
  return { title, top: usePaneTop(), offer, recover, onCurrent: current === null }
}

export function DocumentPane(props: Props) {
  const { identity, link, tab, onTab, onVersion, onFormat, onEnlarge, onStepDown, onClose, onChat } = props
  const pane = useRef<HTMLElement>(null)
  const data = usePaneData(identity, link, props.cursor, tab)
  // A section asked for (a search hit's): its heading, once its version's Markdown is on screen.
  useSectionArrival(props.section, { text: data.parsed, inSight: data.shown.inSight, versionId: data.version?.id })
  const live = useLiveVersion(pane, data.shown, data.versions.data)
  const { title, top, offer, recover, onCurrent } = usePaneBehaviour(props, data, live.showing)
  const width = usePaneWidth()
  const status = useTransientStatus()
  const { focusSource, cite, choose } = useCitation(tab, onTab)
  const full = link.size === 'full'
  const tasks = useTaskTab(props)
  return (
    <aside ref={pane} className="report-pane" data-size={link.size} aria-labelledby="report-pane-title">
      {!full && <div className="report-pane-grip" aria-hidden onPointerDown={width.drag} />}
      <PaneTop
        topRef={top}
        head={
          <PaneHead
            title={data.version?.title ?? 'Report'}
            titleRef={title}
            {...headOf(data)}
            current={offer}
            // Only the current version is shown to everyone: the room shows what is current (present-view.ts).
            show={data.version && onCurrent && props.show?.(data.version.id, onClose)}
            full={full}
            onDownload={() => void viewerDownload(data, status.show)}
            onEnlarge={onEnlarge}
            onStepDown={onStepDown}
            onClose={onClose}
            onChat={onChat}
            chatUnread={props.chatUnread ?? false}
          />
        }
        review={reviewOf(props, data)}
        call={props.call}
        note={props.note}
        tabs={<PaneTabs tab={tab} onTab={choose} {...tabFacts(data)} tasks={tasks.open} onFormat={onFormat} />}
      />
      <PaneBody
        tab={tab}
        data={data}
        full={full}
        identity={identity}
        focusSource={focusSource}
        onCite={cite}
        onVersion={onVersion}
        recover={recover}
        changes={live.changes}
        tasks={tasks.list}
      />
      <PaneStatus {...status} />
      <PassageBar pane={pane} version={data.version} viewer={{ ...props, onSeeTasks: () => choose('tasks') }} />
    </aside>
  )
}

/** The Tasks tab (A17, the vision flag's): how many are open, and its list. */
function useTaskTab(props: Props): { open: number | undefined; list: ReactNode } {
  const read = useTasks(props.identity, props.link.artifactId, props.cursor)
  return {
    open: VISION && read.data ? openCount(read.data.tasks) : undefined,
    list: VISION ? (
      <TaskList
        projectId={props.projectId}
        identity={props.identity}
        artifactId={props.link.artifactId}
        cursor={props.cursor}
      />
    ) : null,
  }
}

/** The version's review row (A16, the vision flag's): one per version, so nothing of one reaches another. */
function reviewOf(props: Props, data: PaneData): ReactNode {
  const version = data.version
  if (!VISION || !version) return null
  const newest = data.versions.data?.[0]?.id === version.id
  return (
    <ReviewRow
      key={version.id}
      projectId={props.projectId}
      identity={props.identity}
      version={version}
      newest={newest}
      cursor={props.cursor}
      readable={headOf(data).canDownload}
    />
  )
}

/** The download's line of status, in the pane's foot. */
function PaneStatus({ text, error }: { text: string; error: boolean }) {
  return (
    <p className="report-status" role="status" data-error={error || undefined}>
      {text}
    </p>
  )
}

interface BodyProps {
  tab: ViewerTab
  data: PaneData
  full: boolean
  identity: Identity
  focusSource: string | null
  onCite: (sourceId: string) => void
  onVersion: (versionId: string) => void
  recover: Recover
  /** The new version's changes, when it was shown from the offer (useLiveVersion). */
  changes: LiveChanges
  /** The Tasks tab's list (A17), under the vision flag. */
  tasks: ReactNode
}

/**
 * Why nothing of the report can be shown, whatever the tab: not readable to this person, or the version gone (then the
 * current one, when the report has one, is a press away).
 */
function unavailable(data: PaneData): Blocked | null {
  const failure = versionReadFailure(data.versions, data.version !== undefined, data.versionSettled)
  if (failure === 'refused') return { text: 'This report isn’t available to you.' }
  if (failure === 'failed') {
    // Nothing of the report was read, or its list was, but without this version.
    const what = data.versions.data === undefined ? 'The report' : 'This version'
    return { text: `${what} couldn’t be loaded.`, retry: true }
  }
  if (versionMissing(data.versions, data.version !== undefined, data.versionSettled)) {
    return { text: 'This version isn’t available.', current: data.versions.data?.[0] }
  }
  return null
}

interface Blocked {
  text: string
  current?: ArtifactVersion | undefined
  /** The read failed: it can be tried again. */
  retry?: boolean
}

/**
 * Showing another version (the head's "Show it", an unavailable report's current one) and reading the list again. Each
 * button goes once pressed, so each hands the focus to the title.
 */
interface Recover {
  show: (versionId: string) => void
  retry: () => void
}

function Unavailable({ text, current, retry, recover }: Blocked & { recover: Recover }) {
  return (
    <p className="muted" role="alert">
      {text}{' '}
      {current && (
        <button type="button" className="text-button" onClick={() => recover.show(current.id)}>
          Show the current version{current.versionNumber ? `, v${current.versionNumber}` : ''}
        </button>
      )}
      {retry && (
        <button type="button" className="text-button" onClick={recover.retry}>
          Try again
        </button>
      )}
    </p>
  )
}

function PaneBody(props: BodyProps) {
  const blocked = unavailable(props.data)
  return (
    <div
      id="report-tabpanel"
      className="report-pane-body"
      role="tabpanel"
      aria-labelledby={`report-tab-${props.tab}`}
      data-pdf={(!blocked && props.data.showPdf) || undefined}
      data-html={(!blocked && props.data.showHtml) || undefined}
    >
      {blocked ? <Unavailable {...blocked} recover={props.recover} /> : <TabContent {...props} />}
    </div>
  )
}

/**
 * The Document tab shows one view per format: the PDF rendition, the designed HTML page (SDD-01) of its stored bytes in
 * an isolated frame, never in MarkdownView or the Studio's own DOM, or the Markdown read in the reading voice (with
 * what changed in a version that arrived live).
 */
function DocumentView({ data, full, onCite, changes }: Pick<BodyProps, 'data' | 'full' | 'onCite' | 'changes'>) {
  if (data.showPdf) return <PdfTab data={data} full={full} />
  if (data.showHtml) return <HtmlTab data={data} full={full} />
  return <DocumentTab data={data} onCite={onCite} changes={changes} />
}

function TabContent({ tab, data, full, identity, focusSource, onCite, onVersion, changes, tasks }: BodyProps) {
  return (
    <>
      {tab === 'document' && <DocumentView data={data} full={full} onCite={onCite} changes={changes} />}
      {tab === 'sources' && (
        <SourcesTab
          identity={identity}
          version={data.version}
          sources={data.sources.data?.sources}
          numbers={numbersOf(data.parsed)}
          failed={failedOutright(data.sources)}
          focus={focusSource}
        />
      )}
      {tab === 'history' && (
        <ReportHistory
          identity={identity}
          versions={data.versions.data}
          shown={data.version?.id ?? null}
          onShow={onVersion}
        />
      )}
      {tab === 'tasks' && tasks}
    </>
  )
}

const numbersOf = (parsed: ParsedReport | null): ReadonlyMap<string, number> =>
  new Map((parsed?.citations ?? []).map((id, i) => [id, i + 1]))

/** "Markdown · v2 · 1,234 words": what is on screen, in words; its bytes and their hash are Download's (fileLine). */
function metaLine(version: ArtifactVersion | undefined, text: LoadedText | undefined): string {
  if (!version) return ''
  return [
    version.format === 'markdown' ? 'Markdown' : version.format.toUpperCase(),
    version.versionNumber ? `v${version.versionNumber}` : null,
    text ? `${wordCount(text.text).toLocaleString()} words` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** What the tab row counts and offers: the version's sources and the report's versions, its formats, the one shown. */
const tabFacts = (data: PaneData) => ({
  sources: data.sources.data?.sources.length,
  versions: data.versions.data?.length,
  formats: viewerFormats(data.version),
  format: shownFormat(data),
})

/** The format on screen: the one the link asks for when the version has it, else its Markdown. */
const shownFormat = (data: PaneData): ViewerFormat => {
  if (data.showPdf) return 'pdf'
  return data.showHtml ? 'html' : 'markdown'
}

interface HeadFacts {
  format: ViewerFormat
  meta: string
  /** "41.2 KB · 1a2b3c4d": the bytes on screen and their hash, said at Download; null until they are known. */
  file: string | null
  canDownload: boolean
}

/** What the head says about the format on screen, and whether its bytes are there to download. */
function headOf(data: PaneData): HeadFacts {
  const file = fileLine(data)
  if (data.showPdf) return { format: 'pdf', meta: pdfMetaLine(data), file, canDownload: data.pdf.isSuccess }
  if (data.showHtml) return { format: 'html', meta: htmlMetaLine(data), file, canDownload: data.html.isSuccess }
  const meta = metaLine(data.version, data.text.data)
  return { format: 'markdown', meta, file, canDownload: data.text.isSuccess }
}

/** "41.2 KB · 1a2b3c4d": a file's size, when its bytes are read, and its hash. */
const exact = (bytes: number | undefined, sha256: string) =>
  [bytes === undefined ? null : formatBytes(bytes), shortHash(sha256)].filter(Boolean).join(' · ')

/** The bytes of the format on screen and the hash their record gives, exactly: what Download saves. */
function fileLine({ version, text, rendition, showPdf, page, showHtml }: PaneData): string | null {
  if (showPdf) return rendition ? exact(rendition.byteLength, rendition.sha256) : null
  if (showHtml) return page ? exact(page.byteLength, page.sha256) : null
  return version ? exact(text.data?.byteLength, version.sourceHash) : null
}

/** "HTML · v2 · design checked": the designed page on screen, and how it was checked. */
function htmlMetaLine({ version, page }: PaneData): string {
  if (!version || !page) return ''
  return ['HTML', version.versionNumber ? `v${version.versionNumber}` : null, reviewTag(page.reviewState)]
    .filter(Boolean)
    .join(' · ')
}

/** "PDF · v2 · 3 pages": the PDF on screen. */
function pdfMetaLine({ version, rendition }: PaneData): string {
  if (!version || !rendition) return ''
  return [
    'PDF',
    version.versionNumber ? `v${version.versionNumber}` : null,
    rendition.pageCount ? `${rendition.pageCount} ${rendition.pageCount === 1 ? 'page' : 'pages'}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** The bytes on screen and the hash their record gives: the PDF's, the designed page's, or the Markdown's. */
function onScreen({ version, text, rendition, showPdf, pdf, page, showHtml, html }: PaneData) {
  if (showPdf) return pdf.data && rendition ? { file: pdf.data, sha256: rendition.sha256 } : null
  if (showHtml) return html.data && page ? { file: asBytes(html.data), sha256: page.sha256 } : null
  return text.data && version ? { file: asBytes(text.data), sha256: version.sourceHash } : null
}

const asBytes = (text: LoadedText): LoadedBytes => ({
  bytes: utf8(text.text),
  filename: text.filename,
  mime: text.mime,
})

/** The viewer's download: the bytes already loaded, checked against their record again before they are saved. */
async function viewerDownload(data: PaneData, show: (text: string, error?: boolean) => void): Promise<void> {
  const shown = onScreen(data)
  if (!shown) return
  try {
    saveBlob(await checkedBlob(shown.file.bytes, shown.sha256, shown.file.mime), shown.file.filename)
    show(`Downloading ${shown.file.filename} · ${exact(shown.file.bytes.byteLength, shown.sha256)}`)
  } catch (err: unknown) {
    show(err instanceof HashMismatch ? err.message : 'The download didn’t start. Try again.', true)
  }
}

interface HeadProps {
  title: string
  titleRef: React.RefObject<HTMLHeadingElement | null>
  format: ViewerFormat
  meta: string
  /** The report's current version, when another is on screen (currentOffer). */
  current: { words: string; onShow: () => void } | null
  /** «Show everyone», where it is offered. */
  show: ReactNode
  full: boolean
  /** The bytes on screen and their hash (fileLine), said at Download. */
  file: string | null
  canDownload: boolean
  onDownload: () => void
  onEnlarge: () => void
  onStepDown: () => void
  onClose: () => void
  onChat?: (() => void) | undefined
  chatUnread: boolean
}

const TILE: Record<ViewerFormat, string> = { markdown: 'MD', pdf: 'PDF', html: 'HTML' }

function PaneHead(props: HeadProps) {
  const {
    title,
    titleRef,
    format,
    meta,
    current,
    full,
    canDownload,
    onDownload,
    onEnlarge,
    onStepDown,
    onClose,
    onChat,
  } = props
  const size = full ? 'Back to side panel' : 'Enlarge'
  return (
    <header className="report-pane-head">
      <span className="report-tile" data-format={format} aria-hidden>
        {TILE[format]}
      </span>
      <div className="report-pane-name">
        <h2 id="report-pane-title" ref={titleRef} tabIndex={-1}>
          {title}
        </h2>
        <p className="report-meta">{meta}</p>
        {current && (
          <p className="report-current" role="status">
            {current.words}{' '}
            <button type="button" className="text-button" onClick={current.onShow}>
              Show it
            </button>
          </p>
        )}
      </div>
      {props.show}
      <DownloadButton ready={canDownload} file={props.file} onDownload={onDownload} />
      <button type="button" className="round has-tip" aria-label={size} onClick={full ? onStepDown : onEnlarge}>
        <Icon name={full ? 'collapse' : 'expand'} />
        <Tip label={size} keys="F" side="bottom" align="end" />
      </button>
      {onChat && <ChatButton unread={props.chatUnread} onChat={onChat} />}
      <button type="button" className="round has-tip" aria-label="Close" onClick={onClose}>
        <Icon name="close" />
        <Tip label="Close" keys="Esc" side="bottom" align="end" />
      </button>
    </header>
  )
}

/**
 * The bytes on screen, once they are checked: until then a press does nothing, and the button says so (aria-disabled,
 * never disabled), so it keeps the focus and its tip. Named on its own: a phone hides the word.
 */
function DownloadButton(props: { ready: boolean; file: string | null; onDownload: () => void }) {
  const { ready, file, onDownload } = props
  // The size and the hash said to a screen reader, and on touch (no tip there) by the download's own note.
  const described = useId()
  return (
    <button
      type="button"
      className="pill report-download has-tip"
      aria-label="Download"
      aria-describedby={file ? described : undefined}
      aria-disabled={!ready || undefined}
      onClick={() => {
        if (ready) onDownload()
      }}
    >
      <Icon name="download" />
      <span className="report-download-label">Download</span>
      {file && (
        <span id={described} className="sr-only">
          {file}
        </span>
      )}
      <Tip label={file ? `Download this version · ${file}` : 'Download this version'} side="bottom" align="end" />
    </button>
  )
}

/** In the room: the chat in the report's place, with the corner toggle's mark for what is new there. */
function ChatButton({ unread, onChat }: { unread: boolean; onChat: () => void }) {
  return (
    <button
      type="button"
      className="round has-tip"
      aria-label={unread ? 'Chat, something new' : 'Chat'}
      onClick={onChat}
    >
      <Icon name="chat" />
      {unread && <span className="toggle-dot" aria-hidden />}
      <Tip label="Chat in place of the report" keys="C" side="bottom" align="end" />
    </button>
  )
}

interface TabsProps {
  tab: ViewerTab
  onTab: (tab: ViewerTab) => void
  sources: number | undefined
  versions: number | undefined
  /** The formats the version can be read in; the switch shows when there is more than its Markdown. */
  formats: readonly ViewerFormat[]
  format: ViewerFormat
  onFormat: (format: ViewerFormat) => void
  /** The open tasks (A17); undefined until read, or outside the vision flag. */
  tasks: number | undefined
}

const count = (n: number | undefined) => (n === undefined ? '' : ` ${n}`)

/** The Tasks tab only under the vision flag (A17). */
const TABS: readonly ViewerTab[] = VISION
  ? ['document', 'sources', 'history', 'tasks']
  : ['document', 'sources', 'history']

/**
 * The report's tabs, as every tab row in Studio: the one selected is the one Tab reaches, arrow keys, Home and End move
 * between them. The format switch sits beside the row, not in it (a tab list holds tabs only).
 */
function PaneTabs({ tab, onTab, sources, versions, tasks, formats, format, onFormat }: TabsProps) {
  const label: Record<ViewerTab, string> = {
    document: 'Document',
    sources: `Sources${count(sources)}`,
    history: `History${count(versions)}`,
    tasks: `Tasks${count(tasks)}`,
  }
  return (
    <div className="report-tabs">
      <Tabs
        label="Report"
        className="report-tablist"
        items={TABS.map((id) => ({ id, label: label[id], controls: 'report-tabpanel' }))}
        value={tab}
        onChange={onTab}
        idFor={(id) => `report-tab-${id}`}
      />
      {formats.length > 1 && <FormatSwitch formats={formats} format={format} onFormat={onFormat} />}
    </div>
  )
}

const FORMAT_NAME: Record<ViewerFormat, string> = { markdown: 'Markdown', pdf: 'PDF', html: 'HTML' }

/** Markdown, PDF or the designed HTML page: the formats the version has. */
function FormatSwitch(props: {
  formats: readonly ViewerFormat[]
  format: ViewerFormat
  onFormat: (format: ViewerFormat) => void
}) {
  const { formats, format, onFormat } = props
  return (
    <Segmented
      role="group"
      label="Format"
      size="sm"
      className="report-format"
      items={formats.map((id) => ({ id, label: FORMAT_NAME[id] }))}
      value={format}
      onChange={onFormat}
    />
  )
}

/** The version's PDF, once its bytes matched the rendition's hash. */
function PdfTab({ data, full }: { data: PaneData; full: boolean }) {
  if (data.pdf.isError) {
    return (
      <p className="muted" role="alert">
        {data.pdf.error instanceof HashMismatch
          ? 'This PDF did not match its record, so it is not shown.'
          : 'The PDF couldn’t be loaded. Try again in a moment.'}
      </p>
    )
  }
  if (!data.pdf.data) return <ReadNote>Loading the PDF…</ReadNote>
  return (
    <Suspense fallback={<ReadNote>Opening the PDF…</ReadNote>}>
      <PdfView bytes={data.pdf.data.bytes} full={full} />
    </Suspense>
  )
}

/** The version's designed page, once its bytes matched the rendition's hash. */
function HtmlTab({ data, full }: { data: PaneData; full: boolean }) {
  if (data.html.isError) {
    return (
      <p className="muted" role="alert">
        {data.html.error instanceof HashMismatch
          ? 'This page did not match its record, so it is not shown.'
          : 'The page couldn’t be loaded. Try again in a moment.'}
      </p>
    )
  }
  if (!data.html.data || !data.page) return <ReadNote>Loading the page…</ReadNote>
  return (
    <HtmlView html={data.html.data.text} title={data.version?.title ?? 'Report'} rendition={data.page} full={full} />
  )
}

interface DocumentTabProps {
  data: PaneData
  onCite: (sourceId: string) => void
  changes: LiveChanges
}

/** Why the Markdown is on screen though another format was asked for, or null. */
const formatNote = (data: PaneData): string | null => {
  if (data.noPdf) return 'This version has no PDF, so its Markdown is shown.'
  return data.noHtml ? 'This version has no designed HTML page, so its Markdown is shown.' : null
}

function DocumentTab({ data, onCite, changes }: DocumentTabProps) {
  const { arrival } = data
  if (data.text.isError) {
    return (
      <p className="muted" role="alert">
        {data.text.error instanceof HashMismatch
          ? 'This report did not match its record, so it is not shown.'
          : 'The report couldn’t be loaded. Try again in a moment.'}
      </p>
    )
  }
  if (!data.parsed || !data.version) return <ReadNote>Loading the report…</ReadNote>
  return (
    <>
      {formatNote(data) && (
        <p className="report-format-note" role="note">
          {formatNote(data)}
        </p>
      )}
      <Limitations items={data.version.limitations ?? []} />
      {arrival === 'missing' && (
        <p className="report-passage-note" role="status">
          This passage isn’t in this version.
        </p>
      )}
      {changes.facts && (
        <p className="report-changes" role="note">
          {changes.facts}
        </p>
      )}
      <MarkdownView
        marks={changes.marks}
        report={data.parsed}
        sources={data.sources.data?.sources}
        language={data.language}
        onCite={onCite}
      />
    </>
  )
}

function Limitations({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null
  return (
    <section className="report-limits" aria-label="Limitations">
      <h3>Limitations</h3>
      <ul>
        {items.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  )
}
