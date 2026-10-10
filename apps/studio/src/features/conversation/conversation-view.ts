// What the conversation shows, derived from the snapshot's discussion and native tasks. Pure, so the rules are
// unit-tested; React only renders the result. A task's words say what is observed, never more: queued is not
// running, and a drafted brief is a candidate, not an accepted plan. They say what Sophia does, never what runs her
// (docs/plans/copy-no-jargon.md). New briefs are retired (SMC-M01); the briefs that
// exist keep their phases, their text and their controls.
import type { NativeTask } from '@sophia/contracts'
import type { Tone } from '@sophia/ui'

export const TASK_PHASE: Record<NativeTask['phase'], { label: string; tone: Tone; note: string }> = {
  queued: { label: 'Queued', tone: 'lav', note: 'Waiting for Sophia to start it.' },
  dispatched: { label: 'Sent', tone: 'lav', note: 'Sent to Sophia; not confirmed started yet.' },
  running: { label: 'Drafting', tone: 'teal', note: 'Sophia is drafting. You can keep talking.' },
  result_ready: { label: 'Brief ready', tone: 'teal', note: 'A candidate brief for the team to review.' },
  holding: { label: 'Holding', tone: 'amber', note: 'Pausing; waiting for Sophia to confirm.' },
  held: { label: 'Held', tone: 'amber', note: 'Paused. Resume to continue.' },
  stopping: { label: 'Stopping', tone: 'rose', note: 'Stopping; waiting for Sophia to confirm.' },
  stopped: { label: 'Stopped', tone: 'muted', note: 'Stopped for good. Nothing it produces afterwards is published.' },
  denied: { label: 'Not started', tone: 'rose', note: 'It could no longer run when it was dispatched.' },
  failed: { label: 'Failed', tone: 'rose', note: 'Sophia could not finish it.' },
  outcome_unknown: {
    label: 'Unconfirmed',
    tone: 'amber',
    note: 'Sophia couldn’t confirm what happened. Nothing is repeated.',
  },
}

type PhaseWords = (typeof TASK_PHASE)[NativeTask['phase']]

/** What each kind of task is called (A11). */
export const TASK_KIND: Record<NativeTask['kind'], string> = {
  draft_brief: 'Implementation brief',
  research: 'Research report',
  design: 'HTML page design',
}

/** Where research reads differently from a brief; every other phase says the same for both. */
const RESEARCH_PHASE: Partial<Record<NativeTask['phase'], Pick<PhaseWords, 'label' | 'note'>>> = {
  running: { label: 'Researching', note: 'Sophia is researching. You can keep talking.' },
  result_ready: { label: 'Report ready', note: 'A report for the team to read.' },
}

/** Where an HTML design (SDD-01) reads differently: it designs, then its page is ready. */
const DESIGN_PHASE: Partial<Record<NativeTask['phase'], Pick<PhaseWords, 'label' | 'note'>>> = {
  running: { label: 'Designing', note: 'Sophia is designing the HTML page from the published report.' },
  result_ready: { label: 'HTML page ready', note: 'The designed HTML page is published with the report.' },
}

/** A task's phase in the words of its kind. */
export function taskPhase(task: Pick<NativeTask, 'kind' | 'phase'>): PhaseWords {
  const base = TASK_PHASE[task.phase]
  if (task.kind === 'research') return { ...base, ...RESEARCH_PHASE[task.phase] }
  return task.kind === 'design' ? { ...base, ...DESIGN_PHASE[task.phase] } : base
}

/** The heading over Sophia's tasks: briefs, research, or both. */
export function workHeading(work: readonly Pick<NativeTask, 'kind'>[]): string {
  const kinds = new Set(work.map((t) => t.kind))
  if (kinds.size === 1 && kinds.has('draft_brief')) return 'Briefs from Sophia'
  if (kinds.size === 1 && kinds.has('research')) return 'Research from Sophia'
  return 'Work from Sophia'
}

/** Who said it: "You", a name the room knows, or a neutral word (the snapshot carries actor ids only). */
export function authorLabel(actorId: string, me: string, names: ReadonlyMap<string, string>): string {
  if (actorId === me) return 'You'
  return names.get(actorId) ?? 'A member'
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

/** Hide the machine citation section, preserving authored sentences when removing inline citation markers. */
export function visibleBriefBlocks(markdown: string): BriefBlock[] {
  let citations = false
  const visible: BriefBlock[] = []
  for (const block of briefBlocks(markdown)) {
    if (block.kind === 'heading') citations = /^Cited inputs$/i.test(block.text)
    if (
      citations ||
      /^Source [0-9a-f]{8,64}$/i.test(block.text) ||
      /^Drafted by (?:Open ?AI|Anthropic|Google)\.?$/i.test(block.text)
    )
      continue
    const text = block.text.replace(/\s*\[input:[^\]]+\]/g, '').trim()
    if (text) visible.push({ ...block, text })
  }
  return visible
}

/** The task a person most needs to see: the newest one still in motion, else the newest. */
export function currentTask(work: readonly NativeTask[]): NativeTask | null {
  const moving = work.filter((t) => ['queued', 'dispatched', 'running', 'holding', 'stopping'].includes(t.phase))
  return moving.at(-1) ?? work.at(-1) ?? null
}
