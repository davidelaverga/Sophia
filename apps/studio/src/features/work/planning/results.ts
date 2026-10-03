// A task's results (WBC-01): the exact candidate versions its view lists, which is current, which earlier one is
// still usable while a newer attempt runs or failed, and which version its review speaks of. A review of one version
// says nothing of another: a check that passed for v1 never certifies v2. A result is reached through a port with its
// exact identity (source, version, hash); nothing here builds a link, and no candidate means no result to open.
import type { Candidate, ItemView } from './board-view.ts'

/** The exact version a result port reads: never a URL. */
export interface ResultRef {
  work_id: string
  source_id: string
  version_id: string
  sha256: string
  media_type: string
}

/** What a result port gives back for one version: its text and how to label where it came from; null if unavailable. */
export type ReadResult = (ref: ResultRef, purpose: 'read' | 'review') => Promise<{ text: string; label: string } | null>

export const refOf = (workId: string, c: Candidate): ResultRef => ({
  work_id: workId,
  source_id: c.source_id,
  version_id: c.version_id,
  sha256: c.sha256,
  media_type: c.media_type,
})

/**
 * The current version, and the newest earlier one still usable; a withdrawn version is neither. Two versions that both
 * claim to be current are ambiguous: neither is the result.
 */
export function resultsOf(view: ItemView | null): {
  current: Candidate | null
  earlier: Candidate | null
  ambiguous: boolean
} {
  const candidates = view?.candidates ?? []
  const current = candidates.filter((c) => c.state === 'current')
  const earlier = candidates
    .filter((c) => c.state === 'previous')
    .toSorted((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  return {
    current: current.length === 1 ? (current[0] ?? null) : null,
    earlier: earlier[0] ?? null,
    ambiguous: current.length > 1,
  }
}

/** Whether its review speaks of a version other than the current one: it then certifies nothing about this one. */
export function reviewIsOfAnother(view: ItemView): boolean {
  const reviewed = view.review.candidate_version_ref
  const { current } = resultsOf(view)
  return (
    view.review.state !== 'not_requested' && reviewed !== null && current !== null && reviewed !== current.version_id
  )
}

const REVIEW: Readonly<Record<ItemView['review']['state'], string | null>> = {
  not_requested: null,
  pending: 'Review pending',
  passed: 'Review passed',
  changes_required: 'Review found changes needed',
  inconclusive: 'Review inconclusive',
}

/** What its review says, and of which version: "Review passed for fixture-v1, not this version". */
export function reviewSaid(view: ItemView | null): string | null {
  const said = view ? REVIEW[view.review.state] : null
  if (!view || !said) return null
  return reviewIsOfAnother(view) ? `${said} for ${view.review.candidate_version_ref ?? ''}, not this version` : said
}

/** A version in a few words: its id, its type and the start of its hash. */
export const versionSaid = (c: Candidate) => `${c.version_id} · ${c.media_type} · ${c.sha256.slice(0, 8)}`
