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
  opensWithIntro,
  topicOf,
  type ConversationInput,
  withReadBack,
  keptOnReadBack,
  backOnSpaceRead,
  withEarlierPage,
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
  it('under her first line of a new day, how you arrive; gone once you say something', () => {
    const greeted = [
      turn('person', 'Yesterday’s words', at(1, 20)),
      turn('sophia', 'An answer', at(1, 20, 1), { replyTo: 'x' }),
      turn('sophia', 'Morning. How are you arriving today?', at(0, 9)),
    ]
    const rows = conversationRows(input(greeted))
    assert.deepEqual(shape(rows).slice(-2), ['sophia', 'arrive'])
    const arrive = rows.at(-1)
    assert.deepEqual(arrive?.kind === 'arrive' ? arrive.ways.map((w) => w.label) : [], [
      'Light today',
      'Steady',
      'Heavy today',
    ])
    const said = [...greeted, turn('person', 'Steady today.', at(0, 9, 2))]
    assert.equal(shape(conversationRows(input(said))).includes('arrive'), false)
    assert.equal(shape(conversationRows(input(greeted, { answers: false }))).includes('arrive'), false)
  })

  it('opens a first conversation with Sophia’s introduction and three ways in', () => {
    const rows = conversationRows(input([], { fromTheStart: true }))
    assert.deepEqual(shape(rows), ['day:Today', 'intro', 'starters'])
    assert.equal(introText('Ana').startsWith('Hi Ana, I’m Sophia.'), true)
    const ready = { label: 'Get ready for Standup · Launch', note: 'starts in 10 min', words: 'Help me get ready.' }
    const led = conversationRows(input([], { fromTheStart: true, ready }))
    const ways = led.find((r) => r.kind === 'starters')
    assert.deepEqual(ways?.kind === 'starters' ? ways.ways.map((w) => w.label) : [], [
      'Get ready for Standup · Launch',
      'Something’s on my mind',
      'Help me get ready for something',
      'Just talk',
    ])
    assert.equal(introText(null).startsWith('Hi, I’m Sophia.'), true)
  })

  it('reads each turn a bounded number of times, however long the conversation read back', () => {
    const many = Array.from({ length: 2_000 }, (_, i) =>
      turn(i % 2 ? 'sophia' : 'person', `Turn ${String(i)}`, at(0, 10)),
    )
    let reads = 0
    const counted = new Proxy(many, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads += 1
        return Reflect.get(target, key, receiver) as unknown
      },
    })
    conversationRows(input(counted))
    assert.ok(reads < many.length * 10, `${String(reads)} reads of ${String(many.length)} turns`)
  })

  it('offers no ways in where Sophia can’t answer: the field says why', () => {
    const rows = conversationRows(input([], { fromTheStart: true, answers: false }))
    assert.deepEqual(shape(rows), ['day:Today', 'intro'])
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
    const rows = conversationRows(input([], { fromTheStart: true, sending: { text: 'Just talk', at: NOW, epoch: 0 } }))
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

  it('nothing when earlier days are read back: old replies are not news', () => {
    const old = [turn('person', 'Long ago', at(9, 10)), turn('sophia', 'An old reply.', at(9, 10, 1))]
    const recent = [turn('person', 'Today', at(0, 10)), turn('sophia', 'A recent reply.', at(0, 10, 1))]
    const older = old.map((t, i) => ({ ...t, id: `old-${String(i)}`, seq: i + 1 }))
    assert.equal(heard(recent, [...older, ...recent], false, false), null)
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

describe('a conversation that starts again', () => {
  it('opens with the introduction after an erasure too, whatever number its first turn has', () => {
    const first = turn('person', 'Starting again', at(0, 20), { seq: 7 })
    assert.equal(opensWithIntro([first], false, NOW), true)
    assert.equal(opensWithIntro([first], true, NOW), false, 'not when earlier turns exist')
  })
})

describe('a long conversation read back', () => {
  const run = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({
      ...turn('person', `Turn ${from + i}`, at(0, 9)),
      seq: from + i,
    }))

  it('shows what was read back before the window the space lists, once', () => {
    const window = run(501, 1000)
    assert.equal(withReadBack([], window), window, 'nothing read back: the window as it is')
    const shown = withReadBack(run(401, 500), window)
    assert.deepEqual([shown.length, shown[0]?.seq, shown.at(-1)?.seq], [600, 401, 1000])
    assert.equal(withReadBack(run(401, 520), window).length, 600, 'what the window lists is shown once')
  })

  it('keeps what leaves the window as new turns come, so nothing read goes missing', () => {
    const read = run(401, 500)
    const before = run(501, 1000)
    const after = run(511, 1010)
    const kept = keptOnReadBack(read, before, after)
    assert.deepEqual([kept.length, kept[0]?.seq, kept.at(-1)?.seq], [110, 401, 510])
    assert.equal(keptOnReadBack(read, before, before), read, 'nothing left the window: the same turns')
    assert.equal(withReadBack(kept, after).length, 610)
  })

  it('lets what was read back go once the space is erased: another epoch keeps none of it', () => {
    const back = { epoch: 1, turns: run(401, 500), more: true }
    assert.equal(backOnSpaceRead(back, run(501, 1000), { epoch: 2, turns: run(1, 3) }), null)
    assert.equal(backOnSpaceRead(null, [], { epoch: 2, turns: [] }), null)
    const same = backOnSpaceRead(back, run(501, 1000), { epoch: 1, turns: run(511, 1010) })
    assert.deepEqual([same?.turns.length, same?.turns.at(-1)?.seq], [110, 510], 'the same epoch keeps what left')
  })

  it('joins a page that arrives to what was read back by then, each turn once', () => {
    // 401..500 read back; while 301..400 was on its way, 501..510 left the window into what was read back.
    const now = { epoch: 1, turns: run(401, 510), more: true }
    const joined = withEarlierPage(now, 1, { turns: run(301, 400), earlier: true })
    assert.deepEqual(
      [joined.turns.length, joined.turns[0]?.seq, joined.turns.at(-1)?.seq, joined.more],
      [210, 301, 510, true],
    )
    const overlapping = withEarlierPage(now, 1, { turns: run(391, 410), earlier: false })
    assert.equal(new Set(overlapping.turns.map((t) => t.seq)).size, overlapping.turns.length, 'each turn once')
    const fresh = withEarlierPage(now, 2, { turns: run(1, 3), earlier: false })
    assert.deepEqual(
      fresh.turns.map((t) => t.seq),
      [1, 2, 3],
      'nothing read back in another epoch is joined',
    )
  })
})
