import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'
import { LIBRARY_TEXTS } from '../../../fixtures/demo-library.ts'

// The demo's library is read as any report is: the viewer and the covers refuse a text whose hash is not its own.
describe('the demo library’s texts', () => {
  it('each match their recorded SHA-256', () => {
    for (const t of LIBRARY_TEXTS) {
      assert.equal(createHash('sha256').update(t.text, 'utf8').digest('hex'), t.sha256, t.sourceId)
    }
  })
})
