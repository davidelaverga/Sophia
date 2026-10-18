// The fixtures' conversations as A33 serves them (CON-01): the list with its policy and the reader's capability, a
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

/** A message as A33 serves it: its order is its place in the conversation. */
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

/** `?order=none`: rows as an API before CC-0023 lists them, with neither `messageSeq` nor `lastMessage.seq`. */
const ORDERLESS = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('order') === 'none'

/** A conversation as A33 lists it; its newest message's opening only where the page asks for last messages. */
export function wireSummary(
  c: FixtureConversation,
  messages: readonly FixtureMessage[],
  lastShown: boolean,
): ConversationSummary {
  const last = messages.findLast((m) => !m.withdrawn && m.text !== null)
  // The highest place taken, withdrawn messages included (0063's message_seq), and the opening's own (CC-0023).
  const placed = (seq: number) => (ORDERLESS ? {} : { seq })
  return {
    ...c,
    revision: messages.length + 1,
    summaryCoverage: c.summary === null ? NOT_ASSESSED : assessed(messages, c.lastAt),
    questionsCoverage: c.summary === null && c.openQuestions === 0 ? NOT_ASSESSED : assessed(messages, c.lastAt),
    ...(ORDERLESS ? {} : { messageSeq: messages.length }),
    lastMessage:
      lastShown && last?.text
        ? {
            author: last.author,
            actorId: last.actorId,
            name: last.name,
            text: last.text.slice(0, 140),
            at: last.at,
            ...placed(messages.indexOf(last) + 1),
          }
        : null,
  }
}

/** The list as A33 serves it to a member (a viewer reads and writes nothing; an admin also removes and erases). */
export function wireList(
  list: readonly FixtureConversation[],
  messages: Readonly<Record<string, readonly FixtureMessage[]>>,
  opts: { lastShown: boolean; viewer: boolean; admin: boolean; more?: boolean; askOff?: boolean },
): ConversationList {
  return {
    projectId: PROJECT,
    conversations: list.map((c) => wireSummary(c, messages[c.id] ?? [], opts.lastShown)),
    more: opts.more === true,
    policy: {
      id: 'conversation-text-v1',
      // The API's CONVERSATION_NOTICE (packages/persistence/src/conversations.ts), word for word.
      notice:
        'Titles and messages here are saved for this project, and its current members can read them. ' +
        'They’re kept for the life of the project until they’re withdrawn or erased, unless a stricter organization rule applies. ' +
        'You can withdraw your own messages; admins can remove any message or erase a conversation. ' +
        'Hosted backups keep their own retention, and what someone has already seen can’t be unseen. ' +
        'Live room audio is not saved here.',
      retention: 'until_withdrawn_or_erased',
      audience: 'project_members',
    },
    capability: {
      state: 'enabled',
      write: !opts.viewer,
      moderate: opts.admin,
      ...(opts.askOff === true
        ? { ask: 'unavailable', askReason: 'replies_not_enabled' }
        : { ask: 'available', askReason: null }),
    },
  }
}
