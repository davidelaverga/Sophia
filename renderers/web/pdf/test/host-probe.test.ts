// SMC-M03 OP-C: the renderer host probe (host-probe.mjs) on this host. It qualifies a host before its runner is
// registered, so a probe that passes when it should not is the failure that matters: the negative control gives the
// job context a file it can read and requires the probe to fail on it, by name, with a non-zero exit. Like the kernel
// tests, it skips on a host without the confined renderer and says why; CI sets SOPHIA_RENDERER_REQUIRED=1. A check the
// probe could not perform (no API host to try, one this host cannot reach either, no runner token file, a secret that
// is not there) fails on any host (M03-RF-0019).
// Without root there is no render user: the job context runs as the supervisor and reads the supervisor's own runner
// token, so the probe fails exactly that check, as it must. As root, with a render user, every check passes.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
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

/**
 * The API the supervisor would talk to: a listener on this host's loopback, reachable here and, if the network
 * namespace holds, not from the job context.
 */
const api = net.createServer((socket) => socket.end())
let apiEnv: NodeJS.ProcessEnv = env
before(async () => {
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve))
  const { port } = api.address() as net.AddressInfo
  apiEnv = { ...env, SOPHIA_API_URL: `http://127.0.0.1:${String(port)}` }
})
after(() => api.close())

/** A file the render user can read: the negative control. */
function readableSecret(): string {
  const file = path.join(scratch, 'readable-secret')
  fs.writeFileSync(file, 'not a secret', { mode: 0o644 })
  fs.chmodSync(file, 0o644)
  return file
}

/** The supervisor's runner token: only its owner may read it. */
const token = path.join(scratch, 'runner-token')
fs.writeFileSync(token, 'token', { mode: 0o600 })
/** Without a render user the job context is the supervisor, and its token is the one check that must fail. */
const tokenFailure = root ? [] : [`unreadable:${token}`]

/** The supervisor's environment, with the API and its runner token. */
const supervisorEnv = (): NodeJS.ProcessEnv => ({ ...apiEnv, SOPHIA_RENDER_RUNNER_TOKEN_FILE: token })

