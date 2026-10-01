import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HOME, joinStands, opensJoinPage, parseRoute, PLACES, projectOnScreen, routePath, VIEWS } from './route.ts'

const P = '6f1f3a52-4b8e-4c62-9d7e-0a1b2c3d4e5f'
const project = (view: string) => ({ projectId: P, view, place: 'work' })

describe('route', () => {
  it('round-trips every view of a project, and every place outside one', () => {
    for (const view of VIEWS) assert.deepEqual(parseRoute(routePath({ projectId: P, view })), project(view))
    for (const place of PLACES) assert.deepEqual(parseRoute(routePath({ ...HOME, place })), { ...HOME, place })
    assert.equal(routePath(HOME), '/')
    assert.equal(routePath({ ...HOME, place: 'personal' }), '/personal')
  })

  it('keeps links shared before S1-04 and tolerates case and a trailing slash', () => {
    assert.deepEqual(parseRoute(`/projects/${P}`), project('studio'))
    assert.deepEqual(parseRoute(`/p/${P.toUpperCase()}/work/`), project('work'))
    assert.deepEqual(parseRoute('/work/'), { ...HOME, place: 'work' })
  })

  it('falls back instead of showing a blank page', () => {
    assert.deepEqual(parseRoute(`/p/${P}`), project('studio'))
    assert.deepEqual(parseRoute(`/p/${P}/settings`), project('studio'))
    assert.deepEqual(parseRoute('/p/not-a-project/studio'), HOME)
    assert.deepEqual(parseRoute('/anything'), HOME)
    assert.deepEqual(parseRoute('/personal/notes'), HOME)
  })
})

describe('a join asked for on opening a project', () => {
  it('stands while that project is on screen', () => {
    assert.equal(joinStands('p1', 'p1'), 'p1')
  })

  it('is dropped once the person is anywhere else, so a later visit joins nothing on its own', () => {
    assert.equal(joinStands('p1', null), null)
    assert.equal(joinStands('p1', 'p2'), null)
    assert.equal(joinStands(null, 'p1'), null)
  })

  it('lets a sign-in link ask first, even when it lands on an invitation', () => {
    assert.equal(opensJoinPage('/join', 'link_offer'), false)
    assert.equal(opensJoinPage('/join/', 'signed_out'), true)
    assert.equal(opensJoinPage('/join', 'loading'), true)
    assert.equal(opensJoinPage('/join', 'signed_in'), true)
    assert.equal(opensJoinPage(`/p/${P}/studio`, 'signed_in'), false)
  })
})

describe('the project on screen', () => {
  it('is the one asked for, but while a call runs in another, that one until the call has left', () => {
    assert.equal(projectOnScreen('p2', null), 'p2')
    assert.equal(projectOnScreen('p1', 'p1'), 'p1')
    assert.equal(projectOnScreen('p2', 'p1'), 'p1', 'its controls stay in sight; the other opens after')
    assert.equal(projectOnScreen(null, 'p1'), null, 'in the places, the call goes on out of sight')
  })
})
