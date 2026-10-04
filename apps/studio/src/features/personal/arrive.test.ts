import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PersonalTurn, ProjectSummary } from '@sophia/contracts'
import { ARRIVALS, arriving } from './arrive.ts'
import { readyFor } from './places-view.ts'

const NOW = new Date(2026, 9, 5, 9, 0)
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()
const ahead = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString()

let seq = 0
const turn = (author: PersonalTurn['author'], createdAt: string, over: Partial<PersonalTurn> = {}): PersonalTurn => {
  seq += 1
  return {
    id: `t${String(seq)}`,
    seq,
    author,
    text: 'words',
    createdAt,
    replyTo: null,
    reply: author === 'person' ? 'answered' : null,
    suggestion: null,
    ...over,
  }
}

const project = (title: string, session: string | null, startsAt: string): ProjectSummary => ({
  projectId: title,
  title,
  role: 'editor',
  members: 3,
  room: null,
  nextSession: session ? { id: `${title}-s`, title: session, startsAt, endsAt: startsAt, timeZone: 'UTC' } : null,
  releases: [],
})

describe('arriving on a new day', () => {
  const yesterday = [turn('person', ago(20 * 60)), turn('sophia', ago(20 * 60 - 1), { replyTo: 'x' })]

  it('offers the day’s answers under her first line of the day, while you haven’t said anything today', () => {
    assert.equal(arriving([...yesterday, turn('sophia', ago(2))], NOW, false), true)
  })

  it('not once you have said something today, nor while a message is on its way', () => {
    const answered = [...yesterday, turn('sophia', ago(5)), turn('person', ago(4))]
    assert.equal(arriving(answered, NOW, false), false)
    assert.equal(arriving([...yesterday, turn('sophia', ago(2))], NOW, true), false)
  })

  it('not once you spoke today, even when her greeting comes after it', () => {
    const spoke = [
      ...yesterday,
      turn('person', ago(60)),
      turn('sophia', ago(59), { replyTo: 'x' }),
      turn('sophia', ago(2)),
    ]
    assert.equal(arriving(spoke, NOW, false), false)
  })

  it('under yesterday’s greeting too, when nobody answered it: no day goes without them', () => {
    assert.equal(arriving([...yesterday, turn('sophia', ago(20 * 60 - 5))], NOW, false), true)
  })

  it('not when her last line is a reply rather than her greeting', () => {
    assert.equal(arriving([...yesterday, turn('sophia', ago(2), { replyTo: 't1' })], NOW, false), false)
    assert.equal(arriving([], NOW, false), false)
  })

  it('answers in a word, sent as a sentence', () => {
    assert.deepEqual(
      ARRIVALS.map((a) => [a.label, a.words]),
      [
        ['Light today', 'Light today.'],
        ['Steady', 'Steady today.'],
        ['Heavy today', 'Heavy today.'],
      ],
    )
  })
})

describe('getting ready for what’s next', () => {
  it('offers the soonest session in your projects within the day, said as you’d ask for it', () => {
    const ready = readyFor(
      [project('Design review', 'Crit', ahead(300)), project('Product launch', 'Standup', ahead(10))],
      NOW,
    )
    assert.deepEqual(ready, {
      label: 'Get ready for Standup · Product launch',
      note: 'starts in 10 min',
      words: 'Help me get ready for Standup in Product launch. It starts in 10 min.',
    })
  })

  it('says a later one by its day and time', () => {
    const ready = readyFor([project('Pitch deck', 'Review', new Date(2026, 9, 5, 16, 0).toISOString())], NOW)
    assert.equal(ready?.words, 'Help me get ready for Review in Pitch deck. It’s today at 16:00.')
  })

  it('offers none for a session already started, or more than a day away', () => {
    assert.equal(readyFor([project('A', 'Started', ago(5)), project('B', 'Far', ahead(25 * 60))], NOW), null)
    assert.equal(readyFor([project('C', null, ahead(10))], NOW), null)
  })
})
