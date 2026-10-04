#!/usr/bin/env node
/**
 * Build the runtime artifact and the bundle archive, then compare their
 * identities with config/runtime-unit.json and config/dsh/profile/pnpm-lock.yaml.
 *
 *   pnpm artifacts           build and verify; exit 1 on any difference
 *   pnpm artifacts:record    build and write the identities into the committed files
 *
 * A clean second checkout running `pnpm install --frozen-lockfile && pnpm artifacts`
 * must reproduce every recorded identity (S1-01 acceptance).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { ARTIFACTS_DIR, RUNTIME_UNIT_PATH, loadRuntimeUnit, readJson, writeJson } from './lib/common.mjs'
import { profileLockPath, buildArtifacts, getPath, setPath } from './lib/artifacts.mjs'
import { assertToolchain } from './lib/toolchain.mjs'

const record = process.argv.includes('--record')

assertToolchain()
const unit = loadRuntimeUnit()
const { facts, profileLock, lintFindings } = buildArtifacts(unit)
const profileLockFile = profileLockPath()

if (lintFindings.length > 0) {
  console.error('patch layers are not the intended configuration:')
  for (const f of lintFindings) console.error(`  ${f.code} [${f.layer}] ${f.message}`)
  process.exit(1)
}

writeJson(`${ARTIFACTS_DIR}/identities.json`, facts)

if (record) {
  const canonical = readJson(RUNTIME_UNIT_PATH)
  for (const [path, value] of Object.entries(facts)) setPath(canonical, path, value)
  writeJson(RUNTIME_UNIT_PATH, canonical)
  writeFileSync(profileLockFile, profileLock)
  console.log('recorded artifact identities:')
  for (const [path, value] of Object.entries(facts)) console.log(`  ${path} = ${JSON.stringify(value)}`)
  process.exit(0)
}

let mismatches = 0
for (const [path, value] of Object.entries(facts)) {
  const recorded = getPath(unit, path)
  if (recorded === undefined) {
    mismatches += 1
    console.log(`UNRECORDED ${path}\n         built    ${JSON.stringify(value)}\n         nothing is recorded for this platform yet (primary: ${unit.dsh.artifact_primary_platform}); record it with \`pnpm artifacts:record\` in a reviewed commit`)
    continue
  }
  const same = JSON.stringify(recorded) === JSON.stringify(value)
  if (!same) mismatches += 1
  console.log(`${same ? 'match   ' : 'MISMATCH'} ${path}\n         built    ${JSON.stringify(value)}${same ? '' : `\n         recorded ${JSON.stringify(recorded)}`}`)
}
let committedLock = null
try { committedLock = readFileSync(profileLockFile, 'utf8') } catch {}
const lockSame = committedLock === profileLock
if (!lockSame) mismatches += 1
console.log(`${lockSame ? 'match   ' : 'MISMATCH'} ${profileLockFile}`)

if (mismatches > 0) {
  console.error(`\n${mismatches} identity mismatch(es): this checkout does not reproduce runtime unit ${unit.id}`)
  process.exit(1)
}
console.log(`\nruntime unit ${unit.id}: all artifact identities reproduced`)
