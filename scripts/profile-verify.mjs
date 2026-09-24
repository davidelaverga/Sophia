#!/usr/bin/env node
/**
 * Run the composition gate against an already installed Harness home.
 *
 *   pnpm profile:verify [--home <dir>] [--json]
 */

import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DEFAULT_HOME_ROOT, RUNTIME_DIR, loadRuntimeUnit } from './lib/common.mjs'
import { verifyProfile } from './lib/gate.mjs'
import { homeLayout } from './lib/profile.mjs'

const { values } = parseArgs({ options: { home: { type: 'string' }, json: { type: 'boolean', default: false } } })
const unit = loadRuntimeUnit()
const layout = homeLayout(resolve(values.home ?? join(DEFAULT_HOME_ROOT, unit.id)))
const gate = verifyProfile({ unit, runtimeDir: RUNTIME_DIR, ...layout })

if (values.json) {
  console.log(JSON.stringify({ ok: gate.ok, health: gate.health, checks: gate.checks }, null, 2))
} else {
  for (const c of gate.checks) {
    console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.id}`)
    for (const f of c.findings) console.log(`       ${f.code}: ${f.message}`)
  }
  console.log(`composition ${gate.ok ? 'verified' : 'REJECTED'}; healthy=${gate.health.healthy}`)
}
process.exit(gate.ok ? 0 : 1)
