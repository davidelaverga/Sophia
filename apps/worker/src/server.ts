// Entry point: `node src/server.ts` (Node 24 strips types; no build step).
import { hostname } from 'node:os'
import { checkRoleSafety, createPool } from '@sophia/persistence'
import { liveKitRemover, RemovalReconciler } from './room-removals.ts'
import { RuntimeDispatcher } from './runtime-dispatch.ts'

const url = process.env.SOPHIA_WORKER_DATABASE_URL?.trim()
if (!url) throw new Error('SOPHIA_WORKER_DATABASE_URL is required (a login granted sophia_worker; see .env.example)')

const pool = createPool(url, { max: 4 })
await checkRoleSafety(pool, 'sophia_worker') // refuse to run as an owner, superuser or BYPASSRLS login

const log = (line: string) => console.log(`[sophia-worker] ${line}`)
const workerId = `${hostname()}:${process.pid}`
const dispatcher = new RuntimeDispatcher(pool, { workerId, log })
dispatcher.start()
log('runtime dispatch started')

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

const shutdown = async () => {
  removals?.stop()
  await dispatcher.stop()
  await pool.end()
  process.exit(0)
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void shutdown())
