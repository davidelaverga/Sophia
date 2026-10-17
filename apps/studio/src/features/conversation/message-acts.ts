// What a member may do with their own message in the room's chat, and the words for it (docs/plans/message-acts.md,
// A36). Pure, so the rules and their words are unit-tested; MessageActions.tsx draws them.
import type { ContributionActPreview, DiscussionEntry, WithdrawnEntry } from '@sophia/contracts'
import type { Acted } from './MessageActions.tsx'

export type MessageAct = ContributionActPreview['action']

/**
 * The acts a message offers its reader: none on someone else's; on their own, a written one is corrected or withdrawn
 * and one that shares a report or file only withdrawn. A message read without its kind (no revisions=1) offers none.
 */
export function actsOf(entry: DiscussionEntry, me: string): readonly MessageAct[] {
  if (entry.actorId !== me) return []
  if (entry.kind === 'text') return ['correct', 'withdraw']
  return entry.kind === 'reference' ? ['withdraw'] : []
}

/** Messages and the places of withdrawn ones, oldest first, as the API orders them: by time, then by id. */
export type DiscussionItem =
  | { type: 'entry'; id: string; createdAt: string; entry: DiscussionEntry }
  | { type: 'withdrawn'; id: string; createdAt: string; withdrawn: WithdrawnEntry }

export function discussionItems(
  entries: readonly DiscussionEntry[],
  withdrawn: readonly WithdrawnEntry[],
): DiscussionItem[] {
  const gone = new Set(withdrawn.map((w) => w.id))
  // The entries keep the order they were read in (the API's); each withdrawn place goes before the first entry after it.
  const items = entries
    .filter((e) => !gone.has(e.id))
    .map((entry): DiscussionItem => ({ type: 'entry', id: entry.id, createdAt: entry.createdAt, entry }))
  for (const w of withdrawn.toSorted(inOrder)) {
    const at = items.findIndex((item) => inOrder(item, w) > 0)
    const place: DiscussionItem = { type: 'withdrawn', id: w.id, createdAt: w.createdAt, withdrawn: w }
    items.splice(at < 0 ? items.length : at, 0, place)
  }
  return items
}

const count = (n: number, one: string, many: string) => `${n === 1 ? 'One' : String(n)} ${n === 1 ? one : many}`

/**
 * What the act will do, in plain words, for the member about to confirm it: their words erased or the shared source
 * kept, the work that read the words stopped (and started again without them), and that words already sent to an AI
 * provider can't be called back.
 */
export function effectWords(preview: ContributionActPreview): string[] {
  const words: string[] = []
  if (!preview.erases) words.push('The message leaves the chat. The report or file it shared stays as it is.')
  else if (preview.action === 'correct')
    words.push('Your earlier words are erased. The message keeps its place and shows as edited.')
  else words.push('Your words are erased. The chat shows that you withdrew a message.')
  const research = preview.reach.filter((r) => r.kind === 'research')
  const again = research.filter((r) => r.restarts).length
  const stops = research.length - again
  const designs = preview.reach.filter((r) => r.kind === 'design').length
  if (again > 0)
    words.push(
      `${count(again, 'research task', 'research tasks')} that read them will stop and start again without them.`,
    )
  if (stops > 0) words.push(`${count(stops, 'research task', 'research tasks')} that read them will stop.`)
  if (designs > 0) words.push(`${count(designs, 'page design', 'page designs')} that read them will stop.`)
  if (preview.erases) words.push('Words already sent to an AI provider can’t be called back.')
  return words
}

/** Whether the member decides before the act goes: always to withdraw; to correct, only when work read the words. */
export const asksFirst = (preview: ContributionActPreview) => preview.action === 'withdraw' || preview.reach.length > 0

/** Why an act didn't go, in plain words, and whether the chat should be read again before another try. */
export function failureOf(code: string): { words: string; reread: boolean; sameKey: boolean } {
  if (code === 'outcome_unknown')
    return { words: 'No reply from Sophia. Try again: it won’t be done twice.', reread: false, sameKey: true }
  if (code === 'stale_revision' || code === 'request_erased')
    return { words: 'This message changed since you opened it. Check it and try again.', reread: true, sameKey: false }
  if (code === 'forbidden') return { words: 'You can only change your own messages.', reread: true, sameKey: false }
  if (code === 'invalid_request')
    return { words: 'That change can’t be made to this message.', reread: true, sameKey: false }
  return { words: 'The change didn’t go through. Try again.', reread: false, sameKey: false }
}

interface Placed {
  id: string
  createdAt: string
}

/** Oldest first, as the API orders them: by time, then by id. */
export const inOrder = (a: Placed, b: Placed) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)

interface Discussion {
  entries: readonly DiscussionEntry[]
  withdrawn: readonly WithdrawnEntry[]
}

/** What earlier reads held, with the window over its own span: what it no longer lists there was withdrawn. */
function windowed(held: Discussion | null, window: Discussion) {
  const entries = new Map((held?.entries ?? []).map((e) => [e.id, e]))
  const withdrawn = new Map((held?.withdrawn ?? []).map((w) => [w.id, w]))
  const [start] = [...window.entries, ...window.withdrawn].toSorted(inOrder)
  if (start) for (const [id, entry] of entries) if (inOrder(entry, start) >= 0) entries.delete(id)
  for (const entry of window.entries) entries.set(entry.id, entry)
  for (const w of window.withdrawn) withdrawn.set(w.id, w)
  return { entries, withdrawn }
}

/**
 * What the chat shows (A36): what was held from earlier reads, the window over its own span, and the reader's own acts
 * until a read brings them (a correction only over an older revision). A withdrawn message is a place, never its words.
 */
export function heldView(
  held: { entries: ReadonlyMap<string, DiscussionEntry>; withdrawn: ReadonlyMap<string, WithdrawnEntry> } | null,
  window: Discussion,
  acted: ReadonlyMap<string, Acted>,
): Discussion {
  const { entries, withdrawn } = windowed(
    held && { entries: [...held.entries.values()], withdrawn: [...held.withdrawn.values()] },
    window,
  )
  for (const a of acted.values()) {
    if (a.type === 'withdrawn') withdrawn.set(a.withdrawn.id, a.withdrawn)
    const now = a.type === 'corrected' ? entries.get(a.entry.id) : undefined
    if (a.type === 'corrected' && now && (now.revision ?? 0) < (a.entry.revision ?? 0)) entries.set(a.entry.id, a.entry)
  }
  for (const id of withdrawn.keys()) entries.delete(id)
  // Without earlier reads, the window's own order (the API's); with them, merged by time, then id.
  const merged = [...entries.values()]
  return { entries: held ? merged.toSorted(inOrder) : merged, withdrawn: [...withdrawn.values()].toSorted(inOrder) }
}

/** When the discussion's last line was said, a withdrawn message's place included (Codex on #396): «Today» goes after it. */
export const lastSaidAt = (entries: readonly Placed[], withdrawn: readonly Placed[]): string | undefined =>
  [...entries, ...withdrawn].toSorted(inOrder).at(-1)?.createdAt
