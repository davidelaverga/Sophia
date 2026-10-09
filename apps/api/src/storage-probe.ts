// SDD-01 P1, the hosted no-replace proof (WBC-02-CC-0010 §8): the operator's probe of the API's own byte store, written
// once per key by the API's own database claim. No public route can name a key twice (each upload slot mints a fresh
// one), so the probe composes the store exactly as buildApp does (byteStoreFromEnv, then writeOnceStore) from the
// API's own settings and login, and writes labelled synthetic keys under PROBE_PROJECT:
// - one key written, then written again with other bytes and with the same bytes: both refused, the first bytes kept;
// - one fresh key written by eight writers at once, over eight connections: one written, seven refused;
// - every request to the provider counted, by method and key: one PUT per key, whatever the provider does with a second.
// Finite: 11 claims, at most 7 provider requests, 2 objects of about 100 bytes, never deleted (a claim is never
// released). With `--run <uuid>` it is one-shot: both keys derive from the operator's run id, so a start that runs it
// again under the same id (the API's start command restarted) finds its first key claimed and writes nothing (exit 2).
// It ends within PROBE_MS, its preconditions' queries included, so the API's start follows it. It prints JSON lines:
// the first names the physical namespace it writes in (endpoint, region, bucket) and its keys; none names a credential
// or a signed URL. Exit: 0 every guarantee held;
// 1 one did not; 2 a precondition is missing (nothing written); 3 an outcome is uncertain (stopped at once, never
// retried: its keys, named by its first line, are claimed and can never be written again; what the provider holds there
// is read from the dashboard's Storage view, never with a copy of the API's key).
import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { checkRoleSafety, createPool } from '@sophia/persistence'
import { STORE_SCHEMA, writeOnceStore } from './app.ts'
import { ByteStoreError, byteStoreFromEnv, objectPath, type ByteStore } from './byte-store.ts'
import { sha256Hex } from './s3-sign.ts'

/** The probe's own project id, which no project has: every object it writes is `<PROBE_PROJECT>/<fresh uuid>`. */
export const PROBE_PROJECT = '00000000-0000-4000-8000-000000000044'
/** How many writers race for one key. */
export const RACERS = 8
/** Each request to the provider, and the whole probe, end within these. */
const REQUEST_MS = 20_000
export const PROBE_MS = 120_000
/** Closing the probe's connections waits no longer than this: a connection the database never answered can't hold it. */
const ENDING_MS = 5_000
const MIME = 'application/octet-stream'

/** One request the probe's store sent to the provider: its method, the object key it named, and how it answered. */
export interface ProviderCall {
  method: string
  key: string
  status: number | 'no_answer'
}

/**
 * A fetch that records every request to the provider (its method and the object key at the end of its path) and gives
 * each REQUEST_MS: what the store actually sent, whatever the provider then did with it.
 * @param calls where each request is recorded
 * @param fetchImpl the fetch underneath (tests give a stand-in provider)
 */
export function countingFetch(
  calls: ProviderCall[],
  fetchImpl: typeof fetch = fetch,
  stopped: () => boolean = () => false,
): typeof fetch {
  return async (input, init) => {
    // Past the probe's deadline nothing more is sent: its last line counted every request.
    if (stopped()) throw new Error("past the probe's deadline: not sent")
    const url = new URL(input instanceof Request ? input.url : String(input))
    const key = url.pathname.split('/').slice(-2).map(decodeURIComponent).join('/')
    const call: ProviderCall = { method: init?.method ?? 'GET', key, status: 'no_answer' }
    calls.push(call)
    const res = await fetchImpl(input, { ...init, signal: AbortSignal.timeout(REQUEST_MS) })
    call.status = res.status
    return res
  }
}

/** Why the probe stopped before its end. */
class Stop extends Error {
  readonly exit: 1 | 2 | 3
  readonly key: string | null

  constructor(exit: 1 | 2 | 3, message: string, key: string | null = null) {
    super(message)
    this.exit = exit
    this.key = key
  }
}

const refused = (error: unknown) => error instanceof ByteStoreError && error.status === 409

