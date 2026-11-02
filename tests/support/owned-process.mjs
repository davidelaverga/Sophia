/**
 * A process a test starts and owns, with a finite end (B-NATIVE-PROFILE-HISTORY-R1). It runs in a process group of its
 * own, so it and every process it starts that stays in the group are signalled together, and never anything else.
 * Every wait is raced against a timer whose loss is asserted. `settle` ends the group within a bound and returns only
 * once the group, and every descendant ever seen (a descendant that left the group is checked, never signalled), is
 * gone; otherwise it throws, and the caller keeps its fixture rather than delete what may still be in use.
 * Descendants are found by `ps`, run asynchronously and bounded by the caller's budget (R1-FINITE-PS): a look that times
 * out, fails or cannot be read leaves the descendants UNKNOWN, never an empty set, so `settle` still signals the group
 * and waits for it within its bound but then throws and the fixture is kept.
 * It does not see a descendant that started and left the group between two looks, nor exclude a seen pid being reused
 * by an unrelated process within the seconds between a look and the check.
 */

import { spawn } from 'node:child_process'
import { sleep } from './harness.mjs'

const LOST = Symbol('the timer won')
/** The longest one look may take; less when the caller's budget has less left. */
const LOOK_MS = 2_000
/** Below this much budget a wait takes no further look (one sample fewer, not a failed one). */
const MIN_LOOK_MS = 100

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

/**
 * Every process descending from `pid` now, by parent pid, from one `ps` that must finish within `ms`. Rejects when it
 * does not (it is then killed and left to exit on its own, holding nothing of the caller's), fails, or prints a table
 * it cannot read.
 * @returns {Promise<number[]>}
 */
function descendantsOf(pid, ms) {
  return new Promise((resolve, reject) => {
    const ps = spawn('ps', ['-A', '-o', 'pid=,ppid='], { stdio: ['ignore', 'pipe', 'ignore'] })
    let table = ''
    let done = false
    const finish = (error, rows) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(rows)
    }
    const timer = setTimeout(() => {
      finish(new Error(`ps did not finish within ${ms} ms`))
      ps.kill('SIGKILL')
      ps.stdout.destroy()
      ps.unref()
    }, ms)
    ps.stdout.on('data', (chunk) => (table += chunk))
    ps.once('error', (error) => finish(new Error(`ps could not run: ${error.message}`)))
    ps.once('close', (code, signal) => {
      if (code !== 0) return finish(new Error(`ps exited ${code ?? signal}`))
      const rows = table.trim().split('\n').map((row) => row.trim().split(/\s+/).map(Number))
      if (!rows.every((row) => row.length === 2 && row.every((n) => Number.isSafeInteger(n) && n >= 0)) || !rows.some(([child]) => child === process.pid)) {
        return finish(new Error('ps printed a table that cannot be read'))
      }
      finish(null, tree(rows, pid))
    })
  })
}

/** The descendants of `pid` in a table of [pid, parent pid] rows. */
function tree(rows, pid) {
  const children = new Map()
  for (const [child, parent] of rows) children.set(parent, [...(children.get(parent) ?? []), child])
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
  /** Why the descendants are not known, once any look has failed; null while every look succeeded. */
  let unknown = null
  /** One look within `ms`: adds what it finds to `seen`, or records why it could not. */
  const look = async (ms) => {
    if (child.pid === undefined || over || ms < MIN_LOOK_MS) return
    try {
      for (const pid of await descendantsOf(child.pid, Math.min(ms, LOOK_MS))) seen.add(pid)
    } catch (error) {
      unknown ??= error.message
    }
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
        if (n % 5 === 0) await look(deadline - Date.now())
        await sleep(100)
      }
      await look(deadline - Date.now())
    },
    /**
     * End it: one last look (at most `termMs`), SIGTERM to its group, SIGKILL to the group after `termMs`, then verify
     * within `killMs` that the process, its group and every descendant seen are gone. The signals never wait on a look
     * that succeeded. Idempotent. Throws, naming what is left, when that is not shown, or when the descendants are
     * unknown even though the group is gone.
     */
    settle({ termMs = 10_000, killMs = 5_000 } = {}) {
      settling ??= (async () => {
        if (child.pid === undefined) return // never started: spawn failed
        await look(termMs)
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
        let settled = await within(termMs, gone)
        if (!settled) {
          signal('SIGKILL')
          settled = await within(killMs, gone)
        }
        if (settled && unknown === null) return
        const left = [...seen].filter((pid) => exists(pid))
        const state = `exited ${over}, group ${exists(group) ? 'present' : 'gone'}, descendants left [${left.join(', ')}]`
        if (unknown !== null) throw new Error(`owned pid ${child.pid}: descendants unknown (${unknown}); ${state}`)
        throw new Error(`owned pid ${child.pid} not settled: ${state}`)
      })()
      return settling
    },
  }
}
