import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

// Synthetic filesystem mechanics only. This does not implement or execute Q7.
const began = performance.now()
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'con01-cx148-'))
const oldRoot = path.join(root, 'gen-owned')
const sealedRoot = path.join(root, 'sealed-owned')
let leaseFd
let receipt
try {
  const oldHome = path.join(oldRoot, 'synthetic-attempt')
  fs.mkdirSync(oldHome, { recursive: true, mode: 0o700 })
  // Every O_EXCL lease write necessarily has this open-before-durable interval.
  leaseFd = fs.openSync(path.join(oldHome, 'lease.json'), 'wx', 0o600)
  assert.equal(fs.fstatSync(leaseFd).size, 0)
  fs.renameSync(oldRoot, sealedRoot)
  assert.equal(fs.existsSync(oldRoot), false)
  let byNameFailure
  try { fs.openSync(path.join(oldHome, 'another-file'), 'wx') }
  catch (err) { byNameFailure = err.code }
  assert.equal(byNameFailure, 'ENOENT')
  fs.writeSync(leaseFd, 'synthetic lease bytes written after rename\n')
  fs.fsyncSync(leaseFd)
  const sealedLease = path.join(sealedRoot, 'synthetic-attempt', 'lease.json')
  assert.equal(fs.readFileSync(sealedLease, 'utf8'), 'synthetic lease bytes written after rename\n')
  receipt = {
    checkpoint: 'CON-01-CX-0148', candidate: '971793db34d9f3f323448394f2096a5e959453c4',
    platform: process.platform, node: process.version, evidence: 'L1 owned filesystem mechanics only',
    oldRootAbsent: true, freshByNameOpen: byNameFailure,
    preexistingDescriptorWriteAfterRename: true, fsyncAfterRename: true,
    inferredQ7RetireFailure: false, runtimeLauncherOrChildExecuted: false,
    providerOrNetworkOrCredentials: false,
    limit: 'Confirms rename is not descriptor revocation and the proposed lease-durability interval needs accounting. Does not execute the proposed check/retire or force an in-flight mkdir race.',
  }
} finally {
  if (leaseFd !== undefined) fs.closeSync(leaseFd)
  fs.rmSync(root, { recursive: true, force: true })
}
assert.equal(fs.existsSync(root), false)
receipt.cleanup = { ownedDescriptorsClosed: true, scratchRemoved: true, processesStarted: 0 }
receipt.elapsedMs = Math.round((performance.now() - began) * 100) / 100
console.log(JSON.stringify(receipt, null, 2))
