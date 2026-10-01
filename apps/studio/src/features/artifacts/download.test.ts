import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'
import { checkedBlob, HashMismatch, sha256Hex, utf8 } from './download.ts'

describe('a download is the version on screen', () => {
  const text = '# Report\nHosts — sandboxed.\n'
  const sha = createHash('sha256').update(text, 'utf8').digest('hex')

  it('hashes the stored bytes (UTF-8) as the service does', async () => {
    assert.equal(await sha256Hex(utf8(text)), sha)
  })

  it('saves bytes whose hash matches the record, and refuses any other', async () => {
    const blob = await checkedBlob(utf8(text), sha.toUpperCase(), 'text/markdown')
    assert.equal(await blob.text(), text)
    assert.equal(blob.type, 'text/markdown')
    await assert.rejects(checkedBlob(utf8(`${text} `), sha, 'text/markdown'), HashMismatch)
  })
})
