import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '../../api/client.ts'
import { blockedBy, isStale, readsServedBoard, shownConnection, STALE_RETRY_MS, staleRetry } from './project-door.ts'

const refused = (status: number) => new ApiError(status, `http_${status}`, 'refused', 'never')
const outage = new ApiError(503, 'http_503', 'Service Unavailable', 'never')
const offline = new TypeError('Failed to fetch')

describe('whether the project can be shown', () => {
  it('shows it while the snapshot answers', () => {
    assert.equal(blockedBy(null, true), null)
    assert.equal(blockedBy(null, false), null)
  })

  it('a closed door blocks it, whatever was on screen', () => {
    assert.equal(blockedBy(refused(401), true), 'expired')
    assert.equal(blockedBy(refused(401), false), 'expired')
    assert.equal(blockedBy(refused(403), true), 'denied')
    assert.equal(blockedBy(refused(403), false), 'denied')
  })

  it('a refresh that fails keeps a loaded project on screen: the room and its controls stay', () => {
    assert.equal(blockedBy(outage, true), null)
    assert.equal(blockedBy(offline, true), null)
    assert.equal(isStale(outage, true), true)
    assert.equal(isStale(offline, true), true)
  })

  it('a project that never loaded says it is unreachable', () => {
    assert.equal(blockedBy(outage, false), 'unreachable')
    assert.equal(blockedBy(offline, false), 'unreachable')
    assert.equal(isStale(outage, false), false)
  })

  it('a closed door is never a stale view', () => {
    assert.equal(isStale(refused(401), true), false)
    assert.equal(isStale(refused(403), true), false)
    assert.equal(isStale(null, true), false)
  })
})

describe('what the bar says about the feed', () => {
  it('says nothing while blocked: the notice says why', () => {
    assert.equal(shownConnection('live', 'denied', false), null)
    assert.equal(shownConnection('connecting', 'unreachable', false), null)
  })

  it('says Reconnecting while the view on screen is stale, even if the stream is up', () => {
    assert.equal(shownConnection('live', null, true), 'reconnecting')
  })

  it('otherwise says what the feed says', () => {
    assert.equal(shownConnection('live', null, false), 'live')
    assert.equal(shownConnection('resyncing', null, false), 'resyncing')
  })
})

describe('asking again', () => {
  it('a stale view asks again every few seconds; a closed door and a healthy view do not', () => {
    assert.equal(staleRetry(outage, true), STALE_RETRY_MS)
    assert.equal(staleRetry(refused(403), true), false)
    assert.equal(staleRetry(null, true), false)
    assert.equal(staleRetry(outage, false), false)
  })
})

describe('the work board Sophia serves', () => {
  it('is read only while Tasks is in view', () => {
    assert.equal(readsServedBoard('work', null, false), true)
    for (const view of ['studio', 'goals', 'knowledge', 'updates', 'resources'] as const) {
      assert.equal(readsServedBoard(view, null, false), false, view)
    }
  })

  it('is not read behind a closed door, or where the page brings its own plans', () => {
    assert.equal(readsServedBoard('work', 'denied', false), false)
    assert.equal(readsServedBoard('work', 'unreachable', false), false)
    assert.equal(readsServedBoard('work', null, true), false)
  })
})
