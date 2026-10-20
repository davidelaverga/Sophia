/**
 * The project root's single-writer lease, taken by the host BEFORE it reconciles the profile (FND-B115, 4326076000).
 *
 * It is the supervisor's own lease (apps/execution-host runtime-supervisor.ts): `<root>/supervisor.lease`, created
 * exclusively, holding the holder's pid. A root a live runtime holds is refused, so no print or launch renames or
 * reinstalls a profile beneath it. The supervisor this host then starts takes the lease over in place (a lease
 * holding its own process's pid is its own), so there is no unleased moment between reconciliation and start.
 */

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs'
import { join } from 'node:path'

/** Whether `pid` names a live process (EPERM: alive, another user's). */
function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

/**
 * Take the root's lease for this process, or throw when a live runtime holds it. A lease of a dead process is stale and
 * replaced, as the supervisor replaces it.
 * @param {string} root - the project root.
 * @returns {{ release: () => void }} release removes the lease only while it is still this process's.
 */
export function holdRootLease(root) {
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const path = join(root, 'supervisor.lease')
  if (existsSync(path)) {
    const pid = Number(readFileSync(path, 'utf8').trim())
    if (Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid && isAlive(pid)) {
      throw new Error(`${root} is leased by live runtime pid ${pid}; nothing is reconciled under it`)
    }
    rmSync(path, { force: true })
  }
  let fd
  try {
    fd = openSync(path, 'wx', 0o600)
  } catch {
    throw new Error(`${root} was leased by another runtime meanwhile; nothing is reconciled under it`)
  }
  try {
    writeSync(fd, `${process.pid}\n`)
  } finally {
    closeSync(fd)
  }
  return {
    release: () => {
      if (existsSync(path) && readFileSync(path, 'utf8').trim() === String(process.pid)) rmSync(path, { force: true })
    },
  }
}
