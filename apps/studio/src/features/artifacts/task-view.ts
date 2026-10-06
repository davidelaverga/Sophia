// What the Tasks tab says of a report's tasks (docs/plans/room-passage-task.md): who each is for, in what order, and
// who may mark it done. Pure, so the units test it.
import { segmenter } from './cite-view.ts'
import type { Membership } from '@sophia/contracts'
import type { ProjectTask } from '../../api/vision.ts'
import type { RoomParticipant } from '../voice/room-view.ts'

/** Who a task is for: you, the member by the name the API gives, or anyone. */
export function ownerWords(task: ProjectTask, me: string): string {
  if (task.owner === null) return 'anyone'
  if (task.owner === me) return 'you'
  return task.ownerName ?? 'a member'
}

export const doneWords = (task: ProjectTask, me: string): string =>
  task.doneBy === me ? 'Done by you.' : 'Done by a member.'

const isOpen = (task: ProjectTask) => task.doneBy === null

/** The open ones first, then the done ones, each newest first as the API gives them. */
export const ordered = (tasks: readonly ProjectTask[]): ProjectTask[] => [
  ...tasks.filter(isOpen),
  ...tasks.filter((t) => !isOpen(t)),
]

export const openCount = (tasks: readonly ProjectTask[]): number => tasks.filter(isOpen).length

/** Done is whoever it is for (anyone's, any member's), or an editor's or an admin's; and only while it is open. */
export const mayFinish = (task: ProjectTask, me: string, role: Membership['role']): boolean =>
  isOpen(task) && (task.owner === null || task.owner === me || role === 'admin' || role === 'editor')

const MEMBERS: ReadonlySet<RoomParticipant['standing']> = new Set(['admin', 'editor', 'viewer'])

/** Whom a task may be for, of the people in the call: the members, once each; never this person, a guest or Sophia. */
export const taskPeople = (people: readonly RoomParticipant[]): { actorId: string; name: string }[] => [
  ...new Map(
    people
      .filter((p) => !p.local && MEMBERS.has(p.standing))
      .map((p) => [p.identity, { actorId: p.identity, name: p.name }]),
  ).values(),
]

/** The API's limit on a task's quote (A17). */
export const QUOTE_MAX = 800

/** The passage as selected, within the API's limit; a cut ends in "…", inside the limit. */
export function taskQuote(text: string, by: Intl.Segmenter | null = segmenter()): string {
  // Measured in UTF-16 units, the strictest count an API applies, and cut between characters as a reader sees them
  // (graphemes; code points where the browser has no segmenter), so a cut never splits one.
  if (text.length <= QUOTE_MAX) return text
  const parts = by ? Array.from(by.segment(text), (s) => s.segment) : Array.from(text)
  let kept = ''
  for (const part of parts) {
    if (kept.length + part.length > QUOTE_MAX - 1) break
    kept += part
  }
  return `${kept}…`
}
