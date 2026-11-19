// Entry point: `node src/server.ts` (Node 24 strips types; no build step).
import { createPrivateKey } from 'node:crypto'
import { hostname } from 'node:os'
import { checkRoleSafety, createPool, requireRunnerResults } from '@sophia/persistence'
import { CoordinationDispatcher, httpPaperclipClient } from './coordination-dispatch.ts'
import { liveKitRemover, RemovalReconciler } from './room-removals.ts'
import { assemblyConfig, RuntimeDispatcher } from './runtime-dispatch.ts'
import { ownerHostRouteFromEnv, requireOwnerHostRoute, OwnerHostRouteController } from './owner-host-route.ts'
import { ownerRunnerResultsFromEnv } from './runner-results-config.ts'
import { RunnerResultsController } from './runner-results.ts'

const ownerHostRoute = ownerHostRouteFromEnv(process.env)
const ownerRunnerResults = ownerRunnerResultsFromEnv(process.env.SOPHIA_OWNER_RUNNER_RESULTS)

const url = process.env.SOPHIA_WORKER_DATABASE_URL?.trim()
if (!url) throw new Error('SOPHIA_WORKER_DATABASE_URL is required (a login granted sophia_worker; see .env.example)')

// Explicit original-journal route only. Parsing above precedes pool effects; ON requires current qualified records.
// OFF preserves only configured maintenance. Actual account/native qualification remains a separate episode.

const pool = createPool(url, { max: 4 })
if (ownerRunnerResults) await requireRunnerResults(pool)
await checkRoleSafety(pool, 'sophia_worker') // refuse to run as an owner, superuser or BYPASSRLS login
await requireOwnerHostRoute(pool, ownerHostRoute)

const log = (line: string) => console.log(`[sophia-worker] ${line}`)
const workerId = `${hostname()}:${process.pid}`
// Optional: a login admitted to the conversation assembler role (Q13), or the fixed assembly through this worker's own
// login (0084, SOPHIA_CONVERSATION_ASSEMBLY=fixed). Without either no reply context is recorded here.
const assembly = assemblyConfig({ ...process.env, workerUrl: url })
const runnerResults = new RunnerResultsController(pool, { enabled: ownerRunnerResults, log })
const ownerHost = new OwnerHostRouteController(pool, ownerHostRoute, workerId, log)
const dispatcher = new RuntimeDispatcher(pool, { workerId, log, runnerResults, ownerHost, ...assembly })
dispatcher.start()
log('runtime dispatch started')
log(
  ownerHostRoute?.sends
    ? 'owner-runner dispatch: configured, current rights rechecked'
    : 'owner-runner dispatch: off; only explicitly configured original-journal maintenance',
)

// Room removals (amendment A07) need the LiveKit server; without it they stay pending, visibly, never "done".
const livekitUrl = process.env.LIVEKIT_URL?.trim()
const removals =
  livekitUrl && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET
    ? new RemovalReconciler(
        pool,
        liveKitRemover({
          url: livekitUrl,
          apiKey: process.env.LIVEKIT_API_KEY,
          apiSecret: process.env.LIVEKIT_API_SECRET,
        }),
        workerId,
        log,
      )
    : null
removals?.start()
log(removals ? 'room removal reconciliation started' : 'room removals: no LIVEKIT_URL, pending removals wait')

// Paperclip commissions and their mirrored controls (WBC-02) need the private Paperclip origin, the integration
// principal's key and Sophia's envelope signing key; without them commissions wait, visibly, and nothing is sent.
const paperclipOrigin = process.env.PAPERCLIP_ORIGIN?.trim()
const paperclipToken = process.env.PAPERCLIP_INTEGRATION_TOKEN?.trim()
const signingKey = process.env.SOPHIA_COORDINATION_SIGNING_KEY?.trim()
const coordination =
  paperclipOrigin && paperclipToken && signingKey
    ? new CoordinationDispatcher(pool, {
        workerId,
        client: httpPaperclipClient({ origin: paperclipOrigin, token: paperclipToken }),
        signingKey: createPrivateKey(signingKey.replaceAll('\\n', '\n')),
        log,
      })
    : null
coordination?.start()
log(
  coordination
    ? 'coordination delivery started'
    : 'coordination: no PAPERCLIP_ORIGIN, token or signing key; commissions wait',
)

const shutdown = async () => {
  const resultsStopped = runnerResults.stop()
  removals?.stop()
  await coordination?.stop()
  await dispatcher.stop()
  await resultsStopped
  await pool.end()
  process.exit(0)
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void shutdown())
