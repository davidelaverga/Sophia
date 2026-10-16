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
