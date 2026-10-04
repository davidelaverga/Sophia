import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PersonalExport, PersonalTurn, ProjectSummary } from '@sophia/contracts'
import { confirmsErasure, exportText, factsOf } from './data-view.ts'
import { NOTICE } from './notice-view.ts'
import {
  codeButton,
  EDGE_TIP,
  LOCK_TIP,
  PRIVACY_RULES,
  firstName,
  greeting,
  HOME_ACTION,
  homeRows,
  otherWaysNote,
  otherWaysShown,
  rowNote,
  sophiaSays,
  projectCard,
  readState,
  roomCaption,
  sessionWhen,
  UNLOCK,
  workCount,
  youDoor,
} from './places-view.ts'

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
    // A call shut it, and only the person opens it again: true during the call and after it.
    assert.deepEqual(youDoor({ ...base, locked: 'room', turns: yesterday }), {
      verb: 'Unlock',
      meta: 'Locked when you joined a room',
      notes: null,
    })
    assert.equal(youDoor({ ...base, locked: 'you', turns: undefined }).meta, 'Locked on this device')
  })

  it('only opens a space still loading: no first conversation offered over one that may exist', () => {
    assert.deepEqual(youDoor({ locked: null, notes: 0, now: NOW, turns: undefined }), {
      verb: 'Open',
      meta: '',
      notes: null,
    })
  })

  it('tells a read that failed from one that is loading or not asked', () => {
    assert.equal(readState({ data: undefined, isFetching: true, isError: false }), 'loading')
    assert.equal(readState({ data: undefined, isFetching: false, isError: true }), 'failed')
    // Try again answers at once: a failed read asked again is loading, not still failed.
    assert.equal(readState({ data: undefined, isFetching: true, isError: true }), 'loading')
    // A read that isn't asked (behind the padlock) is neither loading nor failed.
    assert.equal(readState({ data: undefined, isFetching: false, isError: false }), 'idle')
    // Data already shown stays shown while a later read fails.
    assert.equal(readState({ data: [], isFetching: false, isError: true }), 'ready')
  })

  it('counts the projects for All projects, and the notes carried from you; nothing while they load', () => {
    assert.equal(workCount(undefined), '')
    assert.equal(workCount([]), '')
    assert.equal(workCount([project(), project({ title: 'Pitch deck, Q4' })]), '2 projects')
    const mine = project({
      releases: [{ id: 'r', text: 'x', ownerName: 'a', mine: true, createdAt: NOW.toISOString() }],
    })
    assert.equal(workCount([mine]), '1 project · 1 from you')
  })

  it('names who is in a room, Sophia last', () => {
    const live = project({ room: { people: ['davide@sophia.test', 'luis@sophia.test'], sophia: true } })
    assert.equal(roomCaption(live), 'Davide, Luis and Sophia are in Launch plan')
    assert.equal(
      roomCaption(project({ room: { people: ['luis@sophia.test'], sophia: false } })),
      'Luis is in Launch plan',
    )
    assert.equal(roomCaption(project()), '')
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

const id = (n: number) => `00000000-0000-4000-8000-00000000000${String(n)}`
const plain = (said: ReturnType<typeof sophiaSays>) => said.map((s) => s.text).join('')

describe('home, as a place that knows where you’ll go', () => {
  const four = [
    project({ projectId: id(1), title: 'Launch plan' }),
    project({ projectId: id(2), title: 'Research notes' }),
    project({ projectId: id(3), title: 'Design review' }),
    project({ projectId: id(4), title: 'Weekly standup', nextSession: session(10) }),
  ]

  it('offers Work’s first three, in its order, each read as Work reads it', () => {
    const rows = homeRows(four, NOW, null)
    assert.deepEqual(
      rows.map((r) => r.project.title),
      ['Weekly standup', 'Launch plan', 'Research notes'],
    )
    assert.equal(rows[0]?.soon, true)
    assert.deepEqual(rows[0]?.card, projectCard(four[3] ?? project(), NOW, false))
    assert.equal(rows[1]?.soon, false)
    assert.deepEqual(homeRows([], NOW, null), [])
  })

  it('a row with people in its room joins it; the call you are in takes you back to it, never hangs up', () => {
    const live = project({ projectId: id(5), room: { people: ['davide@sophia.test'], sophia: true } })
    const [row] = homeRows([live], NOW, null)
    assert.equal(row?.live, true)
    assert.equal(row?.action, 'join')
    assert.equal(homeRows([live], NOW, id(5))[0]?.action, 'back')
    assert.equal(HOME_ACTION.back, 'Back to the room')
    assert.equal(homeRows([project()], NOW, null)[0]?.action, 'open')
  })

  it('Sophia says the one thing that matters: your call, else a session soon, else a live room, else all is well', () => {
    assert.equal(plain(sophiaSays(undefined, NOW, null)), '')
    assert.equal(plain(sophiaSays([], NOW, null)), 'Start a project when you’re ready, or just talk to me.')
    assert.equal(plain(sophiaSays([project()], NOW, null)), 'Your projects are as you left them.')
    assert.equal(plain(sophiaSays(four, NOW, null)), 'Pitch run in Weekly standup starts in 10 min.')
    const live = project({
      projectId: id(5),
      title: 'Pitch deck',
      room: { people: ['davide@sophia.test'], sophia: true },
    })
    assert.equal(plain(sophiaSays([project(), live], NOW, null)), 'Davide and Sophia are in Pitch deck.')
    assert.equal(plain(sophiaSays(four, NOW, { title: 'Launch plan' })), 'You’re in Launch plan’s room.')
    // The project's name is the sentence's strong part.
    assert.deepEqual(
      sophiaSays([project(), live], NOW, null)
        .filter((s) => s.strong)
        .map((s) => s.text),
      ['Pitch deck'],
    )
  })

  it('each row says quietly what matters there: a session soon, people in the room, else its people', () => {
    const rows = homeRows(four, NOW, null)
    assert.deepEqual(rowNote(rows[0] ?? homeRows([project()], NOW, null)[0]!), {
      text: 'Pitch run starts in 10 min',
      tone: 'soon',
    })
    assert.deepEqual(rowNote(homeRows([project({ members: 2 })], NOW, null)[0]!), {
      text: 'You and 1 other',
      tone: 'quiet',
    })
    const live = project({ projectId: id(5), room: { people: ['davide@sophia.test'], sophia: true } })
    assert.deepEqual(rowNote(homeRows([live], NOW, null)[0]!), { text: 'Davide and Sophia are here', tone: 'live' })
    assert.deepEqual(rowNote(homeRows([live], NOW, id(5))[0]!), { text: 'You’re in the room', tone: 'live' })
  })
})

describe('your data', () => {
  it('counts days with Sophia by the days the person wrote, and copies everything as text', () => {
    const everything: PersonalExport = {
      exportedAt: NOW.toISOString(),
      next: null,
      turns: [
        turn('I have a pitch', 60 * 24),
        { ...turn('Still here', 5), id: 't2', seq: 2 },
        {
          ...turn('Glad you are', 4),
          id: 't3',
          seq: 3,
          author: 'sophia',
          reply: null,
          suggestion: { id: 's', text: 'Pitch on Friday', state: 'open' },
        },
      ],
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
    // Days are the server's count over the whole conversation (a long one lists only its newest turns).
    assert.deepEqual(factsOf({ ...everything, days: 31 }), { days: 31, notes: 1, carried: 1 })
    const text = exportText(everything, 'Ana', NOW)
    assert.match(text, /^Ana · personal space with Sophia\n\nNotes:\n- Take a day off/)
    assert.match(text, /Carried to projects:\n- Ask Luis \(Launch plan\)/)
    assert.match(
      text,
      /\nYesterday\nYou: I have a pitch\n\nToday\nYou: Still here\nSophia: Glad you are\n {2}Suggested note, not kept: Pitch on Friday$/,
    )
    assert.equal(confirmsErasure(' Delete '), true)
    assert.equal(confirmsErasure('del'), false)
  })
})

describe('unlocking', () => {
  it('offers the other ways on request, says so while they load, and says at once when they couldn’t', () => {
    const withPasskey = { passkey: true }
    assert.equal(otherWaysShown({ ways: null, failed: false, asked: false }), 'ask')
    assert.equal(otherWaysShown({ ways: null, failed: false, asked: true }), 'loading')
    assert.equal(otherWaysShown({ ways: withPasskey, failed: false, asked: false }), 'ask')
    assert.equal(otherWaysShown({ ways: withPasskey, failed: false, asked: true }), 'ways')
    assert.equal(
      otherWaysShown({ ways: { passkey: false }, failed: false, asked: false }),
      'ways',
      'nothing to ask for',
    )
    assert.equal(otherWaysShown({ ways: null, failed: true, asked: false }), 'failed', 'before any press')
  })

  it('keeps one button for the code: asked for, waiting while it is sent, then a new one on request', () => {
    assert.deepEqual(codeButton({ codes: 0, sending: false, canResend: true }), {
      label: 'Email me a code',
      quiet: false,
    })
    assert.deepEqual(codeButton({ codes: 0, sending: true, canResend: true }), { label: 'Sending…', quiet: false })
    assert.deepEqual(codeButton({ codes: 1, sending: false, canResend: true }), {
      label: 'Send a new code',
      quiet: true,
    })
    assert.deepEqual(codeButton({ codes: 2, sending: true, canResend: true }), { label: 'Sending…', quiet: true })
    assert.equal(codeButton({ codes: 1, sending: false, canResend: false }), null, 'a dev identity has nothing to send')
  })

  it('says how to use a provider during a call, and when there is no other way, in a call too', () => {
    const google = { providers: ['Google'], code: true }
    assert.equal(otherWaysNote(google, true), 'Leave the call, then continue with Google.')
    assert.equal(
      otherWaysNote({ providers: ['Google', 'GitHub'], code: false }, true),
      'Leave the call, then continue with Google or GitHub.',
    )
    assert.equal(otherWaysNote(google, false), null)
    assert.equal(otherWaysNote({ providers: [], code: false }, true), UNLOCK.noOther)
    assert.equal(otherWaysNote({ providers: [], code: false }, false), UNLOCK.noOther)
    assert.equal(otherWaysNote({ providers: [], code: true }, true), null)
  })
})

describe('the padlock’s words', () => {
  it('promise only that opening it asks who you are, never a passkey that may not be offered', () => {
    const words = [
      LOCK_TIP.you.label,
      LOCK_TIP.room.label,
      EDGE_TIP.you,
      EDGE_TIP.room,
      NOTICE.locked,
      ...PRIVACY_RULES.map((rule) => rule.rest),
    ]
    for (const said of words) assert.doesNotMatch(said, /passkey/i, said)
  })
})
