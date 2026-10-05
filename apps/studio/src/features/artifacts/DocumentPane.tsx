// The report viewer (plan §2.8.3–§2.8.6): a side pane that can be enlarged to a full page in the same frame. Its head
// names the version on screen (format, version, words or pages, size, short hash) and downloads exactly those bytes;
// its tabs are the Document, the Sources it cites and its History. A version with a PDF shows either its Markdown or
// its PDF (S5b). Every file is checked against its hash before it is shown, so what is read is what downloads. A non-modal complementary region: focus moves to its title on open
// and back to the opener on close; Esc steps down, F toggles the full page.
// The Document tab also saves its version as an HTML page, printed from the Markdown on screen (PageDownload).
import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ArtifactVersion } from '@sophia/contracts'
import { reportLanguage } from '@sophia/report/language'
import { Icon, Tip } from '@sophia/ui'
import { listArtifactVersions, listReportSources } from '../../api/artifacts.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { nextInRow } from '../../app/roving.ts'
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
import { MarkdownView } from './MarkdownView.tsx'
import { PageDownload } from './PageDownload.tsx'
import { PassageBar, type Passage } from './PassageBar.tsx'
import type { ReportLink, ViewerFormat, ViewerTab } from './report-link.ts'
import {
  currentOffer,
  escapeStepsDown,
  failedOutright,
  focusFree,
  focusReturn,
  formatBytes,
  pdfMissing,
  pinTo,
  rereadFor,
  shortHash,
  versionMissing,
  versionReadFailure,
} from './report-view.ts'
import { ReportHistory } from './ReportHistory.tsx'
import { SourcesList } from './SourcesList.tsx'
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
  /** In the room: a selected passage goes to the chat's message (PassageBar). */
  onAsk: ((passage: Passage) => void) | undefined
}

/** pdf.js loads with the first PDF opened, never with the Studio. */
const PdfView = lazy(() => import('./PdfView.tsx').then((m) => ({ default: m.PdfView })))

/** The version the link names, else the report's current one (the history reads newest first). */
const pick = (versions: readonly ArtifactVersion[] | undefined, id: string | null) =>
  versions?.find((v) => v.id === id) ?? (id === null ? versions?.[0] : undefined)

/** The data on screen: the report's versions, the one shown, its checked text and its sources. */
function usePaneData(identity: Identity, link: ReportLink) {
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
  // The report's own language: the viewer names a citation in it, as its HTML page does.
  const language = useMemo(() => (text.data ? reportLanguage(text.data.text) : 'und'), [text.data])
  // The PDF is the one rendition format (A11).
  const rendition = version?.renditions?.[0]
  const showPdf = link.format === 'pdf' && rendition !== undefined
  const noPdf = pdfMissing(link.format, version)
  const pdf = useQuery({
    queryKey: ['report-pdf', rendition?.sourceId, identity.name],
    queryFn: () => loadReportBytes(identity.token, rendition?.sourceId ?? '', rendition?.sha256 ?? ''),
    enabled: showPdf,
    staleTime: Infinity,
    retry: (n, error) => !(error instanceof HashMismatch) && n < 2,
  })
  return { versions, version, versionSettled, text, sources, parsed, language, rendition, showPdf, noPdf, pdf }
}

type PaneData = ReturnType<typeof usePaneData>

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
  call: ReactNode
  note: string | null
  tabs: ReactNode
}

/**
 * The pane's top: its head, then (where the pane covers the dock or the mini dock) the call's switches and the note,
 * then its tabs.
 */
