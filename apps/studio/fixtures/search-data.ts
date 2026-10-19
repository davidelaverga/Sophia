// A project search, answered as A13 proposes (issue #105): the decisions of every meeting, the notes kept, the report's
// title and its sections, and the meetings' recaps, matched against the query ignoring case, three hits a page. Every
// snippet is the record's own words. Every word is synthetic.
import type { SearchHit as ServedHit } from '@sophia/contracts'
import type { SearchHit } from '../src/api/vision.ts'
import { anchorOf } from '../src/features/artifacts/markdown.ts'
import { allRecaps, type Meeting } from './meeting-data.ts'
import { DEMO } from './demo.ts'
import { content, REPORT, versions } from './report-data.ts'

export const SEARCH_PAGE = 3

interface Searched {
  meeting: Meeting
  /** The room's messages as the chat lists them, oldest first (A38 finds them; `before` is the next one's id). */
  messages?: readonly { id: string; text: string; createdAt: string }[]
  kept: readonly { id: string; text: string | null; recordedAt: string }[]
  report: { versions: number; title: string; pilot: boolean | undefined }
}

const has = (text: string, q: string) => text.toLowerCase().includes(q.toLowerCase())

/** A report's words as a snippet says them (the demo's): no citation ids, no emphasis or list marks. */
const words = (text: string) =>
  DEMO
    ? text
        .replace(/\s?\[[0-9a-f-]{36}\]/g, '')
        .replace(/\*\*/g, '')
        .replace(/(^|\s)- /g, '$1')
    : text

/**
 * The report's sections, `## ` headings with the paragraph under each, in its current version; a repeated heading's
 * anchor names its occurrence (`#1`, the second), as the viewer finds it.
 */
function sectionsOf(markdown: string): { heading: string; body: string; anchor: string }[] {
  const seen = new Map<string, number>()
  return markdown
    .split('\n## ')
    .slice(1)
    .map((part) => {
      const [heading = '', ...rest] = part.split('\n')
      const anchor = anchorOf(heading)
      const n = seen.get(anchor) ?? 0
      seen.set(anchor, n + 1)
      return { heading, body: rest.join(' ').trim(), anchor: n > 0 ? `${anchor}#${String(n)}` : anchor }
    })
}

function reportHits(s: Searched, q: string): SearchHit[] {
  const current = versions(s.report.versions, s.report.title, s.report.pilot)[0]
  if (!current) return []
  const text = content(current.sourceId)?.text ?? ''
  const at = current.createdAt ?? '2026-10-05T09:00:00.000Z'
  const cite = { recordId: current.id }
  const report: SearchHit[] = has(s.report.title, q)
    ? [
        {
          kind: 'report',
          id: REPORT,
          title: s.report.title,
          snippet: words(text.split('\n\n')[1] ?? ''),
          meetingId: null,
          at,
          cite,
        },
      ]
    : []
  const sections = sectionsOf(text)
    .filter((x) => has(x.heading, q) || has(x.body, q))
    .map((x): SearchHit => ({
      kind: 'report_section',
      id: REPORT,
      title: x.heading,
      snippet: words(x.body),
      meetingId: null,
      at,
      cite: { ...cite, anchor: x.anchor },
    }))
  return [...report, ...sections]
}

/** Every hit for `q`, decisions first, then notes, reports and their sections, and the meetings' recaps. */
export function searchHits(s: Searched, q: string): SearchHit[] {
  const recaps = allRecaps(s.meeting)
  const decisions = recaps.flatMap((r) =>
    r.decided
      .filter((d) => has(d.statement, q))
      .map((d): SearchHit => ({
        kind: 'decision',
        id: d.decisionId,
        title: d.statement,
        snippet: d.statement,
        meetingId: r.meetingId,
        at: d.at,
        cite: { recordId: d.decisionId },
      })),
  )
  const notes = s.kept
    .filter((n) => has(n.text ?? '', q))
    .map((n): SearchHit => {
      const text = n.text ?? ''
      return {
        kind: 'note',
        id: n.id,
        title: text,
        snippet: text,
        meetingId: null,
        at: n.recordedAt,
        cite: { recordId: n.id },
      }
    })
  const meetings = recaps
    .map((r) => ({
      r,
      line: [...r.decided.map((d) => d.statement), ...r.open.map((o) => o.statement)].find((t) => has(t, q)),
    }))
    .filter((x) => x.line !== undefined)
    .map(({ r, line }): SearchHit => ({
      kind: 'recap',
      id: r.meetingId,
      title: 'Meeting recap',
      snippet: line ?? '',
      meetingId: r.meetingId,
      at: r.startedAt,
      cite: { recordId: r.meetingId },
    }))
  return [...decisions, ...notes, ...reportHits(s, q), ...messageHits(s, q), ...meetings]
}

/** The room's messages that say `q`, newest first, each with the message after it (A38's `before`). */
function messageHits(s: Searched, q: string): SearchHit[] {
  const all = s.messages ?? []
  return all
    .map((m, i) => ({ m, next: all[i + 1]?.id ?? null }))
    .filter(({ m }) => has(m.text, q))
    .toReversed()
    .map(({ m, next }): SearchHit => ({
      kind: 'message',
      id: m.id,
      title: 'Marco',
      snippet: m.text,
      meetingId: null,
      at: m.createdAt,
      cite: { recordId: m.id },
      before: next,
    }))
}

/**
 * The hits as A38 serves them (the served page, VITE_SOPHIA_SEARCH without the vision flag): no recap, no meeting, each
 * with its source's hash; only a message has `before`.
 */
export function servedHits(all: readonly SearchHit[]): ServedHit[] {
  return all.flatMap(({ meetingId: _meeting, before, ...h }): ServedHit[] =>
    h.kind === 'recap'
      ? []
      : [
          {
            ...h,
            kind: h.kind,
            cite: { ...h.cite, sha256: h.cite.sha256 ?? '0'.repeat(64) },
            ...(h.kind === 'message' ? { before: before ?? null } : {}),
          },
        ],
  )
}

/** One page of the hits, from the cursor (an offset, for the fixture). */
export function searchPage<T>(all: readonly T[], cursor: string | null): { hits: T[]; next: string | null } {
  const from = Number(cursor ?? '0')
  const to = from + SEARCH_PAGE
  return { hits: all.slice(from, to), next: to < all.length ? String(to) : null }
}
