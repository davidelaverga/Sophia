// One voice tool call, two API processes (Codex P1 r4234393693 and r4234171899 on PR #190), level: sql-run. A recorded
// call's attempt in a second API process (cross-instance-child.ts: a real child Node process, so its module instance
// and its pool are its own and nothing of this process is shared) pauses once its binding has committed, before its
// handler; this process's API takes the identical call meanwhile. Root's sequence: the goal completed, the child binds
// and pauses, the parent answers, the goal starts running, the child goes on. Before the fence, the parent ran and
// marked the call refused, and the child then admitted a Hold the record linked to its refusal.
// A holder whose fence session is lost while its API process goes on (Codex P1 r4234782534): its fence's backend is
// terminated alone (found by the call key's hashed advisory lock), and another attempt takes the fence. And one API
// process holds a bounded number of fences (Codex P1 r4234782537), counted in pg_locks.
import { type ChildProcess, fork } from 'node:child_process'
import net from 'node:net'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { MediaToolCall, MediaToolResult } from '@sophia/contracts'
import {
  admitNativeTask,
  createPool,
  readSnapshot,
  startExchange,
  submitContribution,
  withActor,
} from '@sophia/persistence'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { CallFences, fenceCall } from './call-fence.ts'
import { executeToolCall } from './media-tools.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const MEDIA_TOKEN = 'media-bridge-capability-for-tests-0123456789'
const LIVEKIT = { url: 'ws://127.0.0.1:9', apiKey: 'devkey', apiSecret: 'livekit-test-secret-at-least-32-bytes!!' }
const CHILD = fileURLToPath(new URL('./cross-instance-child.ts', import.meta.url))
/**
 * How long a call waits for another attempt's fence (media-tools.ts CALL_FENCE_WAIT_MS). Not imported, so the test also
 * runs against a source without it.
 */
const CALL_FENCE_WAIT_MS = 5000
const A = randomUUID() // admin
const P = randomUUID() // the synthetic principal, an editor
const RUN = 'ab'.repeat(32)

/** A call's answer as the bridge reads it. */
type Answer = { status: MediaToolResult['status']; output: Record<string, unknown> }

let db: TestDatabase
let pool: pg.Pool
const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
const mediaBridgeTokenSha256 = createHash('sha256').update(MEDIA_TOKEN, 'utf8').digest()
/** The parent API, voice qualification on: its calls are recorded, and made under their fence. */
let app: FastifyInstance
/** The same API with voice qualification off: nothing is recorded or fenced. */
let off: FastifyInstance
/** Every second process still running: a test that fails leaves its child paused, and the file must still end. */
const children = new Set<ChildProcess>()

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 6 })
  app = buildApp({ pool, verifyActor, mediaBridgeTokenSha256, livekit: LIVEKIT, voiceQualification: true })
  off = buildApp({ pool, verifyActor, mediaBridgeTokenSha256, livekit: LIVEKIT })
  await app.ready()
  await off.ready()
})
after(async () => {
  await Promise.all(
    [...children].map(async (child) => {
      const gone = new Promise<void>((resolve) => child.once('exit', () => resolve()))
      child.kill('SIGKILL')
      await gone
    }),
  )
  await app?.close()
  await off?.close()
  await pool?.end()
  await db?.drop()
})

async function owner<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

/**
 * A project whose principal holds P's grant and the floor of an exchange opened under it (epoch 1), with a brief's
 * task: the Hold's work. Its calls through the parent API, the goal's status, and what the call key holds.
 */
