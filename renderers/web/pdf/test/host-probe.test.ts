// SMC-M03 OP-C: the renderer host probe (host-probe.mjs) on this host. It qualifies a host before its runner is
// registered, so a probe that passes when it should not is the failure that matters: the negative control gives the
// job context a file it can read and requires the probe to fail on it, by name, with a non-zero exit. Like the kernel
// tests, it skips on a host without the confined renderer and says why; CI sets SOPHIA_RENDERER_REQUIRED=1.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromiumPath } from '../index.mjs'
import { probeHost } from '../host-probe.mjs'

const PROBE = fileURLToPath(new URL('../host-probe.mjs', import.meta.url))
const root = process.getuid?.() === 0

/** As root, the supervisor names its render user; anyone else runs the browser as themselves. */
const env: NodeJS.ProcessEnv = root
  ? { ...process.env, SOPHIA_RENDER_UID: process.env.SOPHIA_RENDER_UID ?? '1000' }
  : { ...process.env }
delete env.SOPHIA_API_URL
delete env.SOPHIA_RENDER_RUNNER_TOKEN_FILE

function unavailable(): string | null {
  if (process.platform !== 'linux') return `the confined renderer runs on Linux only (here: ${process.platform})`
  const browser = chromiumPath(env)
  if (!fs.existsSync(browser)) return `no headless shell at ${browser}`
  const probe = spawnSync('unshare', ['--user', '--map-current-user', '--net', '--pid', '--fork', 'true'], {
    encoding: 'utf8',
  })
  if (probe.status !== 0) return `user namespaces are not available: ${probe.stderr.trim()}`
  return null
}
const why = unavailable()
if (why && process.env.SOPHIA_RENDERER_REQUIRED === '1') throw new Error(`the renderer is required: ${why}`)
const skip = why ?? false

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sophia-probe-test-'))
fs.chmodSync(scratch, 0o755)
after(() => fs.rmSync(scratch, { recursive: true, force: true }))

/**
 * The Node binary the checks inside run under: this one, unless the render user cannot execute it (a toolchain under
 * root's home), in which case a copy it can.
 */
function nodeForRenderUser(): string {
  if (!root || why) return process.execPath
  const uid = env.SOPHIA_RENDER_UID ?? '1000'
  // Tried the way the probe runs it: as the render user, inside a fresh user namespace.
  const asUser = [`--reuid=${uid}`, `--regid=${uid}`, '--clear-groups']
  const run = spawnSync('setpriv', [...asUser, 'unshare', '--user', '--map-current-user', process.execPath, '-v'])
  if (run.status === 0) return process.execPath
  const copy = path.join(scratch, 'node')
  fs.copyFileSync(process.execPath, copy)
  fs.chmodSync(copy, 0o755)
  return copy
}
const node = nodeForRenderUser()

/** A file the render user can read: the negative control. */
function readableSecret(): string {
  const file = path.join(scratch, 'readable-secret')
  fs.writeFileSync(file, 'not a secret', { mode: 0o644 })
  fs.chmodSync(file, 0o644)
  return file
}

describe('the renderer host probe (OP-C)', () => {
  it('passes every check on a host whose confinement holds', { skip }, async () => {
    const results = await probeHost({ env, node })
    assert.deepEqual(
      results.filter((r) => !r.ok),
      [],
    )
    const names = results.map((r) => r.check.split(':')[0])
    for (const check of [
      'render',
      'kernel_checks',
      'sandbox',
      'public_tcp',
      'dns',
      'metadata',
      'api_host',
      'supervisor_environment',
    ]) {
      assert.ok(names.includes(check), check)
    }
  })

  it(
    'fails on a file the job context can read, naming it, and the command exits non-zero (negative control)',
    { skip },
    async () => {
      const file = readableSecret()
      const results = await probeHost({ env, node, secrets: [file] })
      assert.deepEqual(
        results.filter((r) => !r.ok).map((r) => r.check),
        [`unreadable:${file}`],
      )
      const run = spawnSync(process.execPath, [PROBE, '--secret', file, '--node', node], {
        env,
        encoding: 'utf8',
        timeout: 120_000,
      })
      assert.equal(run.status, 1, run.stderr)
      const lines = run.stdout
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as { check: string; ok: boolean })
      assert.deepEqual(
        lines.filter((r) => !r.ok).map((r) => r.check),
        [`unreadable:${file}`],
      )
    },
  )

  it(
    'passes on a secret only the supervisor can read (as root, with a render user)',
    { skip: skip || (root ? false : 'needs root and a render user') },
    async () => {
      const file = path.join(scratch, 'runner-token')
      fs.writeFileSync(file, 'token', { mode: 0o600 })
      const results = await probeHost({ env: { ...env, SOPHIA_RENDER_RUNNER_TOKEN_FILE: file }, node })
      const check = results.find((r) => r.check === `unreadable:${file}`)
      assert.equal(check?.ok, true, check?.detail)
      assert.deepEqual(
        results.filter((r) => !r.ok),
        [],
      )
    },
  )
})
