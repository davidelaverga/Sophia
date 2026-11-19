import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  afterSkip,
  afterStep,
  arrivedMidRun,
  endedElsewhere,
  endsOnEscape,
  FIRST_RUN,
  firstRunHolds,
  firstRunKey,
  firstRunShows,
  firstSteps,
  namePrefill,
  profileFacts,
  readFirstRunDone,
  rememberFirstRunDone,
  savedFrom,
  stepAt,
  type FirstRunFacts,
} from './first-run.ts'

// Home's guided first run (docs/plans/home-first-run.md): when it shows, which steps it asks, and where skipping goes.

const NONE: readonly unknown[] = []
const ONE: readonly unknown[] = [{ projectId: 'p1' }]
const facts = (over: Partial<FirstRunFacts> = {}): FirstRunFacts => ({
  done: false,
  projects: NONE,
  archived: NONE,
  profile: { chosen: false },
  ...over,
})

describe('when the first run shows', () => {
  it('shows the first time, with no projects, once the profile has answered', () => {
    assert.equal(firstRunShows(facts()), true)
    assert.equal(firstRunShows(facts({ profile: { chosen: true } })), true)
    // A server with no profile to change still gets the first run, without the name.
    assert.equal(firstRunShows(facts({ profile: 'none' })), true)
  })

  it('never once it ended on this browser', () => {
    assert.equal(firstRunShows(facts({ done: true })), false)
  })

  it('never with a project, active or archived', () => {
    assert.equal(firstRunShows(facts({ projects: ONE })), false)
    assert.equal(firstRunShows(facts({ archived: ONE })), false)
  })

  it('never on a guess: projects, archived ones or the profile still being read (or a read that failed)', () => {
    assert.equal(firstRunShows(facts({ projects: undefined })), false)
    assert.equal(firstRunShows(facts({ archived: 'reading' })), false)
    assert.equal(firstRunShows(facts({ archived: 'failed' })), false)
    assert.equal(firstRunShows(facts({ profile: 'reading' })), false)
  })
})

describe('while it can’t tell yet', () => {
  it('holds the place under the greeting while the archived ones or the profile are read, with no projects', () => {
    assert.equal(firstRunHolds(facts({ archived: 'reading' })), true)
    assert.equal(firstRunHolds(facts({ profile: 'reading' })), true)
  })

  it('holds nothing once it can tell, once it ended, with projects, or while the projects are still read', () => {
    assert.equal(firstRunHolds(facts()), false)
    assert.equal(firstRunHolds(facts({ archived: 'failed' })), false)
    assert.equal(firstRunHolds(facts({ archived: 'reading', done: true })), false)
    assert.equal(firstRunHolds(facts({ archived: 'reading', projects: ONE })), false)
    assert.equal(firstRunHolds(facts({ archived: 'reading', projects: undefined })), false)
  })
})

describe('how it ends', () => {
  const key = { key: 'Escape', isComposing: false, defaultPrevented: false }
  it('Escape ends it, unless an input method is composing, it was handled, or a dialog or a menu is open', () => {
    assert.equal(endsOnEscape(key, false), true)
    assert.equal(endsOnEscape({ ...key, key: 'Enter' }, false), false)
    assert.equal(endsOnEscape({ ...key, isComposing: true }, false), false)
    assert.equal(endsOnEscape({ ...key, defaultPrevented: true }, false), false)
    assert.equal(endsOnEscape(key, true), false)
  })

  it('a project arriving while it shows ends it, so it is remembered', () => {
    assert.equal(arrivedMidRun(true, ONE), true)
    assert.equal(arrivedMidRun(true, NONE), false)
    assert.equal(arrivedMidRun(true, undefined), false)
    assert.equal(arrivedMidRun(false, ONE), false)
  })

  it('ended in another tab of this browser, for this account, it ends here', () => {
    assert.equal(endedElsewhere({ key: firstRunKey('acc-1'), newValue: 'done' }, 'acc-1'), true)
    assert.equal(endedElsewhere({ key: firstRunKey('acc-2'), newValue: 'done' }, 'acc-1'), false)
    assert.equal(endedElsewhere({ key: firstRunKey('acc-1'), newValue: null }, 'acc-1'), false)
    assert.equal(endedElsewhere({ key: null, newValue: null }, 'acc-1'), false)
  })
})

