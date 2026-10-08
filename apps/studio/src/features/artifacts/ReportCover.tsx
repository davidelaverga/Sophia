// A report's cover on its Knowledge tile (docs/plans/knowledge-library.md): the first screen of its designed page, or its
// Markdown's first lines as words. Read only once the tile nears the screen, through the viewer's own reads (the same
// query keys: opening the report after reads its versions again, never its page or its text), and checked against the
// version's hashes as the viewer checks them. The page is shown as the viewer shows it, in a frame with no permission
// at all (no scripts, no same origin, no forms, no popups), and as a picture: hidden from screen readers and inert, out
// of the Tab order with every link inside it, since the press over it names it. The frame is there only while the tile
// is within reach: one scrolled far away keeps its checked page in the cache, not a live document. Until it arrives the
// cover is a quiet plane; a read that fails or doesn't match leaves the monogram.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { ArtifactVersion, ReportCard } from '@sophia/contracts'
import { listArtifactVersions } from '../../api/artifacts.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { HashMismatch, loadReportText } from './download.ts'
import { coverOf, monogramOf, type CoverLine } from './report-cover.ts'
import { renditionOf } from './report-view.ts'

const retryRead = (n: number, error: Error) => !(error instanceof HashMismatch) && n < 2

/**
 * Whether the cover is within a screen's reach now (`inReach`), and whether it ever has been (`near`): once it has, its
 * read is kept.
 */
function useNear() {
  const ref = useRef<HTMLDivElement>(null)
  const [inReach, setInReach] = useState(false)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const seen = new IntersectionObserver(
      (entries) => {
        const now = entries.some((e) => e.isIntersecting)
        setInReach(now)
        if (now) setNear(true)
      },
      { rootMargin: '240px' },
    )
    seen.observe(el)
    return () => seen.disconnect()
  }, [])
  return { ref, near, inReach }
}

type Cover =
  | { kind: 'waiting' }
  | { kind: 'page'; html: string }
  | { kind: 'lines'; heading: string | null; lines: CoverLine[] }
  | { kind: 'mark' }

/**
 * The card's current version in the versions read. One the read doesn't hold (published since it was read) reads the
 * list again, once per version, before the cover gives up on it: as the viewer does (rereadFor).
 */
function useCurrent(card: ReportCard, identity: Identity, near: boolean) {
  const versions = useQuery({
    queryKey: ['report-versions', card.artifactId, identity.name],
    queryFn: () => listArtifactVersions(identity.token, card.artifactId),
    enabled: near,
    // A cover is read once: never again by itself (the window coming back, a reconnect), for every tile ever seen.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const id = card.currentVersionId
  const version: ArtifactVersion | undefined = versions.data?.find((v) => v.id === id)
  // Only within reach: versions already in the cache (the viewer's) never read again for a tile out of sight.
  const absent = near && versions.isSuccess && versions.fetchStatus === 'idle' && version === undefined
  const [reread, setReread] = useState<string | null>(null)
  const { refetch } = versions
  useEffect(() => {
    if (!absent || reread === id) return
    setReread(id)
    void refetch()
  }, [absent, reread, id, refetch])
  return { version, failed: versions.isError || (absent && reread === id) }
}

/** The cover's reads: the current version, then its designed page, or its Markdown when it has none. */
function useCover(card: ReportCard, identity: Identity, near: boolean): Cover {
  const { version, failed } = useCurrent(card, identity, near)
  const page = renditionOf(version, 'html')
  const html = useQuery({
    queryKey: ['report-html', page?.sourceId, identity.name],
    queryFn: () => loadReportText(identity.token, page?.sourceId ?? '', page?.sha256 ?? ''),
    // Behind the tile's reach too: versions already in the cache (the viewer's) never read an off-screen page.
    enabled: near && page !== undefined,
    staleTime: Infinity,
    retry: retryRead,
  })
  const text = useQuery({
    queryKey: ['report-text', version?.sourceId, identity.name],
    queryFn: () => loadReportText(identity.token, version?.sourceId ?? '', version?.sourceHash ?? ''),
    enabled: near && version !== undefined && page === undefined,
    staleTime: Infinity,
    retry: retryRead,
  })
  if (html.data) return { kind: 'page', html: html.data.text }
  if (text.data) return { kind: 'lines', ...coverOf(text.data.text) }
  return failed || html.isError || text.isError ? { kind: 'mark' } : { kind: 'waiting' }
}

export function ReportCover({ card, identity }: { card: ReportCard; identity: Identity }) {
  const { ref, near, inReach } = useNear()
  const cover = useCover(card, identity, near)
  return (
    <div ref={ref} className="report-cover" data-cover={cover.kind}>
      {cover.kind === 'page' && inReach && (
        <iframe
          className="report-cover-frame"
          title={`${card.title}, first screen`}
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={cover.html}
          aria-hidden
          inert
          tabIndex={-1}
        />
      )}
      {cover.kind === 'lines' && (
        <div className="report-cover-page" aria-hidden>
          {cover.heading && <p className="report-cover-heading">{cover.heading}</p>}
          {cover.lines.map((line, i) => (
            <p key={i} className={line.section ? 'report-cover-section' : undefined}>
              {line.words}
            </p>
          ))}
        </div>
      )}
      {cover.kind === 'mark' && (
        <span className="report-cover-mark" data-format={monogramOf(card.formats).toLowerCase()} aria-hidden>
          {monogramOf(card.formats)}
        </span>
      )}
    </div>
  )
}
