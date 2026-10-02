// The report viewer (plan §2.8.3–§2.8.6): a side pane that can be enlarged to a full page in the same frame. Its head
// names the version on screen (format, version, words or pages, size, short hash) and downloads exactly those bytes;
// its tabs are the Document, the Sources it cites and its History. A version with a PDF shows either its Markdown or
// its PDF (S5b). Every file is checked against its hash before it is shown, so what is read is what downloads. A non-modal complementary region: focus moves to its title on open
// and back to the opener on close; Esc steps down, F toggles the full page.
import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ArtifactVersion } from '@sophia/contracts'
import { Icon, Tip } from '@sophia/ui'
import { listArtifactVersions, listReportSources } from '../../api/artifacts.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useShortcuts } from '../../app/shortcuts.ts'
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
import type { ReportLink, ViewerFormat, ViewerTab } from './report-link.ts'
import { formatBytes, rereadFor, shortHash, versionMissing } from './report-view.ts'
import { ReportHistory } from './ReportHistory.tsx'
import { SourcesList } from './SourcesList.tsx'
import { usePaneWidth } from './usePaneWidth.ts'
import { useTransientStatus } from './useTransientStatus.ts'

interface Props {
  identity: Identity
  link: ReportLink
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
  // version, before the pane may say it is not available.
  const [reread, setReread] = useState<string | null>(null)
  const absent = versions.isSuccess && link.versionId !== null && version === undefined
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
  const parsed = useMemo(() => (text.data ? parseMarkdown(text.data.text) : null), [text.data])
  // The PDF is the one rendition format (A11).
  const rendition = version?.renditions?.[0]
  const showPdf = link.format === 'pdf' && rendition !== undefined
  const pdf = useQuery({
    queryKey: ['report-pdf', rendition?.sourceId, identity.name],
    queryFn: () => loadReportBytes(identity.token, rendition?.sourceId ?? '', rendition?.sha256 ?? ''),
    enabled: showPdf,
    staleTime: Infinity,
    retry: (n, error) => !(error instanceof HashMismatch) && n < 2,
  })
  return { versions, version, versionSettled, text, sources, parsed, rendition, showPdf, pdf }
}

type PaneData = ReturnType<typeof usePaneData>

/** Esc steps down while the pane is open, unless a field or a dialog has it. */
function useEscape(onStepDown: () => void) {
  const step = useRef(onStepDown)
  useEffect(() => {
    step.current = onStepDown
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const t = e.target instanceof HTMLElement ? e.target : null
      if (t?.closest('[role="dialog"], input, textarea, select')) return
      e.preventDefault()
      step.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Focus moves to the title on open and returns to whatever opened the pane on close. */
function useFocusHandoff() {
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    title.current?.focus({ preventScroll: true })
    return () => opener?.focus({ preventScroll: true })
  }, [])
  return title
}

export function DocumentPane(props: Props) {
  const { identity, link, tab, onTab, onVersion, onFormat, onEnlarge, onStepDown, onClose, onChat } = props
  const data = usePaneData(identity, link)
  const title = useFocusHandoff()
  const width = usePaneWidth()
  const status = useTransientStatus()
  const [focusSource, setFocusSource] = useState<string | null>(null)
  const full = link.size === 'full'
  useEscape(onStepDown)
  useShortcuts({ f: full ? onStepDown : onEnlarge })
  const cite = (sourceId: string) => {
    setFocusSource(sourceId)
    onTab('sources')
  }
  return (
    <aside className="report-pane" data-size={link.size} aria-labelledby="report-pane-title">
      {!full && <div className="report-pane-grip" aria-hidden onPointerDown={width.drag} />}
      <PaneHead
        title={data.version?.title ?? 'Report'}
        titleRef={title}
        {...headOf(data)}
        full={full}
        onDownload={() => void viewerDownload(data, status.show)}
        onEnlarge={onEnlarge}
        onStepDown={onStepDown}
        onClose={onClose}
        onChat={onChat}
      />
      <PaneTabs
        tab={tab}
        onTab={onTab}
        sources={data.sources.data?.sources.length}
        versions={data.versions.data?.length}
        format={data.rendition ? (data.showPdf ? 'pdf' : 'markdown') : null}
        onFormat={onFormat}
      />
      <PaneBody
        tab={tab}
        data={data}
        full={full}
        identity={identity}
        focusSource={focusSource}
        onCite={cite}
        onVersion={onVersion}
      />
      <p className="report-status" role="status" data-error={status.error || undefined}>
        {status.text}
      </p>
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
}

function PaneBody({ tab, data, full, identity, focusSource, onCite, onVersion }: BodyProps) {
  return (
    <div className="report-pane-body" role="tabpanel" aria-label={TAB_NAME[tab]} data-pdf={data.showPdf || undefined}>
      {tab === 'document' && data.showPdf && <PdfTab data={data} full={full} />}
      {tab === 'document' && !data.showPdf && <DocumentTab data={data} onCite={onCite} />}
      {tab === 'sources' && (
        <SourcesList
          sources={data.sources.data?.sources}
          numbers={numbersOf(data.parsed)}
          failed={data.sources.isError}
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
    </div>
  )
}

const TAB_NAME: Record<ViewerTab, string> = { document: 'Document', sources: 'Sources', history: 'History' }

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
  full: boolean
  canDownload: boolean
  onDownload: () => void
  onEnlarge: () => void
  onStepDown: () => void
  onClose: () => void
  onChat?: (() => void) | undefined
}

function PaneHead(props: HeadProps) {
  const { title, titleRef, format, meta, full, canDownload, onDownload, onEnlarge, onStepDown, onClose, onChat } = props
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
      </div>
      <button type="button" className="pill report-download has-tip" onClick={onDownload} disabled={!canDownload}>
        <Icon name="download" />
        <span className="report-download-label">Download</span>
        <Tip label="Download this version" side="bottom" align="end" />
      </button>
      <button type="button" className="round has-tip" aria-label={size} onClick={full ? onStepDown : onEnlarge}>
        <Icon name={full ? 'collapse' : 'expand'} />
        <Tip label={size} keys="F" side="bottom" align="end" />
      </button>
      {onChat && (
        <button type="button" className="round has-tip" aria-label="Chat" onClick={onChat}>
          <Icon name="chat" />
          <Tip label="Chat in place of the report" keys="C" side="bottom" align="end" />
        </button>
      )}
      <button type="button" className="round has-tip" aria-label="Close" onClick={onClose}>
        <Icon name="close" />
        <Tip label="Close" keys="Esc" side="bottom" align="end" />
      </button>
    </header>
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

function PaneTabs({ tab, onTab, sources, versions, format, onFormat }: TabsProps) {
  const tabs: [ViewerTab, string][] = [
    ['document', 'Document'],
    ['sources', `Sources${count(sources)}`],
    ['history', `History${count(versions)}`],
  ]
  return (
    <div className="report-tabs" role="tablist" aria-label="Report">
      {tabs.map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => onTab(id)}>
          {label}
        </button>
      ))}
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

function DocumentTab({ data, onCite }: { data: PaneData; onCite: (sourceId: string) => void }) {
  if (data.versions.isError) return <p className="muted">This report isn’t available to you.</p>
  if (versionMissing(data.versions, data.version !== undefined, data.versionSettled))
    return <p className="muted">This version isn’t available.</p>
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
      <Limitations items={data.version.limitations ?? []} />
      <MarkdownView report={data.parsed} onCite={onCite} />
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
