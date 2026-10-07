// A report's cover on its Knowledge tile (docs/plans/knowledge-library.md): the first screen of its designed page, or its
// Markdown's first lines as words. Read only once the tile nears the screen, through the viewer's own reads (the same
// query keys, so opening the report after reads nothing again), and checked against the version's hashes as the viewer
// checks them. The page is shown as the viewer shows it, in a frame with no permission at all (no scripts, no same
// origin, no forms, no popups), and as a picture: hidden from screen readers and out of the Tab order, since the press
// over it names it. Until it arrives the cover is a quiet plane; a read that fails or doesn't match leaves the monogram.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { ReportCard } from '@sophia/contracts'
import { listArtifactVersions } from '../../api/artifacts.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { HashMismatch, loadReportText } from './download.ts'
import { coverOf, monogramOf, type CoverLine } from './report-cover.ts'
import { renditionOf } from './report-view.ts'

const retryRead = (n: number, error: Error) => !(error instanceof HashMismatch) && n < 2

/** Whether the cover has come within a screen's reach: once it has, its read is kept. */
function useNear() {
  const ref = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return undefined
    const seen = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), {
      rootMargin: '240px',
    })
    seen.observe(el)
    return () => seen.disconnect()
  }, [near])
  return { ref, near }
}

type Cover =
  | { kind: 'waiting' }
  | { kind: 'page'; html: string }
  | { kind: 'lines'; heading: string | null; lines: CoverLine[] }
  | { kind: 'mark' }

/** The cover's reads: the versions (for the current one), then its designed page, or its Markdown when it has none. */
function useCover(card: ReportCard, identity: Identity, near: boolean): Cover {
  const versions = useQuery({
    queryKey: ['report-versions', card.artifactId, identity.name],
    queryFn: () => listArtifactVersions(identity.token, card.artifactId),
    enabled: near,
  })
  const version = versions.data?.find((v) => v.id === card.currentVersionId)
  const page = renditionOf(version, 'html')
  const html = useQuery({
    queryKey: ['report-html', page?.sourceId, identity.name],
    queryFn: () => loadReportText(identity.token, page?.sourceId ?? '', page?.sha256 ?? ''),
    enabled: page !== undefined,
    staleTime: Infinity,
    retry: retryRead,
  })
  const text = useQuery({
    queryKey: ['report-text', version?.sourceId, identity.name],
    queryFn: () => loadReportText(identity.token, version?.sourceId ?? '', version?.sourceHash ?? ''),
    enabled: version !== undefined && page === undefined,
    staleTime: Infinity,
    retry: retryRead,
  })
  if (html.data) return { kind: 'page', html: html.data.text }
  if (text.data) return { kind: 'lines', ...coverOf(text.data.text) }
  const settled = versions.isError || (versions.isSuccess && version === undefined) || html.isError || text.isError
  return settled ? { kind: 'mark' } : { kind: 'waiting' }
}

export function ReportCover({ card, identity }: { card: ReportCard; identity: Identity }) {
  const { ref, near } = useNear()
  const cover = useCover(card, identity, near)
  return (
    <div ref={ref} className="report-cover" data-cover={cover.kind}>
      {cover.kind === 'page' && (
        <iframe
          className="report-cover-frame"
          title={`${card.title}, first screen`}
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={cover.html}
          aria-hidden
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