/** Two keys no probe has used. */
const freshKeys = (): [string, string] => [
  objectPath(PROBE_PROJECT, randomUUID()),
  objectPath(PROBE_PROJECT, randomUUID()),
]

/** The two keys of a one-shot run: its id, and one derived from it. A UUID in capitals (macOS uuidgen's) is the same id. */
export function runKeys(id: string): [string, string] {
  const run = id.toLowerCase()
  if (!UUID.test(run)) throw new Stop(2, 'a run id is a UUID')
  const h = sha256Hex(new TextEncoder().encode(`${run}:racing`))
  const racing = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
  return [objectPath(PROBE_PROJECT, run), objectPath(PROBE_PROJECT, racing)]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u

interface Probe {
  /** The API's store as buildApp composes it, its claims over the API's pool. */
  store: ByteStore
  /** The same, its claims over a pool of RACERS connections. */
  racing: ByteStore
  calls: ProviderCall[]
  fetchImpl: typeof fetch
  log: (record: object) => void
  /** A one-shot run: a first key found claimed means the run id was used before, not a broken guarantee. */
  oneShot?: boolean
  /** The physical namespace the store writes in, named by the probe's first line so its evidence binds it. */
  namespace?: Namespace
}

/** Where the objects are: the endpoint (its origin and path only), the region and the bucket. Never a credential. */
export interface Namespace {
  endpoint: string
  region: string
  bucket: string
}

/** The namespace the API's settings name (they are complete: byteStoreFromEnv has read them). */
function namespaceOf(env: Record<string, string | undefined>): Namespace {
  const endpoint = new URL(env.SOPHIA_STORAGE_S3_ENDPOINT?.trim() ?? '')
  return {
    endpoint: `${endpoint.origin}${endpoint.pathname.replace(/\/+$/u, '')}`,
    region: env.SOPHIA_STORAGE_S3_REGION?.trim() ?? '',
    bucket: env.SOPHIA_STORAGE_BUCKET?.trim() ?? '',
  }
}

/** The requests sent for one key, counted by method. */
function sent(calls: ProviderCall[], key: string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const c of calls) if (c.key === key) counts[c.method] = (counts[c.method] ?? 0) + 1
  return counts
}

/** The first write of a fresh key: it must be written. A refusal breaks the guarantee; anything else is uncertain. */
async function firstWrite(p: Probe, key: string, bytes: Buffer) {
  try {
    await p.store.put(key, bytes, MIME)
  } catch (error) {
    if (refused(error) && p.oneShot) throw new Stop(2, 'this run id was used before: nothing written', key)
    if (refused(error)) throw new Stop(1, 'a fresh key was refused', key)
    throw new Stop(3, `the first write's outcome is unknown: ${String(error)}`, key)
  }
}

/** A write of a written key: it must be refused, and reach the provider not at all. */
async function refusedWrite(p: Probe, key: string, bytes: Buffer, what: string) {
  const before = p.calls.length
  try {
    await p.store.put(key, bytes, MIME)
  } catch (error) {
    if (!refused(error)) throw new Stop(3, `${what}: the refusal is not the claim's: ${String(error)}`, key)
    if (p.calls.length !== before) throw new Stop(1, `${what} was refused only after reaching the provider`, key)
    p.log({ event: 'STORAGE_PROBE_STEP', step: what, key, outcome: 'refused', providerRequests: 0 })
    return
  }
  throw new Stop(1, `${what} was written`, key)
}

/** The bytes the provider holds at `key` must be `expected`, read by the API's own GET. */
async function readBack(p: Probe, key: string, expected: Buffer, what: string) {
  let held: Uint8Array
  try {
    held = await p.store.get(key)
  } catch (error) {
    throw new Stop(3, `${what}: the read failed: ${String(error)}`, key)
  }
  const sha = sha256Hex(held)
  if (sha !== sha256Hex(expected)) throw new Stop(1, `${what}: the bytes held are not the first written`, key)
  p.log({ event: 'STORAGE_PROBE_STEP', step: what, key, outcome: 'first bytes held', sha256: sha })
}

