// Where a report's project source came from (docs/plans/knowledge-origins.md; A19, proposed): a conversation, a
// meeting, a decision or a file, in words; a conversation or a meeting is a press that goes there. Read under the
// vision flag only; without the read, or while it fails, a source says «From the project» as before.
import { useQuery } from '@tanstack/react-query'
import { listSourceOrigins, type SourceOrigin } from '../../api/vision.ts'
import type { Arrival } from '../studio/project-go.tsx'
import type { Identity } from '../../app/dev-identity.ts'
import { VISION } from '../../app/vision.ts'

export interface OriginWords {
  words: string
  /** A press that goes to it: a conversation or a meeting. */
  goes: boolean
}

/** "Oct 4", in the reader's time zone (or the one given). */
const dayOf = (iso: string, timeZone?: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', ...(timeZone ? { timeZone } : {}) }).format(
    new Date(iso),
  )

/** A source's origin, said: «From the conversation “…”», «From the meeting on Oct 4», «A file Lucía added · Sep 29». */
export function originWords(origin: SourceOrigin, timeZone?: string): OriginWords {
  if (origin.kind === 'conversation') {
    return { words: origin.title ? `From the conversation “${origin.title}”` : 'From a conversation', goes: true }
  }
  if (origin.kind === 'meeting') return { words: `From the meeting on ${dayOf(origin.at, timeZone)}`, goes: true }
  if (origin.kind === 'decision') {
    return { words: origin.title ? `From the decision “${origin.title}”` : 'From a decision', goes: false }
  }
  return { words: `A file ${origin.by ?? 'a member'} added · ${dayOf(origin.at, timeZone)}`, goes: false }
}

/** Where a conversation's or a meeting's origin goes: that one open in its view; nowhere for the others. */
export function arrivalOf(origin: SourceOrigin): Arrival | null {
  if (origin.kind === 'conversation') return { view: 'conversations', conversationId: origin.id }
  if (origin.kind === 'meeting') return { view: 'updates', meetingId: origin.id }
  return null
}

const NONE: ReadonlyMap<string, SourceOrigin> = new Map()

/** The origins of a version's sources, by source id: none without the flag, while unread, or when the read fails. */
export function useSourceOrigins(
  identity: Identity,
  artifactId: string | undefined,
  versionId: string | undefined,
): ReadonlyMap<string, SourceOrigin> {
  const read = useQuery({
    queryKey: ['vision', 'source-origins', versionId, identity.name],
    queryFn: ({ signal }) => listSourceOrigins(identity.token, artifactId ?? '', versionId ?? '', signal),
    enabled: VISION && artifactId !== undefined && versionId !== undefined,
    staleTime: Infinity,
    retry: false,
    select: (data) => new Map(data.origins.map((o) => [o.sourceId, o])),
  })
  return read.data ?? NONE
}
