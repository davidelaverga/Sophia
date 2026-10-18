// Notes on a goal (docs/plans/goal-notes.md): the mission ledger's entries for one goal, newest first; the word a kind
// says; who wrote it; the latest said as who said what, given to each goal's row.
import type { Goal, MissionEntry } from '@sophia/contracts'
import { authorLabel } from '../conversation/conversation-view.ts'
import { ENTRY_KIND } from '../mission/mission-view.ts'

/** A goal's latest note, as its row says it. */
export interface Noted {
  note?: { kind: MissionEntry['kind']; said: string }
}

/** The kinds a note on a goal is written as: a plain note, a difficulty, what is expected. */
export const NOTE_KINDS = [
  { id: 'observation', label: 'Note' },
  { id: 'blocker', label: 'Difficulty' },
  { id: 'expectation', label: 'Expected' },
] as const satisfies readonly { id: MissionEntry['kind']; label: string }[]

export type NoteKind = (typeof NOTE_KINDS)[number]['id']

/** The goal's current notes, newest first. */
export const goalNotes = (entries: readonly MissionEntry[], goalId: string): MissionEntry[] =>
  entries
    .filter((e) => e.goalId === goalId && e.state === 'current')
    .toSorted((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))

/** The word a kind says beside its author; a plain note says none. */
export function noteWord(kind: MissionEntry['kind']): string | null {
  if (kind === 'observation') return null
  if (kind === 'blocker') return 'Difficulty'
  if (kind === 'expectation') return 'Expected'
  return ENTRY_KIND[kind]
}

/** Who wrote it: Sophia, the viewer («You»), a name the Studio knows, else «A member». */
export const noteAuthor = (entry: MissionEntry, me: string, names: ReadonlyMap<string, string>) =>
  entry.authoredBy === 'sophia' ? 'Sophia' : authorLabel(entry.actorId, me, names, entry.authorName ?? null)

/** The note as who said what: «Sophia “Legal lands Thursday.”». */
export const said = (entry: MissionEntry, me: string, names: ReadonlyMap<string, string>) =>
  `${noteAuthor(entry, me, names)} “${entry.text ?? ''}”`

/** Each goal's plan with its latest note; a goal with a note and no plan gets one of its own. */
export function withNotes<P extends object>(
  goals: readonly Goal[],
  plans: Readonly<Record<string, P>> | undefined,
  entries: readonly MissionEntry[],
  me: string,
  names: ReadonlyMap<string, string>,
): Record<string, P | (P & Noted) | Noted> {
  const out: Record<string, P | (P & Noted) | Noted> = { ...plans }
  for (const goal of goals) {
    const latest = goalNotes(entries, goal.id)[0]
    if (latest) out[goal.id] = { ...plans?.[goal.id], note: { kind: latest.kind, said: said(latest, me, names) } }
  }
  return out
}

/**
 * How the notes stand (notes-robust.md): read; being read for the first time; failed with nothing read; or failed on
 * a later read, the last list kept.
 */
export function notesRead(q: { data: unknown; isError: boolean }): 'read' | 'reading' | 'failed' | 'stale' {
  if (q.isError) return q.data === undefined ? 'failed' : 'stale'
  return q.data === undefined ? 'reading' : 'read'
}

type ReadState = ReturnType<typeof notesRead>

/**
 * Whether a goal's health can be said: every read it waits on (the notes, the dates) is in, or kept from before a later
 * failure (targets-robust.md; Codex P2 on #372).
 */
export const known = (...states: readonly ReadState[]): boolean => states.every((s) => s === 'read' || s === 'stale')

/** What the brief adds while the notes or the dates are still coming: the health may miss a difficulty or a date. */
export function readingWords(notes: ReadState, dates: ReadState): string {
  if (notes === 'reading') return dates === 'reading' ? ' · Reading the notes and dates…' : ' · Reading the notes…'
  return dates === 'reading' ? ' · Reading the dates…' : ''
}

/** After a note is kept, the field clears only what was sent: words typed since, or a kind chosen since, stay. */
export function keptAfter(
  now: { text: string; kind: NoteKind },
  sent: { text: string; kind: NoteKind },
): { text: string; kind: NoteKind } {
  return {
    text: now.text.trim() === sent.text ? '' : now.text,
    kind: now.kind === sent.kind ? 'observation' : now.kind,
  }
}
