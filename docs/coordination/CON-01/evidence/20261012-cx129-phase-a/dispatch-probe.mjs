// Independent synthetic local-PG probe. No runtime process/provider or hosted target.
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const root = process.env.CON01_WORKTREE
const journal = process.env.CON01_JOURNAL
const imp = p => import(pathToFileURL(join(root, p)).href)
const ts = await imp('packages/test-support/src/index.ts')
const ps = await imp('packages/persistence/src/index.ts')
const { RuntimeDispatcher, dispatchOnce } = await imp('apps/worker/src/runtime-dispatch.ts')
const checks = []
const details = []
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
function check(name, actual, expected) {
  try { assert.deepEqual(actual, expected); checks.push({ name, pass: true }) }
  catch { checks.push({ name, pass: false, actual, expected }) }
}
const ends = new WeakMap()
function tracked(pool) {
  const pending = new Set(); ends.set(pool, pending)
  pool.on('connect', c => pending.add(new Promise(resolve => c.once('end', resolve))))
  return pool
}
async function close(pool) { await pool.end(); await Promise.all(ends.get(pool)) }
async function inDatabase(label, run) {
  const db = await ts.createTestDatabase()
  const api = tracked(ps.createPool(db.apiUrl, { max: 4 }))
  const worker = tracked(ps.createPool(db.workerUrl, { max: 4 }))
  const owner = tracked(ps.createPool(db.ownerUrl, { max: 2 }))
  try { await run({ db, api, worker, owner }) }
  finally { await close(api); await close(worker); await close(owner); await db.drop() }
  details.push({ label, databaseDropped: true, clientEndEventsSettled: true })
}
async function rowFor(c, stage) {
  const admin = randomUUID(), editor = randomUUID()
  const project = await ts.seedProject(c.db.ownerUrl, { admin, editors: [editor], viewers: [] })
  const rt = await ts.registerRuntime(c.db.ownerUrl, { projectId: project.projectId, admin })
  const who = { tokenSha256: ps.runtimeTokenHash(rt.token), runtimeUnitId: rt.runtimeUnitId, bridgeInstanceId: randomUUID() }
  await ps.withService(c.api, x => ps.runtimeHello(x, who, { bundle: 'independent-local-synthetic', protocolVersion: 1, dshVersion: 'no-native-process' }))
  await ps.withService(c.api, x => ps.recordRuntimeReady(x, who, { state: 'ready', reason: null, unrecovered: [] }))
  const input = await ps.withActor(c.api, editor, 'write', x => ps.submitContribution(x, project.projectId, randomUUID(), { source: null, text: 'Synthetic dispatcher review only.', threadId: null, artifactVersionId: null, intent: 'discuss' }))
  await ps.withActor(c.api, editor, 'write', x => ps.admitNativeTask(x, project.projectId, randomUUID(), { kind: 'draft_brief', instruction: 'Synthetic local queue; no native execution.', contributionIds: [input.contributionId], expectedMissionRevision: 1 }))
  const claimed = await ps.claimRuntimeOutbox(c.worker, 'independent-phase-a', 1, 30)
  assert.equal(claimed.length, 1)
  const row = claimed[0]
  assert.equal(row.project_id, project.projectId)
  if (stage === 'no-command') {
    // Explicit owned clock fixture. No shared/live connection or clock manipulation.
    await c.owner.query("UPDATE sophia.outbox SET lease_until=now()-interval '1 second' WHERE id=$1", [row.id])
    assert.equal(await ps.expireDispatchLeases(c.worker), 1)
  } else {
    assert.equal((await ps.dispatchRuntimeOutbox(c.worker, row.project_id, row.id, row.lease_token)).result, 'enqueued')
    const batch = await ps.withService(c.api, x => ps.runtimePoll(x, who, 0))
    assert.equal(batch.commands.length, 1)
    const cmd = batch.commands[0].command
    if (stage !== 'unanswered') {
      await ps.withService(c.api, x => ps.recordRuntimeReceipts(x, who, [{ commandId: cmd.commandId, attemptId: cmd.binding.attemptId, stage, nativeSessionId: 'sophia-' + cmd.binding.attemptId, nativeSequence: 3, evidenceRefs: [], observedAt: new Date().toISOString(), reason: 'Synthetic receipt; no execution.' }]))
    }
    // Model an uncertain acknowledgement after the actual admission/dispatch/receipt path.
    await c.owner.query("UPDATE sophia.outbox SET state='outcome_unknown' WHERE id=$1", [row.id])
  }
  return row
}
async function outsideOutbox(c) {
  const tables = (await c.owner.query("SELECT tablename FROM pg_tables WHERE schemaname='sophia' AND tablename<>'outbox' ORDER BY tablename")).rows
  const result = []
  for (const { tablename } of tables) {
    assert.match(tablename, /^[a-z_0-9]+$/)
    const rows = (await c.owner.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS rows FROM sophia.${tablename} t`)).rows[0].rows
    result.push({ table: tablename, rows })
  }
  return hash(result)
}
async function outbox(c, ids) {
  return (await c.owner.query('SELECT to_jsonb(o) AS row FROM sophia.outbox o WHERE id=ANY($1::uuid[]) ORDER BY id', [ids])).rows.map(x => x.row)
}
let fatal = null
try {
  for (const limit of [2, 50]) {
    await inDatabase('fairness-' + limit, async c => {
      const head = []
      for (let i = 0; i < limit; i++) head.push(await rowFor(c, i % 2 ? 'failed' : 'outcome_unknown'))
      const tail = await rowFor(c, 'no-command')
      const ids = head.map(x => x.id)
      const headBefore = await outbox(c, ids)
      const accountingBefore = await outsideOutbox(c)
      const counts = []
      for (let i = 0; i < 3; i++) counts.push(await ps.reconcileRuntimeOutbox(c.worker, limit))
      const tailAfter = (await outbox(c, [tail.id]))[0]
      check(`L${limit}: recoverable tail reached first pass and honest changed counts`, counts, [1, 0, 0])
      check(`L${limit}: no-command tail becomes pending`, tailAfter.state, 'pending')
      check(`L${limit}: uncertain heads entirely unchanged`, await outbox(c, ids), headBefore)
      check(`L${limit}: all other Sophia tables unchanged during reconciliation`, await outsideOutbox(c), accountingBefore)
      details.push({ label: 'fairness-' + limit, counts, tailState: tailAfter.state, uncertainHeads: limit, accountingBefore, accountingAfter: await outsideOutbox(c) })
      // Parent fairness control also lets the subsequent real dispatch test run.
      if (tailAfter.state === 'outcome_unknown') await ps.reconcileRuntimeOutbox(c.worker, limit + 1)
      await c.owner.query('UPDATE sophia.outbox SET available_at=now() WHERE id=$1', [tail.id])
      const dispatched = await dispatchOnce(c.worker, { workerId: 'independent-recovery', batchSize: 1 })
      check(`L${limit}: recovered row enqueues exactly once`, dispatched.outcomes.map(x => x.result), ['enqueued'])
      await dispatchOnce(c.worker, { workerId: 'independent-recovery', batchSize: 1 })
      const queued = (await c.owner.query('SELECT count(*)::int AS n FROM sophia.runtime_commands WHERE outbox_id=$1', [tail.id])).rows[0].n
      check(`L${limit}: repeated dispatch creates no duplicate command`, queued, 1)
      const calls = []
      const query = c.worker.query.bind(c.worker)
      c.worker.query = (...args) => {
        if (typeof args[0] === 'string' && args[0].includes('sophia.reconcile_runtime_outbox')) calls.push(performance.now())
        return query(...args)
      }
      const dispatcher = new RuntimeDispatcher(c.worker, { workerId: 'independent-idle', idleMs: 80 })
      dispatcher.start()
      try { await new Promise(resolve => setTimeout(resolve, 260)) }
      finally { await dispatcher.stop(); c.worker.query = query }
      const gaps = calls.slice(1).map((n, i) => n - calls[i])
      check(`L${limit}: real dispatcher idles with unchanged uncertain rows`, calls.length >= 2 && calls.length <= 5 && gaps.every(x => x >= 60), true)
      details.push({ label: 'idle-' + limit, intervalMs: 80, observedMs: 260, passes: calls.length, minimumGapMs: gaps.length ? Math.min(...gaps) : null })
    })
  }
  await inDatabase('state-and-permission-preservation', async c => {
    const stages = ['no-command', 'unanswered', 'delivered', 'checked', 'rejected']
    const rows = []
    for (const stage of stages) rows.push(await rowFor(c, stage))
    const catalog = (await c.owner.query("SELECT prosecdef,proconfig,pg_get_function_arguments(oid) AS arguments,proacl::text FROM pg_proc WHERE oid='sophia.reconcile_runtime_outbox(integer)'::regprocedure")).rows[0]
    details.push({ label: 'catalog', ...catalog })
    const before = await outsideOutbox(c)
    let denied = null
    try { await c.api.query('SELECT sophia.reconcile_runtime_outbox()') } catch (error) { denied = error.code }
    check('API execution of worker reconciliation remains denied', denied, '42501')
    const first = (await c.worker.query('SELECT sophia.reconcile_runtime_outbox() AS n')).rows[0].n
    const second = (await c.worker.query('SELECT sophia.reconcile_runtime_outbox() AS n')).rows[0].n
    check('No-argument default call preserves five recoverable transitions', [first, second], [5, 0])
    const byId = new Map((await outbox(c, rows.map(x => x.id))).map(x => [x.id, x]))
    check('Original recoverable state mapping preserved', rows.map(x => byId.get(x.id).state), ['pending', 'acknowledged', 'settled', 'settled', 'denied'])
    check('Recoverable reconciliation preserves all other tables', await outsideOutbox(c), before)
    check('Reconciliation clears owned leases', rows.every(x => byId.get(x.id).lease_token === null && byId.get(x.id).lease_until === null), true)
  })
} catch (error) { fatal = { name: error.name, message: error.message, stack: error.stack }; process.exitCode = 2 }
const result = { schema: 'sophia.con01.independent-phase-a-pg.v1', candidate: process.env.CON01_CANDIDATE, scope: 'Owned local PostgreSQL only; real API/worker logins and admission/receipt paths; explicit owned uncertainty/clock fixtures; synthetic receipts; no native/provider or hosted execution', checks, details, fatal, passed: checks.filter(x => x.pass).length, failed: checks.filter(x => !x.pass).length }
writeFileSync(join(journal, 'probe-results.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ candidate: result.candidate, passed: result.passed, failed: result.failed, fatal }))
if (!fatal && result.failed) process.exitCode = 1