/** The same bytes through a URL the API signs (as a member's download is), never printed. */
async function signedRead(p: Probe, key: string, expected: Buffer) {
  let bytes: Buffer
  try {
    const res = await p.fetchImpl(await p.store.signedUrl(key, 60, null), { signal: AbortSignal.timeout(REQUEST_MS) })
    if (!res.ok) throw new Error(`status ${String(res.status)}`)
    bytes = Buffer.from(await res.arrayBuffer())
  } catch (error) {
    throw new Stop(3, `the signed read failed: ${String(error)}`, key)
  }
  if (sha256Hex(bytes) !== sha256Hex(expected)) throw new Stop(1, 'the signed read is not the first bytes', key)
  p.log({ event: 'STORAGE_PROBE_STEP', step: 'signed read', key, outcome: 'first bytes held' })
}

/** One key, written once, then again with other bytes and the same bytes: refused, before the provider. */
async function sequential(p: Probe, key: string) {
  const first = Buffer.from(`sophia write-once probe ${key} first`)
  await firstWrite(p, key, first)
  p.log({ event: 'STORAGE_PROBE_STEP', step: 'first write', key, outcome: 'written', sha256: sha256Hex(first) })
  await refusedWrite(p, key, Buffer.from(`sophia write-once probe ${key} other`), 'other bytes, same key')
  await refusedWrite(p, key, first, 'same bytes, same key')
  await readBack(p, key, first, 'read after the refusals')
  await signedRead(p, key, first)
  const puts = sent(p.calls, key).PUT ?? 0
  if (puts !== 1) throw new Stop(1, `${String(puts)} PUTs reached the provider for one key`, key)
}

/** One fresh key, RACERS writers at once: one written, the rest refused by the claim, one PUT. */
async function race(p: Probe, key: string) {
  const bodies = Array.from({ length: RACERS }, (_, k) => Buffer.from(`sophia write-once probe ${key} racer ${k}`))
  const results = await Promise.allSettled(bodies.map((b) => p.racing.put(key, b, MIME)))
  const written = results.flatMap((r, k) => (r.status === 'fulfilled' ? [k] : []))
  const unknown = results.filter((r) => r.status === 'rejected' && !refused(r.reason))
  const puts = sent(p.calls, key).PUT ?? 0
  p.log({
    event: 'STORAGE_PROBE_STEP',
    step: 'racing writers',
    key,
    written: written.length,
    puts,
    unknown: unknown.length,
  })
  if (puts > 1 || written.length > 1)
    throw new Stop(1, `${String(written.length)} writes and ${String(puts)} PUTs for one key`, key)
  if (unknown.length > 0 || written.length !== 1) throw new Stop(3, 'a racing write ended unknown', key)
  const winner = bodies[written[0] ?? -1]
  if (!winner) throw new Stop(3, 'no racing write is known to have won', key)
  await readBack(p, key, winner, 'read after the race')
}

/**
 * The probe itself, over the API's composed stores: the sequential key, then the racing key.
 * @returns the exit code
 */
export async function probeWriteOnce(p: Probe, keys: readonly [string, string] = freshKeys()): Promise<number> {
  p.log({ event: 'STORAGE_PROBE_START', ...(p.namespace ? { namespace: p.namespace } : {}), keys })
  try {
    await sequential(p, keys[0])
    await race(p, keys[1])
    p.log({ event: 'STORAGE_PROBE_DONE', ok: true, exit: 0, keys, providerRequests: p.calls.length, objects: 2 })
    return 0
  } catch (error) {
    const stop = error instanceof Stop ? error : new Stop(3, String(error))
    p.log({
      event: 'STORAGE_PROBE_DONE',
      ok: false,
      exit: stop.exit,
      reason: stop.message,
      key: stop.key,
      keys,
      providerRequests: p.calls.length,
      sent: Object.fromEntries(keys.map((k) => [k, sent(p.calls, k)])),
    })
    return stop.exit
  }
}

