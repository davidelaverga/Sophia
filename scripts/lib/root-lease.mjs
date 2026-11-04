/**
 * The project root's lease, taken by the host BEFORE it reconciles the profile or stages an overlay (FND-B115/B116).
 *
 * It is the execution host's own ProjectLease (apps/execution-host runtime-supervisor.ts), the lease every supervisor
 * holds: a root a live runtime holds is refused, so no print or launch renames or reinstalls a profile beneath it. A
 * launch passes the same lease to its RuntimeSupervisor (SupervisorOptions.lease), which adopts it without removing or
 * recreating the file, so the root stays leased from preparation through the runtime's whole life.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { LeaseHeldError, ProjectLease } from '../../apps/execution-host/dist/runtime-supervisor.js'

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

/**
 * Keep the root excluded after this process exits, when work it started under the lease may still be running and
 * its state is unknown (a stopped install whose process group was not shown gone). The lease file stays, naming this
 * process, and ProjectLease's own takeover marker (`<lease>.takeover`, which "blocks stale takeovers of that home
 * until an operator removes it") is created with the reason inside, so no later print or launch takes the lease over
 * as stale: each is refused until an operator, having found that work gone, removes the marker. Do not release the
 * lease afterwards.
 * @param {import('../../apps/execution-host/dist/runtime-supervisor.js').ProjectLease} lease - this process's lease.
 * @param {string} reason - what may still run, for the operator.
 */
export function retainRootLease(lease, reason) {
  const marker = `${lease.path}.takeover`
  try {
    mkdirSync(marker, { mode: 0o700 })
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
  }
  writeFileSync(join(marker, 'retained-by-runtime-host'), `${new Date().toISOString()} pid ${process.pid}: ${reason}\n`, { mode: 0o600 })
}
