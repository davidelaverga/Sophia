import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { test } from 'node:test'
import { pnpmBinDir, sanitizedEnv } from '../../scripts/lib/common.mjs'

test('the pinned pnpm directory is found on PATH even when it is not beside node', () => {
  const root = mkdtempSync(join(tmpdir(), 'launch-env-'))
  try {
    const empty = join(root, 'empty')
    const pnpmDir = join(root, 'setup-pnpm', 'bin')
    mkdirSync(empty, { recursive: true })
    mkdirSync(pnpmDir, { recursive: true })
    writeFileSync(join(pnpmDir, 'pnpm'), '#!/bin/sh\n')
    chmodSync(join(pnpmDir, 'pnpm'), 0o755)
    assert.equal(pnpmBinDir([empty, pnpmDir].join(delimiter)), pnpmDir)
    assert.throws(() => pnpmBinDir(empty), /pnpm is not on PATH/)
  } finally {
    rmSync(root, { recursive: true })
  }
})

test('the launch environment is explicit: no inherited variables beyond the fixed set', () => {
  const root = mkdtempSync(join(tmpdir(), 'launch-env-'))
  try {
    const env = sanitizedEnv({ dshHome: join(root, 'dsh-home'), home: join(root, 'home') })
    assert.deepEqual(Object.keys(env).toSorted(), [
      'DSH_HOME',
      'DSH_TELEMETRY_DISABLED',
      'HOME',
      'LANG',
      'PATH',
      'TMPDIR',
    ])
    const path = env.PATH.split(':')
    assert.equal(path[0], dirname(process.execPath))
    assert.ok(path.includes(pnpmBinDir()))
    assert.deepEqual(path.slice(-2), ['/usr/bin', '/bin'])
    assert.equal(env.TMPDIR, join(root, 'home', 'tmp'))
  } finally {
    rmSync(root, { recursive: true })
  }
})
