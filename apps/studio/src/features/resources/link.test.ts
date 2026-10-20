import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
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

describe('a sheet’s link has one builder (#413)', () => {
  it('only resources/link.ts joins the page’s origin, path and query with a link hash', () => {
    const src = new URL('../../', import.meta.url)
    // `${origin}${pathname}${search}${linkHash(`, the location's fields read whole or destructured.
    const join =
      /\$\{(?:window\.location\.)?origin\}\$\{(?:window\.location\.)?pathname\}\$\{(?:window\.location\.)?search\}\$\{linkHash\(/
    const builders = readdirSync(src, { recursive: true, encoding: 'utf8' })
      .map((path) => path.replaceAll('\\', '/'))
      .filter((path) => /\.tsx?$/.test(path) && !path.endsWith('.test.ts'))
      .filter((path) => join.test(readFileSync(new URL(path, src), 'utf8')))
    assert.deepEqual(builders, ['features/resources/link.ts'])
  })
})