/** The preconditions, before any write: the API's settings, its login (never an owner's), and 0044. */
async function ready(pool: pg.Pool, store: ByteStore | null) {
  if (!store) throw new Stop(2, 'the API has no byte store configured')
  try {
    await checkRoleSafety(pool)
  } catch (error) {
    throw new Stop(2, `not the API's login: ${error instanceof Error ? error.message : String(error)}`)
  }
  const { rows } = await pool.query<{ ok: boolean }>(STORE_SCHEMA)
  if (!rows[0]?.ok) throw new Stop(2, 'the database has no write claim (0044)')
}

/**
 * Run the probe with the API's own environment (SOPHIA_API_DATABASE_URL and the five SOPHIA_STORAGE_* settings). It ends
 * within PROBE_MS from its first query, its preconditions' included, and closing its connections waits at most
 * ENDING_MS more: run from a start command, the API's own start follows it whatever the database or the provider does.
 * Tests give a stand-in provider and a shorter deadline.
 * @returns the exit code
 */
export async function runStorageProbe(
  env: Record<string, string | undefined>,
  options: { fetchImpl?: typeof fetch; log?: (record: object) => void; runId?: string; probeMs?: number } = {},
): Promise<number> {
  const print = options.log ?? ((record: object) => console.log(JSON.stringify(record)))
  // Once the probe is past its time, nothing it does after is reported: the deadline's line is the last.
  let over = false
  const log = (record: object) => {
    if (!over) print(record)
  }
  const url = env.SOPHIA_API_DATABASE_URL?.trim()
  if (!url) {
    log({ event: 'STORAGE_PROBE_DONE', ok: false, exit: 2, reason: 'SOPHIA_API_DATABASE_URL is not set' })
    return 2
  }
  const calls: ProviderCall[] = []
  const fetchImpl = countingFetch(calls, options.fetchImpl, () => over)
  const pool = createPool(url, { max: 2 })
  const racers = createPool(url, { max: RACERS })
  const probeMs = options.probeMs ?? PROBE_MS
  // Known once the preconditions hold, so the deadline's line names them too.
  let keys: readonly [string, string] | undefined
  const deadline = deadlineAfter(probeMs, () => {
    log({
      event: 'STORAGE_PROBE_DONE',
      ok: false,
      exit: 3,
      reason: `past ${String(probeMs)} ms`,
      keys,
      providerRequests: calls.length,
    })
    over = true
  })
  const probe = async () => {
    try {
      const raw = byteStoreFromEnv(env, fetchImpl)
      await ready(pool, raw)
      const store = writeOnceStore(pool, raw)
      const racing = writeOnceStore(racers, raw)
      if (!store || !racing) throw new Stop(2, 'the API has no byte store configured')
      // Preconditions that answered only after the deadline write nothing: the deadline's exit stands.
      if (over) return 3
      const oneShot = options.runId !== undefined
      keys = oneShot ? runKeys(options.runId ?? '') : freshKeys()
      const namespace = namespaceOf(env)
      return await probeWriteOnce({ store, racing, calls, fetchImpl, log, oneShot, namespace }, keys)
    } catch (error) {
      const stop = error instanceof Stop ? error : new Stop(2, String(error))
      log({ event: 'STORAGE_PROBE_DONE', ok: false, exit: stop.exit, reason: stop.message })
      return stop.exit
    }
  }
  try {
    return await Promise.race([probe(), deadline.done])
  } finally {
    deadline.cancel()
    await closeWithin([pool, racers])
  }
}

/** Exit 3 once `ms` have passed, after `report` has written the deadline's line. */
function deadlineAfter(ms: number, report: () => void): { done: Promise<number>; cancel: () => void } {
  let timer: NodeJS.Timeout | undefined
  const done = new Promise<number>((resolve) => {
    timer = setTimeout(() => {
      report()
      resolve(3)
    }, ms)
  })
  return { done, cancel: () => clearTimeout(timer) }
}

/** Close the pools, waiting no longer than ENDING_MS: a connection the database never answered can't hold the probe. */
async function closeWithin(pools: pg.Pool[]) {
  let ending: NodeJS.Timeout | undefined
  await Promise.race([
    Promise.allSettled(pools.map((p) => p.end())),
    new Promise((resolve) => (ending = setTimeout(resolve, ENDING_MS))),
  ])
  clearTimeout(ending)
}
