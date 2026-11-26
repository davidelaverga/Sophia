#!/usr/bin/env node
// Inside the dev stack's runtime container (scripts/lib/runtime-container.ts; docs/plans/dev-runtime-container.md):
// copy what git knows from the read-only checkout (/src) into the volume (/work/src) with git's modes, install and
// build there, reproduce every recorded artifact identity, then start scripts/runtime-host.mjs bound to the host's
// API. The manifest arrives as stdin's first line, JSON: [{ path, mode }]. Stdin then stays open while the dev stack
// runs; when it closes, the dev stack is gone (however it stopped), and the runtime is stopped with it.
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'

const SOURCE = '/src'
const WORK = '/work/src'
const PNPM_PREFIX = '/work/pnpm'
const PNPM_VERSION = '11.7.0'
const say = (text) => console.log(`[runtime-container] ${text}`)

const { values } = parseArgs({ options: { rehearse: { type: 'boolean', default: false } } })

let host = null
const input = createInterface({ input: process.stdin })
// Checked between steps too: the builds below hold the event loop, so a close then is only heard after them.
let parentGone = false
input.once('close', () => {
  parentGone = true
  say('the dev stack is gone; stopping the runtime')
  if (host) host.kill('SIGTERM')
  else process.exit(0)
})
const manifestLine = new Promise((done, fail) => {
  input.once('line', done)
  input.once('close', () => fail(new Error('no manifest on stdin')))
})

/** Every file under `dir` except inside node_modules: what an earlier copy left. */
function removeCopied(dir) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') removeCopied(path)
    } else rmSync(path, { force: true })
  }
}

function copy(manifest) {
  removeCopied(WORK)
  let copied = 0
  for (const { path, mode } of manifest) {
    const from = join(SOURCE, path)
    // A file git still lists but the checkout deleted is left out, as git would leave it out of a commit.
    if (!existsSync(from) || !statSync(from).isFile()) continue
    const to = join(WORK, path)
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to)
    chmodSync(to, mode)
    copied += 1
  }
  return copied
}

function step(command, args, env) {
  const run = spawnSync(command, args, { cwd: WORK, env, stdio: 'inherit' })
  if (run.status !== 0) {
    say(`${command} ${args.join(' ')} exited ${run.status ?? run.signal}`)
    process.exit(1)
  }
}

const manifest = JSON.parse(await manifestLine)
say(`copied ${copy(manifest)} files from the checkout`)

const env = {
  ...process.env,
  PATH: `${join(PNPM_PREFIX, 'bin')}:${process.env.PATH}`,
  CI: '1',
  npm_config_store_dir: '/work/store',
}
const installed = spawnSync('pnpm', ['--version'], { env, encoding: 'utf8' })
if (installed.stdout?.trim() !== PNPM_VERSION) step('npm', ['install', '-g', '--prefix', PNPM_PREFIX, `pnpm@${PNPM_VERSION}`], env)
step('pnpm', ['install', '--frozen-lockfile'], env)
step('pnpm', ['build'], env)
// Exits 1 on any identity this copy doesn't reproduce: then the runtime doesn't start.
step('node', ['scripts/build-artifacts.mjs'], env)

// Let a close that came during the builds be heard before the runtime starts.
await new Promise((done) => setImmediate(done))
if (parentGone) process.exit(0)
const root = join('/work/root', process.env.SOPHIA_PROJECT_ID ?? 'dev')
say(`runtime data: ${root} (volume sophia-dev-runtime)`)
host = spawn('node', ['scripts/runtime-host.mjs', '--root', root, ...(values.rehearse ? ['--rehearse'] : [])], {
  cwd: WORK,
  env,
  stdio: 'inherit',
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => host.kill(signal))
host.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
