// The report viewer (plan §2.8.3–§2.8.6): a side pane that can be enlarged to a full page in the same frame. Its head
// names the version on screen (format, version, words, size, short hash) and downloads exactly those bytes; its tabs
// are the Document, the Sources it cites and its History. The text is checked against the version's hash before it
// is shown, so what is read is what downloads. A non-modal complementary region: focus moves to its title on open
// and back to the opener on close; Esc steps down, F toggles the full page.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ArtifactVersion } from '@sophia/contracts'
import { Icon, Tip } from '@sophia/ui'
import { listArtifactVersions, listReportSources } from '../../api/artifacts.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useShortcuts } from '../../app/shortcuts.ts'
import { checkedBlob, HashMismatch, loadReportText, saveBlob, utf8, type LoadedText } from './download.ts'
import { parseMarkdown, wordCount, type ParsedReport } from './markdown.ts'
import { MarkdownView } from './MarkdownView.tsx'
import type { ReportLink, ViewerTab } from './report-link.ts'
import { formatBytes, shortHash } from './report-view.ts'
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
  onEnlarge: () => void
  /** Esc and "Back to side panel": full → side → closed. */
  onStepDown: () => void
  onClose: () => void
  /** In the room: the chat in the report's place. */
  onChat?: (() => void) | undefined
}

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
  return { versions, version, text, sources, parsed }
}

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
  const { identity, link, tab, onTab, onVersion, onEnlarge, onStepDown, onClose, onChat } = props
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
        meta={metaLine(data.version, data.text.data)}
        full={full}
        canDownload={data.text.isSuccess}
        onDownload={() => void viewerDownload(data.version, data.text.data, status.show)}
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
      />
      <PaneBody
        tab={tab}
        data={data}
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
  data: ReturnType<typeof usePaneData>
  identity: Identity
  focusSource: string | null
  onCite: (sourceId: string) => void
  onVersion: (versionId: string) => void
}

function PaneBody({ tab, data, identity, focusSource, onCite, onVersion }: BodyProps) {
  return (
    <div className="report-pane-body" role="tabpanel" aria-label={TAB_NAME[tab]}>
      {tab === 'document' && <DocumentTab data={data} onCite={onCite} />}
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

/** The viewer's download: the bytes already loaded, checked against the version record before they are saved. */
async function viewerDownload(
  version: ArtifactVersion | undefined,
  text: LoadedText | undefined,
  show: (text: string, error?: boolean) => void,
): Promise<void> {
  if (!version || !text) return
  try {
    saveBlob(await checkedBlob(utf8(text.text), version.sourceHash, text.mime), text.filename)
    show(`Downloading ${text.filename} · ${formatBytes(text.byteLength)}`)
  } catch (err: unknown) {
    show(err instanceof HashMismatch ? err.message : 'The download didn’t start. Try again.', true)
  }
}

interface HeadProps {
  title: string
  titleRef: React.RefObject<HTMLHeadingElement | null>
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
  const { title, titleRef, meta, full, canDownload, onDownload, onEnlarge, onStepDown, onClose, onChat } = props
  const size = full ? 'Back to side panel' : 'Enlarge'
  return (
    <header className="report-pane-head">
      <span className="report-tile" data-format="markdown" aria-hidden>
        MD
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
}

const count = (n: number | undefined) => (n === undefined ? '' : ` ${n}`)

function PaneTabs({ tab, onTab, sources, versions }: TabsProps) {
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
    </div>
  )
}

function DocumentTab({ data, onCite }: { data: ReturnType<typeof usePaneData>; onCite: (sourceId: string) => void }) {
  if (data.versions.isError) return <p className="muted">This report isn’t available to you.</p>
  if (data.versions.isSuccess && !data.version) return <p className="muted">This version isn’t available.</p>
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
