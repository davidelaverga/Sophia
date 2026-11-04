/**
 * The project root's lease, taken by the host BEFORE it reconciles the profile or stages an overlay (FND-B115/B116).
 *
 * It is the execution host's own ProjectLease (apps/execution-host runtime-supervisor.ts), the lease every supervisor
 * holds: a root a live runtime holds is refused, so no print or launch renames or reinstalls a profile beneath it. A
 * launch passes the same lease to its RuntimeSupervisor (SupervisorOptions.lease), which adopts it without removing or
 * recreating the file, so the root stays leased from preparation through the runtime's whole life.
 */

import { lstatSync, mkdirSync, rmdirSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { LeaseHeldError, ProjectLease } from '../../apps/execution-host/dist/runtime-supervisor.js'
import { reconcileProfileUntilSignalled } from './profile.mjs'

/**
 * Take the root's lease for this process, or throw when another holder has it.
 * @param {string} root - the project root.
 * @returns {ProjectLease} release() removes it only while it is still this process's; idempotent.
 */
export function holdRootLease(root) {
  try {
    return ProjectLease.acquire(root)
  } catch (error) {
    if (error instanceof LeaseHeldError && error.pid !== undefined) {
      throw new Error(`${root} is leased by live runtime pid ${error.pid}; nothing is reconciled under it`)
    }
    if (error instanceof LeaseHeldError || error?.code === 'EEXIST') throw new Error(`${root} is leased by another runtime; nothing is reconciled under it`)
    throw error
  }
}

/** Write a line to stderr synchronously (the process may exit next); a closed stderr does not change the outcome. */
function report(line) {
  try {
    writeSync(2, `${line}\n`)
  } catch {}
}

/**
 * The runtime host's hold on a root, for print and launch alike: the root's lease, taken first, and released when this
 * process exits unless the root has to stay excluded (`kept`, set by reconcileHostProfile). A root that has the
 * exclusion marker `<lease>.takeover` (ProjectLease's own takeover marker, which "blocks stale takeovers of that home
 * until an operator removes it") is refused before anything is reconciled or started, even when its lease file is
 * gone: an earlier run left work under it whose end is unknown. A refusal exits 2.
 * @param {string} root - the project root.
 * @returns {{ lease: ProjectLease, marker: string, kept: boolean, cleanups: (() => void)[] }} `cleanups` run at exit.
 */
export function holdHostRoot(root) {
  let lease
  try {
    lease = holdRootLease(root)
  } catch (error) {
    report(`runtime-host: ${error.message}`)
    process.exit(2)
  }
  const hold = { lease, marker: `${lease.path}.takeover`, kept: false, cleanups: [] }
  process.on('exit', () => {
    for (const cleanup of hold.cleanups) cleanup()
    if (!hold.kept) lease.release()
  })
  if (lstatSync(hold.marker, { throwIfNoEntry: false }) !== undefined) {
    report(`runtime-host: ${hold.marker} exists: work an earlier run started under ${root} may still be running; nothing is reconciled or started until an operator, having found it gone, removes that marker`)
    process.exit(2)
  }
  return hold
}

/**
 * The root's exclusion while its profile changes: the marker directory is created (exclusively, never through a
 * link) before the first change and removed only by `release()`, only while it is still the directory this process
 * made and empty. Until then a dead or stopped host leaves it in place, and no later host takes the root over.
 */
function rootExclusion(hold) {
  let made = null
  const ours = () => {
    const stat = lstatSync(hold.marker, { throwIfNoEntry: false })
    return made !== null && stat !== undefined && stat.isDirectory() && stat.dev === made.dev && stat.ino === made.ino
  }
  return {
    hold() {
      try {
        mkdirSync(hold.marker, { mode: 0o700 })
      } catch (error) {
        throw new Error(`the root cannot be excluded before its profile changes (${hold.marker}: ${error.code ?? error.message}); nothing is changed`)
      }
      try {
        const stat = lstatSync(hold.marker)
        made = { dev: stat.dev, ino: stat.ino }
      } catch {}
    },
    release() {
      if (!ours()) throw new Error(`${hold.marker} is not the exclusion this process made`)
      rmdirSync(hold.marker)
    },
    /** Add the reason to this process's own marker, never through a link or over an existing entry. */
    note(reason) {
      try {
        if (!ours()) throw new Error('the marker is not the one this process made')
        writeFileSync(join(hold.marker, 'reason'), `${new Date().toISOString()} pid ${process.pid}: ${reason}\n`, { flag: 'wx', mode: 0o600 })
        return ''
      } catch (error) {
        return ` (its reason could not be written there: ${error.code ?? error.message})`
      }
    },
  }
}

/**
 * Reconcile the held root's profile (reconcileProfileUntilSignalled) under its exclusion, and end this process when
 * that cannot be done safely. Work whose end is unknown (`closureUnknown`), or an exclusion that could not be released
 * (`exclusionKept`), keeps the root excluded: the hold is marked kept before anything else can fail, the lease is not
 * released, and the process exits nonzero; nothing is reported as reconciled. A stop by SIGTERM or SIGINT exits 143 or
 * 130 after the reconciliation has settled. Any other failure is thrown, as before.
 * @param {ReturnType<typeof holdHostRoot>} hold
 * @param {Omit<Parameters<typeof reconcileProfileUntilSignalled>[0], 'exclusion'>} input - its properties are read
 *   only by the reconciliation.
 * @returns {ReturnType<typeof reconcileProfileUntilSignalled>}
 */
export async function reconcileHostProfile(hold, input) {
  const exclusion = rootExclusion(hold)
  try {
    return await reconcileProfileUntilSignalled(Object.defineProperties({ exclusion }, Object.getOwnPropertyDescriptors(input)))
  } catch (error) {
    const excluded = error.closureUnknown === true || error.exclusionKept === true
    if (excluded) hold.kept = true
    if (!excluded && !error.stopped) throw error
    const note = excluded ? exclusion.note(error.message) : ''
    report(`runtime-host: ${error.message}${excluded ? `; the root stays leased and excluded (${hold.marker})${note} until an operator finds that work gone` : ''}`)
    process.exit(error.signal === 'SIGINT' ? 130 : error.signal === 'SIGTERM' ? 143 : 1)
  }
}
