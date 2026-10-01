import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PersonalTurn } from '@sophia/contracts'
import {
  conversationRows,
  dayLabel,
  daysOf,
  heard,
  introText,
  notePrefill,
  topicOf,
  type ConversationInput,
} from './conversation-view.ts'

const NOW = new Date(2026, 8, 30, 21, 0)
const at = (daysAgo: number, h: number, m = 0) => new Date(2026, 8, 30 - daysAgo, h, m).toISOString()

let seq = 0
function turn(
  author: 'person' | 'sophia',
  text: string,
  createdAt: string,
  extra: Partial<PersonalTurn> = {},
): PersonalTurn {
  seq += 1
  return {
    id: `t${seq}`,
    seq,
    author,
    text,
    createdAt,
    replyTo: null,
    reply: author === 'person' ? 'answered' : null,
    suggestion: null,
    ...extra,
  }
}

const input = (turns: PersonalTurn[], more: Partial<ConversationInput> = {}): ConversationInput => ({
  turns,
  sending: null,
  now: NOW,
  name: 'Ana',
  fromTheStart: false,
  ...more,
})

const shape = (rows: ReturnType<typeof conversationRows>) =>
  rows.map((r) =>
    r.kind === 'turn' ? `${r.author}${r.first ? '' : '+'}` : r.kind === 'day' ? `day:${r.label}` : r.kind,
  )

describe('dayLabel', () => {
  it('names today, yesterday, a weekday this week, then the date', () => {
    assert.equal(dayLabel(new Date(2026, 8, 30, 1), NOW), 'Today')
    assert.equal(dayLabel(new Date(2026, 8, 29, 23), NOW), 'Yesterday')
    assert.equal(dayLabel(new Date(2026, 8, 28), NOW), 'Monday')
    assert.equal(dayLabel(new Date(2026, 8, 21), NOW), 'Sep 21')
    assert.equal(dayLabel(new Date(2025, 11, 31), NOW), 'Dec 31, 2025')
  })
})

describe('conversationRows', () => {
  it('opens a first conversation with Sophia’s introduction and three ways in', () => {
    const rows = conversationRows(input([], { fromTheStart: true }))
    assert.deepEqual(shape(rows), ['day:Today', 'intro', 'starters'])
    assert.equal(introText('Ana').startsWith('Hi Ana, I’m Sophia.'), true)
    assert.equal(introText(null).startsWith('Hi, I’m Sophia.'), true)
  })

  it('divides by day, groups turns from the same side, and shows the wait at the end', () => {
    const turns = [
      turn('person', 'I keep putting off the slides', at(2, 21, 10)),
      turn('sophia', 'Which slide do you avoid?', at(2, 21, 10)),
      turn('person', 'I have a pitch on Friday', at(1, 22, 40)),
      turn('person', 'And I am not sleeping', at(1, 22, 41), { reply: 'pending' }),
    ]
    assert.deepEqual(shape(conversationRows(input(turns))), [
      'day:Monday',
      'person',
      'sophia',
      'day:Yesterday',
      'person',
      'person+',
      'typing',
    ])
  })

  it('shows what was just sent at once, with Sophia writing after it, and the starters go', () => {
    const rows = conversationRows(input([], { fromTheStart: true, sending: { text: 'Just talk', at: NOW } }))
    assert.deepEqual(shape(rows), ['day:Today', 'intro', 'person', 'typing'])
  })

  it('offers a suggestion after the reply, folds it once the person moves on, and keeps a kept one', () => {
    const asked = turn('person', 'I cannot sleep', at(0, 20))
    const reply = turn('sophia', 'What helps?', at(0, 20), {
      replyTo: asked.id,
      suggestion: { id: 's1', text: 'Sleep has been short', state: 'open' },
    })
    const open = conversationRows(input([asked, reply]))
    assert.deepEqual(
      open
        .filter((r) => r.kind === 'suggestion')
        .map((r) => (r.kind === 'suggestion' ? [r.shown, r.askedTurnId] : null)),
      [['open', asked.id]],
    )
    const later = turn('person', 'Anyway', at(0, 20, 5))
    const folded = conversationRows(input([asked, reply, later]))
    assert.equal(folded.find((r) => r.kind === 'suggestion')?.kind === 'suggestion', true)
    assert.deepEqual(
      folded.flatMap((r) => (r.kind === 'suggestion' ? [r.shown] : [])),
      ['folded'],
    )
    // A suggestion row breaks the grouping: the next Sophia turn opens with her dot again.
    assert.deepEqual(shape(conversationRows(input([asked, reply, turn('sophia', 'Also…', at(0, 20, 1))]))), [
      'day:Today',
      'person',
      'sophia',
      'suggestion',
      'sophia',
    ])
  })

  it('says when Sophia could not answer, so the person can ask again', () => {
    const failed = turn('person', 'Hello?', at(0, 19), { reply: 'failed' })
    assert.deepEqual(shape(conversationRows(input([failed]))), ['day:Today', 'person', 'failed'])
  })
})

