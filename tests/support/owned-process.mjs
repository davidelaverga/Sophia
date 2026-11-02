/**
 * A process a test starts and owns, with a finite end (B-NATIVE-PROFILE-HISTORY-R1). It runs in a process group of its
 * own, so it and every process it starts that stays in the group are signalled together, and never anything else.
 * Every wait is raced against a timer whose loss is asserted. `settle` ends the group within a bound and returns only
 * once the group, and every descendant ever seen (a descendant that left the group is checked, never signalled), is
 * gone; otherwise it throws, and the caller keeps its fixture rather than delete what may still be in use.
 * It does not see a descendant that started and left the group between two looks.
 */

import { spawn, spawnSync } from 'node:child_process'
import { sleep } from './harness.mjs'

const LOST = Symbol('the timer won')

/** Whether `target` (a pid, or a negated process group id) still exists; signal 0 sends nothing. */
function exists(target) {
  try {
    process.kill(target, 0)
    return true
  } catch (error) {
    if (error.code === 'ESRCH') return false
    throw error
  }
}

/** Every process descending from `pid` now, by parent pid. */
function descendantsOf(pid) {
  const rows = spawnSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' }).stdout.trim().split('\n')
  const children = new Map()
  for (const row of rows) {
    const [child, parent] = row.trim().split(/\s+/).map(Number)
    children.set(parent, [...(children.get(parent) ?? []), child])
  }
  const found = []
  for (const queue = [pid]; queue.length > 0; ) {
    for (const child of children.get(queue.shift()) ?? []) {
      found.push(child)
      queue.push(child)
    }
  }
  return found
}

/** Poll `done` until it is true or `ms` pass; whether it became true. */
async function within(ms, done) {
  for (const deadline = Date.now() + ms; ; await sleep(100)) {
    if (done()) return true
    if (Date.now() > deadline) return false
  }
}

/**
 * Start `command` in its own process group.
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string, env: Record<string, string | undefined> }} options
 */
export function startOwned(command, args, { cwd, env }) {
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => (stdout += chunk))
  child.stderr.on('data', (chunk) => (stderr += chunk))
  /** @type {Promise<{ code: number | null, signal: string | null } | { error: Error }>} */
  const ended = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }))
    child.once('error', (error) => resolve({ error }))
  })
  let over = false
  void ended.then(() => (over = true))
  const seen = new Set()
  const look = () => {
    if (child.pid !== undefined && !over) for (const pid of descendantsOf(child.pid)) seen.add(pid)
  }
  let settling = null
  return {
    pid: child.pid,
    seen,
    stdout: () => stdout,
    stderr: () => stderr,
    /** How it ended, within `ms`; throws if it is still running then. */
    async ended(ms) {
      const outcome = await Promise.race([ended, sleep(ms).then(() => LOST)])
      if (outcome === LOST) throw new Error(`pid ${child.pid} still running after ${ms} ms\n${stdout}${stderr}`.slice(-3000))
      return outcome
    },
    /** Wait until its output matches `pattern`, within `ms`; throws if it ends first or the time passes. */
    async until(pattern, ms) {
      const deadline = Date.now() + ms
      for (let n = 0; !pattern.test(stdout + stderr); n++) {
        if (over) throw new Error(`pid ${child.pid} ended before ${pattern}\n${stdout}${stderr}`.slice(-3000))
        if (Date.now() > deadline) throw new Error(`no ${pattern} from pid ${child.pid} within ${ms} ms\n${stdout}${stderr}`.slice(-3000))
        if (n % 5 === 0) look()
        await sleep(100)
      }
      look()
    },
    /**
     * End it: SIGTERM to its group, SIGKILL to the group after `termMs`, then verify within `killMs` that the process,
     * its group and every descendant seen are gone. Idempotent. Throws, naming what is left, when that is not shown.
     */
    settle({ termMs = 10_000, killMs = 5_000 } = {}) {
      settling ??= (async () => {
        if (child.pid === undefined) return // never started: spawn failed
        look()
        const group = -child.pid
        const signal = (name) => {
          try {
            process.kill(group, name)
          } catch (error) {
            // The group is already gone: nothing to signal.
            if (error.code !== 'ESRCH') throw error
          }
        }
        const gone = () => over && !exists(group) && [...seen].every((pid) => !exists(pid))
        signal('SIGTERM')
        if (await within(termMs, gone)) return
        signal('SIGKILL')
        if (await within(killMs, gone)) return
        const left = [...seen].filter((pid) => exists(pid))
        throw new Error(`owned pid ${child.pid} not settled: exited ${over}, group ${exists(group) ? 'present' : 'gone'}, descendants left [${left.join(', ')}]`)
      })()
      return settling
    },
  }
}
