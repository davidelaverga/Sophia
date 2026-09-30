import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectRuntimeUnit } from '../../scripts/lib/common.mjs'
import { profileLockPath } from '../../scripts/lib/artifacts.mjs'
const unit = { dsh: { artifact_primary_platform: 'linux-x64' }, sophia_bundle: {
  archive_integrity: 'linux-integrity', archive_sha256: 'linux-sha', artifact_digest: 'sha256:linux-sha',
  archives_by_platform: { 'darwin-arm64': { archive_integrity: 'darwin-integrity', archive_sha256: 'darwin-sha', artifact_digest: 'sha256:darwin-sha' } },
} }
test('Darwin archive selection preserves canonical Linux facts and uses its own frozen lock', () => {
  const selected = selectRuntimeUnit(unit, 'darwin-arm64')
  assert.equal(selected.sophia_bundle.archive_integrity, 'darwin-integrity')
  assert.equal(selected.sophia_bundle.artifact_digest, 'sha256:darwin-sha')
  assert.equal(unit.sophia_bundle.archive_integrity, 'linux-integrity')
  assert.match(profileLockPath(unit, 'darwin-arm64'), /pnpm-lock\.darwin-arm64\.yaml$/)
})
test('Linux keeps its canonical bundle identity and production lock', () => {
  assert.equal(selectRuntimeUnit(unit, 'linux-x64'), unit)
  assert.match(profileLockPath(unit, 'linux-x64'), /profile\/pnpm-lock\.yaml$/)
})
