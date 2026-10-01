// The confined browser (architecture 14 §5B, SMC-M03 plan §2.7). Playwright launches `bin/confine-chromium` in place
// of Chromium; the wrapper gives the browser an empty environment, resource limits, a non-root user with no new
// privileges and fresh user, network, PID and mount namespaces, and refuses every flag that would turn Chromium's
// own sandbox off. After the browser starts, a self-test reads the process tree from /proc and fails closed unless
// the browser is confined and every renderer runs in Chromium's sandbox (seccomp filter, its own user and network
// namespaces). There is no retry with weaker isolation.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import playwrightPackage from 'playwright-core/package.json' with { type: 'json' }

const WRAPPER = fileURLToPath(new URL('./bin/confine-chromium', import.meta.url))
const require = createRequire(import.meta.url)

/** Why the browser could not start confined; `code` is stable. */
export class ConfinementError extends Error {
  /**
   * @param {string} code
   * @param {string} detail
   */
  constructor(code, detail) {
    super(`${code}: ${detail}`)
    this.name = 'ConfinementError'
    this.code = code
  }
}

/**
 * The headless shell pinned with playwright-core (its browsers.json revision), under PLAYWRIGHT_BROWSERS_PATH or
 * Playwright's default cache; SOPHIA_CHROMIUM_PATH overrides it.
 * @param {NodeJS.ProcessEnv} env
 */
export function chromiumPath(env = process.env) {
  if (env.SOPHIA_CHROMIUM_PATH) return env.SOPHIA_CHROMIUM_PATH
  const pkg = path.dirname(require.resolve('playwright-core/package.json'))
  const browsers = fs.readFileSync(path.join(pkg, 'browsers.json'), 'utf8')
  const revision = /"name":\s*"chromium-headless-shell",\s*"revision":\s*"(\d+)"/.exec(browsers)?.[1]
  if (!revision) throw new ConfinementError('no_browser', 'playwright-core names no headless shell')
  const base = env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), '.cache', 'ms-playwright')
  return path.join(base, `chromium_headless_shell-${revision}`, 'chrome-linux', 'headless_shell')
}

/** Playwright's version, for the receipt. */
export const playwrightVersion = () => playwrightPackage.version

/**
 * @typedef {{ pid: number, ppid: number, uid: number, seccomp: number, noNewPrivs: number, nsDepth: number,
 *   cmdline: string, ns: { user: string | null, net: string | null } }} ProcessFacts
 */

/**
 * @param {string} status
 * @param {string} key
 */
const field = (status, key) => new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(status)?.[1] ?? ''

/**
 * @param {string | number} pid
 * @param {'user' | 'net'} kind
 */
function nsOf(pid, kind) {
  try {
    return fs.readlinkSync(`/proc/${pid}/ns/${kind}`)
  } catch {
    return null
  }
}

/**
 * What /proc says about one process, or null when it is gone or unreadable.
 * @param {string} pid
 * @returns {ProcessFacts | null}
 */
function factsOf(pid) {
  try {
    const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8')
    return {
      pid: Number(pid),
      ppid: Number(field(status, 'PPid')),
      uid: Number(field(status, 'Uid').split(/\s+/)[0]),
      seccomp: Number(field(status, 'Seccomp')),
      noNewPrivs: Number(field(status, 'NoNewPrivs')),
      nsDepth: field(status, 'NSpid').split(/\s+/).length,
      cmdline: fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' ').trim(),
      ns: { user: nsOf(pid, 'user'), net: nsOf(pid, 'net') },
    }
  } catch {
    return null
  }
}

/**
 * The wrapper's process (unshare, once the wrapper has exec'd) and everything under it, found by the job's own
 * profile directory, which appears on the wrapper's command line.
 * @param {string} profileDir
 * @returns {ProcessFacts[]}
 */
export function processTree(profileDir) {
  const all = fs
    .readdirSync('/proc')
    .filter((name) => /^\d+$/.test(name))
    .map(factsOf)
    .filter((p) => p !== null)
  const root = all.find((p) => p.cmdline.startsWith('unshare ') && p.cmdline.includes(`--user-data-dir=${profileDir}`))
  if (!root) return []
  const tree = [root]
  for (let i = 0; i < tree.length; i += 1) {
    const parent = tree[i]
    if (parent) tree.push(...all.filter((p) => p.ppid === parent.pid))
  }
  return tree
}

/**
 * @typedef {{ active: boolean, reasons: string[], browserUid: number | null, renderers: number,
 *   gpuSeccomp: number | null }} SandboxVerdict
 */

/**
 * What keeps the browser from counting as confined: root, privileges it may gain, or a namespace it shares with
 * this process.
 * @param {ProcessFacts} browser
 * @param {{ user: string | null, net: string | null }} self
 */
function browserGaps(browser, self) {
  return [
    browser.uid === 0 && 'the browser runs as root',
    browser.noNewPrivs !== 1 && 'the browser may gain privileges',
    browser.nsDepth < 2 && 'the browser shares the host PID namespace',
    (!browser.ns.user || browser.ns.user === self.user) && 'the browser shares the user namespace',
    (!browser.ns.net || browser.ns.net === self.net) && 'the browser shares the network namespace',
  ].filter((gap) => typeof gap === 'string')
}