describe('the words around the conversation', () => {
  it('names a day by what was talked about, and a message by its topic', () => {
    const turns = [
      turn('person', 'I have a pitch on Friday', at(1, 22)),
      turn('person', 'I cannot sleep', at(1, 23)),
      turn('person', 'Weekend plans with nobody', at(0, 9)),
    ]
    assert.deepEqual(
      daysOf(conversationRows(input(turns))).map((d) => [d.label, d.topics]),
      [
        ['Yesterday', 'the pitch · sleep'],
        ['Today', 'weekend plans with…'],
      ],
    )
    assert.equal(topicOf('Just talk'), 'a chat')
  })

  it('prefills a note with Sophia’s suggestion when there is one, else the words, cut short', () => {
    assert.equal(notePrefill('I have a pitch', { id: 's', text: 'Pitch on Friday', state: 'open' }), 'Pitch on Friday')
    assert.equal(notePrefill('I have a pitch', { id: 's', text: 'Pitch on Friday', state: 'kept' }), 'I have a pitch')
    assert.equal(notePrefill('x'.repeat(80), null), `${'x'.repeat(70)}…`)
  })
})

describe('what a screen reader hears', () => {
  const asked = turn('person', 'Are you there?', at(0, 20), { reply: 'pending' })
  const before = turn('sophia', 'Hello again.', at(0, 19))
  const answered = { ...asked, reply: 'answered' as const }
  const reply = turn('sophia', 'I am.', at(0, 20, 1))

  it('nothing at a load: what was already there is not read out', () => {
    assert.equal(heard(null, [before, answered, reply], false, false), null)
  })

  it('Sophia beginning to write, then her reply, never the person’s own turn', () => {
    assert.equal(heard([before], [before, asked], true, false), 'Sophia is writing…')
    assert.equal(heard([before, asked], [before, answered, reply], false, true), 'Sophia: I am.')
    assert.equal(
      heard([before, answered, reply], [before, answered, reply, turn('person', 'Good', at(0, 21))], false, false),
      null,
    )
  })

  it('every new reply in one read, in order: two quick messages', () => {
    const second = turn('sophia', 'Still here.', at(0, 20, 2))
    assert.equal(
      heard([before, asked], [before, answered, reply, second], false, true),
      'Sophia: I am. Sophia: Still here.',
    )
  })

  it('a reply that failed, also while a later message waits, and again after Ask again', () => {
    const later = turn('person', 'Hello?', at(0, 20, 3), { reply: 'pending' })
    const failed = { ...asked, reply: 'failed' as const }
    assert.equal(heard([before, asked, later], [before, failed, later], true, true), 'Sophia couldn’t answer this one.')
    assert.equal(heard([before, failed], [before, asked], true, false), 'Sophia is writing…')
    assert.equal(heard([before, asked], [before, failed], false, true), 'Sophia couldn’t answer this one.')
  })
})
