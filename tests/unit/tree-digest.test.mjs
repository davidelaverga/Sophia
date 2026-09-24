import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { treeDigest } from '../../scripts/lib/tree-digest.mjs'

function fixture(binShimText, stateText) {
  const root = mkdtempSync(join(tmpdir(), 'tree-digest-'))
  mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true })
  mkdirSync(join(root, 'node_modules', 'pkg', 'lib'), { recursive: true })
  writeFileSync(join(root, 'node_modules', 'pkg', 'lib', 'bin.js'), 'console.log(1)\n')
  chmodSync(join(root, 'node_modules', 'pkg', 'lib', 'bin.js'), 0o755)
  writeFileSync(join(root, 'node_modules', '.bin', 'pkg'), binShimText)
  writeFileSync(join(root, 'node_modules', '.modules.yaml'), stateText)
  symlinkSync('pkg', join(root, 'node_modules', 'alias'))
  return root
}

test('the digest ignores location-bound shims and install-time bookkeeping', () => {
  const a = fixture('#!/bin/sh\nexport NODE_PATH=/one/place\n', 'prunedAt: Mon\n')
  const b = fixture('#!/bin/sh\nexport NODE_PATH=/another/place\n', 'prunedAt: Tue\n')
  try {
    assert.equal(treeDigest(a).digest, treeDigest(b).digest)
    assert.match(treeDigest(a).digest, /^sophia-tree-v1:sha256:[0-9a-f]{64}$/)
  } finally {
    rmSync(a, { recursive: true }); rmSync(b, { recursive: true })
  }
})

test('the digest changes with file content, exec bit and link target', () => {
  const root = fixture('', '')
  try {
    const before = treeDigest(root).digest
    writeFileSync(join(root, 'node_modules', 'pkg', 'lib', 'bin.js'), 'console.log(2)\n')
    const content = treeDigest(root).digest
    assert.notEqual(before, content)
    chmodSync(join(root, 'node_modules', 'pkg', 'lib', 'bin.js'), 0o644)
    const mode = treeDigest(root).digest
    assert.notEqual(content, mode)
    rmSync(join(root, 'node_modules', 'alias'))
    symlinkSync('pkg/lib', join(root, 'node_modules', 'alias'))
    assert.notEqual(mode, treeDigest(root).digest)
  } finally {
    rmSync(root, { recursive: true })
  }
})
