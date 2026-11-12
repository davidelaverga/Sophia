/**
 * INC01-CC-004 S5c crossing: a member's API contribution runtime with an EXPLICIT custodian, through the REAL Sophia
 * service (Fastify API and worker on a disposable PostgreSQL), the real registration script, the new launcher
 * (scripts/contribution-runtime-host.mjs) and the real pinned dsh. The contributed route is the recorded
 * `openai-research` route pointed at a local Responses stub that records each request's headers; every key is INVENTED
 * and marked. Wrong ambient default, research and search keys are set in the launcher's environment throughout.
 *
 * What it shows (source and fake only): registration writes a binding record; the launcher passes only the custody
 * file's value; another member pins and starts a project-sources-only Explore; every model call is reserved and
 * settled under the contribution; one result is retained with funding `contribution` and model payer
 * `contributor_api_account`; refusals happen before spawn; rotation needs the new revision's custody file. A fake
 * completion is not a real account, route, billing or acceptance proof.
 *
 * S5c r2 (registration atomicity): the real registration CLI against the same database. Caller fields are refused
 * before any change; a failure after the directory precheck (a real EACCES, a real EFBIG, a session lost before
 * COMMIT) rolls everything back; an unconfirmed COMMIT (a loopback proxy cutting the session) keeps the record and the
 * ids, never retries, and reconciles to rolled back or committed; accepted UUID spellings are stored lowercase.
 * S5c r3: after a genuine COMMIT, an answer with another tag (SELECT 0) or no tag stays unknown and keeps the committed
 * record; a genuine ROLLBACK tag and a genuine server ERROR at COMMIT remain definite rollbacks.
 *
 * Needs SOPHIA_DISPOSABLE_DATABASE_URL; skipped without one, as the other service crossings are.
 */

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { chmodSync, chownSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { REPO_ROOT, RUNTIME_DIR } from '../../scripts/lib/common.mjs'
import { assertRecordedArtifacts, homeLayout, installProfile } from '../../scripts/lib/profile.mjs'
import { BINDING_SCHEMA, custodyFileName, readBinding, writeBinding } from '../../scripts/lib/contribution-custody.mjs'
import { researchRouteOverlay, startMockResponses } from '../support/mock-responses.mjs'
import { sleep, unit } from '../support/harness.mjs'

const enabled = Boolean(process.env.SOPHIA_DISPOSABLE_DATABASE_URL)
const skip = enabled ? false : 'needs SOPHIA_DISPOSABLE_DATABASE_URL (a disposable PostgreSQL)'

const ROUTE = 'research-sol-medium-v1'
const ROLE = 'sophia-research-md-v1'
const LAUNCHER = join(REPO_ROOT, 'scripts', 'contribution-runtime-host.mjs')
const REGISTER = join(REPO_ROOT, 'scripts', 'register-contribution-runtime.ts')
const invented = (tag) => `sk-s5c-invented-${tag}-${randomBytes(10).toString('hex')}`
const KEY1 = invented('custodian-r1')
const KEY2 = invented('custodian-r2')
/** Wrong values a careless host could carry: none may reach the provider, the runtime's files or the database. */
const AMBIENT = {
  OPENAI_RESEARCH_API_KEY: invented('ambient-research'),
  OPENAI_API_KEY: invented('ambient-default'),
  TAVILY_API_KEY: invented('ambient-tavily'),
  JINA_API_KEY: invented('ambient-jina'),
}
const DRAFT = '# Sandboxed PDF rendering\n\nOur project sources say the pilot hosts render PDFs in a sandbox.\n'
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const bundlePatch = readFileSync(join(REPO_ROOT, 'packages', 'dsh-bundle', 'cordis.patch.yml'), 'utf8')

/** Loaded only when enabled: the TypeScript service code runs through Node's type stripping. */
async function service() {
  const [{ buildApp }, persistence, testSupport, worker] = await Promise.all([
    import('../../apps/api/src/app.ts'),
    import('../../packages/persistence/src/index.ts'),
    import('../../packages/test-support/src/index.ts'),
    import('../../apps/worker/src/index.ts'),
  ])
  return { buildApp, persistence, testSupport, worker }
}

/** The launcher's library run in its own process (it owns the root lease and exits like the CLI); only the stub overlay is added. */
const LAUNCH_SCRIPT = `
const { launchContributionRuntime } = await import(process.env.S5C_LAUNCHER)
const s = await launchContributionRuntime({ root: process.env.S5C_ROOT, binding: process.env.S5C_BINDING, custodyDir: process.env.S5C_CUSTODY, overlays: [process.env.S5C_OVERLAY], readyTimeoutMs: 60000 })
const stop = async () => { await s.stop(); process.exit(0) }
process.on('SIGTERM', () => void stop())
process.on('SIGINT', () => void stop())
`

describe('contribution runtime with an explicit custodian (real API, PostgreSQL, worker, pinned dsh)', { skip }, () => {
  let s, db, pool, workerPool, app, base, dispatcher, scratch, pristine, llm, overlayFile
  const A = randomUUID()
  const OWNER = randomUUID()
  const REQ = randomUUID()
  const launched = []
  const w = {}
  let counter = 0

  before(async () => {
    s = await service()
    db = await s.testSupport.createTestDatabase()
    pool = s.persistence.createPool(db.apiUrl, { max: 8 })
    workerPool = s.persistence.createPool(db.workerUrl, { max: 3 })
    const verifyActor = async (authorization) => {
      const id = /^Bearer test-actor:([0-9a-f-]{36})$/.exec(authorization ?? '')?.[1]
      if (!id) throw new Error('no test actor')
      return { id, name: null, anonymous: false }
    }
    app = s.buildApp({ pool, verifyActor, apiContributions: true })
    await app.listen({ host: '127.0.0.1', port: 0 })
    base = `http://127.0.0.1:${app.server.address().port}`
    dispatcher = new s.worker.RuntimeDispatcher(workerPool, { workerId: 's5c-worker', idleMs: 250 })
    dispatcher.start()
    scratch = mkdtempSync(join(tmpdir(), 'sophia-s5c-'))
    chmodSync(scratch, 0o700)
    pristine = homeLayout(join(scratch, 'pristine'))
    assertRecordedArtifacts(unit, RUNTIME_DIR)
    installProfile({ unit, runtimeDir: RUNTIME_DIR, layout: pristine })
    llm = await startMockResponses()
    overlayFile = join(scratch, 'research-stub-overlay.yml')
    writeFileSync(overlayFile, researchRouteOverlay(bundlePatch, llm.baseURL))
    await owner(`SELECT sophia.qualify_api_route($1,'gpt-6.1-sol','medium','synthetic: not a live qualification',now()+interval '1 day')`, [ROUTE])
  })

  after(async () => {
    for (const l of launched) await l.stop()
    await dispatcher?.stop()
    await app?.close()
    await pool?.end()
    await workerPool?.end()
    await db?.drop()
    await llm?.close()
    if (scratch) rmSync(scratch, { recursive: true, force: true })
  })

  async function api(actor, method, path, body, key = randomUUID()) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer test-actor:${actor}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(method === 'GET' ? {} : { 'idempotency-key': key }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await res.text()
    return { status: res.status, json: text ? JSON.parse(text) : null }
  }
  async function owner(sql, params) {
    const pg = (await import('pg')).default
    const c = new pg.Client({ connectionString: db.ownerUrl })
    await c.connect()
    try {
      return (await c.query(sql, params)).rows
    } finally {
      await c.end()
    }
  }
  async function until(predicate, what, timeoutMs = 90000) {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const value = await predicate()
      if (value) return value
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
      await sleep(250)
    }
  }
  /** A private (0700) directory: a binding or custody directory as an operator would configure it. */
  function privateDir(name) {
    const dir = join(scratch, `${name}-${counter++}`)
    mkdirSync(dir, { mode: 0o700 })
    return dir
  }
  /** The owner/operator step: the custodian's key for one registration, in its derived file (0600). */
  function placeKey(dir, binding, key, { revision = binding.credentialRevision, mode = 0o600 } = {}) {
    const file = join(dir, custodyFileName(binding))
    writeFileSync(file, `sophia-contribution-credential v1\nconnection ${binding.connectionId}\nrevision ${revision}\nroute ${ROUTE}\nkey ${key}\n`, { mode })
    chmodSync(file, mode)
    return file
  }
  /** The real registration script against the disposable database, writing a binding record. */
  function register(rotate = false) {
    const dir = privateDir('binding')
    const args = [REGISTER, w.projectId, w.connectionId, ...(rotate ? ['--rotate'] : []), '--binding-dir', dir, '--service-origin', base]
    const r = spawnSync(process.execPath, args, { env: { ...process.env, SOPHIA_MIGRATION_DATABASE_URL: db.ownerUrl }, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const path = /binding record (\S+) /.exec(r.stdout)?.[1]
    assert.ok(path, r.stdout)
    const binding = readBinding(path)
    assert.ok(!`${r.stdout}${r.stderr}`.includes(binding.capability), 'the capability is not printed when a record is written')
    return { path, binding, printed: `${r.stdout}${r.stderr}` }
  }
  /** One launch through the launcher's library in its own process, with the wrong ambient keys in that process. */
  async function launch(binding, custodyDir) {
    const root = join(scratch, `root-${counter++}`)
    cpSync(pristine.root, root, { recursive: true, verbatimSymlinks: true })
    const env = { ...process.env, ...AMBIENT, S5C_LAUNCHER: LAUNCHER, S5C_ROOT: root, S5C_BINDING: binding, S5C_CUSTODY: custodyDir, S5C_OVERLAY: overlayFile }
    const child = spawn(process.execPath, ['--input-type=module', '-e', LAUNCH_SCRIPT], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (b) => (out += b))
    child.stderr.on('data', (b) => (out += b))
    const exited = new Promise((resolve) => child.once('exit', resolve))
    const l = {
      root,
      out: () => out,
      async stop() {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGTERM')
          await Promise.race([exited, sleep(20000)])
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        }
      },
    }
    launched.push(l)
    await until(() => /"event":"ready"/.test(out) || child.exitCode !== null, 'the contribution runtime', 90000)
    assert.match(out, /"event":"ready"/, out.slice(-2000))
    return l
  }
  /** The CLI, expected to refuse before the root exists. */
  function refusedLaunch(bindingPath, custodyDir) {
    const root = join(scratch, `refused-${counter++}`)
    const r = spawnSync(process.execPath, [LAUNCHER, '--root', root, '--binding', bindingPath, '--custody-dir', custodyDir], {
      env: { ...process.env, ...AMBIENT },
      encoding: 'utf8',
      timeout: 60000,
    })
    assert.equal(existsSync(root), false, 'nothing under the root was created')
    return { status: r.status, code: /contribution custody refused: ([a-z_]+)/.exec(r.stderr)?.[1] ?? null, text: `${r.stdout}${r.stderr}` }
  }
  const admit = (exchangeId = randomUUID()) =>
    s.persistence.withActor(pool, REQ, 'write', (c) =>
      s.persistence.admitResearchTask(c, w.projectId, {
        key: randomUUID(),
        exchangeId,
        request: { question: 'What do our project sources say about sandboxed PDF rendering?', outputs: ['markdown'], inputSourceIds: [w.sourceId] },
        specialist: { role: ROLE, route: ROUTE },
      }),
    )
  const script = () =>
    llm.script(
      { toolCall: { name: 'research_read_context', arguments: {} } },
      { toolCall: { name: 'research_write_draft', arguments: { text: DRAFT, expectedSha256: null } } },
      {
        toolCall: {
          name: 'research_submit_result',
          arguments: {
            draftSha256: sha256(DRAFT),
            title: 'Sandboxed PDF rendering',
            summary: 'What our project sources say about sandboxed PDF rendering.',
            resultSummary: 'The pilot hosts render PDFs in a sandbox.',
            limitations: ['Project sources only: no web search or read was available.'],
            citations: [w.sourceId],
          },
        },
      },
      { text: 'Done.' },
    )

  test('registration writes a binding record, and the custodian key alone reaches the provider for another member\'s Explore', async (t) => {
    const project = await s.testSupport.seedProject(db.ownerUrl, { admin: A, editors: [OWNER, REQ] })
    w.projectId = project.projectId
    await owner(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [w.projectId])
    const account = await api(OWNER, 'POST', '/api/v1/me/api-accounts', { label: 'Owner API', totalCapUsd: 20 })
    assert.equal(account.status, 201, JSON.stringify(account.json))
    const conn = await api(OWNER, 'POST', '/api/v1/me/api-connections', { accountId: account.json.accountId, label: 'Research key', custodianLabel: 'Owner host' })
    assert.equal(conn.status, 201, JSON.stringify(conn.json))
    w.connectionId = conn.json.connectionId
    const settings = {
      expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
      taskCapUsd: 5,
      totalCapUsd: 10,
      fundingPolicy: 'bounded_total_spend',
      fundingAcknowledgementRef: 'synthetic acknowledgement: provider may draw on mixed funds',
    }
    const grant = await api(OWNER, 'POST', `/api/v1/me/api-connections/${w.connectionId}/grants`, { projectId: w.projectId, settings })
    assert.equal(grant.status, 201, JSON.stringify(grant.json))
    w.grantId = grant.json.grantId

    const first = register()
    w.first = first
    assert.equal(first.binding.credentialRevision, 1)
    assert.equal(first.binding.serviceOrigin, base)
    w.custody = privateDir('custody')
    placeKey(w.custody, first.binding, KEY1)
    w.runtime1 = await launch(first.path, w.custody)

    const input = await s.persistence.withActor(pool, REQ, 'write', (c) =>
      s.persistence.submitContribution(c, w.projectId, randomUUID(), {
        source: null,
        text: 'Our pilot hosts render PDFs in a sandbox.',
        threadId: null,
        artifactVersionId: null,
        intent: 'discuss',
      }),
    )
    w.sourceId = input.sourceId
    const pin = await api(REQ, 'PUT', `/api/v1/projects/${w.projectId}/research-funding`, { grantId: w.grantId, expectedRevision: 1 })
    assert.equal(pin.status, 200, JSON.stringify(pin.json))
    script()
    const admission = await admit()
    assert.ok('admitted' in admission, JSON.stringify(admission))
    w.taskId = admission.admitted.taskId
    const versions = await until(async () => {
      const rows = await owner(`SELECT id FROM sophia.artifact_versions WHERE project_id=$1 AND job_id=$2`, [w.projectId, w.taskId])
      return rows.length > 0 ? rows : null
    }, 'the retained result', 150000)
    assert.equal(versions.length, 1, 'one retained result')

    // The provider saw only the custodian's key, never an ambient one, and no prompt carried it.
    assert.ok(llm.requests.length >= 3, `model calls: ${llm.requests.length}`)
    for (const r of llm.requests) {
      assert.equal(r.url, '/v1/responses')
      assert.equal(r.headers.authorization, `Bearer ${KEY1}`, 'the custodian key, by the route reference')
      assert.ok(!JSON.stringify(r.body).includes(KEY1), 'the key is never in a prompt')
    }
    const tools = new Set(llm.requests[0].body.tools.map((tool) => tool.name))
    assert.ok(tools.has('research_read_context') && tools.has('research_submit_result'))

    // Funding: the contribution; model calls paid by the contributor's account; every reservation settled under it.
    const funding = await api(REQ, 'GET', `/api/v1/projects/${w.projectId}/research-tasks/${w.taskId}/funding`)
    assert.equal(funding.status, 200, JSON.stringify(funding.json))
    assert.deepEqual([funding.json.funding, funding.json.payers.model, funding.json.grantId, funding.json.credentialRevision, funding.json.requesterId], [
      'contribution',
      'contributor_api_account',
      w.grantId,
      1,
      REQ,
    ])
    assert.equal(funding.json.settings.accepted, 'unknown')
    assert.equal(funding.json.settings.observedEffort, 'unknown')
    const reservations = await owner(
      `SELECT r.kind, r.state, x.credential_revision AS rev, x.grant_id AS grant FROM sophia.api_contribution_reservations x
        JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id WHERE x.job_id=$1`,
      [w.taskId],
    )
    assert.ok(reservations.length >= 3, JSON.stringify(reservations))
    for (const r of reservations) assert.deepEqual([r.kind, r.state, Number(r.rev), r.grant], ['model', 'settled', 1, w.grantId])
    const searches = await owner(`SELECT count(*)::int AS n FROM sophia.research_reservations WHERE kind IN ('search','read') AND project_id=$1`, [w.projectId])
    assert.equal(searches[0].n, 0, 'project sources only: no search or read was reserved')
    t.diagnostic(JSON.stringify({ modelCalls: llm.requests.length, reservations: reservations.length, funding: funding.json.funding, payer: funding.json.payers.model, observed: funding.json.settings.observedModels }))
  })

  test('the invented key and the capability appear nowhere else: argv, logs, journal, the runtime files or the database', async () => {
    const values = [KEY1, ...Object.values(AMBIENT)]
    const out = w.runtime1.out()
    for (const v of [...values, w.first.binding.capability]) assert.ok(!out.includes(v), 'the launcher\'s output holds no key or capability')
    // The dsh child's argv (never its environment).
    const pids = readdirSync('/proc').filter((p) => /^\d+$/.test(p))
    let seen = 0
    for (const pid of pids) {
      let cmd
      try {
        cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
      } catch {
        continue
      }
      if (!cmd.includes('--profile')) continue
      seen += 1
      for (const v of [...values, w.first.binding.capability]) assert.ok(!cmd.includes(v), 'no key in a runtime argv')
    }
    assert.ok(seen >= 1, 'the runtime process was found')
    // Every regular file under the runtime's root: journal, logs, homes, workspace.
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        const stat = lstatSync(path)
        if (stat.isDirectory()) walk(path)
        else if (stat.isFile() && stat.size < 32 * 1024 * 1024) {
          const text = readFileSync(path, 'latin1')
          for (const v of values) assert.ok(!text.includes(v), `no key in ${path.slice(w.runtime1.root.length)}`)
        }
      }
    }
    walk(w.runtime1.root)
    // Every table of the service's schema.
    const tables = await owner(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema='sophia' AND table_type='BASE TABLE'`)
    for (const { t } of tables) {
      const [{ dump }] = await owner(`SELECT coalesce(json_agg(x)::text,'') AS dump FROM sophia.${JSON.stringify(t).slice(1, -1)} x`)
      for (const v of [...values, w.first.binding.capability]) assert.ok(!dump.includes(v), `no key or capability in sophia.${t}`)
    }
  })

  test('the launcher refuses before spawn: no custody file, ambient keys only, another revision, an open mode, a link, another unit, a malformed record', async () => {
    const requests = llm.requests.length
    const b = w.first.binding
    const empty = privateDir('custody-empty')
    assert.deepEqual([refusedLaunch(w.first.path, empty).status, refusedLaunch(w.first.path, empty).code], [2, 'not_found'], 'ambient keys never stand in')
    const wrongRev = privateDir('custody-rev')
    placeKey(wrongRev, b, KEY1, { revision: 2 })
    assert.equal(refusedLaunch(w.first.path, wrongRev).code, 'binding_mismatch')
    const open = privateDir('custody-open')
    placeKey(open, b, KEY1, { mode: 0o644 })
    assert.equal(refusedLaunch(w.first.path, open).code, 'mode_open')
    const linked = privateDir('custody-link')
    symlinkSync(join(w.custody, custodyFileName(b)), join(linked, custodyFileName(b)))
    assert.equal(refusedLaunch(w.first.path, linked).code, 'symlink')
    const otherUnitDir = privateDir('binding-unit')
    const otherUnit = writeBinding(otherUnitDir, { ...b, runtimeId: randomUUID(), runtimeUnitId: 'another-unit' })
    assert.equal(refusedLaunch(otherUnit, w.custody).code, 'binding_mismatch')
    const badDir = privateDir('binding-bad')
    const bad = join(badDir, 'x.binding.json')
    writeFileSync(bad, `{"schema":"${BINDING_SCHEMA}"`, { mode: 0o600 })
    assert.equal(refusedLaunch(bad, w.custody).code, 'binding_invalid')
    assert.equal(refusedLaunch(join(badDir, 'absent.binding.json'), w.custody).code, 'not_found')
    for (const r of [refusedLaunch(w.first.path, empty)]) assert.ok(!r.text.includes(KEY1) && !r.text.includes(b.capability))
    assert.equal(llm.requests.length, requests, 'no refused launch reached the provider')
  })

  test('rotation: new work waits for the new revision\'s custodian; the old file cannot stand in, and replacing a file rebinds nothing', async (t) => {
    const before = llm.requests.length
    const second = register(true)
    assert.equal(second.binding.credentialRevision, 2)
    // The old runtime drains: a new admission is refused or never dispatched to it, and nothing reaches the provider.
    script()
    let refusal = null
    try {
      const admission = await admit()
      if ('admitted' in admission) w.pendingTask = admission.admitted.taskId
    } catch (error) {
      refusal = error
    }
    await sleep(3000)
    assert.equal(llm.requests.length, before, 'the drained runtime sent no new model call')
    if (refusal) assert.match(String(refusal.message), /Contribution unavailable|unavailable/i)
    t.diagnostic(JSON.stringify({ afterRotation: refusal ? `refused: ${String(refusal.message).slice(0, 100)}` : 'admitted, waiting' }))
    const after1 = await owner(
      `SELECT count(*)::int AS n FROM sophia.api_contribution_reservations WHERE credential_revision=1 AND job_id<>$1`,
      [w.taskId],
    )
    assert.equal(after1[0].n, 0, 'no new reservation under the old revision')
    // The new registration needs its own custody file: the old revision's file does not stand in.
    assert.equal(refusedLaunch(second.path, w.custody).code, 'not_found')
    // Replacing the old file while its runtime runs rebinds nothing (the value was read once at launch).
    placeKey(w.custody, w.first.binding, KEY2)
    placeKey(w.custody, second.binding, KEY2)
    const runtime2 = await launch(second.path, w.custody)
    assert.ok(runtime2)
    if (!w.pendingTask) {
      const admission = await admit()
      assert.ok('admitted' in admission, JSON.stringify(admission))
      w.pendingTask = admission.admitted.taskId
    }
    await until(async () => (await owner(`SELECT id FROM sophia.artifact_versions WHERE job_id=$1`, [w.pendingTask])).length > 0, 'the result under revision 2', 150000)
    const later = llm.requests.slice(before)
    assert.ok(later.length >= 3)
    for (const r of later) assert.equal(r.headers.authorization, `Bearer ${KEY2}`, 'the new revision\'s custodian key')
    const funding = await api(REQ, 'GET', `/api/v1/projects/${w.projectId}/research-tasks/${w.pendingTask}/funding`)
    assert.deepEqual([funding.json.funding, funding.json.credentialRevision], ['contribution', 2])
    // The first task's settled reservations are unchanged by the rotation.
    const firstRes = await owner(
      `SELECT r.state FROM sophia.api_contribution_reservations x JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id WHERE x.job_id=$1`,
      [w.taskId],
    )
    assert.ok(firstRes.length >= 3 && firstRes.every((r) => r.state === 'settled'))
  })

  test('a paused grant refuses new work before dispatch, with no other payer', async () => {
    const before = llm.requests.length
    const rev = (await owner(`SELECT revision::int AS r FROM sophia.api_contribution_grants WHERE id=$1`, [w.grantId]))[0].r
    const paused = await api(OWNER, 'POST', `/api/v1/api-contribution-grants/${w.grantId}/state`, { expectedRevision: rev, state: 'paused' })
    assert.equal(paused.status, 200, JSON.stringify(paused.json))
    await assert.rejects(admit(), /Contribution unavailable: grant_paused/)
    await sleep(1500)
    assert.equal(llm.requests.length, before, 'nothing reached any provider')
  })
  // ---- S5c r2: one registration, retained or rolled back ----

  /** The registration CLI with any ids and flags; `dir: null` is the legacy (printing) mode. The raw result. */
  async function registerCli({ project = w.projectId, connection = w.connectionId, rotate = false, dir = privateDir('reg'), origin = base, unitId, url = db.ownerUrl, wrap, spawnOptions = {} } = {}) {
    const args = [REGISTER, project, connection, ...(rotate ? ['--rotate'] : []), ...(unitId ? ['--unit', unitId] : []), ...(dir === null ? [] : ['--binding-dir', dir, '--service-origin', origin])]
    const [cmd, argv] = wrap ? wrap(process.execPath, args) : [process.execPath, args]
    // Asynchronous: the loopback proxy below runs in this process and must keep relaying while the CLI runs.
    const child = spawn(cmd, argv, { env: { ...process.env, SOPHIA_MIGRATION_DATABASE_URL: url }, stdio: ['ignore', 'pipe', 'pipe'], ...spawnOptions })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (b) => (stdout += b))
    child.stderr.on('data', (b) => (stderr += b))
    const timer = setTimeout(() => child.kill('SIGKILL'), 90000)
    return new Promise((resolve) =>
      child.once('close', (status) => {
        clearTimeout(timer)
        resolve({ status, stdout, stderr, out: `${stdout}${stderr}`, dir })
      }),
    )
  }
  /** No capability-shaped token (43 base64url characters standing alone) in the output. */
  const noCapability = (out) => !/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/.test(out)
  /** Everything a registration may change, without the liveness a running runtime updates. */
  async function snapshot() {
    const [row] = await owner(
      `SELECT jsonb_build_object(
        'connection', (SELECT to_jsonb(c) FROM sophia.api_connections c WHERE c.id=$2),
        'links', (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.resource_id), '[]') FROM sophia.api_contribution_runtimes l WHERE l.connection_id=$2),
        'resources', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]') FROM sophia.executor_resources r WHERE r.project_id=$1),
        'instances', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'resource', i.resource_id, 'unit', i.runtime_unit_id,
          'token', encode(i.token_sha256, 'hex'), 'state', i.state, 'revokedAt', i.revoked_at) ORDER BY i.id), '[]') FROM sophia.runtime_instances i WHERE i.project_id=$1),
        'reservations', (SELECT coalesce(jsonb_agg(jsonb_build_object('x', to_jsonb(x), 'state', r.state) ORDER BY x.reservation_id), '[]')
          FROM sophia.api_contribution_reservations x JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id WHERE x.project_id=$1)
      ) AS s`,
      [w.projectId, w.connectionId],
    )
    return row.s
  }
  const currentLink = (snap) => snap.links.find((l) => l.state === 'current')
  /**
   * A loopback PostgreSQL proxy for the CLI. `cut`: 'register' forwards the registration call, then closes both sides
   * on the server's answer (the open transaction is aborted); 'commit-before' closes both sides on COMMIT without
   * forwarding it; 'commit-after' forwards COMMIT, then closes both sides instead of relaying its answer.
   * S5c r3, each after forwarding a GENUINE COMMIT: 'commit-tag-select' relays CommandComplete `SELECT 0` in place of
   * the server's tag; 'commit-tag-missing' drops the server's CommandComplete and relays ReadyForQuery;
   * 'commit-abort' first sends `SELECT 1/0` inside the same transaction and absorbs its answer, so the server answers
   * the forwarded COMMIT with its genuine ROLLBACK tag. `stats.tags` holds the server's own tags for COMMIT.
   */
  async function pgProxy(cut) {
    const target = new URL(db.ownerUrl)
    const sockets = new Set()
    const stats = { commits: 0, tags: [], changedTags: 0, injectedAborts: 0 }
    const message = (type, text) => {
      const body = Buffer.from(`${text}\0`, 'utf8')
      const head = Buffer.alloc(5)
      head.write(type, 0, 'latin1')
      head.writeInt32BE(body.length + 4, 1)
      return Buffer.concat([head, body])
    }
    const server = createServer((client) => {
      const upstream = connect(Number(target.port || 5432), target.hostname)
      sockets.add(client)
      sockets.add(upstream)
      const close = () => {
        client.destroy()
        upstream.destroy()
      }
      let pending = Buffer.alloc(0)
      let started = false
      let swallow = false
      // After a forwarded COMMIT: the server's answer is parsed frame by frame (rewritten, absorbed or relayed).
      let answer = null
      let held = null
      upstream.on('data', (d) => {
        if (swallow) return close()
        if (!answer) return client.write(d)
        answer.buf = Buffer.concat([answer.buf, d])
        while (answer && answer.buf.length >= 5 && answer.buf.length >= answer.buf.readInt32BE(1) + 1) {
          const len = answer.buf.readInt32BE(1) + 1
          const frame = answer.buf.subarray(0, len)
          answer.buf = answer.buf.subarray(len)
          const type = String.fromCharCode(frame[0])
          if (answer.absorbing) {
            // The injected statement's error and ReadyForQuery never reach the client; then the held COMMIT goes on.
            if (type === 'Z') {
              answer.absorbing = false
              upstream.write(held)
            }
            continue
          }
          if (type === 'C') {
            stats.tags.push(frame.subarray(5, len - 1).toString('utf8'))
            if (cut === 'commit-tag-select' || cut === 'commit-tag-missing') {
              stats.changedTags += 1
              if (cut === 'commit-tag-select') client.write(message('C', 'SELECT 0'))
              continue
            }
          }
          client.write(frame)
          if (type === 'Z') {
            const rest = answer.buf
            answer = null
            if (rest.length > 0) client.write(rest)
          }
        }
      })
      client.on('data', (d) => {
        pending = Buffer.concat([pending, d])
        for (;;) {
          if (!started) {
            if (pending.length < 8 || pending.length < pending.readInt32BE(0)) return
            const len = pending.readInt32BE(0)
            const code = pending.readInt32BE(4)
            upstream.write(pending.subarray(0, len))
            pending = pending.subarray(len)
            if (code !== 80877103 && code !== 80877104) started = true
            continue
          }
          if (pending.length < 5 || pending.length < pending.readInt32BE(1) + 1) return
          const len = pending.readInt32BE(1) + 1
          const frame = pending.subarray(0, len)
          pending = pending.subarray(len)
          const type = String.fromCharCode(frame[0])
          const text = type === 'Q' || type === 'P' ? frame.subarray(5).toString('utf8') : ''
          const commit = type === 'Q' && text.replace(/\0/g, '').trim() === 'COMMIT'
          if (commit) stats.commits += 1
          if (cut === 'commit-before' && commit) return close()
          if (commit && ['commit-tag-select', 'commit-tag-missing', 'commit-abort'].includes(cut)) {
            answer = { buf: Buffer.alloc(0), absorbing: cut === 'commit-abort' }
            if (cut === 'commit-abort') {
              stats.injectedAborts += 1
              held = frame
              upstream.write(message('Q', 'SELECT 1/0'))
              continue
            }
          }
          upstream.write(frame)
          if ((cut === 'commit-after' && commit) || (cut === 'register' && text.includes('register_contribution_runtime'))) swallow = true
        }
      })
      for (const sock of [client, upstream]) {
        sock.on('error', close)
        sock.on('close', close)
      }
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const url = new URL(db.ownerUrl)
    url.hostname = '127.0.0.1'
    url.port = String(server.address().port)
    return {
      url: url.href,
      stats,
      close: async () => {
        for (const sock of sockets) sock.destroy()
        await new Promise((resolve) => server.close(resolve))
      },
    }
  }
  /** A definite rollback: exit 1, said so, nothing printed as success, no record left and the database as it was. */
  async function assertRolledBack(r, before, what) {
    assert.equal(r.status, 1, `${what}: ${r.out}`)
    assert.match(r.stderr, /registration rolled back: nothing was registered/, what)
    assert.ok(!/registered for unit|binding record /.test(r.stdout), `${what}: no success before a known commit`)
    assert.ok(noCapability(r.out), `${what}: no capability printed`)
    assert.deepEqual(readdirSync(r.dir), [], `${what}: no record remains`)
    assert.deepEqual(await snapshot(), before, `${what}: the current runtime, revision, drains and commitments are as they were`)
  }

  test('S5c r2: registration refuses a malformed or cast-only id, a bad unit or origin and an unsafe directory before any change', async () => {
    const before = await snapshot()
    const open = privateDir('reg-open')
    chmodSync(open, 0o755)
    const cases = [
      ['id_invalid', { project: 'not-a-uuid' }],
      ['id_invalid', { project: `{${w.projectId}}` }],
      ['id_invalid', { connection: w.connectionId.replaceAll('-', '') }],
      ['unit_invalid', { unitId: 'a unit' }],
      ['unit_invalid', { unitId: `u${'x'.repeat(140)}` }],
      ['service_origin_invalid', { origin: `${base}/api` }],
      ['directory_unsafe', { dir: open }],
      ['directory_unsafe', { dir: join(scratch, 'absent-binding-dir') }],
      ['path_not_absolute', { dir: 'relative-binding-dir' }],
    ]
    for (const [expected, over] of cases) {
      const r = await registerCli({ rotate: true, ...over })
      assert.equal(r.status, 1, `${expected}: ${r.out}`)
      assert.match(r.stderr, new RegExp(`contribution custody refused: ${expected}`), JSON.stringify(over))
      assert.ok(!/registered for unit/.test(r.stdout) && noCapability(r.out))
      if (existsSync(r.dir) && r.dir.startsWith('/')) assert.deepEqual(readdirSync(r.dir), [])
    }
    assert.deepEqual(await snapshot(), before, 'nothing was registered, rotated or drained')
  })

  test('S5c r2: a failure after the precheck rolls back a rotation: an unwritable directory, a write error, a session lost before COMMIT', async (t) => {
    const before = await snapshot()
    // A private 0500 directory (the study's case): the create fails with a real EACCES after the precheck passed.
    // As root, the CLI runs as uid/gid 65534, which owns the directory; root would ignore the mode.
    const asOther = process.getuid() === 0
    let readOnly
    if (asOther) {
      const parent = mkdtempSync(join(tmpdir(), 'sophia-s5c-r2-'))
      chmodSync(parent, 0o755)
      readOnly = join(parent, 'binding')
      mkdirSync(readOnly)
      chownSync(readOnly, 65534, 65534)
      t.after(() => rmSync(parent, { recursive: true, force: true }))
    } else readOnly = privateDir('reg-ro')
    chmodSync(readOnly, 0o500)
    const unwritable = await registerCli({ rotate: true, dir: readOnly, spawnOptions: asOther ? { uid: 65534, gid: 65534 } : {} })
    await assertRolledBack(unwritable, before, 'a 0500 directory')
    assert.match(unwritable.stderr, /binding_unwritable/)
    // The first write to the created record fails with a real EFBIG (file size limit 0, SIGXFSZ ignored).
    const efbig = await registerCli({ rotate: true, wrap: (node, args) => ['/bin/sh', ['-c', 'trap "" XFSZ; ulimit -f 0; exec "$0" "$@"', node, ...args]] })
    await assertRolledBack(efbig, before, 'a write error')
    assert.match(efbig.stderr, /binding_unwritable/)
    // The session is lost after the registration call ran inside the transaction, before COMMIT was sent.
    const proxy = await pgProxy('register')
    try {
      const lost = await registerCli({ rotate: true, url: proxy.url })
      await assertRolledBack(lost, before, 'a session lost before COMMIT')
    } finally {
      await proxy.close()
    }
    t.diagnostic(JSON.stringify({ unwritableAs: asOther ? 65534 : process.getuid(), revision: before.connection.credential_revision }))
  })

  test('S5c r2: an unconfirmed COMMIT keeps the record and the original ids, never retries, and reconciles to rolled back or committed', async (t) => {
    const before = await snapshot()
    const kept = (r) => {
      assert.equal(r.status, 3, r.out)
      assert.match(r.stderr, /registration outcome UNKNOWN: COMMIT was sent but not confirmed/)
      assert.ok(!/registered for unit|binding record /.test(r.stdout), 'no success before a known commit')
      const path = /binding record kept at (\S+):/.exec(r.stderr)?.[1]
      assert.ok(path, r.stderr)
      const binding = readBinding(path)
      assert.ok(!r.out.includes(binding.capability) && noCapability(r.out), 'the capability stays in the record')
      for (const id of [binding.projectId, binding.connectionId, binding.runtimeId, binding.resourceId]) assert.ok(r.stderr.includes(id), 'the original ids are reported')
      assert.ok(r.stderr.includes(`revision ${binding.credentialRevision}`))
      assert.deepEqual(readdirSync(r.dir), [`${binding.runtimeId}.binding.json`], 'one record, kept')
      return { binding, path }
    }
    // COMMIT never reached the server: the record is kept, and reconciliation finds nothing registered.
    const p1 = await pgProxy('commit-before')
    let lostCommit
    try {
      lostCommit = kept(await registerCli({ rotate: true, url: p1.url })).binding
    } finally {
      await p1.close()
    }
    assert.equal((await owner(`SELECT count(*)::int AS n FROM sophia.runtime_instances WHERE id=$1`, [lostCommit.runtimeId]))[0].n, 0)
    assert.deepEqual(await snapshot(), before, 'nothing committed, nothing retried')
    // COMMIT committed but its answer was lost: the kept record is the committed runtime's only capability.
    const p2 = await pgProxy('commit-after')
    let lostAnswer, lostAnswerPath
    try {
      ;({ binding: lostAnswer, path: lostAnswerPath } = kept(await registerCli({ rotate: true, url: p2.url })))
    } finally {
      await p2.close()
    }
    const after = await snapshot()
    const [row] = await owner(`SELECT state, encode(token_sha256,'hex') AS token, resource_id AS resource FROM sophia.runtime_instances WHERE id=$1`, [lostAnswer.runtimeId])
    assert.deepEqual([row.state, row.token, row.resource], ['active', createHash('sha256').update(lostAnswer.capability, 'utf8').digest('hex'), lostAnswer.resourceId])
    assert.equal(after.connection.credential_revision, before.connection.credential_revision + 1, 'advanced exactly once')
    assert.equal(lostAnswer.credentialRevision, after.connection.credential_revision)
    assert.equal(after.instances.length, before.instances.length + 1, 'one runtime: never replayed')
    assert.equal(currentLink(after).runtime_id, lostAnswer.runtimeId)
    assert.equal(after.links.find((l) => l.runtime_id === currentLink(before).runtime_id).state, 'draining')
    // The retained record launches the committed runtime to ready under the real launcher.
    const custody = privateDir('custody-retained')
    placeKey(custody, lostAnswer, invented('custodian-retained'))
    const retained = await launch(lostAnswerPath, custody)
    await retained.stop()
    t.diagnostic(JSON.stringify({ rolledBackUnknown: lostCommit.runtimeId, committedUnknown: lostAnswer.runtimeId, revision: lostAnswer.credentialRevision }))
  })

  test('S5c r3: after a genuine COMMIT, another or a missing tag stays unknown and keeps the committed record; a genuine ROLLBACK tag or server ERROR rolls back', async (t) => {
    /** Unknown after a commit that did happen: exit 3, the record kept, the original ids, effects exactly once. */
    async function unknownButCommitted(cut) {
      const before = await snapshot()
      const proxy = await pgProxy(cut)
      let r
      try {
        r = await registerCli({ rotate: true, url: proxy.url })
      } finally {
        await proxy.close()
      }
      assert.deepEqual([proxy.stats.commits, proxy.stats.tags, proxy.stats.changedTags], [1, ['COMMIT'], 1], `${cut}: the server committed, its tag was replaced`)
      assert.equal(r.status, 3, `${cut}: ${r.out}`)
      assert.match(r.stderr, /registration outcome UNKNOWN: COMMIT was sent but not confirmed/, cut)
      assert.ok(!/registration rolled back/.test(r.out) && !/registered for unit|binding record /.test(r.stdout), `${cut}: neither a rollback nor a success is claimed`)
      const path = /binding record kept at (\S+):/.exec(r.stderr)?.[1]
      assert.ok(path, r.stderr)
      const binding = readBinding(path)
      assert.deepEqual(readdirSync(r.dir), [`${binding.runtimeId}.binding.json`], `${cut}: one record, kept`)
      assert.ok(!r.out.includes(binding.capability) && noCapability(r.out), `${cut}: the capability stays in the record`)
      for (const id of [binding.projectId, binding.connectionId, binding.runtimeId, binding.resourceId]) assert.ok(r.stderr.includes(id), `${cut}: the original ids`)
      const after = await snapshot()
      const [row] = await owner(`SELECT state, encode(token_sha256,'hex') AS token FROM sophia.runtime_instances WHERE id=$1`, [binding.runtimeId])
      assert.deepEqual([row?.state, row?.token], ['active', createHash('sha256').update(binding.capability, 'utf8').digest('hex')], `${cut}: the kept capability is the committed one`)
      assert.equal(after.connection.credential_revision, before.connection.credential_revision + 1, `${cut}: advanced exactly once`)
      assert.equal(binding.credentialRevision, after.connection.credential_revision)
      assert.equal(after.instances.length, before.instances.length + 1, `${cut}: one runtime, never replayed`)
      assert.equal(currentLink(after).runtime_id, binding.runtimeId)
      assert.equal(after.links.find((l) => l.runtime_id === currentLink(before).runtime_id).state, 'draining')
      return binding.runtimeId
    }
    const select = await unknownButCommitted('commit-tag-select')
    const missing = await unknownButCommitted('commit-tag-missing')

    // A genuine ROLLBACK tag: the transaction was aborted inside the session, and the server says so.
    const beforeAbort = await snapshot()
    const abort = await pgProxy('commit-abort')
    let aborted
    try {
      aborted = await registerCli({ rotate: true, url: abort.url })
    } finally {
      await abort.close()
    }
    assert.deepEqual([abort.stats.commits, abort.stats.injectedAborts, abort.stats.tags], [1, 1, ['ROLLBACK']], 'the server answered COMMIT with ROLLBACK')
    await assertRolledBack(aborted, beforeAbort, 'a genuine ROLLBACK tag')

    // A genuine server ERROR at COMMIT: a deferred check (this disposable database only) refuses one test unit.
    const refusedUnit = 's5c-r3-refused-at-commit'
    await owner(`CREATE FUNCTION public.s5c_r3_refuse_at_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 's5c r3: refused at commit' USING ERRCODE='23514'; END $$`)
    await owner(`CREATE CONSTRAINT TRIGGER s5c_r3_refuse_at_commit AFTER INSERT ON sophia.runtime_instances DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW WHEN (NEW.runtime_unit_id = '${refusedUnit}') EXECUTE FUNCTION public.s5c_r3_refuse_at_commit()`)
    try {
      const beforeError = await snapshot()
      const refused = await registerCli({ rotate: true, unitId: refusedUnit })
      await assertRolledBack(refused, beforeError, 'a server ERROR at COMMIT')
      assert.match(refused.stderr, /refused at commit/)
    } finally {
      await owner('DROP TRIGGER s5c_r3_refuse_at_commit ON sophia.runtime_instances')
      await owner('DROP FUNCTION public.s5c_r3_refuse_at_commit()')
    }
    t.diagnostic(JSON.stringify({ unknownCommittedSelectTag: select, unknownCommittedMissingTag: missing, rollbackTag: abort.stats.tags, serverError: 'rolled back' }))
  })

  test('S5c r2: accepted UUID spellings register lowercase (an uppercase replacement, a urn:uuid: rotation); legacy still prints once', async () => {
    const before = await snapshot()
    const upper = await registerCli({ project: w.projectId.toUpperCase(), connection: w.connectionId.toUpperCase() })
    assert.equal(upper.status, 0, upper.out)
    const path = /binding record (\S+) /.exec(upper.stdout)?.[1]
    const b1 = readBinding(path)
    assert.deepEqual([b1.projectId, b1.connectionId, b1.credentialRevision], [w.projectId, w.connectionId, before.connection.credential_revision])
    assert.ok(!upper.out.includes(b1.capability) && upper.stdout.includes(`project ${w.projectId}, connection ${w.connectionId}`))
    const replaced = await snapshot()
    const old = before.instances.find((i) => i.id === currentLink(before).runtime_id)
    assert.equal(replaced.instances.find((i) => i.id === old.id).state, 'revoked', 'the replaced runtime of the same resource is revoked')
    assert.equal(replaced.connection.credential_revision, before.connection.credential_revision, 'a replacement does not rotate')
    assert.equal(currentLink(replaced).runtime_id, b1.runtimeId)

    const urn = await registerCli({ project: `urn:uuid:${w.projectId}`, connection: `URN:UUID:${w.connectionId.toUpperCase()}`, rotate: true })
    assert.equal(urn.status, 0, urn.out)
    const b2 = readBinding(/binding record (\S+) /.exec(urn.stdout)?.[1])
    assert.deepEqual([b2.projectId, b2.connectionId, b2.credentialRevision], [w.projectId, w.connectionId, replaced.connection.credential_revision + 1])
    const rotated = await snapshot()
    assert.equal(rotated.links.find((l) => l.runtime_id === b1.runtimeId).state, 'draining')

    const legacy = await registerCli({ dir: null })
    assert.equal(legacy.status, 0, legacy.out)
    const token = legacy.stdout.trim().split('\n').at(-1)
    assert.match(token, /^[A-Za-z0-9_-]{43}$/, 'the legacy flow prints the capability once')
    const [current] = await owner(
      `SELECT encode(i.token_sha256,'hex') AS token FROM sophia.api_contribution_runtimes l JOIN sophia.runtime_instances i ON i.project_id=l.project_id AND i.id=l.runtime_id WHERE l.connection_id=$1 AND l.state='current'`,
      [w.connectionId],
    )
    assert.equal(current.token, createHash('sha256').update(token, 'utf8').digest('hex'))
  })
})
