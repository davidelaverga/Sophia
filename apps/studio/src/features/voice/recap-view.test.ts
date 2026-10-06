import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MeetingRecap } from '../../api/vision.ts'
import { AFTER_POLL_MS, afterLine, pollAfter, recapHead, recapSections, recapText } from './recap-view.ts'

const names = new Map([
  ['me', 'you'],
  ['marco', 'Marco'],
])
const nameOf = (id: string) => names.get(id) ?? 'a member'

const recap = (over: Partial<MeetingRecap> = {}): MeetingRecap => ({
  meetingId: 'm',
  startedAt: '2026-10-05T10:00:00.000Z',
  endedAt: null,
  minutes: 42,
  people: [{ actorId: 'me' }, { actorId: 'marco' }],
  guests: 0,
  decided: [],
  made: [],
  noted: [],
  open: [],
  work: [],
  names: {},
  ...over,
})

describe('the recap’s head', () => {
  it('says how long it lasted and who was there; guests only counted', () => {
    assert.equal(recapHead(recap()), '42 minutes · 2 members')
    assert.equal(
      recapHead(recap({ minutes: 1, people: [{ actorId: 'me' }], guests: 2 })),
      '1 minute · 1 member · 2 guests',
    )
    assert.equal(recapHead(recap({ minutes: 0 })), 'Under a minute · 2 members')
  })
})

describe('the recap’s sections', () => {
  const full = recap({
    decided: [
      {
        decisionId: 'd',
        statement: 'Pilot with 14 teams',
        proposedBy: 'marco',
        decidedBy: 'me',
        at: 'x',
        undoable: true,
      },
    ],
    made: [{ artifactId: 'a', artifactVersionId: 'v', title: 'Fixture report', versionNumber: 2, askedBy: 'me' }],
    noted: [
      { entryId: 'n1', kind: 'observation', text: 'Two teams left', authoredBy: 'member', actorId: 'marco', at: 'x' },
      { entryId: 'n2', kind: 'observation', text: 'The fixture holds', authoredBy: 'sophia', actorId: 'me', at: 'x' },
    ],
  })

  it('names who did what, each from its record; a section with nothing is left out', () => {
    const sections = recapSections(full, nameOf)
    assert.deepEqual(
      sections.map((s) => s.title),
      ['Decided', 'Made', 'Kept'],
    )
    assert.equal(sections[0]?.lines[0]?.by, 'proposed by Marco, decided by you')
    assert.equal(sections[1]?.lines[0]?.text, 'Fixture report · v2')
    assert.deepEqual(
      sections[2]?.lines.map((l) => l.by),
      ['kept by Marco', 'Sophia’s paraphrase'],
    )
  })

  it('copies as plain text: the head, then each section’s lines; nothing kept says so', () => {
    const text = recapText('Fixture project', full, nameOf)
    assert.ok(text.startsWith('Fixture project\n42 minutes · 2 members\n'))
    assert.ok(text.includes('\nDecided\n- Pilot with 14 teams (proposed by Marco, decided by you)'))
    assert.ok(text.includes('- Two teams left (kept by Marco)'))
    assert.equal(
      recapText('Fixture project', recap(), nameOf),
      'Fixture project\n42 minutes · 2 members\nNothing was decided, made or kept in this meeting.',
    )
  })
})

describe('the record at close, and what came after', () => {
  const running = recap({ work: [{ taskId: 't1', kind: 'research', state: 'running' }] })

  it('says work still running at close as such, never as done', () => {
    const closed = recapSections(running, nameOf, true).find((s) => s.title === 'Work')
    assert.deepEqual(
      closed?.lines.map((l) => [l.text, l.by]),
      [['research', 'still running at close']],
    )
    const queued = recap({ work: [{ taskId: 't2', kind: 'research', state: 'pending' }] })
    assert.deepEqual(
      recapSections(queued, nameOf, true)
        .find((s) => s.title === 'Work')
        ?.lines.map((l) => l.by),
      ['still running at close'],
    )
    assert.ok(
      recapText('This meeting', { ...running, endedAt: '2026-10-05T11:00:00.000Z' }, nameOf).includes(
        'research (still running at close)',
      ),
    )
    const open = recapSections(running, nameOf, false).find((s) => s.title === 'Work')
    assert.deepEqual(
      open?.lines.map((l) => l.by),
      ['running'],
    )
  })

  it('names a later outcome by what it made, and its version', () => {
    const base = {
      at: '2026-10-06T17:34:00Z',
      taskId: 't1',
      artifactId: 'a',
      artifactVersionId: 'v',
      versionNumber: 2,
      title: 'Fixture report',
    }
    assert.equal(afterLine({ ...base, kind: 'work_finished' }), 'Fixture report ready · v2')
    assert.equal(afterLine({ ...base, kind: 'version_made' }), 'Fixture report · v2')
    assert.equal(
      afterLine({
        ...base,
        kind: 'work_finished',
        artifactId: null,
        artifactVersionId: null,
        versionNumber: null,
        title: null,
      }),
      'Work finished',
    )
  })
})

const finished = (taskId: string, at = '2026-10-06T17:05:00Z') => ({ at, kind: 'work_finished', taskId }) as const

describe('reading again what came after the meeting', () => {
  const endedAt = '2026-10-06T17:00:00Z'

  it('goes on while any task running at close has not finished since', () => {
    assert.equal(pollAfter(['t1', 't2'], [], endedAt, 0), true)
    assert.equal(pollAfter(['t1', 't2'], [finished('t1')], endedAt, 0), true) // the first of two (Codex on #130)
    assert.equal(pollAfter(['t1', 't2'], [finished('t2'), finished('t1')], endedAt, 0), false)
  })

  it('counts only a task’s own finish, after the close', () => {
    assert.equal(pollAfter(['t1'], [finished('t1', '2026-10-06T16:59:59Z')], endedAt, 0), true)
    assert.equal(
      pollAfter(['t1'], [{ at: '2026-10-06T17:05:00Z', kind: 'version_made', taskId: 't1' }], endedAt, 0),
      true,
    )
    assert.equal(pollAfter(['t1'], [finished('t9'), { ...finished('t1'), taskId: null }], endedAt, 0), true)
  })

  it('never without work running at close, and never past ten minutes', () => {
    assert.equal(pollAfter([], [], endedAt, 0), false)
    assert.equal(pollAfter(['t1'], [], endedAt, AFTER_POLL_MS - 1), true)
    assert.equal(pollAfter(['t1'], [], endedAt, AFTER_POLL_MS), false)
  })
})
