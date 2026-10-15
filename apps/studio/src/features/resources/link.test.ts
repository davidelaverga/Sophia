import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { requestAddress, requestOf } from './link.ts'

describe('a request’s address (Codex on #245)', () => {
  it('names the request with its resource, each part whole, and reads a bare id as before', () => {
    assert.deepEqual(requestOf(requestAddress('res/1', 'req 2/b')), { resourceId: 'res/1', requestId: 'req 2/b' })
    assert.deepEqual(requestOf(requestAddress(null, 'req-1')), { resourceId: null, requestId: 'req-1' })
    assert.deepEqual(requestOf('req-1'), { resourceId: null, requestId: 'req-1' })
  })
})

describe('a bare request id holding a slash (Codex P2 on #245)', () => {
  it('reads back whole, never split into a resource and a request', () => {
    assert.deepEqual(requestOf(requestAddress(null, 'requests/123')), { resourceId: null, requestId: 'requests/123' })
    assert.deepEqual(requestOf(requestAddress('res', 'requests/123')), { resourceId: 'res', requestId: 'requests/123' })
  })
})
