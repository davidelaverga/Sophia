// The team's update, as a channel would receive it (docs/plans/project-connections.md, Davide's chapter 7): built
// from one closed meeting's recap, its lines as recorded, only those chosen, and no one's name. What is still open
// goes only when chosen: a milestone, not every discussion.
import type { MeetingRecap } from '../../api/vision.ts'

export interface UpdateLine {
  key: string
  text: string
  /** Chosen at first: what was decided and made; what is still open isn't. */
  chosen: boolean
}

type Recapped = Pick<MeetingRecap, 'decided' | 'made' | 'open'>

/** The recap's lines an update can carry, in the recap's order. */
export function updateLines(recap: Recapped): UpdateLine[] {
  return [
    ...recap.decided.map((d) => ({ key: d.decisionId, text: `Decided: ${d.statement}`, chosen: true })),
    ...recap.made.map((m) => ({
      key: m.artifactVersionId,
      text: `Made: ${m.title} · v${String(m.versionNumber)}`,
      chosen: true,
    })),
    ...recap.open.map((o) => ({ key: o.proposalId, text: `Still open: ${o.statement}`, chosen: false })),
  ]
}

/** The update's exact text: the project and the meeting's day, the chosen lines in order, and the way back. */
export function updateText(args: {
  title: string
  recap: Pick<MeetingRecap, 'startedAt'>
  lines: readonly UpdateLine[]
  chosen: ReadonlySet<string>
  link: string
  day: (iso: string) => string
}): string {
  const picked = args.lines.filter((l) => args.chosen.has(l.key)).map((l) => `• ${l.text}`)
  return [
    `${args.title} · Project update · ${args.day(args.recap.startedAt)}`,
    '',
    ...(picked.length > 0 ? picked : ['Nothing chosen yet.']),
    '',
    `Open in Sophia: ${args.link}`,
  ].join('\n')
}
