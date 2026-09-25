// Entry point: `node src/server.ts` (Node 24 strips types; no build step).
import { hostname } from 'node:os'
import { checkRoleSafety, createPool } from '@sophia/persistence'
import { RuntimeDispatcher } from './runtime-dispatch.ts'

const url = process.env.SOPHIA_WORKER_DATABASE_URL?.trim()
if (!url) throw new Error('SOPHIA_WORKER_DATABASE_URL is required (a login granted sophia_worker; see .env.example)')

const pool = createPool(url, { max: 4 })
await checkRoleSafety(pool, 'sophia_worker') // refuse to run as an owner, superuser or BYPASSRLS login

const log = (line: string) => console.log(`[sophia-worker] ${line}`)
const dispatcher = new RuntimeDispatcher(pool, { workerId: `${hostname()}:${process.pid}`, log })
dispatcher.start()
log('runtime dispatch started')

const shutdown = async () => {
  await dispatcher.stop()
  await pool.end()
  process.exit(0)
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void shutdown())
