import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  prototypeEntrySha256,
  prototypeFileIdentity,
  prototypeManifestSha256,
  PROTOTYPE_ENTRY_MAX_BYTES,
} from './prototype-manifest.ts'

test('matches the founder pilot byte, version and bound export digests without rewriting CRLF', () => {
  const bytes = Buffer.from('PCFkb2N0eXBlIGh0bWw+DQo8dGl0bGU+RmljdGlvbmFsIGJ5dGUgZml4dHVyZTwvdGl0bGU+DQo=', 'base64')
  const file = prototypeFileIdentity(bytes, 'synthetic-source-2')
  assert.ok(file)
  assert.equal(file.sha256, 'a3ed7c032902c87b2b202beb066f493ed463bc84d51977b77f0831fdc662002b')
  assert.notEqual(prototypeEntrySha256(Buffer.from(bytes.toString().replaceAll('\r\n', '\n'))), file.sha256)
  const manifest = {
    versionId: 'synthetic-v2',
    parentVersionId: 'synthetic-v1',
    format: 'sophia.prototype.v1',
    files: [{ ...file }],
    entry: 'index.html',
    directionId: 'B',
    artifactId: 'synthetic-artifact',
  }
  const versionSha = prototypeManifestSha256(manifest)
  assert.equal(versionSha, 'c824e1c803724bc921c63649cca5024b069ee8b53136490218a19fc05e5c3798')
  const exportRecord = {
    approvalId: 'synthetic-approval',
    approvalManifestSha256: versionSha,
    criteria: ['C-01'],
    files: [{ ...file }],
    format: 'sophia.founder-export.v1',
    recipient: 'synthetic-owner',
    repoId: 'synthetic-repo',
    seedCommit: '0'.repeat(40),
  }
  const exportHash = prototypeManifestSha256(exportRecord)
  assert.equal(exportHash, '7c74f070a1a4c21b1c831c6dca6ab70094b5f305c15fbf45eb248730095cb09d')
  assert.notEqual(prototypeManifestSha256({ ...exportRecord, repoId: 'changed-repo' }), exportHash)
})

test('enforces the decoded file limit and valid Unicode for manifest and source', () => {
  assert.ok(prototypeEntrySha256(Buffer.alloc(PROTOTYPE_ENTRY_MAX_BYTES, 'a')))
  assert.equal(prototypeEntrySha256(Buffer.alloc(PROTOTYPE_ENTRY_MAX_BYTES + 1, 'a')), null)
  assert.equal(prototypeEntrySha256(Uint8Array.of(0xc0, 0xaf)), null)
  assert.equal(prototypeEntrySha256(new Uint8Array()), null)
  assert.throws(() => prototypeManifestSha256({ unsafe: 2 ** 53 }), /safe integers/)
  assert.throws(() => prototypeManifestSha256({ unsafe: '\ud800' }), /well-formed/)
  assert.notEqual(prototypeManifestSha256({ criteria: ['A', 'B'] }), prototypeManifestSha256({ criteria: ['B', 'A'] }))
})
