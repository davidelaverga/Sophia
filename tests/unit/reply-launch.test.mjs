// Filesystem primitives only. A passing unittest run does not qualify Linux containment.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

test('reply launcher portable filesystem checks (containment held)', () => {
  const result = spawnSync('python3', ['-I', '-m', 'unittest', 'discover', '-s',
    'apps/execution-host/reply', '-p', 'test_*.py'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    encoding: 'utf8', timeout: 30_000, maxBuffer: 1_048_576,
  })
  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(result.signal, null, result.stderr)
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stderr, /Ran [1-9][0-9]* tests? in /)
})
