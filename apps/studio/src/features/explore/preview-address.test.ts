import assert from 'node:assert/strict'
import { test } from 'node:test'
import { previewAddress, type PreviewPermit } from './preview-address.ts'

const now = Date.parse('2026-11-22T09:00:00Z')
const version = { entrySha256: 'a'.repeat(64), manifestSha256: 'b'.repeat(64) }
const content = 'https://preview.example.test'
const permit = {
  ...version,
  url: `${content}/v1/previews/token_1/index.html`,
  expiresAt: '2026-11-22T09:09:00Z',
}
const open = (value: PreviewPermit, origin = content) =>
  previewAddress(value, version, {
    contentOrigin: origin,
    studioOrigin: 'https://studio.example.test',
    apiOrigin: 'https://api.example.test',
    now,
  })

test('a fresh exact-version grant may open the configured separate content origin', () => {
  assert.equal(open(permit)?.href, permit.url)
})

test('rejects expired or mismatched grants and unexpected origins or paths', () => {
  assert.equal(open({ ...permit, expiresAt: '2026-11-22T09:00:00Z' }), null)
  assert.equal(open({ ...permit, expiresAt: '2026-11-22T09:11:00Z' }), null)
  assert.equal(open({ ...permit, entrySha256: 'c'.repeat(64) }), null)
  assert.equal(open({ ...permit, manifestSha256: 'c'.repeat(64) }), null)
  assert.equal(open({ ...permit, url: `${permit.url}?key=other` }), null)
  assert.equal(open({ ...permit, url: `${content}/v1/previews/token_1/other.html` }), null)
  assert.equal(open({ ...permit, url: permit.url.replace('preview.', 'studio.') }), null)
  for (const host of ['studio', 'api']) {
    const origin = `https://${host}.example.test:9000`
    assert.equal(open({ ...permit, url: `${origin}/v1/previews/token_1/index.html` }, origin), null)
  }
})
