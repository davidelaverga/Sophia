import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PersonalExport, PersonalTurn, ProjectSummary } from '@sophia/contracts'
import { confirmsErasure, exportText, factsOf } from './data-view.ts'
import { firstName, greeting, projectCard, roomCaption, sessionWhen, workDoor, youDoor } from './places-view.ts'

const NOW = new Date(2026, 8, 30, 21, 0)
const inMin = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString()

const project = (over: Partial<ProjectSummary> = {}): ProjectSummary => ({
  projectId: '00000000-0000-4000-8000-000000000001',
  title: 'Launch plan',
  role: 'editor',
  members: 3,
  room: { people: [], sophia: false },
  nextSession: null,
  releases: [],
  ...over,
})

const session = (startsInMin: number) => ({
  id: '00000000-0000-4000-8000-0000000000a1',
  title: 'Pitch run',
  startsAt: inMin(startsInMin),
  endsAt: inMin(startsInMin + 60),
  timeZone: 'Europe/Madrid',
})

const turn = (text: string, minutesAgo: number): PersonalTurn => ({
  id: 't',
  seq: 1,
  author: 'person',
  text,
  createdAt: inMin(-minutesAgo),
  replyTo: null,
  reply: 'answered',
  suggestion: null,
})

describe('home words', () => {
  it('greets by the time of day and by first name, never by email', () => {
    assert.equal(greeting(9, 'Ana', false), 'Good morning, Ana')
    assert.equal(greeting(20, null, false), 'Good evening')
    assert.equal(greeting(20, 'Ana', true), 'Welcome, Ana')
    assert.equal(firstName({ name: 'ana@x.test', displayName: 'Ana María López' }), 'Ana')
    assert.equal(firstName({ name: 'ana@x.test' }), null)
    assert.equal(firstName({ name: 'Luis' }), 'Luis')
  })

  it('says what the Personal door opens, naming the last day by what it was about', () => {
    const base = { locked: null, notes: 3, now: NOW }
    assert.deepEqual(youDoor({ ...base, turns: [] }), {
      verb: 'Start talking',
      meta: 'Sophia is here whenever you are',
      notes: null,
    })
    const yesterday = [turn('I have a pitch on Friday', 60 * 24), turn('Writing things down, I think', 60 * 24 - 3)]
    assert.deepEqual(youDoor({ ...base, turns: yesterday }), {
      verb: 'Continue',
      meta: 'Yesterday · the pitch',
      notes: 3,
    })
    assert.equal(youDoor({ ...base, turns: [...yesterday, turn('Just talk', 2)] }).meta, 'Just now · a chat')
    assert.deepEqual(youDoor({ ...base, locked: 'room', turns: yesterday }), {
      verb: 'Unlock',
      meta: 'Locked while you’re in a room',
      notes: null,
    })
  })

  it('says what the Work door opens: a first project, the projects, or a room about to start', () => {
    assert.equal(workDoor([], NOW, null).verb, 'Start a project')
    const quiet = workDoor([project(), project({ title: 'Pitch deck, Q4' })], NOW, null)
    assert.deepEqual(
      [quiet.verb, quiet.meta, quiet.count],
      ['Open your projects', 'Launch plan and 1 more', '2 projects'],
    )
    const pitch = project({ title: 'Pitch deck, Q4', nextSession: session(8) })
    const soon = workDoor([project(), pitch], NOW, null)
    assert.deepEqual(
      [soon.verb, soon.meta, soon.joins?.title],
      ['Join the room', 'Pitch deck, Q4 · starts in 8 min', 'Pitch deck, Q4'],
    )
    assert.equal(workDoor([project(), pitch], NOW, 'Pitch deck, Q4').meta, 'You’re in Pitch deck, Q4')
    const mine = project({
      releases: [{ id: 'r', text: 'x', ownerName: 'a', mine: true, createdAt: NOW.toISOString() }],
    })
    assert.equal(workDoor([mine], NOW, null).count, '1 project · 1 from you')
  })

  it('names who is in the busiest room, Sophia last', () => {
    const live = project({ room: { people: ['davide@sophia.test', 'luis@sophia.test'], sophia: true } })
    const door = workDoor([project({ title: 'Other' }), live], NOW, null)
    assert.equal(roomCaption(door.shown), 'Davide, Luis and Sophia are in Launch plan')
    assert.equal(
      roomCaption(project({ room: { people: ['luis@sophia.test'], sophia: false } })),
      'Luis is in Launch plan',
    )
    assert.equal(roomCaption(workDoor([project()], NOW, null).shown), '')
  })
})

describe('project cards', () => {
  it('lead with the room when someone is in it, else with the people and the next session', () => {
    const live = project({ room: { people: ['davide@sophia.test'], sophia: true } })
    assert.deepEqual(projectCard(live, NOW, false), {
      presence: 'Davide and Sophia are in the room',
      meta: 'You and 2 others',
      action: 'join',
    })
    assert.deepEqual(projectCard(project({ members: 2, nextSession: session(12) }), NOW, false), {
      presence: null,
      meta: 'You and 1 other · session starts in 12 min',
      action: 'open',
    })
    assert.equal(projectCard(project({ nextSession: session(-5) }), NOW, false).action, 'join')
    assert.equal(projectCard(live, NOW, true).action, 'leave')
    assert.equal(sessionWhen(project({ nextSession: session(60 * 20) }), NOW), 'tomorrow at 17:00')
  })
})

describe('your data', () => {
  it('counts days with Sophia by the days the person wrote, and copies everything as text', () => {
    const everything: PersonalExport = {
      exportedAt: NOW.toISOString(),
      turns: [turn('I have a pitch', 60 * 24), { ...turn('Still here', 5), id: 't2', seq: 2 }],
      notes: [{ id: 'n', text: 'Take a day off', keptBy: 'person', fromTurnId: null, createdAt: NOW.toISOString() }],
      releases: [
        {
          id: 'r',
          noteId: null,
          projectId: 'p',
          projectTitle: 'Launch plan',
          text: 'Ask Luis',
          createdAt: NOW.toISOString(),
        },
      ],
    }
    assert.deepEqual(factsOf(everything), { days: 2, notes: 1, carried: 1 })
    const text = exportText(everything, 'Ana', NOW)
    assert.match(text, /^Ana · personal space with Sophia\n\nNotes:\n- Take a day off/)
    assert.match(text, /Carried to projects:\n- Ask Luis \(Launch plan\)/)
    assert.match(text, /\nYesterday\nYou: I have a pitch\n\nToday\nYou: Still here$/)
    assert.equal(confirmsErasure(' Delete '), true)
    assert.equal(confirmsErasure('del'), false)
  })
})
