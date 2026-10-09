// A second API process for cross-instance.db.test.ts (Codex P1 r4234393693, r4234171899 and r4234782534 on PR #190):
// the candidate executeToolCall in a Node process of its own, so its module instance, its pool and its fence are its
// own, on the test's database. It makes one call, and stops where it is asked to until the test sends 'go': 'bound',
// once the transaction that binds the call has committed, at the next connection the call asks for (its handler's);
// 'mark', just before the query that writes the call's answer (a seal in its write's transaction, or a mark on its
// own); 'admitted', just before the COMMIT of the transaction that admitted the call's command (live_call_admits). It
// reports its pid, each pause and its answer over IPC.
//   node cross-instance-child.ts <database url> <call json> <on|off> <bound,mark,admitted|bound|run>
import process from 'node:process'
import type pg from 'pg'
import type { MediaToolCall } from '@sophia/contracts'
import { createPool } from '@sophia/persistence'
import { executeToolCall } from './media-tools.ts'

const [databaseUrl = '', callJson = '{}', mode = 'on', pause = 'run'] = process.argv.slice(2)
const pool = createPool(databaseUrl, { max: 4, onIdleError: () => undefined })
const send = (message: object) => process.send?.(message)
/** Where to stop, each once. */
const stops = new Set(pause.split(','))

let committed = false
const watched = new WeakSet<pg.PoolClient>()
/** Clients whose open transaction admitted the call's command. */
const admitting = new WeakSet<pg.PoolClient>()
const connect = pool.connect.bind(pool) as () => Promise<pg.PoolClient>
/** The queries that write a call's answer: a seal or a mark under the fence's generation, or 0046's mark before it. */
const MARKS = ['live_call_seal', 'media_mark_live_call', 'media_answer_live_call']

/** Stop here (once) if asked to, until the test says go. */
async function stop(at: 'bound' | 'mark' | 'admitted'): Promise<void> {
  if (!stops.delete(at)) return
  send({ type: 'paused', at })
  await new Promise((resolve) => process.once('message', resolve))
}

/** Every client the call checks out: the first one after a COMMIT completed may stop (bound), and so may the mark. */
async function connectWatched(): Promise<pg.PoolClient> {
  if (committed) await stop('bound')
  const client = await connect()
  if (!watched.has(client)) {
    watched.add(client)
    const query = client.query.bind(client) as (text: string, values?: unknown[]) => Promise<pg.QueryResult>
    const watchedQuery = async (text: string, values?: unknown[]) => {
      if (typeof text === 'string' && MARKS.some((mark) => text.includes(mark))) await stop('mark')
      if (text === 'COMMIT' && admitting.has(client)) await stop('admitted')
      if (text === 'COMMIT' || text === 'ROLLBACK') admitting.delete(client)
      const result = await query(text, values)
      if (typeof text === 'string' && text.includes('live_call_admits')) admitting.add(client)
      if (text === 'COMMIT') committed = true
      return result
    }
    Object.assign(client, { query: watchedQuery })
  }
  return client
}
Object.assign(pool, { connect: connectWatched })

/** The call the test hands over, as the bridge sends it (the test builds it; this only checks it is one). */
const isCall = (v: unknown): v is MediaToolCall =>
  typeof v === 'object' && v !== null && 'exchangeId' in v && 'callId' in v && 'name' in v && 'args' in v
const call: unknown = JSON.parse(callJson)
if (!isCall(call)) throw new Error('the test handed over no tool call')

send({ type: 'started', pid: process.pid })
const answer = await executeToolCall(pool, call, mode === 'on')
send({ type: 'answer', answer })
await pool.end()
process.disconnect()
