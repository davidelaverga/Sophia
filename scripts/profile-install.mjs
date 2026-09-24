#!/usr/bin/env node
/**
 * Install the sophia-runtime profile from the recorded artifacts into an
 * isolated Harness home, run the composition gate, and optionally boot it.
 *
 *   pnpm profile:install [--home <dir>] [--force] [--boot <seconds>] [--evidence <dir>]
 *
 * Default home: <tmpdir>/sophia-next/<runtime unit id> (never inside the product tree).
 * Exit 0 only when the install succeeded, the composition gate passed, and
 * (with --boot) the bridge row loaded with no startup failure.
 */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DEFAULT_HOME_ROOT, REPO_ROOT, RUNTIME_DIR, loadRuntimeUnit, normalizePaths, writeJson } from './lib/common.mjs'
import { verifyProfile } from './lib/gate.mjs'
import { assertRecordedArtifacts, bootProfile, homeLayout, installProfile } from './lib/profile.mjs'
import { assertToolchain } from './lib/toolchain.mjs'

const { values } = parseArgs({
  options: {
    home: { type: 'string' },
    force: { type: 'boolean', default: false },
    boot: { type: 'string' },
    evidence: { type: 'string' },
  },
})

assertToolchain()
const unit = loadRuntimeUnit()
const layout = homeLayout(resolve(values.home ?? join(DEFAULT_HOME_ROOT, unit.id)))
assertRecordedArtifacts(unit, RUNTIME_DIR)

const placeholders = {
  [layout.root]: '<INSTALL>',
  [RUNTIME_DIR]: '<RUNTIME>',
  [REPO_ROOT]: '<REPO>',
  [dirname(process.execPath)]: '<NODE_BIN>',
}
const norm = (text) => normalizePaths(text, placeholders)
const evidence = values.evidence ? resolve(values.evidence) : null
const save = (name, text) => {
  if (!evidence) return
  mkdirSync(dirname(join(evidence, name)), { recursive: true })
  writeFileSync(join(evidence, name), norm(text))
}

const install = installProfile({ unit, runtimeDir: RUNTIME_DIR, layout, force: values.force })
console.log(`installed profile ${unit.dsh.profile} at ${layout.dshHome}`)
save(
  'install.log',
  `$ dsh plugin --profile ${unit.dsh.profile} install --frozen-lockfile --offline\n${install.stdout}${install.stderr}`,
)
const profileDir = join(layout.dshHome, 'profiles', unit.dsh.profile)
save('installed-profile/package.json', readFileSync(join(profileDir, 'package.json'), 'utf8'))
save('installed-profile/cordis.patch.yml', readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8'))

const gate = verifyProfile({ unit, runtimeDir: RUNTIME_DIR, ...layout })
for (const c of gate.checks) {
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.id}`)
  for (const f of c.findings) console.log(`       ${f.code}: ${f.message}`)
}
console.log(
  `composition ${gate.ok ? 'verified' : 'REJECTED'}; healthy=${gate.health.healthy} (${gate.health.reasons.join('; ')})`,
)
save('dump-config.yml', gate.dump.stdout)
save('dump-config.stderr.txt', gate.dump.stderr)
if (evidence)
  writeJson(
    join(evidence, 'gate.json'),
    JSON.parse(
      norm(JSON.stringify({ ok: gate.ok, health: gate.health, checks: gate.checks, dump_status: gate.dump.status })),
    ),
  )

let bootOk = true
if (values.boot) {
  const seconds = Number(values.boot)
  const boot = bootProfile({ unit, runtimeDir: RUNTIME_DIR, layout, seconds })
  const stillRunning = boot.timedOut
  bootOk = stillRunning && boot.bridgeLine !== null && boot.diagnostics.length === 0
  console.log(
    `boot: ${stillRunning ? `running at the ${seconds}s deadline; SIGTERM disposed it (exit ${boot.status ?? boot.signal})` : `exited on its own before the deadline (${boot.status ?? boot.signal})`}`,
  )
  console.log(`boot: bridge ${boot.bridgeLine ?? 'row DID NOT LOAD'}`)
  for (const log of boot.diagnostics) {
    console.log(`boot: startup diagnostics retained: ${log}`)
    if (evidence) {
      mkdirSync(join(evidence, 'startup-diagnostics'), { recursive: true })
      copyFileSync(log, join(evidence, 'startup-diagnostics', log.split('/').at(-1)))
    }
  }
  save('boot.stderr.txt', boot.stderr)
  save('boot.stdout.txt', boot.stdout)
  if (evidence)
    writeJson(join(evidence, 'boot.json'), {
      seconds,
      exit_status_after_sigterm: boot.status,
      signal: boot.signal,
      still_running_at_deadline: stillRunning,
      bridge_line: boot.bridgeLine,
      startup_diagnostics: boot.diagnostics.map((p) => norm(p)),
    })
}

process.exit(gate.ok && bootOk ? 0 : 1)
