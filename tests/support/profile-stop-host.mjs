/**
 * The runtime host's root preparation, for a test that cannot use the recorded runtime: the same two calls
 * scripts/runtime-host.mjs makes (lib/root-lease.mjs holdHostRoot and reconcileHostProfile), with a fake dsh's runtime
 * directory in place of the recorded one, whose identity check is the only step left out.
 *   node tests/support/profile-stop-host.mjs <root> <runtimeDir> <stamp> [graceMs] [outputBytes] [late]
 * `graceMs` and `outputBytes` set the install's stop wait and output bound; `late` sends this process SIGTERM during
 * the reconciliation's synchronous part (as its stamp is read), the window in which a signal is handled only once the
 * reconciliation has returned.
 */

import { loadRuntimeUnit } from '../../scripts/lib/common.mjs'
import { homeLayout } from '../../scripts/lib/profile.mjs'
import { holdHostRoot, reconcileHostProfile } from '../../scripts/lib/root-lease.mjs'

const [root, runtimeDir, stamp, grace, output, late] = process.argv.slice(2)
const hold = holdHostRoot(root)
console.log(JSON.stringify({ event: 'host', pid: process.pid }))
const input = {
  unit: loadRuntimeUnit(),
  runtimeDir,
  layout: homeLayout(root),
  graceMs: grace ? Number(grace) : undefined,
  outputBytes: output ? Number(output) : undefined,
}
Object.defineProperty(input, 'stamp', {
  enumerable: true,
  get() {
    if (late === 'late') process.kill(process.pid, 'SIGTERM')
    return stamp
  },
})
const profile = await reconcileHostProfile(hold, input)
console.log(JSON.stringify({ event: 'profile', state: profile.state }))
