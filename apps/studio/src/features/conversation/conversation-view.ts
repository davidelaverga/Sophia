// What the conversation shows, derived from the snapshot's discussion and native tasks. Pure, so the rules are
// unit-tested; React only renders the result. A task's words say what is observed, never more: admitted is not
// running, and a drafted brief is a candidate, not an accepted plan.
import type { DiscussionEntry, NativeTask } from '@sophia/contracts'
import type { Tone } from '@sophia/ui'

export const MAX_BRIEF_INPUTS = 8

export const TASK_PHASE: Record<NativeTask['phase'], { label: string; tone: Tone; note: string }> = {
  queued: { label: 'Admitted', tone: 'lav', note: 'Waiting for Sophia’s runtime to pick it up.' },
  dispatched: { label: 'Sent', tone: 'lav', note: 'Sent to the runtime; not confirmed running yet.' },
  running: { label: 'Drafting', tone: 'teal', note: 'The runtime is drafting. You can keep talking.' },
  result_ready: { label: 'Brief ready', tone: 'teal', note: 'A candidate brief for the team to review.' },
  holding: { label: 'Holding', tone: 'amber', note: 'Pausing; waiting for the runtime to confirm.' },
  held: { label: 'Held', tone: 'amber', note: 'Paused. Resume to continue.' },
  stopping: { label: 'Stopping', tone: 'rose', note: 'Stopping; waiting for the runtime to confirm.' },
  stopped: { label: 'Stopped', tone: 'muted', note: 'Stopped for good. Nothing it produces afterwards is published.' },
  denied: { label: 'Not started', tone: 'rose', note: 'It could no longer run when it was dispatched.' },
  failed: { label: 'Failed', tone: 'rose', note: 'The runtime could not finish it.' },
  outcome_unknown: {
    label: 'Unconfirmed',
    tone: 'amber',
    note: 'Sophia couldn’t confirm what happened. Nothing is repeated.',
  },
}

/** Who said it: "You", a name the room knows, or a neutral word (the snapshot carries actor ids only). */
export function authorLabel(actorId: string, me: string, names: ReadonlyMap<string, string>): string {
  if (actorId === me) return 'You'
  return names.get(actorId) ?? 'A member'
}

/** Toggle one contribution in the brief's inputs, keeping the order chosen and the cap. */
export function toggleInput(selected: readonly string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((s) => s !== id)
  return selected.length >= MAX_BRIEF_INPUTS ? [...selected] : [...selected, id]
}

/** Inputs that are still in the discussion (an entry scrolled out of the snapshot is dropped). */
export function liveInputs(selected: readonly string[], discussion: readonly DiscussionEntry[]): string[] {
  const present = new Set(discussion.map((d) => d.id))
  return selected.filter((id) => present.has(id))
}

export type BriefBlock =
  { kind: 'heading'; text: string } | { kind: 'item'; text: string } | { kind: 'paragraph'; text: string }

/** A drafted brief as blocks: `##` headings, `-`/`*` items, and paragraphs. Nothing is rendered as HTML. */
export function briefBlocks(markdown: string): BriefBlock[] {
  const blocks: BriefBlock[] = []
  for (const raw of markdown.split('\n')) {
    const line = raw.trim()
    if (line === '') continue
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    const item = /^[-*]\s+(.*)$/.exec(line)
    if (heading?.[1]) blocks.push({ kind: 'heading', text: heading[1] })
    else if (item?.[1]) blocks.push({ kind: 'item', text: item[1] })
    else blocks.push({ kind: 'paragraph', text: line })
  }
  return blocks
}

/** The task a person most needs to see: the newest one still in motion, else the newest. */
export function currentTask(work: readonly NativeTask[]): NativeTask | null {
  const moving = work.filter((t) => ['queued', 'dispatched', 'running', 'holding', 'stopping'].includes(t.phase))
  return moving.at(-1) ?? work.at(-1) ?? null
}