async function exchange() {
  const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [P] })
  await registerRuntime(db.ownerUrl, { projectId, admin: A })
  await owner((c) =>
    c.query(`SELECT sophia.voice_qualification_grant($1,$2,$3,'synthetic-approval',900,3,20,1000,200000,3600)`, [
      projectId,
      P,
      RUN,
    ]),
  )
  const snap = await withActor(pool, P, 'read', (c) => readSnapshot(c, projectId))
  assert.ok(snap)
  const { exchangeId } = await withActor(pool, P, 'write', (c) =>
    startExchange(c, snap.room.id, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
  )
  const said = await withActor(pool, A, 'write', (c) =>
    submitContribution(c, projectId, randomUUID(), {
      source: null,
      text: 'Draft the brief from this.',
      threadId: null,
      artifactVersionId: null,
      intent: 'discuss',
    }),
  )
  const { rows } = await owner((c) =>
    c.query<{ r: string }>(`SELECT mission_revision AS r FROM sophia.projects WHERE id=$1`, [projectId]),
  )
  const { taskId } = await withActor(pool, A, 'write', (c) =>
    admitNativeTask(c, projectId, randomUUID(), {
      kind: 'draft_brief',
      instruction: 'Draft the brief.',
      contributionIds: [said.contributionId],
      expectedMissionRevision: Number(rows[0]?.r),
    }),
  )
  const goal = async () => {
    const read = await withActor(pool, P, 'read', (c) => readSnapshot(c, projectId))
    const found = read?.goals.find((g) => g.id === read.work.find((t) => t.id === taskId)?.goalId)
    assert.ok(found)
    return found
  }
  const goalId = (await goal()).id
  /** The bridge's call, as it sends it: a Hold on the brief's work, or a read. */
  const hold = (callId: string, name: MediaToolCall['name'] = 'control_work'): MediaToolCall => ({
    exchangeId,
    connectionGeneration: 1,
    callId,
    name,
    args: name === 'control_work' ? { taskId, action: 'hold' } : {},
    inputEpoch: 1,
    actorId: P,
    guide: 'v1.2',
  })
  return {
    projectId,
    exchangeId,
    hold,
    key: (callId: string) => `live:${exchangeId}:1:${callId}`,
    goalIs: (status: string) =>
      owner((c) => c.query(`UPDATE sophia.goals SET status=$2 WHERE id=$1`, [goalId, status])),
    goalStatus: async () => (await goal()).status,
    /** The parent's API answering the call, and how long it took. */
    api: async (call: MediaToolCall, api = app) => {
      const started = Date.now()
      const res = await api.inject({
        method: 'POST',
        url: '/v1/media/tool-calls',
        headers: { authorization: `Bearer ${MEDIA_TOKEN}` },
        payload: call,
      })
      assert.equal(res.statusCode, 200, res.body)
      return { answer: JSON.parse(res.body) as Answer, ms: Date.now() - started }
    },
    commandsUnder: async (callId: string) =>
      (
        await owner((c) =>
          c.query<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.commands WHERE idempotency_key=$1`, [
            `live:${exchangeId}:1:${callId}`,
          ]),
        )
      ).rows[0]?.n,
    /** The record: each call P's exchange holds, its command's kind and its answer. */
    recorded: async () =>
      (
        await owner((c) =>
          c.query<{ tool: string; kind: string | null; outcome: string | null }>(
            `SELECT lt.tool, c.kind, lt.outcome FROM sophia.live_tool_calls lt
              LEFT JOIN sophia.commands c ON c.project_id=lt.project_id AND c.id=lt.command_id
              WHERE lt.exchange_id=$1 ORDER BY lt.seq`,
            [exchangeId],
          ),
        )
      ).rows.map((r) => [r.tool, r.kind, r.outcome]),
    /** The command the record links to a call, if any. */
    linked: async (callId: string) =>
      (
        await owner((c) =>
          c.query<{ id: string | null }>(
            `SELECT command_id AS id FROM sophia.live_tool_calls WHERE exchange_id=$1 AND idempotency_key=$2`,
            [exchangeId, `live:${exchangeId}:1:${callId}`],
          ),
        )
      ).rows[0]?.id,
  }
}

/** The backends holding a call key's fence: its advisory lock, found by the hashed key, with their application name. */
async function fenceHolders(key: string): Promise<Array<{ pid: number; app: string }>> {
  const { rows } = await owner((c) =>
    c.query<{ pid: number; app: string }>(
      `SELECT l.pid, a.application_name AS app
         FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid, (SELECT hashtextextended($1, 0) AS h) k
        WHERE l.locktype='advisory' AND l.granted AND l.objsubid=1 AND l.database=(SELECT oid FROM pg_database
          WHERE datname=current_database())
          AND l.classid::bigint=((k.h>>32) & 4294967295) AND l.objid::bigint=(k.h & 4294967295)`,
      [`sophia.live_call:${key}`],
    ),
  )
  return rows
}

/** Terminate the one backend holding a call key's fence, and wait until it is gone; its API process goes on. */
async function dropFence(key: string): Promise<number> {
  const holders = await fenceHolders(key)
  assert.equal(holders.length, 1, 'one backend holds the fence')
  const pid = holders[0]?.pid ?? 0
  await owner((c) => c.query(`SELECT pg_terminate_backend($1)`, [pid]))
  const deadline = Date.now() + 10_000
  while ((await owner((c) => c.query(`SELECT 1 FROM pg_stat_activity WHERE pid=$1`, [pid]))).rowCount) {
    if (Date.now() > deadline) throw new Error('the fence’s backend did not end')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  // Let the holder's process see its session end.
  await new Promise((resolve) => setTimeout(resolve, 200))
  return pid
}

type Pause = 'bound' | 'mark' | 'admitted'
type ChildMessage =
  { type: 'started'; pid: number } | { type: 'paused'; at: Pause } | { type: 'answer'; answer: Answer }

/**
 * The call made by a second API process. It stops where asked: once its binding committed ('bound'), just before its
 * answer is written ('mark': sealed with its write, or marked on its own), and just before the COMMIT of the
 * transaction that admitted its command ('admitted').
 */
function second(call: MediaToolCall, { mode = 'on', pause = 'bound' }: { mode?: 'on' | 'off'; pause?: string } = {}) {
  const proc = fork(CHILD, [db.apiUrl, JSON.stringify(call), mode, pause], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  })
  children.add(proc)
  proc.once('exit', () => children.delete(proc))
  const messages: ChildMessage[] = []
  const waiters: Array<() => void> = []
  proc.on('message', (m: ChildMessage) => {
    messages.push(m)
    for (const wake of waiters.splice(0)) wake()
  })
  const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()))
  async function next<T extends ChildMessage['type']>(type: T): Promise<Extract<ChildMessage, { type: T }>> {
    const deadline = Date.now() + 30_000
    for (;;) {
      const found = messages.find((m): m is Extract<ChildMessage, { type: T }> => m.type === type)
      if (found) return found
      if (Date.now() > deadline) throw new Error(`the child sent no ${type}`)
      await new Promise<void>((resolve) => {
        waiters.push(resolve)
        setTimeout(resolve, 200)
      })
    }
  }
  return {
    started: () => next('started'),
    paused: async (at: Pause = 'bound') => {
      const deadline = Date.now() + 30_000
      while (!messages.some((m) => m.type === 'paused' && m.at === at)) {
        if (Date.now() > deadline) throw new Error(`the child never stopped at ${at}`)
        await next('paused')
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
    },
    answer: async () => (await next('answer')).answer,
    go: () => proc.send('go'),
    /** The process dies where it stands: its connections, and the fence its session held, end with it. */
    kill: async () => {
      proc.kill('SIGKILL')
      await exited
    },
    exited,
    alive: () => proc.exitCode === null && proc.signalCode === null,
  }
}

describe('a recorded call made in two API processes at once (Codex r4234393693, r4234171899)', () => {
  it('root’s sequence: the parent waits on the child’s fence, then answers that the call is still being made and runs and marks nothing; the record is what the child did', async () => {
    const x = await exchange()
    await x.goalIs('completed')
    const child = second(x.hold('k-1'))
    assert.notEqual((await child.started()).pid, process.pid, 'another process: its own module instance and pool')
    await child.paused()
    assert.deepEqual(await x.recorded(), [['control_work', null, null]], 'the child bound and recorded it, then paused')
    const parent = await x.api(x.hold('k-1'))
    assert.deepEqual([parent.answer.status, parent.answer.output.code], ['unknown', 'unconfirmed:in_progress'])
    assert.ok(parent.ms >= CALL_FENCE_WAIT_MS - 500, `it waited for the fence (${String(parent.ms)} ms)`)
    assert.equal(await x.commandsUnder('k-1'), 0, 'nothing ran')
    assert.deepEqual(await x.recorded(), [['control_work', null, null]], 'nothing was marked')
    await x.goalIs('running')
    child.go()
    const own = await child.answer()
    assert.equal(own.status, 'ok', JSON.stringify(own))
    await child.exited
    assert.equal(await x.commandsUnder('k-1'), 1)
    assert.equal(await x.goalStatus(), 'holding')
    assert.deepEqual(await x.recorded(), [['control_work', 'hold', 'ok']], 'the record says what the child did')
    const again = await x.api(x.hold('k-1'))
    assert.deepEqual(
      [again.answer.status, again.answer.output.replayed, again.answer.output.commandId],
      ['ok', true, own.output.commandId],
      'its repeat is answered from the record',
    )
    assert.equal(await x.commandsUnder('k-1'), 1)
  })

  it('the same interleaving with no change of state: the child refuses, the parent ran nothing, the record is one refusal', async () => {
    const x = await exchange()
    await x.goalIs('completed')
    const child = second(x.hold('k-2'))
    await child.paused()
    const parent = await x.api(x.hold('k-2'))
    assert.equal(parent.answer.status, 'unknown', 'still being made')
    child.go()
    assert.equal((await child.answer()).status, 'refused')
    await child.exited
    assert.equal(await x.commandsUnder('k-2'), 0)
    assert.deepEqual(await x.recorded(), [['control_work', null, 'refused']])
    const again = await x.api(x.hold('k-2'))
    assert.deepEqual([again.answer.status, again.answer.output.replayed], ['refused', true])
  })

  it('the holder keeps the fence from before its binding to after its mark: a repeat waiting meanwhile reads the answer it marked, whatever the work did since', async () => {
    const x = await exchange()
    await x.goalIs('completed')
    const child = second(x.hold('k-7'), { pause: 'bound,mark' })
    await child.paused('bound')
    let settled = false
    const parent = x.api(x.hold('k-7')).then((r) => {
      settled = true
      return r
    })
    await new Promise((resolve) => setTimeout(resolve, 300)) // the parent waits on the fence
    child.go()
    await child.paused('mark') // the child's handler refused; its answer is not marked yet
    await x.goalIs('running') // the work moves before the mark
    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.equal(settled, false, 'the parent still waits: the fence is held to the mark')
    child.go()
    assert.equal((await child.answer()).status, 'refused')
    const answered = await parent
    assert.deepEqual(
      [answered.answer.status, answered.answer.output.replayed],
      ['refused', true],
      'once the child marked it, the parent read its answer: nothing ran again',
    )
    assert.equal(await x.commandsUnder('k-7'), 0, 'no Hold, though the work now runs')
    assert.deepEqual(await x.recorded(), [['control_work', null, 'refused']])
    await child.exited
  })

  it('a holder that dies releases the fence: the call it left unanswered runs again, once, and is marked', async () => {
    const x = await exchange()
    await x.goalIs('running')
    const child = second(x.hold('k-3'))
    await child.paused()
    await child.kill()
    const parent = await x.api(x.hold('k-3'))
    assert.equal(parent.answer.status, 'ok', JSON.stringify(parent.answer))
    assert.ok(parent.ms < CALL_FENCE_WAIT_MS - 500, `the fence was free at once (${String(parent.ms)} ms)`)
    assert.equal(await x.commandsUnder('k-3'), 1)
    assert.deepEqual(await x.recorded(), [['control_work', 'hold', 'ok']])
  })

  it('calls under other keys never wait on a held fence', async () => {
    const x = await exchange()
    await x.goalIs('running')
    const child = second(x.hold('k-4'))
    await child.paused()
    const read = await x.api(x.hold('k-5', 'project_status'))
    assert.equal(read.answer.status, 'ok')
    assert.ok(read.ms < 2000, `another key went on at once (${String(read.ms)} ms)`)
    child.go()
    assert.equal((await child.answer()).status, 'ok')
    await child.exited
  })

  it('with voice qualification off nothing is recorded or fenced: the parent runs at once, and the key admits one Hold', async () => {
    const x = await exchange()
    await x.goalIs('running')
    const child = second(x.hold('k-6'), { mode: 'off' })
    await child.paused()
    const parent = await x.api(x.hold('k-6'), off)
    assert.equal(parent.answer.status, 'ok')
    assert.ok(parent.ms < 2000, `not fenced (${String(parent.ms)} ms)`)
    child.go()
    const own = await child.answer()
    assert.deepEqual([own.status, own.output.commandId], ['ok', parent.answer.output.commandId], 'the same Hold')
    await child.exited
    assert.equal(await x.commandsUnder('k-6'), 1)
    assert.deepEqual(await x.recorded(), [], 'nothing recorded')
  })
})

describe('a holder whose fence session is lost while its API process goes on (Codex r4234782534)', () => {
  it('root’s sequence: the child’s fence dropped after its binding; the parent refuses and marks; the work runs; the child goes on and admits nothing', async () => {
    const x = await exchange()
    await x.goalIs('completed')
    const child = second(x.hold('k-11'))
    await child.paused()
    await dropFence(x.key('k-11'))
    assert.ok(child.alive(), 'only the fence’s session ended: the child API process goes on')
    const parent = await x.api(x.hold('k-11'))
    assert.equal(parent.answer.status, 'refused', JSON.stringify(parent.answer))
    assert.ok(parent.ms < CALL_FENCE_WAIT_MS - 500, `the fence was free (${String(parent.ms)} ms)`)
    assert.deepEqual(await x.recorded(), [['control_work', null, 'refused']])
    await x.goalIs('running')
    child.go()
    const own = await child.answer()
    assert.deepEqual([own.status, own.output.code], ['unknown', 'unconfirmed:fence_lost'], JSON.stringify(own))
    await child.exited
    assert.equal(await x.commandsUnder('k-11'), 0, 'no Hold')
    assert.equal(await x.goalStatus(), 'running')
    assert.deepEqual(await x.recorded(), [['control_work', null, 'refused']], 'the record is the parent’s refusal')
    const again = await x.api(x.hold('k-11'))
    assert.deepEqual([again.answer.status, again.answer.output.replayed], ['refused', true])
  })

  it('dropped during the handler, its Hold written but not committed: the child’s write rolls back at its generation check; the parent admits the one Hold and answers it', async () => {
    const x = await exchange()
    await x.goalIs('running')
    const child = second(x.hold('k-12'), { pause: 'mark' })
    await child.paused('mark') // in the transaction that admitted the Hold, before its seal
    await dropFence(x.key('k-12'))
    const parent = x.api(x.hold('k-12')) // takes the fence and its next generation, then waits on the child's write
    await new Promise((resolve) => setTimeout(resolve, 300))
    child.go()
    const own = await child.answer()
    assert.deepEqual([own.status, own.output.code], ['unknown', 'unconfirmed:fence_lost'], JSON.stringify(own))
    const answered = (await parent).answer
    assert.equal(answered.status, 'ok', JSON.stringify(answered))
    assert.equal(answered.output.replayed, undefined, 'run by the parent, not replayed')
    await child.exited
    assert.equal(await x.commandsUnder('k-12'), 1)
    assert.equal(await x.goalStatus(), 'holding')
    assert.deepEqual(await x.recorded(), [['control_work', 'hold', 'ok']])
    assert.equal(await x.linked('k-12'), answered.output.commandId)
  })

  it('dropped after the admitting transaction’s generation check, before its COMMIT: the child commits its Hold with its answer, and the parent replays that answer', async () => {
    const x = await exchange()
    await x.goalIs('running')
    const child = second(x.hold('k-13'), { pause: 'admitted' })
    await child.paused('admitted')
    await dropFence(x.key('k-13'))
    let settled = false
    const parent = x.api(x.hold('k-13')).then((r) => {
      settled = true
      return r
    })
    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.equal(settled, false, 'the parent’s generation waits for the child’s sealed write')
    child.go()
    const own = await child.answer()
    assert.equal(own.status, 'ok', JSON.stringify(own))
    const answered = (await parent).answer
    assert.deepEqual(
      [answered.status, answered.output.replayed, answered.output.commandId],
      ['ok', true, own.output.commandId],
      'the parent found the answer committed with the Hold, and ran nothing again',
    )
    await child.exited
    assert.equal(await x.commandsUnder('k-13'), 1)
    assert.deepEqual(await x.recorded(), [['control_work', 'hold', 'ok']])
  })

  it('dropped before the mark of a call that wrote nothing: the parent runs it and answers; the child’s refusal is not marked, and it answers that it could not confirm', async () => {
    const x = await exchange()
    await x.goalIs('completed')
    const child = second(x.hold('k-14'), { pause: 'mark' })
    await child.paused('mark') // refused; its mark not written yet
    await dropFence(x.key('k-14'))
    await x.goalIs('running')
    const parent = await x.api(x.hold('k-14'))
    assert.deepEqual([parent.answer.status, parent.answer.output.replayed], ['ok', undefined])
    child.go()
    const own = await child.answer()
    assert.deepEqual([own.status, own.output.code], ['unknown', 'unconfirmed:fence_lost'], JSON.stringify(own))
    await child.exited
    assert.equal(await x.commandsUnder('k-14'), 1)
    assert.equal(await x.goalStatus(), 'holding')
    assert.deepEqual(await x.recorded(), [['control_work', 'hold', 'ok']])
  })

  it('a holder that lost its fence stops at once, though nobody took it: nothing run, nothing marked, and the call runs once when asked again', async () => {
    const x = await exchange()
    await x.goalIs('running')
    const child = second(x.hold('k-15'))
    await child.paused()
    await dropFence(x.key('k-15'))
    child.go()
    const own = await child.answer()
    assert.deepEqual([own.status, own.output.code], ['unknown', 'unconfirmed:fence_lost'], JSON.stringify(own))
    await child.exited
    assert.equal(await x.commandsUnder('k-15'), 0)
    assert.deepEqual(await x.recorded(), [['control_work', null, null]], 'unanswered')
    const parent = await x.api(x.hold('k-15'))
    assert.equal(parent.answer.status, 'ok')
    assert.equal(await x.commandsUnder('k-15'), 1)
    assert.deepEqual(await x.recorded(), [['control_work', 'hold', 'ok']])
  })
})

describe('the fences one API process holds are bounded (Codex r4234782537)', () => {
  /** The fences held now (granted advisory locks) for these call keys. */
  async function fencesFor(keys: string[]): Promise<number> {
    let n = 0
    for (const key of keys) n += (await fenceHolders(key)).length
    return n
  }

  it('root’s sequence: a pool of one, the first binding held, three calls under distinct keys: two fences, and the third answers within its wait, having run and marked nothing', async () => {
    const x = await exchange()
    const small = createPool(db.apiUrl, { max: 1 })
    const bounded = buildApp({
      pool: small,
      verifyActor,
      mediaBridgeTokenSha256,
      livekit: LIVEKIT,
      voiceQualification: true,
      callFenceSessions: 2,
    })
    await bounded.ready()
    const holder = new pg.Client({ connectionString: db.ownerUrl })
    await holder.connect()
    const keys = ['b-1', 'b-2', 'b-3'].map((id) => x.key(id))
    try {
      // The project's lock, so the first call's binding (its recording) holds the pool's one connection.
      await holder.query('BEGIN')
      await holder.query('SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE', [x.projectId])
      const call = (id: string) => x.api(x.hold(id, 'project_status'), bounded)
      const first = call('b-1')
      const next = call('b-2')
      const third = call('b-3')
      await new Promise((resolve) => setTimeout(resolve, 1000))
      assert.equal(await fencesFor(keys), 2, 'two fence sessions, the bound')
      assert.deepEqual([small.totalCount, small.waitingCount], [1, 1], 'one connection busy, one call waiting for it')
      const busy = await third
      assert.deepEqual(
        [busy.answer.status, busy.answer.output.code],
        ['unknown', 'unconfirmed:busy'],
        JSON.stringify(busy.answer),
      )
      assert.ok(
        busy.ms >= CALL_FENCE_WAIT_MS - 500 && busy.ms < CALL_FENCE_WAIT_MS + 3000,
        `it answered within its wait (${String(busy.ms)} ms)`,
      )
      assert.equal(await fencesFor(keys), 2, 'still two')
      await holder.query('COMMIT')
      assert.deepEqual([(await first).answer.status, (await next).answer.status], ['ok', 'ok'])
      assert.deepEqual(
        await x.recorded(),
        [
          ['project_status', null, 'ok'],
          ['project_status', null, 'ok'],
        ],
        'the third was never bound, run or marked',
      )
      assert.equal(await fencesFor(keys), 0, 'every fence given back: unlocked, its session ended')
      const fourth = await x.api(x.hold('b-4', 'project_status'), bounded)
      assert.equal(fourth.answer.status, 'ok', 'a call alone goes on (control)')
      // A session ends on the server once its socket closed: its backend leaves pg_stat_activity just after.
      const fenceSessions = async () =>
        (
          await owner((c) =>
            c.query<{ n: number }>(
              `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1`,
              ['sophia-call-fence'],
            ),
          )
        ).rows[0]?.n
      await until('no fence session is left open', async () => (await fenceSessions()) === 0, 2000)
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined)
      await holder.end()
      await bounded.close()
      await small.end()
    }
  })
})

/** A tool result's code, if its output has one. */
const outputCode = (result: MediaToolResult): unknown => ('code' in result.output ? result.output.code : undefined)

/**
 * A pool on the test's database whose queries naming `failing` fail before they are sent, as one whose connection
 * dropped would, or with PostgreSQL's `code` (Codex P1 r4235131965). A call's fence takes a session of its own, from
 * the same options, unaffected.
 */
function failingPool(failing: string, code?: string): pg.Pool {
  const failingOne = createPool(db.apiUrl, { max: 4 })
  const connect = failingOne.connect.bind(failingOne) as () => Promise<pg.PoolClient>
  const wrapped = new WeakSet<pg.PoolClient>()
  async function connectFailing(): Promise<pg.PoolClient> {
    const client = await connect()
    if (!wrapped.has(client)) {
      wrapped.add(client)
      const query = client.query.bind(client) as (text: string, values?: unknown[]) => Promise<pg.QueryResult>
      const failingQuery = (text: string, values?: unknown[]) =>
        typeof text === 'string' && text.includes(failing)
          ? Promise.reject(Object.assign(new Error(`injected: ${failing} failed`), code === undefined ? {} : { code }))
          : query(text, values)
      Object.assign(client, { query: failingQuery })
    }
    return client
  }
  Object.assign(failingOne, { connect: connectFailing })
  return failingOne
}

describe('a call whose answer is not written answers unknown, never what its handler found (Codex r4235131965)', () => {
  it('a call that wrote nothing, its mark failing: unknown, left unanswered; asked again once the work runs, it runs once and is marked', async () => {
    const x = await exchange()
    await x.goalIs('completed')
    const failing = failingPool('media_mark_live_call')
    try {
      const first = await executeToolCall(failing, x.hold('m-1'), true)
      assert.deepEqual([first.status, outputCode(first)], ['unknown', 'unconfirmed:mark_failed'], JSON.stringify(first))
      assert.deepEqual(await x.recorded(), [['control_work', null, null]], 'unanswered: the refusal is not its answer')
    } finally {
      await failing.end()
    }
    await x.goalIs('running')
    const again = await x.api(x.hold('m-1'))
    assert.deepEqual([again.answer.status, again.answer.output.replayed], ['ok', undefined])
    assert.equal(await x.commandsUnder('m-1'), 1)
    assert.deepEqual(await x.recorded(), [['control_work', 'hold', 'ok']])
  })

  it('a write whose seal fails: nothing commits and it answers unknown; asked again, it runs once and is marked', async () => {
    const x = await exchange()
    await x.goalIs('running')
    // A serialization failure, as PostgreSQL raises it: a v1.2 guide's control would explain it as a refusal.
    const failing = failingPool('live_call_seal', '40001')
    try {
      const first = await executeToolCall(failing, x.hold('m-2'), true)
      assert.deepEqual([first.status, outputCode(first)], ['unknown', 'unconfirmed:seal_failed'], JSON.stringify(first))
      assert.equal(await x.commandsUnder('m-2'), 0, 'the Hold rolled back with its seal')
      assert.equal(await x.goalStatus(), 'running')
      assert.deepEqual(await x.recorded(), [['control_work', null, null]], 'unanswered')
    } finally {
      await failing.end()
    }
    const again = await x.api(x.hold('m-2'))
    assert.deepEqual([again.answer.status, again.answer.output.replayed], ['ok', undefined])
    assert.equal(await x.commandsUnder('m-2'), 1)
    assert.deepEqual(await x.recorded(), [['control_work', 'hold', 'ok']])
  })

  it('a mark that is written returns what the handler found (control)', async () => {
    const x = await exchange()
    await x.goalIs('completed')
    const failing = failingPool('nothing-is-named-this')
    try {
      const answered = await executeToolCall(failing, x.hold('m-3'), true)
      assert.equal(answered.status, 'refused', JSON.stringify(answered))
    } finally {
      await failing.end()
    }
    assert.deepEqual(await x.recorded(), [['control_work', null, 'refused']])
  })
})

/** Until `check` holds, polling: what another process or the server does takes real time. */
async function until(what: string, check: () => Promise<boolean>, ms: number): Promise<void> {
  const deadline = Date.now() + ms
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/**
 * A local listener that accepts and never speaks, nor closes its side when the fence closes its own (half-open, as a
 * stalled peer does): a fence's connect to it never completes, and a graceful end waits on it. It records each socket
 * and whether the fence closed its side.
 */
async function silentPeer() {
  const sockets: Array<{ socket: net.Socket; ended: boolean }> = []
  const server = net.createServer({ allowHalfOpen: true }, (socket) => {
    const entry = { socket, ended: false }
    sockets.push(entry)
    socket.on('end', () => (entry.ended = true))
    socket.on('error', () => undefined)
    socket.resume() // it reads (and ignores) what comes, so it sees the fence close its side
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address !== null && typeof address === 'object')
  const stalledPool = createPool(`postgres://nobody@127.0.0.1:${String(address.port)}/nowhere`, { max: 1 })
  return {
    pool: stalledPool,
    sockets,
    end: async () => {
      for (const { socket } of sockets) socket.destroy()
      server.close()
      await stalledPool.end()
    },
  }
}

/**
 * A relay to the test database whose traffic can be frozen: a fence's session through it stalls once frozen, as on a
 * network that stopped answering. It records whether the fence closed its side.
 */
async function freezableRelay() {
  const target = new URL(db.apiUrl)
  const links: Array<{ client: net.Socket; upstream: net.Socket; clientClosed: boolean }> = []
  let frozen = false
  const server = net.createServer((client) => {
    const upstream = net.connect(Number(target.port), target.hostname)
    const link = { client, upstream, clientClosed: false }
    links.push(link)
    client.on('data', (data: Buffer) => {
      if (!frozen) upstream.write(data)
    })
    upstream.on('data', (data: Buffer) => {
      if (!frozen) client.write(data)
    })
    client.on('close', () => {
      link.clientClosed = true
      upstream.destroy()
    })
    upstream.on('close', () => client.destroy())
    client.on('error', () => undefined)
    upstream.on('error', () => undefined)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address !== null && typeof address === 'object')
  const url = new URL(db.apiUrl)
  url.hostname = '127.0.0.1'
  url.port = String(address.port)
  const relayPool = createPool(url.toString(), { max: 1 })
  return {
    pool: relayPool,
    links,
    freeze: () => {
      frozen = true
    },
    end: async () => {
      for (const { client, upstream } of links) {
        client.destroy()
        upstream.destroy()
      }
      server.close()
      await relayPool.end()
    },
  }
}

/** How late past its budget a fence may answer: the abort is synchronous, so only timer and event-loop latency. */
const MARGIN_MS = 250
/** call-fence.ts FENCE_UNLOCK_MS (not imported, so the test also runs against a source without it). */
const UNLOCK_MS = 1000

describe('a fence’s connect is bounded by the call’s budget, and given up at once (Codex r4235131974, root r4235308990)', () => {
  it('a connect that never completes: the call answers unknown within its budget plus the margin; at its return the slot is back and the peer saw the socket close; the next call goes on', async () => {
    const x = await exchange()
    await x.goalIs('running')
    const silent = await silentPeer()
    const fences = new CallFences(1)
    try {
      const started = Date.now()
      const answered = await executeToolCall(silent.pool, x.hold('c-1'), true, fences)
      const ms = Date.now() - started
      const held = fences.held
      // The socket was destroyed before the answer; its peer sees that on its next turns of the event loop.
      await new Promise((resolve) => setTimeout(resolve, 50))
      assert.deepEqual(
        [answered.status, outputCode(answered)],
        ['unknown', 'unconfirmed:fence_timeout'],
        JSON.stringify(answered),
      )
      assert.ok(
        ms >= CALL_FENCE_WAIT_MS - 50 && ms < CALL_FENCE_WAIT_MS + MARGIN_MS,
        `it answered at its budget (${String(ms)} ms)`,
      )
      assert.equal(held, 0, 'its slot was back when it answered')
      assert.deepEqual(
        silent.sockets.map((s) => s.ended),
        [true],
        'the peer saw the fence close its side',
      )
      assert.deepEqual(await x.recorded(), [], 'nothing bound, run or marked')
      const next = await executeToolCall(pool, x.hold('c-2'), true, fences)
      assert.equal(next.status, 'ok', 'the next call, on a working database, goes on')
      assert.equal(fences.held, 0)
    } finally {
      await silent.end()
    }
  })

  it('a short budget (700 ms): late within it plus the margin, and a call queued behind it gets the slot when that budget ends', async () => {
    const x = await exchange()
    const silent = await silentPeer()
    const fences = new CallFences(1)
    try {
      const started = Date.now()
      const first = fenceCall(silent.pool, fences, { exchangeId: x.exchangeId, key: x.key('q-1') }, 700)
      await new Promise((resolve) => setTimeout(resolve, 350))
      // Queued for the one slot, on the working database, with a 700 ms wait of its own (it ends at about 1,050 ms).
      const queued = fenceCall(pool, fences, { exchangeId: x.exchangeId, key: x.key('q-2') }, 700).then((fence) => ({
        fence,
        ms: Date.now() - started,
      }))
      assert.equal(await first, 'late')
      const firstMs = Date.now() - started
      assert.ok(firstMs >= 650 && firstMs < 700 + MARGIN_MS, `late at its budget (${String(firstMs)} ms)`)
      const behind = await queued
      assert.notEqual(behind.fence, 'busy', 'the queued call got the slot when the first one’s budget ended')
      assert.notEqual(behind.fence, 'late')
      assert.notEqual(behind.fence, 'held')
      assert.ok(behind.ms < 1050, `before its own wait ran out (${String(behind.ms)} ms)`)
      if (typeof behind.fence === 'object') await behind.fence.release()
      assert.equal(fences.held, 0)
    } finally {
      await silent.end()
    }
  })

  it('a release whose session stalls: unlocked or not within its bound, the socket destroyed, the slot back', async () => {
    const x = await exchange()
    const relay = await freezableRelay()
    const fences = new CallFences(1)
    try {
      const fence = await fenceCall(relay.pool, fences, { exchangeId: x.exchangeId, key: x.key('r-1') }, 5000)
      assert.ok(typeof fence === 'object', typeof fence === 'string' ? fence : 'a fence')
      assert.equal((await fenceHolders(x.key('r-1'))).length, 1, 'the fence is held through the relay')
      relay.freeze()
      const started = Date.now()
      const released = await Promise.race([
        fence.release().then(() => 'released' as const),
        new Promise<'stalled'>((resolve) => setTimeout(() => resolve('stalled'), UNLOCK_MS + 2000)),
      ])
      const ms = Date.now() - started
      assert.equal(released, 'released', `its release returned (${String(ms)} ms)`)
      assert.ok(ms < UNLOCK_MS + MARGIN_MS, `its release is bounded (${String(ms)} ms)`)
      assert.equal(fences.held, 0, 'the slot is back')
      await new Promise((resolve) => setTimeout(resolve, 50))
      assert.deepEqual(
        relay.links.map((l) => l.clientClosed),
        [true],
        'its socket was destroyed',
      )
      await until(
        'the server ended the session',
        async () => (await fenceHolders(x.key('r-1'))).length === 0,
        CALL_FENCE_WAIT_MS,
      )
    } finally {
      await relay.end()
    }
  })
})
