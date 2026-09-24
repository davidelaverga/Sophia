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
import { ARTIFACTS_DIR, RUNTIME_UNIT_PATH, loadRuntimeUnit, writeJson } from './lib/common.mjs'
import { PROFILE_LOCK, buildArtifacts, getPath, setPath } from './lib/artifacts.mjs'
import { assertToolchain } from './lib/toolchain.mjs'

const record = process.argv.includes('--record')

assertToolchain()
const unit = loadRuntimeUnit()
const { facts, profileLock, lintFindings } = buildArtifacts(unit)
facts['sophia_bundle.artifact_digest'] = `sha256:${facts['sophia_bundle.archive_sha256']}`

if (lintFindings.length > 0) {
  console.error('patch layers are not the intended configuration:')
  for (const f of lintFindings) console.error(`  ${f.code} [${f.layer}] ${f.message}`)
  process.exit(1)
}

writeJson(`${ARTIFACTS_DIR}/identities.json`, facts)

if (record) {
  for (const [path, value] of Object.entries(facts)) setPath(unit, path, value)
  writeJson(RUNTIME_UNIT_PATH, unit)
  writeFileSync(PROFILE_LOCK, profileLock)
  console.log('recorded artifact identities:')
  for (const [path, value] of Object.entries(facts)) console.log(`  ${path} = ${JSON.stringify(value)}`)
  process.exit(0)
}

let mismatches = 0
for (const [path, value] of Object.entries(facts)) {
  const recorded = getPath(unit, path)
  const same = JSON.stringify(recorded) === JSON.stringify(value)
  if (!same) mismatches += 1
  console.log(`${same ? 'match   ' : 'MISMATCH'} ${path}\n         built    ${JSON.stringify(value)}${same ? '' : `\n         recorded ${JSON.stringify(recorded)}`}`)
}
let committedLock = null
try { committedLock = readFileSync(PROFILE_LOCK, 'utf8') } catch {}
const lockSame = committedLock === profileLock
if (!lockSame) mismatches += 1
console.log(`${lockSame ? 'match   ' : 'MISMATCH'} config/dsh/profile/pnpm-lock.yaml`)

if (mismatches > 0) {
  console.error(`\n${mismatches} identity mismatch(es): this checkout does not reproduce runtime unit ${unit.id}`)
  process.exit(1)
}
console.log(`\nruntime unit ${unit.id}: all artifact identities reproduced`)
