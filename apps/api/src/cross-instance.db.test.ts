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
      const sessions = await owner((c) =>
        c.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1`,
          ['sophia-call-fence'],
        ),
      )
      assert.equal(sessions.rows[0]?.n, 0, 'no fence session is left open')
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined)
      await holder.end()
      await bounded.close()
      await small.end()
    }
  })
})
