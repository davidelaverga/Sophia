/**
 * The runtime host's lease and reconciliation, as scripts/runtime-host.mjs runs them, for a test that cannot use the
 * recorded runtime: it takes the root's lease, reconciles the profile with the given runtime directory (a fake dsh),
 * and when a signal stops it, exits as runtime-host does, releasing the lease or, when the install was not shown
 * gone, keeping it (retainRootLease).
 *   node tests/support/profile-stop-host.mjs <root> <runtimeDir> <stamp> [graceMs] [late]
 * `graceMs` is each of the stop's waits; `late` sends this process SIGTERM during the reconciliation's synchronous part
 * (as its arguments are read), the window in which a signal is handled only once the reconciliation has returned.
 */

import { writeSync } from 'node:fs'
import { loadRuntimeUnit } from '../../scripts/lib/common.mjs'
import { homeLayout, reconcileProfileUntilSignalled } from '../../scripts/lib/profile.mjs'
import { holdRootLease, retainRootLease } from '../../scripts/lib/root-lease.mjs'

const [root, runtimeDir, stamp, grace, late] = process.argv.slice(2)
let lease
try {
  lease = holdRootLease(root)
} catch (error) {
  console.error(`runtime-host: ${error.message}`)
  process.exit(2)
}
let retained = false
process.on('exit', () => {
  if (!retained) lease.release()
})
console.log(JSON.stringify({ event: 'host', pid: process.pid }))
const input = { unit: loadRuntimeUnit(), runtimeDir, layout: homeLayout(root), graceMs: grace ? Number(grace) : undefined }
Object.defineProperty(input, 'stamp', {
  enumerable: true,
  get() {
    if (late === 'late') process.kill(process.pid, 'SIGTERM')
    return stamp
  },
})
try {
  const profile = await reconcileProfileUntilSignalled(input)
  console.log(JSON.stringify({ event: 'profile', state: profile.state }))
} catch (error) {
  if (!error.stopped) throw error
  if (!error.gone) {
    retainRootLease(lease, error.message)
    retained = true
  }
  // Written synchronously, as the process exits next (a piped stderr is asynchronous on some platforms). A caller
  // whose bound expired may have closed its end already (spawnSync does): the stop is not undone by an unread message.
  try {
    writeSync(2, `runtime-host: ${error.message}${retained ? `; the root stays leased (${lease.path}.takeover) until an operator finds that install gone` : ''}\n`)
  } catch {}
  process.exit(error.signal === 'SIGINT' ? 130 : 143)
}
