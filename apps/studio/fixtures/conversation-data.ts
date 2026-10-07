// The project's conversations as the proposed A18 reads would give them (docs/plans/project-conversations.md): three,
// newest activity first, the first with more messages than a page. Every word is synthetic.
import type { MissionDecision } from '@sophia/contracts'
import type { ConversationMessage, ConversationSummary } from '../src/api/vision.ts'
import { membership } from './data.ts'
import { personId } from './fake-people.ts'
import { REPORT, TITLE, versionId } from './report-data.ts'
import { DEMO, VIEWER_NAME } from './demo.ts'

const ME = membership.actorId
const MARCO = personId(1)
const LUCIA = personId(2)

export const CONVERSATION = {
  reading: '00000000-0000-4000-8000-0000000000c1',
  briefs: '00000000-0000-4000-8000-0000000000c2',
  data: '00000000-0000-4000-8000-0000000000c3',
  quiet: '00000000-0000-4000-8000-0000000000c4',
} as const

/** A page of messages: the newest six, and `before` for the page before them. */
export const MESSAGE_PAGE = 6

export const conversations = (): ConversationSummary[] => [
  {
    id: CONVERSATION.reading,
    title: 'What makes a report worth reading?',
    summary:
      'Compared a short brief with a longer report that cites every source. We want the first screen to answer the question before anyone scrolls.',
    lastAt: '2026-10-06T09:40:00.000Z',
    contributors: [
      { actorId: LUCIA, name: 'Lucía' },
      { actorId: ME, name: VIEWER_NAME },
    ],
    sophia: true,
    openQuestions: 1,
    // What it made, at the version the report opens on: the demo's second.
    output: { artifactId: REPORT, versionId: versionId(DEMO ? 2 : 1), versionNumber: DEMO ? 2 : 1, title: TITLE },
  },
  {
    id: CONVERSATION.briefs,
    title: 'Short or long briefs?',
    summary: 'Marco prefers one page; Lucía wants the sources inline. Nothing decided yet.',
    lastAt: '2026-10-05T16:10:00.000Z',
    contributors: [
      { actorId: MARCO, name: 'Marco' },
      { actorId: LUCIA, name: 'Lucía' },
    ],
    sophia: false,
    openQuestions: 0,
    output: null,
  },
  {
    id: CONVERSATION.data,
    title: DEMO ? 'Who owns setup when an admin changes?' : 'Test data for the first release',
    summary: null,
    lastAt: '2026-10-04T11:00:00.000Z',
    contributors: [{ actorId: ME, name: VIEWER_NAME }],
    sophia: true,
    openQuestions: 2,
    output: null,
  },
]

/** A conversation nobody has written in yet (`conversations=quiet`): oldest, with no messages. */
export const quietConversation = (): ConversationSummary => ({
  id: CONVERSATION.quiet,
  title: 'A quiet question',
  summary: null,
  lastAt: '2026-10-01T09:00:00.000Z',
  contributors: [],
  sophia: false,
  openQuestions: 0,
  output: null,
})

const member = (actorId: string, name: string) => ({ author: 'member' as const, actorId, name })
const sophia = { author: 'sophia' as const, actorId: null, name: null }
const at = (day: number, hh: number, mm: number) =>
  `2026-10-0${String(day)}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00.000Z`

/** Each conversation's messages, oldest first. */
export const messagesOf = (): Record<string, ConversationMessage[]> => ({
  [CONVERSATION.reading]: [
    {
      id: 'm1',
      ...member(LUCIA, 'Lucía'),
      text: 'Who reads the report first, and what do they need from it?',
      at: at(6, 9, 0),
    },
    {
      id: 'm2',
      ...sophia,
      text: 'Mostly the people deciding: they need the answer, then the evidence.',
      at: at(6, 9, 2),
    },
    {
      id: 'm3',
      ...member(ME, VIEWER_NAME),
      text: 'Then the first screen should say the answer.',
      at: at(6, 9, 5),
    },
    { id: 'm4', ...member(LUCIA, 'Lucía'), text: 'And every claim keeps its source, one click away.', at: at(6, 9, 9) },
    {
      id: 'm5',
      ...sophia,
      text: 'I can keep both versions apart so we compare them on the same question.',
      at: at(6, 9, 12),
    },
    { id: 'm6', ...member(ME, VIEWER_NAME), text: 'Please do. Short first.', at: at(6, 9, 20) },
    { id: 'm7', ...member(LUCIA, 'Lucía'), text: 'The short one still needs the March figures.', at: at(6, 9, 28) },
    {
      id: 'm8',
      ...sophia,
      text: 'Added them, cited. The open question is how long the evidence section may be.',
      at: at(6, 9, 35),
    },
    { id: 'm9', ...member(ME, VIEWER_NAME), text: 'Let’s look at it together tomorrow.', at: at(6, 9, 40) },
  ],
  [CONVERSATION.briefs]: [
    { id: 'b1', ...member(MARCO, 'Marco'), text: 'One page. Anything longer, nobody reads.', at: at(5, 15, 50) },
    { id: 'b2', ...member(LUCIA, 'Lucía'), text: 'One page, with the sources inline, then.', at: at(5, 16, 10) },
  ],
  [CONVERSATION.data]: [
    {
      id: 'd1',
      ...member(ME, VIEWER_NAME),
      text: DEMO
        ? 'Two teams left right after their admin changed. Who picks up setup then?'
        : 'Which records can we copy for the tests?',
      at: at(4, 10, 50),
    },
    {
      id: 'd2',
      ...sophia,
      text: DEMO
        ? 'The owner named at signup, handed on with the admin role. Two questions are open: who tells the new admin, and when.'
        : 'The synthetic ones only. Two questions are open: how many, and who checks them.',
      at: at(4, 11, 0),
    },
  ],
})

const decision = (n: number, statement: string, state: 'accepted' | 'proposed', day: number): MissionDecision => ({
  id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
  revision: 1,
  kind: 'constraint',
  state,
  statement,
  purpose: null,
  destination: null,
  origin: null,
  textKind: 'member_text',
  proposedBy: LUCIA,
  proposedVia: 'studio',
  createdAt: at(day, 8, 0),
  baseMissionRevision: 1,
  stale: false,
  supersedesDecisionId: null,
  supportingEntryIds: [],
  decidedBy: state === 'accepted' ? ME : null,
  decidedAt: state === 'accepted' ? at(day, 9, 0) : null,
  decidedVia: state === 'accepted' ? 'studio' : null,
  sourceId: '00000000-0000-4000-8000-0000000000ac',
  sha256: '0'.repeat(64),
})

/** The brief's context for the conversations: its purpose, five accepted decisions (oldest first), one still open. */
export const conversationMission = () => ({
  purpose: 'Reports the team can act on in one read.',
  constraints: [
    decision(1, DEMO ? 'Every new team names a setup owner' : 'Only synthetic data in tests', 'accepted', 1),
    decision(2, 'Every claim cites its source', 'accepted', 2),
    decision(3, 'No payments in the first release', 'accepted', 3),
    decision(4, 'Reports open on the answer', 'accepted', 4),
    decision(5, 'Keep the brief to one page', 'accepted', 5),
  ],
  pending: [decision(6, 'Map first, list second', 'proposed', 6)],
})