function PaneTop({ topRef, head, call, note, tabs }: TopProps) {
  return (
    <div ref={topRef} className="report-pane-top">
      {head}
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
function usePaneBehaviour({ link, opener, onVersion, onStepDown, onEnlarge }: Props, data: PaneData) {
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
  const offer = current ? { number: current.versionNumber, onShow: () => recover.show(current.id) } : null
  return { title, top: usePaneTop(), offer, recover }
}

export function DocumentPane(props: Props) {
  const { identity, link, tab, onTab, onVersion, onFormat, onEnlarge, onStepDown, onClose, onChat } = props
  const data = usePaneData(identity, link)
  const { title, top, offer, recover } = usePaneBehaviour(props, data)
  const width = usePaneWidth()
  const status = useTransientStatus()
  const { focusSource, cite, choose } = useCitation(tab, onTab)
  const full = link.size === 'full'
  const pane = useRef<HTMLElement>(null)
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
            full={full}
            onDownload={() => void viewerDownload(data, status.show)}
            onEnlarge={onEnlarge}
            onStepDown={onStepDown}
            onClose={onClose}
            onChat={onChat}
            chatUnread={props.chatUnread ?? false}
          />
        }
        call={props.call}
        note={props.note}
        tabs={
          <PaneTabs
            tab={tab}
            onTab={choose}
            sources={data.sources.data?.sources.length}
            versions={data.versions.data?.length}
            format={data.rendition ? (data.showPdf ? 'pdf' : 'markdown') : null}
            onFormat={onFormat}
          />
        }
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
      />
      <p className="report-status" role="status" data-error={status.error || undefined}>
        {status.text}
      </p>
      <PassageBar pane={pane} version={data.version} viewer={props} />
    </aside>
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
    >
      {blocked ? <Unavailable {...blocked} recover={props.recover} /> : <TabContent {...props} />}
    </div>
  )
}