/**
 * What keeps a renderer from counting as sandboxed: no seccomp filter, privileges it may gain, or the browser's
 * user or network namespace.
 * @param {ProcessFacts} r
 * @param {ProcessFacts | undefined} browser
 */
function rendererGaps(r, browser) {
  return [
    r.seccomp !== 2 && `renderer ${r.pid} has no seccomp filter`,
    r.noNewPrivs !== 1 && `renderer ${r.pid} may gain privileges`,
    (!r.ns.user || r.ns.user === browser?.ns.user) && `renderer ${r.pid} is not in its own user namespace`,
    (!r.ns.net || r.ns.net === browser?.ns.net) && `renderer ${r.pid} is not in its own network namespace`,
  ].filter((gap) => typeof gap === 'string')
}

/**
 * Whether the tree is confined and sandboxed. `self` is this process's own namespaces.
 * @param {ProcessFacts[]} tree
 * @param {{ user: string | null, net: string | null }} self
 * @returns {SandboxVerdict}
 */
export function judgeSandbox(tree, self) {
  const browser = tree.find((p) => p.ppid === tree[0]?.pid && !p.cmdline.includes('--type='))
  const renderers = tree.filter((p) => p.cmdline.includes('--type=renderer'))
  const reasons = [
    ...(browser ? browserGaps(browser, self) : ['no browser process under the wrapper']),
    ...(renderers.length === 0 ? ['no renderer to check'] : renderers.flatMap((r) => rendererGaps(r, browser))),
    ...(tree.some((p) => p.cmdline.includes('--no-sandbox')) ? ['a process runs with --no-sandbox'] : []),
  ]
  return {
    active: reasons.length === 0,
    reasons,
    browserUid: browser?.uid ?? null,
    renderers: renderers.length,
    gpuSeccomp: tree.find((p) => p.cmdline.includes('--type=gpu-process'))?.seccomp ?? null,
  }
}

/**
 * The job's scratch directories, owned by the render user when this process is root.
 * @param {string} workDir
 * @param {{ uid: number, gid: number } | null} renderUser
 */
function scratch(workDir, renderUser) {
  const profile = path.join(workDir, 'profile')
  const home = path.join(workDir, 'home')
  fs.mkdirSync(profile, { mode: 0o700 })
  fs.mkdirSync(home, { mode: 0o700 })
  if (renderUser) for (const dir of [workDir, profile, home]) fs.chownSync(dir, renderUser.uid, renderUser.gid)
  return { profile, home }
}

/**
 * The render user when this process is root: SOPHIA_RENDER_UID/GID, never 0. Null when not root.
 * @param {NodeJS.ProcessEnv} env
 */
export function renderUserOf(env = process.env) {
  if (process.getuid?.() !== 0) return null
  const uid = Number(env.SOPHIA_RENDER_UID)
  const gid = Number(env.SOPHIA_RENDER_GID ?? env.SOPHIA_RENDER_UID)
  if (!Number.isInteger(uid) || !Number.isInteger(gid) || uid <= 0 || gid <= 0) {
    throw new ConfinementError('root_without_render_user', 'started as root: set SOPHIA_RENDER_UID to a non-root uid')
  }
  return { uid, gid }
}

/**
 * @typedef {{ context: import('playwright-core').BrowserContext, profile: string, version: string,
 *   selfTest: () => SandboxVerdict, kill: () => void, close: () => Promise<void> }} ConfinedBrowser
 */

/**
 * Launch the confined browser for one job, in `workDir` (an empty directory this job owns).
 * @param {{ workDir: string, chromium?: string | undefined, timeoutMs?: number, env?: NodeJS.ProcessEnv | undefined,
 *   extraArgs?: string[] }} opts
 * @returns {Promise<ConfinedBrowser>}
 */
export async function launchConfined(opts) {
  if (process.platform !== 'linux') throw new ConfinementError('unsupported_platform', process.platform)
  const renderUser = renderUserOf(opts.env)
  const executable = opts.chromium ?? chromiumPath(opts.env)
  if (!fs.existsSync(executable)) throw new ConfinementError('no_browser', executable)
  const { profile, home } = scratch(opts.workDir, renderUser)
  /** @type {Record<string, string>} */
  const env = { SOPHIA_CHROMIUM: executable, SOPHIA_RENDER_HOME: home, PATH: '/usr/bin:/bin' }
  if (renderUser)
    Object.assign(env, { SOPHIA_RENDER_UID: String(renderUser.uid), SOPHIA_RENDER_GID: String(renderUser.gid) })
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: WRAPPER,
    headless: true,
    chromiumSandbox: true,
    javaScriptEnabled: false,
    acceptDownloads: false,
    env,
    args: ['--disable-dev-shm-usage', ...(opts.extraArgs ?? [])],
    timeout: opts.timeoutMs ?? 30_000,
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  })
  const self = { user: nsOf('self', 'user'), net: nsOf('self', 'net') }
  return {
    context,
    profile,
    version: context.browser()?.version() ?? 'unknown',
    selfTest: () => judgeSandbox(processTree(profile), self),
    // Killing the wrapper (unshare) kills the browser, the namespace's init, and with it every process inside.
    kill: () => {
      for (const p of processTree(profile).slice(0, 1)) process.kill(p.pid, 'SIGKILL')
    },
    close: () => context.close(),
  }
}
