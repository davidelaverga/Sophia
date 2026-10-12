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
