// The fixtures' conversations as A16 serves them (CON-01): the list with its policy and the reader's capability, a
// summary with its coverage, a message with its order and its reply request. Only the fixture pages use this; what
// they keep is conversation-data.ts's. Every word is synthetic.
import type { ConversationList, ConversationMessage, ConversationSummary, ProjectionCoverage } from '@sophia/contracts'
import { PROJECT } from './data.ts'
import type { FixtureConversation, FixtureMessage } from './conversation-data.ts'

const NOT_ASSESSED: ProjectionCoverage = {
  state: 'not_assessed',
  complete: false,
  fromSeq: null,
  throughSeq: null,
  newer: 0,
  generatedAt: null,
  replyId: null,
  eligibilityRevision: null,
  ledgerRevision: null,
}

/** The seeded conversations were assessed through their newest message (fixture data, not a generation). */
const assessed = (messages: readonly FixtureMessage[], at: string): ProjectionCoverage =>
  messages.length === 0
    ? NOT_ASSESSED
    : {
        state: 'current',
        complete: true,
        fromSeq: 1,
        throughSeq: messages.length,
        newer: 0,
        generatedAt: at,
        replyId: null,
        eligibilityRevision: 1,
        ledgerRevision: 1,
      }

/** A message as A16 serves it: its order is its place in the conversation. */
export const wireMessage = (m: FixtureMessage, index: number): ConversationMessage => ({
  id: m.id,
  seq: index + 1,
  author: m.author,
  actorId: m.actorId,
  name: m.name,
  text: m.withdrawn ? null : m.text,
  at: m.at,
  withdrawn: m.withdrawn ?? null,
  ask: m.ask ?? null,
  replyTo: m.replyTo ?? null,
})

/** A conversation as A16 lists it; its newest message's opening only where the page asks for last messages. */
export function wireSummary(
  c: FixtureConversation,
  messages: readonly FixtureMessage[],
  lastShown: boolean,
): ConversationSummary {
  const last = messages.findLast((m) => !m.withdrawn && m.text !== null)
  return {
    ...c,
    revision: messages.length + 1,
    summaryCoverage: c.summary === null ? NOT_ASSESSED : assessed(messages, c.lastAt),
    questionsCoverage: c.summary === null && c.openQuestions === 0 ? NOT_ASSESSED : assessed(messages, c.lastAt),
    lastMessage:
      lastShown && last?.text
        ? {
            author: last.author,
            actorId: last.actorId,
            name: last.name,
            text: last.text.slice(0, 140),
            at: last.at,
            seq: messages.indexOf(last) + 1,
          }
        : null,
  }
}

/** The list as A16 serves it to a member (a viewer reads and writes nothing; an admin also removes and erases). */
export function wireList(
  list: readonly FixtureConversation[],
  messages: Readonly<Record<string, readonly FixtureMessage[]>>,
  opts: { lastShown: boolean; viewer: boolean; admin: boolean; more?: boolean },
): ConversationList {
  return {
    projectId: PROJECT,
    conversations: list.map((c) => wireSummary(c, messages[c.id] ?? [], opts.lastShown)),
    more: opts.more === true,
    policy: {
      id: 'conversation-text-v1',
      notice:
        'Messages here are saved for this project and can be read by its members. Live room audio is not saved here.',
      retention: 'until_withdrawn_or_erased',
      audience: 'project_members',
    },
    capability: { state: 'enabled', write: !opts.viewer, moderate: opts.admin, ask: 'available', askReason: null },
  }
}
