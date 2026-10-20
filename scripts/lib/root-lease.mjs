/**
 * The project root's lease, taken by the host BEFORE it reconciles the profile or stages an overlay (FND-B115/B116).
 *
 * It is the execution host's own ProjectLease (apps/execution-host runtime-supervisor.ts), the lease every supervisor
 * holds: a root a live runtime holds is refused, so no print or launch renames or reinstalls a profile beneath it. A
 * launch passes the same lease to its RuntimeSupervisor (SupervisorOptions.lease), which adopts it without removing or
 * recreating the file, so the root stays leased from preparation through the runtime's whole life.
 */

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
