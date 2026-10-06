// What a meeting left (docs/plans/room-recap.md): the recap's head, its sections with something in them, and the text
// «Copy recap» puts on the clipboard, all from the A12 recap's records. Pure, so the words are unit-tested.
import type { MeetingRecap } from '../../api/vision.ts'

/** A member named in a sentence: "you", their name, or "a member" when the room never knew them. */
export type NameOf = (actorId: string) => string

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

/** The recap's sections with something in them, in the order the sheet shows them. */
export function recapSections(recap: MeetingRecap, nameOf: NameOf): RecapSection[] {
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
        by: w.state.replaceAll('_', ' '),
      })),
    },
  ]
  return sections.filter((s) => s.lines.length > 0)
}

/** The recap as plain text, for «Copy recap»: its head, then each section's lines. */
export function recapText(title: string, recap: MeetingRecap, nameOf: NameOf): string {
  const sections = recapSections(recap, nameOf)
  const body =
    sections.length === 0
      ? ['Nothing was decided, made or kept in this meeting.']
      : sections.flatMap((s) => ['', s.title, ...s.lines.map((l) => `- ${l.text} (${l.by})`)])
  return [title, recapHead(recap), ...body].join('\n')
}