function TabContent({ tab, data, full, identity, focusSource, onCite, onVersion }: BodyProps) {
  // The Document tab shows one view per format: the PDF rendition, or the Markdown read in the reading voice. A designed
  // HTML version (SDD-01) is a third view here, of its stored bytes in an isolated frame, beside these and never in
  // MarkdownView or the Studio's own DOM (docs/coordination/M75/HANDOFF_TO_SDD01.md §4).
  return (
    <>
      {tab === 'document' && data.showPdf && <PdfTab data={data} full={full} />}
      {tab === 'document' && !data.showPdf && <DocumentTab data={data} identity={identity} onCite={onCite} />}
      {tab === 'sources' && (
        <SourcesList
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
    </>
  )
}

const numbersOf = (parsed: ParsedReport | null): ReadonlyMap<string, number> =>
  new Map((parsed?.citations ?? []).map((id, i) => [id, i + 1]))

/** "Markdown · v2 · 1,234 words · 8.1 KB · 1a2b3c4d": what is on screen, exactly. */
function metaLine(version: ArtifactVersion | undefined, text: LoadedText | undefined): string {
  if (!version) return ''
  return [
    version.format === 'markdown' ? 'Markdown' : version.format.toUpperCase(),
    version.versionNumber ? `v${version.versionNumber}` : null,
    text ? `${wordCount(text.text).toLocaleString()} words` : null,
    text ? formatBytes(text.byteLength) : null,
    shortHash(version.sourceHash),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** What the head says about the format on screen, and whether its bytes are there to download. */
const headOf = (data: PaneData) =>
  data.showPdf
    ? { format: 'pdf' as const, meta: pdfMetaLine(data), canDownload: data.pdf.isSuccess }
    : { format: 'markdown' as const, meta: metaLine(data.version, data.text.data), canDownload: data.text.isSuccess }

/** "PDF · v2 · 3 pages · 68.0 KB · 1a2b3c4d": the PDF on screen, exactly. */
function pdfMetaLine({ version, rendition }: PaneData): string {
  if (!version || !rendition) return ''
  return [
    'PDF',
    version.versionNumber ? `v${version.versionNumber}` : null,
    rendition.pageCount ? `${rendition.pageCount} ${rendition.pageCount === 1 ? 'page' : 'pages'}` : null,
    formatBytes(rendition.byteLength),
    shortHash(rendition.sha256),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** The bytes on screen and the hash their record gives: the PDF's, or the Markdown's. */
function onScreen({ version, text, rendition, showPdf, pdf }: PaneData) {
  if (showPdf) return pdf.data && rendition ? { file: pdf.data, sha256: rendition.sha256 } : null
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
    show(`Downloading ${shown.file.filename} · ${formatBytes(shown.file.bytes.byteLength)}`)
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
  current: { number: number | undefined; onShow: () => void } | null
  full: boolean
  canDownload: boolean
  onDownload: () => void
  onEnlarge: () => void
  onStepDown: () => void
  onClose: () => void
  onChat?: (() => void) | undefined
  chatUnread: boolean
}

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
        {format === 'pdf' ? 'PDF' : 'MD'}
      </span>
      <div className="report-pane-name">
        <h2 id="report-pane-title" ref={titleRef} tabIndex={-1}>
          {title}
        </h2>
        <p className="report-meta">{meta}</p>
        {current && (
          <p className="report-current" role="status">
            {current.number ? `v${current.number} is the current version.` : 'This is not the current version.'}{' '}
            <button type="button" className="text-button" onClick={current.onShow}>
              Show it
            </button>
          </p>
        )}
      </div>
      <DownloadButton ready={canDownload} onDownload={onDownload} />
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
function DownloadButton({ ready, onDownload }: { ready: boolean; onDownload: () => void }) {
  return (
    <button
      type="button"
      className="pill report-download has-tip"
      aria-label="Download"
      aria-disabled={!ready || undefined}
      onClick={() => {
        if (ready) onDownload()
      }}
    >
      <Icon name="download" />
      <span className="report-download-label">Download</span>
      <Tip label="Download this version" side="bottom" align="end" />
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
  /** The format on screen when the version has a PDF; null when it has only its Markdown. */
  format: ViewerFormat | null
  onFormat: (format: ViewerFormat) => void
}

const count = (n: number | undefined) => (n === undefined ? '' : ` ${n}`)

const TABS: readonly ViewerTab[] = ['document', 'sources', 'history']

/**
 * The report's tabs, as every tab row in Studio: the one selected is the one Tab reaches, arrow keys, Home and End move
 * between them. The format switch sits beside the row, not in it (a tab list holds tabs only).
 */
function PaneTabs({ tab, onTab, sources, versions, format, onFormat }: TabsProps) {
  const buttons = useRef(new Map<ViewerTab, HTMLButtonElement>())
  const label: Record<ViewerTab, string> = {
    document: 'Document',
    sources: `Sources${count(sources)}`,
    history: `History${count(versions)}`,
  }
  const onKey = (e: React.KeyboardEvent) => {
    const next = nextInRow(TABS, tab, e.key)
    if (!next) return
    e.preventDefault()
    onTab(next)
    buttons.current.get(next)?.focus()
  }
  return (
    <div className="report-tabs">
      <div className="report-tablist" role="tablist" aria-label="Report" onKeyDown={onKey}>
        {TABS.map((id) => (
          <button
            key={id}
            ref={(el) => {
              if (el) buttons.current.set(id, el)
            }}
            type="button"
            role="tab"
            id={`report-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="report-tabpanel"
            tabIndex={tab === id ? 0 : -1}
            onClick={() => onTab(id)}
          >
            {label[id]}
          </button>
        ))}
      </div>
      {format && <FormatSwitch format={format} onFormat={onFormat} />}
    </div>
  )
}

/** Markdown or PDF, for a version that has both. */
function FormatSwitch({ format, onFormat }: { format: ViewerFormat; onFormat: (format: ViewerFormat) => void }) {
  const options: [ViewerFormat, string][] = [
    ['markdown', 'Markdown'],
    ['pdf', 'PDF'],
  ]
  return (
    <span className="report-format" role="group" aria-label="Format">
      {options.map(([id, label]) => (
        <button key={id} type="button" aria-pressed={format === id} onClick={() => onFormat(id)}>
          {label}
        </button>
      ))}
    </span>
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
  if (!data.pdf.data) return <p className="muted">Loading the PDF…</p>
  return (
    <Suspense fallback={<p className="muted">Opening the PDF…</p>}>
      <PdfView bytes={data.pdf.data.bytes} full={full} />
    </Suspense>
  )
}

interface DocumentTabProps {
  data: PaneData
  identity: Identity
  onCite: (sourceId: string) => void
}

function DocumentTab({ data, identity, onCite }: DocumentTabProps) {
  if (data.text.isError) {
    return (
      <p className="muted" role="alert">
        {data.text.error instanceof HashMismatch
          ? 'This report did not match its record, so it is not shown.'
          : 'The report couldn’t be loaded. Try again in a moment.'}
      </p>
    )
  }
  if (!data.parsed || !data.version) return <p className="muted">Loading the report…</p>
  return (
    <>
      {data.noPdf && (
        <p className="report-format-note" role="note">
          This version has no PDF, so its Markdown is shown.
        </p>
      )}
      <PageDownload token={identity.token} artifactId={data.version.artifactId} versionId={data.version.id} />
      <Limitations items={data.version.limitations ?? []} />
      <MarkdownView
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
