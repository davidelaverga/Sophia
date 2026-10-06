// What a meeting left (docs/plans/room-recap.md): the recap's head, its sections with something in them, and the text
// «Copy recap» puts on the clipboard, all from the A12 recap's records. Pure, so the words are unit-tested.
import type { AfterUpdate, MeetingRecap } from '../../api/vision.ts'

/** A member named in a sentence: "you", their name, or "a member" when the room never knew them. */
export type NameOf = (actorId: string) => string

/**
 * How a recap or a digest names people: the names the room knew this visit, else the record's own (`names`), else
 * "a member". On screen the reader is "you"; in copied text, which others read, the reader goes by their name.
 */
export function namers(me: string, known: ReadonlyMap<string, string>, named: Readonly<Record<string, string>>) {
  const copied: NameOf = (id) => known.get(id) ?? named[id] ?? 'a member'
  const shown: NameOf = (id) => (id === me ? 'you' : copied(id))
  return { shown, copied }
}

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`

/** The head: how long it lasted, and who was there (guests only counted). */
export function recapHead(recap: Pick<MeetingRecap, 'minutes' | 'people' | 'guests'>): string {
  const length = recap.minutes < 1 ? 'Under a minute' : plural(recap.minutes, 'minute', 'minutes')
  const people = plural(recap.people.length, 'member', 'members')
  return recap.guests > 0
    ? `${length} · ${people} · ${plural(recap.guests, 'guest', 'guests')}`
    : `${length} · ${people}`
}

export interface RecapLine {
  key: string
  text: string
  /** Who and how, in a few words: "proposed by Marco, decided by you", "asked by you", "your note". */
  by: string
}

export interface RecapSection {
  title: 'Decided' | 'Made' | 'Kept' | 'Still open' | 'Work'
  lines: RecapLine[]
}

/** A kept note's words of who kept it: the member's own, or Sophia's paraphrase of what was said. */
const keptBy = (n: MeetingRecap['noted'][number], nameOf: NameOf) =>
  n.authoredBy === 'sophia' ? 'Sophia’s paraphrase' : `kept by ${nameOf(n.actorId)}`

/** What a recap or a digest lists (A12's items), the same builder for both. */
export type Records = Pick<MeetingRecap, 'decided' | 'made' | 'noted' | 'open' | 'work'>

/** The sections with something in them, in the order the sheet (or Updates) shows them. */
/** Work not finished yet: queued or running. */
export const ongoing = (state: string): boolean => state === 'pending' || state === 'running'

/** `closed`: the recap is the record at close, so work running then is said as such, never as done. */
export function recapSections(recap: Records, nameOf: NameOf, closed = false): RecapSection[] {
  const sections: RecapSection[] = [
    {
      title: 'Decided',
      lines: recap.decided.map((d) => ({
        key: d.decisionId,
        text: d.statement,
        by: `proposed by ${nameOf(d.proposedBy)}, decided by ${nameOf(d.decidedBy)}`,
      })),
    },
    {
      title: 'Made',
      lines: recap.made.map((m) => ({
        key: m.artifactVersionId,
        text: `${m.title} · v${String(m.versionNumber)}`,
        by: `asked by ${nameOf(m.askedBy)}`,
      })),
    },
    { title: 'Kept', lines: recap.noted.map((n) => ({ key: n.entryId, text: n.text, by: keptBy(n, nameOf) })) },
    { title: 'Still open', lines: recap.open.map((o) => ({ key: o.proposalId, text: o.statement, by: 'proposed' })) },
    {
      title: 'Work',
      lines: recap.work.map((w) => ({
        key: w.taskId,
        text: w.kind.replaceAll('_', ' '),
        by: closed && ongoing(w.state) ? 'still running at close' : w.state.replaceAll('_', ' '),
      })),
    },
  ]
  return sections.filter((s) => s.lines.length > 0)
}

/** The recap as plain text, for «Copy recap»: its head, then each section's lines. */
export function recapText(title: string, recap: MeetingRecap, nameOf: NameOf): string {
  const sections = recapSections(recap, nameOf, recap.endedAt !== null)
  const body =
    sections.length === 0
      ? ['Nothing was decided, made or kept in this meeting.']
      : sections.flatMap((s) => ['', s.title, ...s.lines.map((l) => `- ${l.text} (${l.by})`)])
  return [title, recapHead(recap), ...body].join('\n')
}

/** A later outcome, in words: what its work made, and the version. */
export function afterLine(update: AfterUpdate): string {
  const version = update.versionNumber === null ? '' : ` · v${String(update.versionNumber)}`
  if (update.title === null) return update.kind === 'work_finished' ? 'Work finished' : `A new version${version}`
  return update.kind === 'work_finished' ? `${update.title} ready${version}` : `${update.title}${version}`
}