/** A port nothing listens on, on this host's loopback. */
async function closedPort(): Promise<number> {
  const server = net.createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as net.AddressInfo
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

const failed = (results: { check: string; ok: boolean }[]) => results.filter((r) => !r.ok).map((r) => r.check)

/** A check that must not pass: its detail, after asserting it is there and failed. */
function notPassed(results: { check: string; ok: boolean; detail: string }[], check: string): string {
  const result = results.find((r) => r.check === check)
  assert.equal(result?.ok, false, check)
  return result.detail
}

/** The supervisor's environment with no browser: quick, for the checks that never render. */
const quick: NodeJS.ProcessEnv = { ...env, SOPHIA_CHROMIUM_PATH: path.join(scratch, 'no-browser') }

describe('the renderer host probe (OP-C)', () => {
  it('a render that did not happen passes no check, on any host', async () => {
    const results = await probeHost({ env: { ...env, SOPHIA_CHROMIUM_PATH: path.join(scratch, 'no-browser') }, node })
    const byName = new Map(results.map((r) => [r.check, r]))
    assert.equal(byName.get('render')?.ok, false)
    assert.deepEqual(byName.get('kernel_checks'), {
      check: 'kernel_checks',
      ok: false,
      detail: 'not run: no PDF was rendered',
    })
    assert.equal(byName.get('sandbox')?.ok, false)
    // SDD-01: nor does a capture that did not happen.
    assert.equal(byName.get('capture')?.ok, false)
    for (const check of ['capture_checks', 'capture_images'])
      assert.deepEqual(byName.get(check), { check, ok: false, detail: 'not run: nothing was captured' })
    assert.equal(byName.get('capture_sandbox')?.ok, false)
  })

  it('a check that was not performed is a failure, never a pass, on any host', async () => {
    const missing = path.join(scratch, 'no-such-secret')
    const unset = await probeHost({ env: quick, node, secrets: [missing] })
    assert.match(notPassed(unset, 'api_host'), /^not run: SOPHIA_API_URL is not set/)
    assert.match(notPassed(unset, 'runner_token_file'), /^not run: SOPHIA_RENDER_RUNNER_TOKEN_FILE is not set/)
    assert.match(notPassed(unset, `unreadable:${missing}`), /^not run: .* does not exist on this host$/)
    const missingToken = await probeHost({ env: { ...quick, SOPHIA_RENDER_RUNNER_TOKEN_FILE: missing }, node })
    assert.match(notPassed(missingToken, `unreadable:${missing}`), /^not run: /)
  })

  it('an API host that cannot be tried, or that this host cannot reach either, is not run, on any host', async () => {
    const port = String(await closedPort())
    for (const [url, check, detail] of [
      [
        'https://sophia-probe.invalid',
        'api_host:sophia-probe.invalid:443',
        /^not run: .* does not resolve on this host$/,
      ],
      ['not a url', 'api_host', /^not run: SOPHIA_API_URL is not a URL$/],
      ['file:///etc/hosts', 'api_host', /^not run: SOPHIA_API_URL names no host$/],
      // The positive control: an API this host cannot reach proves nothing when the job context cannot either.
      [`http://127.0.0.1:${port}`, `api_host:127.0.0.1:${port}`, /^not run: this host cannot reach the API either/],
      // An IPv6 literal is looked up without its brackets (it resolves, and is then tried from here).
      [`http://[::1]:${port}`, `api_host:::1:${port}`, /^not run: this host cannot reach the API either/],
    ] as const) {
      const results = await probeHost({ env: { ...quick, SOPHIA_API_URL: url }, node })
      assert.deepEqual(
        results.filter((r) => r.check.startsWith('api_host')).map((r) => r.check),
        [check],
        url,
      )
      assert.match(notPassed(results, check), detail, url)
    }
  })

  it('a named directory with more entries than the probe tries fails, never passes, on any host', async () => {
    const big = path.join(scratch, 'big-secrets')
    fs.mkdirSync(big)
    for (let i = 0; i <= 256; i++) fs.writeFileSync(path.join(big, `s${String(i)}`), '')
    const results = await probeHost({
      env: { ...env, SOPHIA_CHROMIUM_PATH: path.join(scratch, 'no-browser') },
      node,
      secrets: [big],
    })
    const check = results.find((r) => r.check === `unreadable:${big}`)
    assert.deepEqual([check?.ok, check?.detail], [false, 'not run: more than 256 entries; name the files instead'])
    assert.ok(!results.some((r) => r.check.startsWith(`unreadable:${big}/`)))
    // Exactly 256 entries are each tried.
    fs.rmSync(path.join(big, 's256'))
    const tried = await probeHost({ env: quick, node, secrets: [big] })
    assert.ok(!tried.some((r) => r.detail.startsWith('not run: more than')))
  })

  it('when the confinement cannot run, the checks it could not perform are still reported, on any host', async () => {
    const results = await probeHost({
      env: { ...env, SOPHIA_CHROMIUM_PATH: path.join(scratch, 'no-browser') },
      node: path.join(scratch, 'no-node'),
    })
    const byName = new Map(results.map((r) => [r.check, r]))
    assert.equal(byName.get('confinement')?.ok, false)
    assert.match(
      byName.get('confinement')?.detail ?? '',
      /^(the confinement did not run|not run: the confinement runs on Linux only)/,
    )
    for (const check of ['api_host', 'runner_token_file']) assert.match(byName.get(check)?.detail ?? '', /^not run: /)
  })

  it('tries only files and directories it can read itself: anything else is not run, on any host', async () => {
    const socket = path.join(scratch, 's.sock')
    const server = net.createServer()
    await new Promise<void>((resolve) => server.listen(socket, resolve))
    try {
      const results = await probeHost({ env: quick, node, secrets: [socket] })
      assert.match(notPassed(results, `unreadable:${socket}`), /^not run: not a file or a directory/)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it(
    'a secret this probe cannot read either is not run: a refusal inside would prove nothing',
    { skip: root ? 'root reads every file' : false },
    async () => {
      const closed = path.join(scratch, 'closed-to-the-probe')
      fs.writeFileSync(closed, 'x', { mode: 0o000 })
      fs.chmodSync(closed, 0o000)
      const results = await probeHost({ env: quick, node, secrets: [closed] })
      assert.match(notPassed(results, `unreadable:${closed}`), /^not run: this probe cannot read it either/)
    },
  )

  it('the command runs nothing on a command line it does not understand, and runs through a link, on any host', () => {
    const missing = path.join(scratch, 'not-here')
    const cli = (args: string[], program = PROBE) =>
      spawnSync(process.execPath, [program, ...args], { env: quick, encoding: 'utf8', timeout: 120_000 })
    for (const args of [['--secrets', missing], ['--secret'], [missing], ['--secret', ''], ['--node=']]) {
      const run = cli(args)
      assert.deepEqual([run.status, run.stdout], [2, ''], args.join(' '))
      assert.match(run.stderr, /usage: host-probe\.mjs/)
    }
    const link = path.join(scratch, 'probe-link.mjs')
    fs.symlinkSync(PROBE, link)
    for (const run of [cli([`--secret=${missing}`]), cli(['--secret', missing], link)]) {
      assert.equal(run.status, 1, run.stderr)
      const lines = run.stdout
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as { check: string; ok: boolean; detail: string })
      assert.match(notPassed(lines, `unreadable:${missing}`), /^not run: .* does not exist on this host$/)
    }
  })

  it('a path the job context fails to open for any reason but permission is not shown closed', { skip }, async () => {
    // The probe's own process entry: readable here, absent from the job context's fresh PID namespace (ENOENT).
    const elsewhere = path.join(scratch, 'elsewhere')
    fs.symlinkSync(`/proc/${String(process.pid)}/cmdline`, elsewhere)
    const results = await probeHost({ env: supervisorEnv(), node, secrets: [elsewhere] })
    assert.deepEqual(failed(results), [...tokenFailure, `unreadable:${elsewhere}`])
    assert.match(notPassed(results, `unreadable:${elsewhere}`), /^not shown closed: ENOENT$/)
  })

  it(
    'a job context holding anything beyond its own four variables fails, naming it (negative control)',
    { skip },
    async () => {
      // The browser's place taken by a program that adds one variable before it starts Node.
      const leaky = path.join(scratch, 'leaky-node')
      fs.writeFileSync(leaky, `#!/bin/sh\nexec env SOPHIA_LEAKED=1 '${node}' "$@"\n`, { mode: 0o755 })
      fs.chmodSync(leaky, 0o755)
      const results = await probeHost({ env: supervisorEnv(), node: leaky })
      assert.deepEqual(failed(results), ['job_environment', ...tokenFailure])
      // The shell adds its own PWD too; only names are reported.
      assert.match(
        results.find((r) => r.check === 'job_environment')?.detail ?? '',
        /^the job context holds (.*, )?SOPHIA_LEAKED(,|$)/,
      )
    },
  )

  it(
    'passes every check where the confinement holds; without a render user, exactly the runner token fails',
    { skip },
    async () => {
      const results = await probeHost({ env: supervisorEnv(), node })
      assert.deepEqual(failed(results), tokenFailure)
      const names = results.map((r) => r.check.split(':')[0])
      for (const check of [
        'render',
        'kernel_checks',
        'sandbox',
        'job_environment',
        'network_namespace',
        'public_tcp',
        'dns',
        'metadata',
        'api_host',
        'supervisor_environment',
      ]) {
        assert.ok(names.includes(check), check)
      }
      // The API was tried from inside, by the address this host reached.
      assert.equal(results.find((r) => r.check.startsWith('api_host:127.0.0.1:'))?.ok, true)
      assert.equal(results.find((r) => r.check === `unreadable:${token}`)?.ok, root)
    },
  )

  it(
    'fails on a file the job context can read, naming it, and the command exits non-zero (negative control)',
    { skip },
    async () => {
      const file = readableSecret()
      const results = await probeHost({ env: supervisorEnv(), node, secrets: [file] })
      assert.deepEqual(failed(results), [...tokenFailure, `unreadable:${file}`])
      const run = spawnSync(process.execPath, [PROBE, '--secret', file, '--node', node], {
        env: supervisorEnv(),
        encoding: 'utf8',
        timeout: 120_000,
      })
      assert.equal(run.status, 1, run.stderr)
      const lines = run.stdout
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as { check: string; ok: boolean })
      assert.deepEqual(failed(lines), [...tokenFailure, `unreadable:${file}`])
    },
  )

  it('follows a link to a directory inside a named one, and tries what is under it', { skip }, async () => {
    const named = path.join(scratch, 'linked-secrets')
    const target = path.join(scratch, 'link-target')
    for (const dir of [named, target]) {
      fs.mkdirSync(dir, { mode: 0o711 })
      fs.chmodSync(dir, 0o711)
    }
    const inner = path.join(target, 'inner')
    fs.writeFileSync(inner, 'not a secret', { mode: 0o644 })
    fs.chmodSync(inner, 0o644)
    fs.symlinkSync(target, path.join(named, 'link'))
    const results = await probeHost({ env: supervisorEnv(), node, secrets: [named] })
    const viaLink = path.join(named, 'link', 'inner')
    // Without a render user the job context owns both directories, so it lists them as well.
    const listed = root ? [] : [`unreadable:${named}`, `unreadable:${path.join(named, 'link')}`]
    assert.deepEqual(failed(results), [...tokenFailure, ...listed, `unreadable:${viaLink}`])
  })

  it(
    'tries every file in a named directory: one the job context cannot list still fails on a file it can read',
    { skip },
    async () => {
      // Execute-only for the render user: listing it is refused, but a file inside opens by name.
      const dir = path.join(scratch, 'secret-dir')
      fs.mkdirSync(dir, { mode: 0o711 })
      fs.chmodSync(dir, 0o711)
      const inner = path.join(dir, 'inner')
      fs.writeFileSync(inner, 'not a secret', { mode: 0o644 })
      fs.chmodSync(inner, 0o644)
      const results = await probeHost({ env: supervisorEnv(), node, secrets: [dir] })
      // Without a render user the job context owns the directory too, so it lists it as well.
      assert.deepEqual(failed(results), [
        ...tokenFailure,
        ...(root ? [] : [`unreadable:${dir}`]),
        `unreadable:${inner}`,
      ])
    },
  )
})