describe('which steps it asks', () => {
  it('asks the name only of someone who has not chosen it, where it can be saved', () => {
    assert.deepEqual(firstSteps({ chosen: false }), ['name', 'how', 'project'])
    assert.deepEqual(firstSteps({ chosen: true }), ['how', 'project'])
    assert.deepEqual(firstSteps('none'), ['how', 'project'])
  })

  it('reads chosen from the profile; no route, a refusal or a failed read is none, never a guess', () => {
    assert.equal(profileFacts(null, null), 'reading')
    assert.deepEqual(profileFacts({ displayName: 'Luis', chosen: true, revision: 2 }, null), { chosen: true })
    assert.deepEqual(profileFacts({ displayName: 'Luis', chosen: false, revision: 0 }, null), { chosen: false })
    assert.equal(profileFacts(null, 'unavailable'), 'none')
    assert.equal(profileFacts(null, 'signed_out'), 'none')
    assert.equal(profileFacts(null, 'failed'), 'none')
  })

  it('starts at the first step, and stays on the one shown when the name is chosen meanwhile', () => {
    assert.equal(stepAt(['name', 'how', 'project'], null), 'name')
    assert.equal(stepAt(['how', 'project'], null), 'how')
    assert.equal(stepAt(['how', 'project'], 'project'), 'project')
    // Saved: the profile now says chosen, the name step leaves the list, and the person is on the next one.
    assert.equal(stepAt(['how', 'project'], 'name'), 'how')
  })

  it('a name saved moves on only from the name: a step reached meanwhile is never taken back', () => {
    assert.equal(savedFrom(null), 'how')
    assert.equal(savedFrom('name'), 'how')
    assert.equal(savedFrom('how'), 'how')
    assert.equal(savedFrom('project'), 'project')
  })

  it('advances one step at a time, and ends after the project', () => {
    assert.equal(afterStep('name'), 'how')
    assert.equal(afterStep('how'), 'project')
    assert.equal(afterStep('project'), null)
  })

  it('skipping moves on (the how as «On my own»); only the last step’s way out ends it', () => {
    assert.deepEqual(afterSkip('name'), { next: 'how', team: false })
    assert.deepEqual(afterSkip('how'), { next: 'project', team: false })
    assert.deepEqual(afterSkip('project'), { next: null, team: false })
  })
})

describe('the name it offers', () => {
  it('the profile’s name, else the provider’s, never an email', () => {
    assert.equal(namePrefill('Luis Pérez', { name: 'luis@sophia.test', displayName: 'Luis P' }), 'Luis Pérez')
    assert.equal(namePrefill(null, { name: 'luis@sophia.test', displayName: 'Luis P' }), 'Luis P')
    assert.equal(namePrefill('  ', { name: 'luis@sophia.test', displayName: null }), '')
    assert.equal(namePrefill(null, { name: 'davide' }), 'davide')
    assert.equal(namePrefill('luis@sophia.test', { name: 'luis@sophia.test' }), '')
  })
})

/** A browser's storage, kept in a map. */
const store = () => {
  const kept = new Map<string, string>()
  return {
    kept,
    getItem: (k: string) => kept.get(k) ?? null,
    setItem: (k: string, v: string) => void kept.set(k, v),
  }
}

describe('where its end is remembered', () => {
  it('per account, on this browser', () => {
    const s = store()
    assert.equal(readFirstRunDone(s, 'acc-1'), false)
    rememberFirstRunDone(s, 'acc-1')
    assert.equal(s.kept.get(firstRunKey('acc-1')), 'done')
    assert.equal(readFirstRunDone(s, 'acc-1'), true)
    assert.equal(readFirstRunDone(s, 'acc-2'), false)
  })

  it('storage that throws, or none, never breaks Home', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    assert.equal(readFirstRunDone(broken, 'acc-1'), false)
    assert.doesNotThrow(() => rememberFirstRunDone(broken, 'acc-1'))
    assert.equal(readFirstRunDone(null, 'acc-1'), false)
    assert.doesNotThrow(() => rememberFirstRunDone(null, 'acc-1'))
  })
})

describe('its words, as approved', () => {
  it('says each step as Luis approved it', () => {
    assert.equal(FIRST_RUN.name.title, 'What should people in your projects call you?')
    assert.equal(FIRST_RUN.name.field, 'Your name')
    assert.equal(FIRST_RUN.name.go, 'Continue')
    assert.equal(FIRST_RUN.skip, 'Skip')
    assert.equal(FIRST_RUN.how.title, 'Will you work on your own or with a team?')
    assert.deepEqual(FIRST_RUN.how.alone, {
      title: 'On my own',
      note: 'A project for you and Sophia. You can invite people later.',
    })
    assert.deepEqual(FIRST_RUN.how.team, { title: 'With a team', note: 'A project you’ll invite people to.' })
    assert.equal(FIRST_RUN.project.title, 'Name your first project')
    assert.equal(FIRST_RUN.project.field, 'Project name')
    assert.equal(FIRST_RUN.project.go, 'Start the project')
    assert.equal(FIRST_RUN.project.notNow, 'Not now, just talk to Sophia')
  })
})
