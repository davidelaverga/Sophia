// Explicit mentions in the room's chat (docs/plans/mentions.md, A37; the mentions flag's): who may be named and how a
// message says whom it names. Pure, so the rules and their words are unit-tested; MentionPicker.tsx draws them.
import type { ProjectMember } from '@sophia/contracts'

/** At most this many members on one message (A37). */
export const MOST_MENTIONS = 5

/** Whether this member can name others on a message: an editor or an admin (A37); a viewer can be named. */
export const canMention = (role: ProjectMember['role'] | undefined) => role === 'editor' || role === 'admin'

/** A member as the chat names them: their current display name, never an address; «A member» without one. */
export const labelOf = (member: Pick<ProjectMember, 'name'> | undefined) => member?.name ?? 'A member'

/** Who can be named: every other current member, in the members read's order. */
export const nameable = (members: readonly ProjectMember[], me: string) => members.filter((m) => m.actorId !== me)

/** The chosen recipients after a press on `id`: added (up to five) or taken off. */
export function toggled(chosen: readonly string[], id: string): string[] {
  if (chosen.includes(id)) return chosen.filter((c) => c !== id)
  return chosen.length >= MOST_MENTIONS ? [...chosen] : [...chosen, id]
}

/** The line under a message that names members: «to you, Marco and a member who left». */
export function mentionWords(ids: readonly string[], me: string, members: ReadonlyMap<string, ProjectMember>): string {
  const names = ids.map((id) => (id === me ? 'you' : members.has(id) ? labelOf(members.get(id)) : 'a former member'))
  if (names.length <= 1) return `to ${names[0] ?? ''}`
  return `to ${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`
}

/**
 * Whether a message is shown enough to count as seen (A37): at least 60% of it in the chat's view, or, for one taller
 * than the chat, at least 60% of the chat's height filled by it. A sliver at the edge is not reading it.
 */
export function readable(visible: number, height: number, view: number): boolean {
  if (visible <= 0 || height <= 0) return false
  return visible >= 0.6 * Math.min(height, view > 0 ? view : height)
}

/** A waiting mention as the Needs read lists it: its exact need id, and the message revision it is for. */
export interface Waiting {
  need: string
  revision: number
}

/**
 * The revision a mention need is for, from its ref's `within` (`<revision>.<occurrence>`, A37); null when it is not
 * that form, so nothing is attached (fail closed).
 */
export function waitingRevision(within: string | null): number | null {
  const m = /^([1-9][0-9]{0,15})\.[1-9][0-9]{0,15}$/.exec(within ?? '')
  return m?.[1] ? Number(m[1]) : null
}

/**
 * The need a shown message carries, only when the message shown is the revision the need is for (V on #409): a newer
 * revision's need never rides on older words still shown, and an older one's never on newer words.
 */
export function needFor(waiting: Waiting | undefined, shownRevision: number | undefined): string | undefined {
  return waiting && shownRevision !== undefined && waiting.revision === shownRevision ? waiting.need : undefined
}

/** What became of a message the address named (a mention from Home), said in the chat when it can't be shown. */
export type AddressState = 'none' | 'looking' | 'found' | 'gone' | 'further'

/** The page that ends at a message a search found couldn't be read (A38): the reader tries again. */
export const JUMP_FAILED = 'The message you opened couldn’t be loaded.'

export const ADDRESS_WORDS: Readonly<Partial<Record<AddressState, string>>> = {
  gone: 'The message you opened isn’t in the chat anymore.',
  further: 'The message you opened is further back. Earlier messages shows more.',
}

/** At most this many earlier pages are read to find a message the address names (50 each). */
export const ADDRESS_PAGES = 4

/**
 * The next step in looking for a message the address names: found (bring it into view), gone (withdrawn, or not there
 * by the chat's start), further (not within ADDRESS_PAGES earlier pages), read an earlier page, or wait for one being read.
 * A message a search found (A38) is not looked for page by page: the one page that ends at it is read (jump), and if
 * it isn't there, it is gone.
 */
export function nextLook(at: {
  found: boolean
  withdrawn: boolean
  reading: boolean
  /** The last earlier page's read failed: the look waits for the reader's own Try again (V on #409). */
  failed: boolean
  offered: boolean
  atStart: boolean
  pages: number
  /** A search found it (its next message known): the page that ends at it is still to read, or has been. */
  jump?: 'none' | 'unread' | 'read'
}): 'found' | 'gone' | 'further' | 'load' | 'wait' | 'jump' {
  if (at.found) return 'found'
  if (at.withdrawn) return 'gone'
  if (at.reading || at.failed) return 'wait'
  if (at.jump === 'unread') return 'jump'
  if (at.jump === 'read') return 'gone'
  if (at.offered && at.pages < ADDRESS_PAGES) return 'load'
  return at.atStart || !at.offered ? 'gone' : 'further'
}
