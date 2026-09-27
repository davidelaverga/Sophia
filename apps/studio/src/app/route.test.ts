import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HOME, parseRoute, routePath, VIEWS } from './route.ts'

const P = '6f1f3a52-4b8e-4c62-9d7e-0a1b2c3d4e5f'

describe('route', () => {
  it('round-trips every view of a project', () => {
    for (const view of VIEWS) assert.deepEqual(parseRoute(routePath({ projectId: P, view })), { projectId: P, view })
    assert.equal(routePath(HOME), '/')
  })

  it('keeps links shared before S1-04 and tolerates case and a trailing slash', () => {
    assert.deepEqual(parseRoute(`/projects/${P}`), { projectId: P, view: 'studio' })
    assert.deepEqual(parseRoute(`/p/${P.toUpperCase()}/work/`), { projectId: P, view: 'work' })
  })

  it('falls back instead of showing a blank page', () => {
    assert.deepEqual(parseRoute(`/p/${P}`), { projectId: P, view: 'studio' })
    assert.deepEqual(parseRoute(`/p/${P}/settings`), { projectId: P, view: 'studio' })
    assert.deepEqual(parseRoute('/p/not-a-project/studio'), HOME)
    assert.deepEqual(parseRoute('/anything'), HOME)
  })
})
