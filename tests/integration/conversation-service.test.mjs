/**
 * CON-01 B2 crossing (FND-B2-CON-SERVICE): a conversation reply in SERVICE mode through the real pinned dsh runtime and
 * its control bridge (ReplyServiceExecutor over the public prepareCall/stream, the real pi-ai adapter and OpenAI SDK),
 * the bridge's ServiceTransport and generated validators, the real Fastify API's /v1/runtime/conversation/* and
 * conversation routes, the worker's dispatcher, and PostgreSQL under its restricted logins. No fixture service.
 *
 * The provider is a local Responses test double (tests/support/mock-responses.mjs) on the route's own provider alias,
 * reached with a dummy key: this is evidence for the crossing and for what the adapter sends, never for a live
 * provider. The service mode is enabled only here, by a test overlay naming the operator's digest variable; the
 * committed bridge row enables no reply mode. The context is recorded on the ordinary path, with the dispatcher never
 * paused: the Ask's create is deferred while it has none (0071), the worker's same pass calls assembleReply through the
 * fixture's synthetic assembler login (0070), and a later pass dispatches. That login is a test binding, not a Q13
 * admission (the exclusive admission test owns that proof).
 *
 * Needs SOPHIA_DISPOSABLE_DATABASE_URL; skipped without one.
 */

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, before, describe, test } from 'node:test'
import { DSH_ENTRY, REPO_ROOT, RUNTIME_DIR, platformKey, sanitizedEnv } from '../../scripts/lib/common.mjs'
import { parseCordisYaml } from '../../scripts/lib/patch-lint.mjs'
import { assertRecordedArtifacts, executorClosureDigest, homeLayout, installProfile } from '../../scripts/lib/profile.mjs'
import { launchRuntime } from '../../scripts/lib/runtime.mjs'
import { treeDigest } from '../../scripts/lib/tree-digest.mjs'
import { sleep, unit } from '../support/harness.mjs'
import { conversationRouteOverlay, startMockResponses } from '../support/mock-responses.mjs'

const enabled = Boolean(process.env.SOPHIA_DISPOSABLE_DATABASE_URL)
const skip = enabled ? false : 'needs SOPHIA_DISPOSABLE_DATABASE_URL (a disposable PostgreSQL)'

const ROUTE = 'conversation-service-luna-high-v1'
const DUMMY_KEY = 'sk-sophia-conversation-service-dummy'
/**
 * The operator's pin is each launch's complete executor closure (executor-identity.ts), derived on the host from the
 * recorded runtime, the installed profile, the launch's overlays and this Node (`closure` below). The bundle archive
 * digest alone is not an executor identity (#393 4302689994): it is pinned only in the cases that prove it refused.
 */
const ARCHIVE_DIGEST = unit.sophia_bundle.archive_sha256
const OTHER_DIGEST = 'b'.repeat(64)
const ADAPTER_MARKER = '[crossing] altered dsh-llm-pi-ai adapter loaded'
const CONTEXT_CANARY = 'CANARY-CONTEXT-7f3a'
const ANSWER_CANARY = 'CANARY-ANSWER-91c2'
const OTHER_CANARY = 'CANARY-OTHER-CONVERSATION-5d0e'
const bundlePatch = readFileSync(join(REPO_ROOT, 'packages', 'dsh-bundle', 'cordis.patch.yml'), 'utf8')

/**
 * Test overlay: the conversation alias pointed at the double, and the bridge row restated whole with service mode on.
 * A service overlay is a strict JSON patch list of config-only overrides (executor-identity.ts), so it is written so.
 */
function serviceOverlay(baseURL) {
  const rows = parseCordisYaml(bundlePatch)
  const bridge = rows.flatMap((row) => row.insert ?? []).find((row) => row.id === 'sophia-control-bridge')?.config
  assert.ok(bridge && !('replies' in bridge), 'the committed bridge row enables no reply mode')
  const replies = { mode: 'service', routeId: ROUTE, executorDigestEnv: 'SOPHIA_EXECUTOR_DIGEST' }
  return JSON.stringify([...parseCordisYaml(conversationRouteOverlay(bundlePatch, baseURL)), { id: 'sophia-control-bridge', config: { ...bridge, replies } }])
}

const PLUGIN_MARKER = '[crossing] external relative plugin loaded'
const PRELOAD_MARKER = '[crossing] node preloader ran'
const PEER_MARKER = '[crossing] nested local dsh-llm peer loaded'
const BIN_PEER_MARKER = '[crossing] bundle .bin-link dsh-llm peer loaded'

/** A same-version `@deepseek-ai/dsh-llm` at `dir` that prints `marker` and re-exports the runtime's own package. */
function writeLocalPeer(dir, marker) {
  const pnpmDir = join(RUNTIME_DIR, 'node_modules', '.pnpm')
  const real = realpathSync(join(pnpmDir, readdirSync(pnpmDir).find((name) => name.startsWith('@deepseek-ai+dsh-llm@0.')), 'node_modules', '@deepseek-ai', 'dsh-llm'))
  const manifest = JSON.parse(readFileSync(join(real, 'package.json'), 'utf8'))
  mkdirSync(join(dir, 'lib'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: manifest.name, version: manifest.version, type: 'module', exports: { '.': './lib/index.js' } }))
  writeFileSync(join(dir, 'lib', 'index.js'), `process.stderr.write(${JSON.stringify(`${marker}\n`)})\nexport * from ${JSON.stringify(pathToFileURL(join(real, 'lib', 'index.js')).href)}\n`)
}

/**
 * R-B2-R02-CANONICAL-BIN-LINK: the canonical real bundle directory kept, with `node_modules/.bin` a link to
 * `<profile>/.peer-root` and `node_modules/@deepseek-ai/dsh-llm` a link to `../.bin/dsh-llm`, and a same-version peer
 * there. The tree scheme skipped `.bin` and hashed the second link's text only, so the peer's bytes were in no pin.
 */
function binLinkPeer(layout) {
  const profile = join(layout.dshHome, 'profiles', unit.dsh.profile)
  const bundle = join(profile, 'node_modules', '@sophia', 'dsh-bundle')
  mkdirSync(join(bundle, 'node_modules', '@deepseek-ai'), { recursive: true })
  symlinkSync(join(profile, '.peer-root'), join(bundle, 'node_modules', '.bin'))
  symlinkSync(join('..', '.bin', 'dsh-llm'), join(bundle, 'node_modules', '@deepseek-ai', 'dsh-llm'))
  writeLocalPeer(join(profile, '.peer-root', 'dsh-llm'), BIN_PEER_MARKER)
}

/**
 * R-B2-A868-02-NESTED-PEER: the same installed bundle bytes moved to `<profile>/.nested/node_modules/@sophia/dsh-bundle`,
 * the canonical entry a relative symlink to it, and a same-version `@deepseek-ai/dsh-llm` beside it. The peer prints a
 * marker and re-exports the runtime's own package, so dsh still boots; the pinned loader prefers it, as a local
 * candidate on the importer's ancestry inside the profile, over the verified runtime installation.
 */
function nestBundleWithPeer(layout) {
  const profile = join(layout.dshHome, 'profiles', unit.dsh.profile)
  const canonical = join(profile, 'node_modules', '@sophia', 'dsh-bundle')
  const nested = join(profile, '.nested', 'node_modules')
  mkdirSync(join(nested, '@sophia'), { recursive: true })
  renameSync(canonical, join(nested, '@sophia', 'dsh-bundle'))
  symlinkSync(join('..', '..', '.nested', 'node_modules', '@sophia', 'dsh-bundle'), canonical)
  const pnpmDir = join(RUNTIME_DIR, 'node_modules', '.pnpm')
  const real = realpathSync(join(pnpmDir, readdirSync(pnpmDir).find((name) => name.startsWith('@deepseek-ai+dsh-llm@0.')), 'node_modules', '@deepseek-ai', 'dsh-llm'))
  const peer = join(nested, '@deepseek-ai', 'dsh-llm')
  mkdirSync(join(peer, 'lib'), { recursive: true })
  const manifest = JSON.parse(readFileSync(join(real, 'package.json'), 'utf8'))
  writeFileSync(join(peer, 'package.json'), JSON.stringify({ name: manifest.name, version: manifest.version, type: 'module', exports: { '.': './lib/index.js' } }))
  writeFileSync(join(peer, 'lib', 'index.js'), `process.stderr.write(${JSON.stringify(`${PEER_MARKER}\n`)})\nexport * from ${JSON.stringify(pathToFileURL(join(real, 'lib', 'index.js')).href)}\n`)
  return { profile, canonical, nested: dirname(nested) }
}

async function modules() {
  const [{ buildApp }, persistence, testSupport, worker] = await Promise.all([
    import('../../apps/api/src/app.ts'),
    import('../../packages/persistence/src/index.ts'),
    import('../../packages/test-support/src/index.ts'),
    import('../../apps/worker/src/index.ts'),
  ])
  return { buildApp, persistence, testSupport, worker }
}

/** Every file under `dir` (bounded), for privacy scans of the runtime's home. */
function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const s = statSync(path, { throwIfNoEntry: false })
    if (!s) continue
    if (s.isDirectory()) files(path, out)
    else if (s.isFile() && s.size < 8_000_000) out.push(path)
  }
  return out
}

describe('conversation service crossing (real dsh service executor, API, worker, PostgreSQL)', { skip }, () => {
  let m, db, pool, workerPool, ownerPool, app, base, dispatcher, scratch, pristine
  let counter = 0
  const A = crypto.randomUUID()
  const E = crypto.randomUUID()

  before(async () => {
    m = await modules()
    db = await m.testSupport.createTestDatabase()
    pool = m.persistence.createPool(db.apiUrl, { max: 8 })
    workerPool = m.persistence.createPool(db.workerUrl, { max: 3 })
    ownerPool = m.persistence.createPool(db.ownerUrl, { max: 3 })
    const verifyActor = async (authorization) => {
      const id = /^Bearer test-actor:([0-9a-f-]{36})$/.exec(authorization ?? '')?.[1]
      if (!id) throw new Error('no test actor')
      return { id, name: null, anonymous: false }
    }
    app = m.buildApp({ pool, verifyActor, conversations: true })
    await app.listen({ host: '127.0.0.1', port: 0 })
    base = `http://127.0.0.1:${app.server.address().port}`
    assert.ok(db.assemblerUrl, 'the fixture binds a synthetic assembler login')
    dispatcher = new m.worker.RuntimeDispatcher(workerPool, { workerId: 'conversation-crossing', idleMs: 200, assemblerUrl: db.assemblerUrl })
    dispatcher.start()
    scratch = mkdtempSync(join(tmpdir(), 'sophia-con-service-'))
    pristine = homeLayout(join(scratch, 'pristine'))
    assertRecordedArtifacts(unit, RUNTIME_DIR)
    installProfile({ unit, runtimeDir: RUNTIME_DIR, layout: pristine })
  })

  after(async () => {
    await dispatcher?.stop()
    await app?.close()
    await pool?.end()
    await workerPool?.end()
    await ownerPool?.end()
    await db?.drop()
    if (scratch) rmSync(scratch, { recursive: true, force: true })
  })

  async function api(actor, method, path, body) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer test-actor:${actor}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(method === 'POST' ? { 'idempotency-key': crypto.randomUUID() } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await res.text()
    return { status: res.status, json: text ? JSON.parse(text) : null }
  }

  const owner = async (sql, params) => (await ownerPool.query(sql, params)).rows

  /**
   * A project with conversations on, a runtime registered, a grant lineage on the service route pinned (unless `pin`
   * is null) to `pin`, a fresh profile home, the Responses double and the runtime process.
   */
  /**
   * A private copy of the recorded runtime whose LOADED adapter (dsh-llm-pi-ai's entry) is altered, with its own
   * locally correct runtime record: the recorded-artifact check accepts it, and only the executor closure tells it apart.
   */
  let altered = null
  function alteredRuntime() {
    if (altered) return altered
    const dir = join(scratch, 'altered-runtime')
    cpSync(RUNTIME_DIR, dir, { recursive: true, verbatimSymlinks: true })
    const pnpmDir = join(dir, 'node_modules', '.pnpm')
    const adapter = readdirSync(pnpmDir).find((name) => name.startsWith('@deepseek-ai+dsh-llm-pi-ai@'))
    appendFileSync(join(pnpmDir, adapter, 'node_modules', '@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js'),
      `\nprocess.stderr.write(${JSON.stringify(`${ADAPTER_MARKER}\n`)})\n`)
    const local = structuredClone(unit)
    local.dsh.artifacts_by_platform[platformKey()].digest = treeDigest(dir).digest
    assertRecordedArtifacts(local, dir)
    altered = { dir, unit: local }
    return altered
  }

  /**
   * `pin` and `runtimeDigest` are 'closure' (this launch's complete executor closure, derived on the host), a fixed
   * value, or null (no pin). `runtime` is the runtime the process launches from ('recorded' or 'altered').
   */
  async function world(t, { pin = 'closure', runtimeDigest = 'closure', grant = {}, runtime: runtimeKind = 'recorded' } = {}) {
    const layout = homeLayout(join(scratch, `case-${counter++}`))
    cpSync(pristine.root, layout.root, { recursive: true, verbatimSymlinks: true })
    const llm = await startMockResponses()
    const launch = runtimeKind === 'altered' ? alteredRuntime() : { dir: RUNTIME_DIR, unit }
    const overlay = serviceOverlay(llm.baseURL)
    const closure = (await executorClosureDigest({ unit: launch.unit, runtimeDir: launch.dir, layout, overlays: [overlay] })).digest
    assert.notEqual(closure, ARCHIVE_DIGEST, 'the closure is not the archive digest')
    pin = pin === 'closure' ? closure : pin
    runtimeDigest = runtimeDigest === 'closure' ? closure : runtimeDigest
    const project = await m.testSupport.seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const projectId = project.projectId
    await owner("SELECT sophia.set_conversation_settings($1,'enabled','con01-b2-crossing')", [projectId])
    const rt = await m.testSupport.registerRuntime(db.ownerUrl, { projectId, admin: A, runtimeUnitId: unit.id })
    const lineage = await owner('SELECT sophia.conversation_new_lineage($1,$2::jsonb) AS v', [projectId, {
      unit: 'calls_tokens', routeId: ROUTE, credentialRef: 'openai-api-key', ownerResourceRef: 'b2-crossing-owner',
      approvalRef: `b2-crossing-${crypto.randomUUID()}`, expiresAt: new Date(Date.now() + 900_000).toISOString(),
      maxCallsPerReply: 1, totalCallCap: 10, replyTokenCap: 200_000, totalTokenCap: 2_000_000, subjects: [E], ...grant,
    }])
    const lineageId = (await owner('SELECT lineage_id FROM sophia.conversation_grants WHERE project_id=$1 AND current', [projectId]))[0].lineage_id
    assert.ok(lineage.length === 1 && lineageId)
    if (pin) {
      await owner('SELECT sophia.conversation_pin_execution($1,$2::jsonb)', [projectId, {
        lineageId, execution: 'service', routeId: ROUTE, executorArtifactDigest: pin, approvalRef: `b2-pin-${crypto.randomUUID()}`,
      }])
    }
    let runtime = null
    const extra = []
    const w = {
      projectId,
      layout,
      llm,
      closure,
      overlay,
      tuple: { execution: 'service', routeId: ROUTE, executorArtifactDigest: closure },
      /** Launch from `runtimeDir` with `overlays` (default: this world's), the operator's expected pin `expected`. */
      async start({ runtimeDir = launch.dir, overlays = [overlay], expected = runtimeDigest } = {}) {
        runtime = launchRuntime({
          unit, runtimeDir, layout, bridge: { url: base, token: rt.token },
          overlays,
          extraEnv: { OPENAI_API_KEY: DUMMY_KEY, SOPHIA_EXECUTOR_DIGEST: expected },
        })
        await w.until(() => /readiness=ready/.test(w.stderr()), 'bridge readiness')
      },
      /**
       * A launch the launcher refuses to make (it rejects Node modifiers): the same argv, overlay and sanitized
       * environment, plus `nodeArgs` before the dsh bin and `env` added, spawned directly.
       */
      async startModified({ nodeArgs = [], env = {} }) {
        const file = join(layout.root, 'overlay-modified.yml')
        writeFileSync(file, overlay)
        mkdirSync(layout.cwd, { recursive: true })
        mkdirSync(join(layout.root, 'workspace'), { recursive: true })
        const child = spawn(process.execPath, [...nodeArgs, join(launch.dir, DSH_ENTRY), '--profile', unit.dsh.profile, '--patch', file], {
          cwd: layout.cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...sanitizedEnv({ dshHome: layout.dshHome, home: layout.home }), SOPHIA_RUNTIME_UNIT: unit.id, SOPHIA_WORKSPACE: join(layout.root, 'workspace'),
            SOPHIA_BRIDGE_URL: base, SOPHIA_BRIDGE_TOKEN: rt.token, OPENAI_API_KEY: DUMMY_KEY, SOPHIA_EXECUTOR_DIGEST: runtimeDigest, ...env },
        })
        let err = ''
        child.stderr.on('data', (chunk) => { err += chunk })
        child.stdout.on('data', (chunk) => { err += chunk })
        const exited = new Promise((resolve) => child.on('exit', resolve))
        runtime = { stderr: () => err, stop: async () => { if (child.exitCode === null) child.kill('SIGTERM'); return exited } }
        await w.until(() => /readiness=ready/.test(w.stderr()), 'bridge readiness')
      },
      stop: (signal) => runtime?.stop(signal),
      /** A second LIVE process on the same runtime credential, in its own home: its hello supersedes the first lease. */
      async startSecond() {
        const second = homeLayout(join(scratch, `case-${counter++}`))
        cpSync(pristine.root, second.root, { recursive: true, verbatimSymlinks: true })
        const other = launchRuntime({
          unit, runtimeDir: launch.dir, layout: second, bridge: { url: base, token: rt.token },
          overlays: [overlay],
          extraEnv: { OPENAI_API_KEY: DUMMY_KEY, SOPHIA_EXECUTOR_DIGEST: runtimeDigest },
        })
        extra.push(other)
        await w.until(() => /readiness=ready/.test(other.stderr()), 'the second bridge readiness')
        return other
      },
      /**
       * FND-B105: the SHIPPED entry, scripts/runtime-host.mjs, as an operator runs it: --service-overlay with this
       * world's overlay (unless `overlay` is false, the default-off launch), the expected digest in the variable it
       * names, the route credential by name; only SOPHIA_SERVICE_URL/TOKEN, PATH and HOME besides.
       */
      async startShipped({ expected = runtimeDigest, overlay: withOverlay = true } = {}) {
        const file = join(layout.root, 'service-overlay.json')
        writeFileSync(file, overlay)
        const args = ['scripts/runtime-host.mjs', '--root', layout.root, ...(withOverlay ? ['--service-overlay', file] : [])]
        const child = spawn(process.execPath, args, {
          cwd: REPO_ROOT,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { PATH: process.env.PATH, HOME: process.env.HOME, SOPHIA_SERVICE_URL: base, SOPHIA_RUNTIME_TOKEN: rt.token,
            OPENAI_API_KEY: DUMMY_KEY, ...(expected ? { SOPHIA_EXECUTOR_DIGEST: expected } : {}) },
        })
        let out = ''
        child.stderr.on('data', (chunk) => { out += chunk })
        child.stdout.on('data', (chunk) => { out += chunk })
        const exited = new Promise((resolve) => child.on('exit', resolve))
        runtime = { stderr: () => out, stop: async () => { if (child.exitCode === null) child.kill('SIGTERM'); return exited } }
        // runtime-host prints its own lines (the dsh child's output stays in the supervisor's diagnostics): its ready line,
        // then the bridge's hello as the server stored it.
        try {
          await w.until(() => /runtime \S+ ready against/.test(w.stderr()), 'runtime-host ready')
          await w.until(async () => (await owner('SELECT 1 FROM sophia.runtime_instances WHERE project_id=$1', [projectId])).length > 0, 'the bridge hello')
        } catch (error) {
          throw new Error(`${error.message}; runtime-host said: ${out.slice(-1500)}`)
        }
      },
      /** The shipped entry's --print-executor-digest for this world's root and overlay. */
      printedDigest() {
        const file = join(layout.root, 'service-overlay.json')
        writeFileSync(file, overlay)
        const r = spawnSync(process.execPath, ['scripts/runtime-host.mjs', '--root', layout.root, '--service-overlay', file, '--print-executor-digest'], {
          cwd: REPO_ROOT, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME } })
        assert.equal(r.status, 0, r.stderr)
        const line = r.stdout.split('\n').map((l) => { try { return JSON.parse(l) } catch { return null } }).find((e) => e?.event === 'executor_digest')
        assert.equal(line?.variable, 'SOPHIA_EXECUTOR_DIGEST')
        return line?.digest
      },
      stderr: () => runtime?.stderr() ?? '',
      async until(predicate, what, timeoutMs = 45_000) {
        const deadline = Date.now() + timeoutMs
        for (;;) {
          const value = await predicate()
          if (value) return value
          if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}\n${w.stderr().slice(-3000)}`)
          await sleep(150)
        }
      },
      /** E asks Sophia in a new conversation over the API; the worker records its context and dispatches it. */
      async ask(text = `Please summarize. ${CONTEXT_CANARY}`) {
        const started = await api(E, 'POST', `/api/v1/projects/${projectId}/conversations`, { title: 'Crossing', text: 'Opening note.', askSophia: false })
        assert.equal(started.status, 202, JSON.stringify(started.json))
        const conversationId = started.json.conversation.id
        const sent = await api(E, 'POST', `/api/v1/conversations/${conversationId}/messages`, { text, askSophia: true })
        assert.equal(sent.status, 202, JSON.stringify(sent.json))
        const replyId = sent.json.reply.id
        assert.equal(sent.json.reply.state, 'pending', 'admitted: an assembler login is bound')
        const [attempt] = await owner(
          `SELECT a.id AS attempt_id,b.id AS binding_id FROM sophia.work_attempts a JOIN sophia.execution_bindings b
            ON b.project_id=a.project_id AND b.attempt_id=a.id WHERE a.project_id=$1 AND a.conversation_reply_id=$2`, [projectId, replyId])
        assert.ok(attempt, 'the Ask admits one reply-owned attempt')
        return { conversationId, messageId: sent.json.message.id, replyId, ...attempt }
      },
      /** An Ask no runtime here can serve (A40): refused at once, with nothing admitted. */
      async askRefused(text = `Please summarize. ${CONTEXT_CANARY}`) {
        const started = await api(E, 'POST', `/api/v1/projects/${projectId}/conversations`, { title: 'Crossing', text: 'Opening note.', askSophia: false })
        assert.equal(started.status, 202, JSON.stringify(started.json))
        const sent = await api(E, 'POST', `/api/v1/conversations/${started.json.conversation.id}/messages`, { text, askSophia: true })
        assert.equal(sent.status, 202, JSON.stringify(sent.json))
        const replyId = sent.json.reply.id
        const [admitted] = await owner(
          `SELECT (SELECT count(*)::int FROM sophia.work_attempts WHERE conversation_reply_id=$1) AS attempts,
             (SELECT count(*)::int FROM sophia.outbox WHERE conversation_reply_id=$1) AS outbox`, [replyId])
        return { replyId, reply: sent.json.reply, admitted }
      },
      reply: async (r) => (await owner('SELECT state,reason,answer_id FROM sophia.conversation_replies WHERE id=$1', [r.replyId]))[0],
      reservations: async (r) => owner(
        'SELECT call_ordinal,state,amount_calls,amount_tokens,used_calls,used_tokens FROM sophia.conversation_reservations WHERE reply_id=$1 ORDER BY call_ordinal', [r.replyId]),
      grant: async () => (await owner(
        `SELECT reserved_calls,reserved_tokens,spent_calls,spent_tokens,uncertain_calls,uncertain_tokens FROM sophia.conversation_grants
          WHERE project_id=$1 AND current`, [projectId]))[0],
      stages: async (r) => (await owner(
        `SELECT rc.kind,rr.stage,rr.reason,rr.executor FROM sophia.runtime_receipts rr JOIN sophia.runtime_commands rc
          ON rc.project_id=rr.project_id AND rc.id=rr.runtime_command_id WHERE rc.project_id=$1 AND rc.attempt_id=$2 ORDER BY rr.recorded_at`,
        [projectId, r.attempt_id])),
      binding: async (r) => (await owner('SELECT state FROM sophia.execution_bindings WHERE id=$1', [r.binding_id]))[0].state,
      creates: async (r) => (await owner(`SELECT count(*)::int AS n FROM sophia.runtime_commands WHERE attempt_id=$1 AND kind='create'`, [r.attempt_id]))[0].n,
      claims: async (r) => (await owner('SELECT count(*)::int AS n FROM sophia.conversation_executions WHERE attempt_id=$1', [r.attempt_id]))[0].n,
      answers: async (r) => owner(
        `SELECT m.id,m.body FROM sophia.conversation_messages m JOIN sophia.conversation_replies r ON r.answer_id=m.id WHERE r.id=$1`, [r.replyId]),
      /** The runtime home and its log hold none of the context, answer or reasoning. */
      assertPrivate() {
        for (const canary of [CONTEXT_CANARY, ANSWER_CANARY]) {
          assert.ok(!w.stderr().includes(canary), `the runtime log never carries ${canary}`)
          const hit = files(layout.dshHome).find((path) => readFileSync(path, 'latin1').includes(canary))
          assert.equal(hit, undefined, `no file in the runtime home carries ${canary}`)
        }
      },
    }
    t.after(async () => {
      for (const other of extra) await other.stop()
      await runtime?.stop()
      await llm.close()
    })
    return w
  }

  test('a complete allowed answer: one request on the pinned route, no session or tools, settled, published once, retired', async (t) => {
    const w = await world(t)
    w.llm.script({ text: `The summary. ${ANSWER_CANARY}`, usage: { input_tokens: 900, output_tokens: 40 } })
    await w.start()
    assert.match(w.stderr(), /readiness=ready/)
    // A40: the real bridge's hello named its configured executor with the conversation role, and the server kept it.
    const [stored] = await owner('SELECT roles FROM sophia.runtime_instances WHERE project_id=$1', [w.projectId])
    assert.deepEqual(stored.roles.find((role) => role.id === 'sophia-conversation-v1')?.executor, w.tuple)
    assert.match(w.stderr(), /reply_service executor_closure_verified/)
    const other = await api(E, 'POST', `/api/v1/projects/${w.projectId}/conversations`, { title: 'Elsewhere', text: `Another thread. ${OTHER_CANARY}`, askSophia: false })
    assert.equal(other.status, 202)
    const r = await w.ask()
    await w.until(async () => (await w.reply(r)).state === 'answered', 'the published answer')
    const answers = await w.answers(r)
    assert.equal(answers.length, 1)
    // The worker recorded the context on the ordinary path: a counted claim, a recorded context with its hash, and the
    // create deferred while it waited rather than denied.
    const [context] = await owner(
      `SELECT x.state,length(x.context_hash) AS hash FROM sophia.conversation_reply_contexts x WHERE x.reply_id=$1 AND x.state='recorded'`, [r.replyId])
    assert.deepEqual([context?.state, context?.hash], ['recorded', 64])
    const claims = await owner('SELECT attempt,outcome FROM sophia.conversation_assembly_claims WHERE reply_id=$1 ORDER BY attempt', [r.replyId])
    assert.ok(claims.length >= 1 && claims.length <= 3 && claims.at(-1).outcome === 'recorded', JSON.stringify(claims))
    assert.notEqual((await w.reply(r)).reason, 'not_dispatched')
    assert.equal(answers[0].body, `The summary. ${ANSWER_CANARY}`)
    // One HTTP request, exactly the pinned route, carrying the recorded context and nothing of a session or tool.
    assert.equal(w.llm.requests.length, 1)
    const [request] = w.llm.requests
    assert.equal(request.url, '/v1/responses')
    assert.equal(request.headers.authorization, `Bearer ${DUMMY_KEY}`)
    assert.equal(request.body.model, 'gpt-6-luna')
    assert.equal(request.body.reasoning?.effort, 'high')
    assert.equal(request.body.max_output_tokens, 4096)
    assert.ok(!request.body.tools || request.body.tools.length === 0, 'no tools')
    assert.equal(request.body.prompt_cache_key, undefined, 'no session-derived cache key')
    assert.equal(request.body.previous_response_id, undefined)
    assert.match(JSON.stringify(request.body.input), new RegExp(CONTEXT_CANARY), 'the recorded context is the input')
    assert.doesNotMatch(JSON.stringify(request.body), new RegExp(OTHER_CANARY), 'another conversation of the project is absent')
    // Counted before, settled from usage; the server's terminal and cleanup ran; the retire names this executor.
    assert.deepEqual((await w.reservations(r)).map((v) => [v.state, v.used_calls]), [['settled', '1']])
    await w.until(async () => (await w.binding(r)) === 'retired', 'the retired binding')
    const stages = await w.stages(r)
    assert.deepEqual(stages.map((s) => `${s.kind}:${s.stage}`), ['create:delivered', 'retire:checked'])
    assert.deepEqual(stages.at(-1).executor, w.tuple)
    assert.equal(await w.creates(r), 1)
    w.assertPrivate()
    await sleep(1000)
    assert.equal(w.llm.requests.length, 1, 'nothing more is sent')
  })

  for (const status of [429, 503]) {
    test(`a provider ${status} is one SDK request, no retry: no answer, the reservation stays counted as uncertain`, async (t) => {
      const w = await world(t)
      w.llm.script({ status }, { text: `must never be sent ${ANSWER_CANARY}` })
      await w.start()
      const r = await w.ask()
      await w.until(async () => (await w.reply(r)).state === 'failed', 'the failed reply')
      await w.until(async () => (await w.binding(r)) === 'retired', 'the retired binding')
      await sleep(2500)
      assert.equal(w.llm.requests.length, 1, 'exactly one HTTP request: no adapter, SDK or bridge retry')
      assert.deepEqual(await w.answers(r), [])
      assert.equal((await w.reply(r)).reason, 'runtime_failed', 'failed by the runtime receipt, not a turn end')
      assert.deepEqual((await w.reservations(r)).map((v) => v.state), ['uncertain'])
      const grant = await w.grant()
      assert.equal(grant.uncertain_calls, '1')
      assert.equal(grant.spent_calls, '0')
      const stages = await w.stages(r)
      assert.deepEqual(stages.map((s) => `${s.kind}:${s.stage}:${s.reason ?? ''}`), ['create:delivered:', 'create:failed:call_failed', 'retire:checked:'])
      w.assertPrivate()
    })
  }

  // A40: the runtime advertises the executor it runs, so a grant it cannot execute is refused at the Ask, before any
  // attempt, binding or create (it used to be bound, dispatched and refused by the executor: reply_executor_mismatch).
  // FND-B105: the same allowed answer through the SHIPPED entry (scripts/runtime-host.mjs), not the test launcher.
  test('shipped runtime-host: --print-executor-digest is the closure; --service-overlay with it serves one allowed answer', async (t) => {
    const w = await world(t)
    const printed = w.printedDigest()
    assert.equal(printed, w.closure, 'the operator-printed digest is the executor closure the runtime will advertise')
    w.llm.script({ text: `The summary. ${ANSWER_CANARY}`, usage: { input_tokens: 900, output_tokens: 40 } })
    await w.startShipped({ expected: printed })
    assert.match(w.stderr(), /"event":"service_replies"/)
    assert.doesNotMatch(w.stderr(), new RegExp(printed), 'the digest value is never logged by the host')
    // The bridge verified the closure and advertised the conversation role with exactly this executor tuple.
    await w.until(async () => {
      const [stored] = await owner('SELECT roles FROM sophia.runtime_instances WHERE project_id=$1', [w.projectId])
      return stored?.roles?.some((role) => role.id === 'sophia-conversation-v1') ?? false
    }, 'the conversation role advertised')
    const [stored] = await owner('SELECT roles FROM sophia.runtime_instances WHERE project_id=$1', [w.projectId])
    assert.deepEqual(stored.roles.find((role) => role.id === 'sophia-conversation-v1')?.executor, w.tuple)
    const r = await w.ask()
    await w.until(async () => (await w.reply(r)).state === 'answered', 'the published answer')
    const answers = await w.answers(r)
    assert.equal(answers.length, 1)
    assert.equal(answers[0].body, `The summary. ${ANSWER_CANARY}`)
    assert.equal(w.llm.requests.length, 1, 'one request on the pinned route')
    assert.equal(w.llm.requests[0].headers.authorization, `Bearer ${DUMMY_KEY}`)
    assert.deepEqual((await w.reservations(r)).map((v) => [v.state, v.used_calls]), [['settled', '1']])
    await w.until(async () => (await w.binding(r)) === 'retired', 'the retired binding')
  })

  test('shipped runtime-host without --service-overlay: ready, no conversation role, no reply mode (default OFF)', async (t) => {
    const w = await world(t)
    await w.startShipped({ overlay: false })
    assert.doesNotMatch(w.stderr(), /"event":"service_replies"/)
    const [stored] = await owner('SELECT roles FROM sophia.runtime_instances WHERE project_id=$1', [w.projectId])
    assert.equal(stored.roles.find((role) => role.id === 'sophia-conversation-v1'), undefined)
    assert.equal(w.llm.requests.length, 0)
  })

  test('shipped runtime-host with a digest that is not the closure: unavailable, no role, nothing sent (no fallback)', async (t) => {
    const w = await world(t)
    await w.startShipped({ expected: 'c'.repeat(64) })
    assert.match(w.stderr(), /"event":"service_replies"/, 'the host passed the overlay and the named digest')
    const [stored] = await owner('SELECT roles FROM sophia.runtime_instances WHERE project_id=$1', [w.projectId])
    assert.equal(stored.roles.find((role) => role.id === 'sophia-conversation-v1'), undefined)
    assert.equal(w.llm.requests.length, 0)
  })

  test('wrong scope: a grant pinned to another executor artifact is refused at the Ask; nothing reaches a runtime or the provider', async (t) => {
    const w = await world(t, { pin: OTHER_DIGEST })
    await w.start()
    const r = await w.askRefused()
    assert.deepEqual([r.reply.state, r.reply.reason], ['blocked', 'runtime_unavailable'])
    assert.deepEqual(r.admitted, { attempts: 0, outbox: 0 })
    assert.deepEqual(await w.reservations(r), [])
    assert.equal(w.llm.requests.length, 0, 'zero provider requests')
  })

  test('an unpinned (native) lineage is not served by the service executor either: refused at the Ask', async (t) => {
    const w = await world(t, { pin: null })
    await w.start()
    const r = await w.askRefused()
    assert.deepEqual([r.reply.state, r.reply.reason], ['blocked', 'runtime_unavailable'])
    assert.deepEqual(r.admitted, { attempts: 0, outbox: 0 })
    assert.equal(w.llm.requests.length, 0)
  })

  for (const [name, act] of [
    ['withdrawal of the question', (w, r) => api(E, 'POST', `/api/v1/conversations/${r.conversationId}/messages/${r.messageId}/withdrawal`)],
    ['erasure of the conversation', (w, r) => api(A, 'POST', `/api/v1/conversations/${r.conversationId}/erasure`)],
    ['revocation of the asker', (w) => api(A, 'POST', `/api/v1/projects/${w.projectId}/members/${E}/removal`, {})],
  ]) {
    test(`late ${name} during the call: no answer is ever published; the call is stopped and counted`, async (t) => {
      const w = await world(t)
      w.llm.script({ text: `late answer ${ANSWER_CANARY}`, delayMs: 6000 })
      await w.start()
      const r = await w.ask()
      await w.until(() => w.llm.active > 0, 'the provider call in flight')
      const done = await act(w, r)
      assert.ok(done.status < 300, JSON.stringify(done.json))
      await w.until(async () => !['pending', 'running'].includes((await w.reply(r)).state), 'the ended reply')
      await sleep(7000)
      assert.deepEqual(await w.answers(r), [], 'no answer, even after the provider finished')
      assert.equal(w.llm.requests.length, 1)
      assert.notEqual((await w.reply(r)).state, 'answered')
      const states = (await w.reservations(r)).map((v) => v.state)
      assert.ok(states.length === 1 && ['uncertain', 'settled'].includes(states[0]), `the call stays counted (${states})`)
      w.assertPrivate()
    })
  }

  test('restart mid-call: the same artifact adopts the attempt from hello, never dispatches again, retires it; uncertain kept', async (t) => {
    const w = await world(t)
    w.llm.script({ text: `before the crash ${ANSWER_CANARY}`, delayMs: 20_000 })
    await w.start()
    const r = await w.ask()
    await w.until(() => w.llm.active > 0, 'the provider call in flight')
    await w.until(async () => (await w.reservations(r)).length === 1, 'the reservation')
    await w.stop('SIGKILL')
    const grantBefore = await w.grant()
    await w.start()
    await w.until(async () => (await w.binding(r)) === 'retired', 'the retired binding')
    const reply = await w.reply(r)
    assert.deepEqual([reply.state, reply.reason], ['outcome_unknown', 'runtime_lease_lost'])
    assert.deepEqual((await w.reservations(r)).map((v) => v.state), ['uncertain'])
    const grantAfter = await w.grant()
    assert.deepEqual(
      [grantAfter.uncertain_calls, grantAfter.uncertain_tokens, grantAfter.spent_calls],
      [String(Number(grantBefore.uncertain_calls) + Number(grantBefore.reserved_calls)), String(Number(grantBefore.uncertain_tokens) + Number(grantBefore.reserved_tokens)), '0'],
    )
    assert.equal(await w.creates(r), 1, 'one create, ever')
    assert.equal(w.llm.requests.length, 1, 'no redispatch to the provider')
    const retire = (await w.stages(r)).find((s) => s.kind === 'retire')
    assert.deepEqual(retire.executor, w.tuple)
    assert.doesNotMatch(w.stderr().split('readiness=ready').at(-1), new RegExp(`unrecovered=.*${r.attempt_id}`), 'adopted, not unrecovered')
    w.assertPrivate()
  })

  test('two LIVE runtimes: the superseded one aborts its held call and goes not ready; nothing is published or sent again', async (t) => {
    const w = await world(t)
    w.llm.script({ text: `held answer ${ANSWER_CANARY}`, delayMs: 60_000 })
    await w.start()
    const r = await w.ask()
    await w.until(() => w.llm.active > 0, 'the provider call in flight')
    await w.until(async () => (await w.reservations(r)).length === 1, 'the reservation')
    const second = await w.startSecond()
    // The old process is NOT killed: its next commands poll meets the superseded lease and fences its executor.
    await w.until(() => /readiness=not_ready reason="conversation_lease_superseded"/.test(w.stderr()), 'the old bridge fenced', 60_000)
    await w.until(() => w.llm.abandoned >= 1, 'the held provider response abandoned by the old process')
    await w.until(async () => (await w.binding(r)) === 'retired', 'the retired binding')
    const reply = await w.reply(r)
    assert.deepEqual([reply.state, reply.reason], ['outcome_unknown', 'runtime_lease_lost'])
    assert.deepEqual(await w.answers(r), [], 'no late answer')
    assert.deepEqual((await w.reservations(r)).map((v) => v.state), ['uncertain'], 'the cost stays counted')
    assert.equal(w.llm.requests.length, 1, 'no second provider call, by either process')
    assert.equal(await w.creates(r), 1)
    assert.deepEqual((await w.stages(r)).find((s) => s.kind === 'retire').executor, w.tuple)
    assert.match(second.stderr(), /readiness=ready/)
    assert.doesNotMatch(w.stderr(), /reply_service_receipt_retained/, 'the fenced process keeps no receipt for a lease it lost')
    w.assertPrivate()
  })

  test('restart with zero reservation: a refused reservation made no call; the restarted executor retires it', async (t) => {
    const w = await world(t, { grant: { replyTokenCap: 64 } })
    await w.start()
    const r = await w.ask()
    await w.until(async () => (await w.reply(r)).state === 'failed', 'the failed reply')
    assert.deepEqual(await w.reservations(r), [], 'no reservation was made')
    await w.stop('SIGKILL')
    await w.start()
    await w.until(async () => (await w.binding(r)) === 'retired', 'the retired binding')
    assert.equal(w.llm.requests.length, 0, 'zero provider requests, before and after the restart')
    assert.equal(await w.creates(r), 1)
  })

  test('a runtime under another artifact digest is never chosen: the Ask is refused, nothing is bound or sent', async (t) => {
    const w = await world(t, { runtimeDigest: OTHER_DIGEST })
    // Pinned to the closure, expected under OTHER_DIGEST, which is not the closure it runs: service mode stays
    // unavailable, so no role is advertised and no attempt is ever bound to a runtime that could not run it.
    await w.start()
    assert.match(w.stderr(), /reply_service_unavailable executor_closure_mismatch/)
    const r = await w.askRefused()
    assert.deepEqual([r.reply.state, r.reply.reason], ['blocked', 'runtime_unavailable'])
    assert.deepEqual(r.admitted, { attempts: 0, outbox: 0 })
    assert.equal(w.llm.requests.length, 0)
  })

  /** Service mode refused before its role exists: no conversation role advertised, the Ask refused, nothing sent. */
  async function assertNoExecutor(w, reason = 'executor_closure_mismatch') {
    assert.match(w.stderr(), new RegExp(`reply_service_unavailable ${reason}`))
    assert.doesNotMatch(w.stderr(), /executor_closure_verified/)
    const [stored] = await owner('SELECT roles FROM sophia.runtime_instances WHERE project_id=$1', [w.projectId])
    assert.equal((stored?.roles ?? []).find((role) => role.id === 'sophia-conversation-v1'), undefined, 'no conversation role is advertised')
    const r = await w.askRefused()
    assert.deepEqual([r.reply.state, r.reply.reason], ['blocked', 'runtime_unavailable'])
    assert.deepEqual(r.admitted, { attempts: 0, outbox: 0 })
    assert.equal(w.llm.requests.length, 0, 'no provider request')
  }

  // #393 4302689994: the advertised executor is the installed closure, verified at startup, not an operator's string.
  test('an altered runtime adapter under the old pin is no executor: unavailable before its role; the Ask refused, nothing sent', async (t) => {
    const w = await world(t)
    await w.start({ runtimeDir: alteredRuntime().dir })
    assert.ok(w.stderr().includes(ADAPTER_MARKER), 'the altered adapter is the one dsh loaded')
    await assertNoExecutor(w)
  })

  test('a changed installed profile input under the old pin is no executor', async (t) => {
    const w = await world(t)
    // The installed lock, an input the closure hashes but the composition policy does not parse (the profile patch is
    // held to strict JSON, so a comment there is refused as patch_unsupported instead).
    appendFileSync(join(w.layout.dshHome, 'profiles', unit.dsh.profile, 'pnpm-lock.yaml'), '# changed after the pin\n')
    await w.start()
    await assertNoExecutor(w)
  })

  test('a changed effective overlay under the old pin is no executor: another provider endpoint is never called', async (t) => {
    const w = await world(t)
    const elsewhere = await startMockResponses()
    t.after(() => elsewhere.close())
    await w.start({ overlays: [serviceOverlay(elsewhere.baseURL)] })
    await assertNoExecutor(w)
    assert.equal(elsewhere.requests.length, 0)
  })

  for (const [label, fixed] of [['the bundle archive digest alone', ARCHIVE_DIGEST], ['an arbitrary digest', 'c'.repeat(64)]]) {
    test(`${label}, expected and pinned alike, is no executor`, async (t) => {
      const w = await world(t, { pin: fixed, runtimeDigest: fixed })
      await w.start()
      await assertNoExecutor(w)
    })
  }

  // #393 R-B2-A868-01..03: startup inputs the closure does not cover are refused, not hashed around.
  test('a material home patch added under the old pin is no executor (the loader composes it; the service admits none)', async (t) => {
    const w = await world(t)
    const elsewhere = await startMockResponses()
    t.after(() => elsewhere.close())
    writeFileSync(join(w.layout.dshHome, 'cordis.patch.yml'), conversationRouteOverlay(bundlePatch, elsewhere.baseURL))
    await assert.rejects(executorClosureDigest({ unit, runtimeDir: RUNTIME_DIR, layout: w.layout, overlays: [w.overlay] }), /home_patch_present/,
      'the host derives no expected pin for it either')
    await w.start()
    await assertNoExecutor(w, 'executor_closure_unverifiable home_patch_present')
    assert.equal(elsewhere.requests.length, 0)
  })

  test('an external relative plugin inserted by an overlay is no executor, whatever its implementation or base', async (t) => {
    const w = await world(t)
    const inserted = JSON.stringify([...JSON.parse(w.overlay), { insert: [{ id: 'crossing-external', name: './crossing-plugin.mjs' }] }])
    writeFileSync(join(w.layout.root, 'crossing-plugin.mjs'),
      `export const name = 'crossing-external'\nexport function apply() { process.stderr.write(${JSON.stringify(`${PLUGIN_MARKER}\n`)}) }\n`)
    for (const layout of [w.layout, homeLayout(join(scratch, `elsewhere-${counter++}`))]) {
      if (layout !== w.layout) cpSync(pristine.root, layout.root, { recursive: true, verbatimSymlinks: true })
      await assert.rejects(executorClosureDigest({ unit, runtimeDir: RUNTIME_DIR, layout, overlays: [inserted] }), /patch_unsupported/,
        'no expected pin is derived for it, at either base')
    }
    await w.start({ overlays: [inserted] })
    assert.ok(w.stderr().includes(PLUGIN_MARKER), 'the loader mounted the external plugin')
    await assertNoExecutor(w, 'executor_closure_unverifiable patch_unsupported')
  })

  for (const [label, launch] of [['--import', { nodeArgs: ['--import'] }], ['NODE_OPTIONS', { env: 'NODE_OPTIONS' }]]) {
    test(`a Node preloader by ${label}, same argv, profile and overlay under the old pin, is no executor; the launcher refuses it`, async (t) => {
      const w = await world(t)
      const preload = join(w.layout.root, 'crossing-preload.mjs')
      writeFileSync(preload, `process.stderr.write(${JSON.stringify(`${PRELOAD_MARKER}\n`)})\n`)
      assert.throws(() => launchRuntime({ unit, runtimeDir: RUNTIME_DIR, layout: w.layout, extraEnv: { NODE_OPTIONS: `--import=${preload}` } }),
        /not a supported launch/)
      await w.startModified(launch.env ? { env: { NODE_OPTIONS: `--import=${preload}` } } : { nodeArgs: [...launch.nodeArgs, preload] })
      assert.ok(w.stderr().includes(PRELOAD_MARKER), 'the preloader ran')
      assert.ok(!w.stderr().includes(preload), 'the refusal names no path')
      await assertNoExecutor(w, 'executor_closure_unverifiable launch_modifier')
    })
  }

  test('a nested bundle placement with a same-version local dsh-llm peer, under the old pin, is no executor', async (t) => {
    const w = await world(t)
    nestBundleWithPeer(w.layout)
    await assert.rejects(executorClosureDigest({ unit, runtimeDir: RUNTIME_DIR, layout: w.layout, overlays: [w.overlay] }), /profile_unsupported/,
      'the host derives no expected pin for it')
    await w.start()
    assert.ok(w.stderr().includes(PEER_MARKER), 'the loader selected the nested local peer')
    await assertNoExecutor(w, 'executor_closure_unverifiable profile_unsupported')
  })

  test('a canonical bundle with a .bin-link local dsh-llm peer is no executor: the bundle is not closed', async (t) => {
    const w = await world(t)
    binLinkPeer(w.layout)
    await assert.rejects(executorClosureDigest({ unit, runtimeDir: RUNTIME_DIR, layout: w.layout, overlays: [w.overlay] }), /profile_unsupported/,
      'the host derives no expected pin for it')
    await w.start()
    assert.ok(w.stderr().includes(BIN_PEER_MARKER), 'the loader selected the linked local peer')
    await assertNoExecutor(w, 'executor_closure_unverifiable profile_unsupported')
  })

  test('a reviewed changed closure under its own new pin serves a new lineage: its tuple, one request, retired', async (t) => {
    const w = await world(t, { runtime: 'altered' })
    const recorded = (await executorClosureDigest({ unit, runtimeDir: RUNTIME_DIR, layout: w.layout, overlays: [w.overlay] })).digest
    assert.notEqual(w.closure, recorded, 'the altered adapter changes the closure')
    w.llm.script({ text: `The summary. ${ANSWER_CANARY}`, usage: { input_tokens: 900, output_tokens: 40 } })
    await w.start()
    assert.ok(w.stderr().includes(ADAPTER_MARKER))
    assert.match(w.stderr(), /reply_service executor_closure_verified/)
    const [stored] = await owner('SELECT roles FROM sophia.runtime_instances WHERE project_id=$1', [w.projectId])
    assert.deepEqual(stored.roles.find((role) => role.id === 'sophia-conversation-v1')?.executor, w.tuple)
    const r = await w.ask()
    await w.until(async () => (await w.reply(r)).state === 'answered', 'the published answer')
    assert.equal(w.llm.requests.length, 1)
    await w.until(async () => (await w.binding(r)) === 'retired', 'the retired binding')
    assert.deepEqual((await w.stages(r)).at(-1).executor, w.tuple)
  })

  test('a restart under a DIFFERENT verified closure never adopts the old tuple: no Stop, retire or redispatch; uncertain kept', async (t) => {
    const w = await world(t)
    w.llm.script({ text: `before the crash ${ANSWER_CANARY}`, delayMs: 20_000 })
    await w.start()
    const r = await w.ask()
    await w.until(() => w.llm.active > 0, 'the provider call in flight')
    await w.until(async () => (await w.reservations(r)).length === 1, 'the reservation')
    await w.stop('SIGKILL')
    const other = alteredRuntime()
    const otherClosure = (await executorClosureDigest({ unit: other.unit, runtimeDir: other.dir, layout: w.layout, overlays: [w.overlay] })).digest
    assert.notEqual(otherClosure, w.closure)
    await w.start({ runtimeDir: other.dir, expected: otherClosure })
    assert.match(w.stderr(), /reply_service executor_closure_verified/)
    await w.until(() => new RegExp(`unrecovered=.*${r.attempt_id}`).test(w.stderr()), 'the old attempt reported unrecovered, not adopted')
    await sleep(2000)
    assert.equal(await w.creates(r), 1, 'one create, ever')
    assert.equal(w.llm.requests.length, 1, 'no redispatch to the provider')
    assert.deepEqual(await w.answers(r), [])
    assert.ok((await w.reservations(r)).every((v) => v.state !== 'settled' && v.state !== 'released'), 'the reservation stays counted')
    assert.equal((await w.grant()).spent_calls, '0')
    for (const stage of await w.stages(r)) {
      assert.notEqual(stage.executor?.executorArtifactDigest, otherClosure, 'no receipt under the other closure')
    }
  })
})

// FND-B105: the shipped runtime-host entry's opt-in (default OFF), without the test launcher. Local and keyless: the
// provider is the mock, the key a dummy; never live evidence.
describe('the shipped runtime-host entry: service replies only by an explicit overlay and pinned digest (FND-B105)', () => {
  test('refused before anything starts: an overlay that is not config-only, sets no replies, or an unset/malformed digest; with --rehearse', () => {
    const dir = mkdtempSync(join(tmpdir(), 'b105-host-'))
    const run = (args, env = {}) =>
      spawnSync(process.execPath, ['scripts/runtime-host.mjs', '--root', join(dir, 'root'), ...args], {
        cwd: REPO_ROOT, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, SOPHIA_SERVICE_URL: 'http://127.0.0.1:9', SOPHIA_RUNTIME_TOKEN: 'x', OPENAI_API_KEY: DUMMY_KEY, ...env } })
    const write = (name, text) => { const f = join(dir, name); writeFileSync(f, text); return f }
    const good = serviceOverlay('http://127.0.0.1:9')
    const noReplies = JSON.stringify(JSON.parse(good).map((row) => row.id === 'sophia-control-bridge' ? { id: row.id, config: { ...row.config, replies: undefined } } : row))
    const cases = [
      ['not config-only', [ '--service-overlay', write('yaml.yml', 'plugins: {}\n') ], { SOPHIA_EXECUTOR_DIGEST: 'a'.repeat(64) }, /not a config-only JSON patch list/],
      ['no replies', [ '--service-overlay', write('none.json', noReplies) ], { SOPHIA_EXECUTOR_DIGEST: 'a'.repeat(64) }, /sets no service replies/],
      ['digest unset', [ '--service-overlay', write('good.json', good) ], {}, /SOPHIA_EXECUTOR_DIGEST must hold the expected executor closure/],
      ['digest malformed', [ '--service-overlay', write('good2.json', good) ], { SOPHIA_EXECUTOR_DIGEST: 'not-hex' }, /must hold the expected executor closure/],
      ['with --rehearse', [ '--rehearse', '--service-overlay', write('good3.json', good) ], { SOPHIA_EXECUTOR_DIGEST: 'a'.repeat(64) }, /never combined with --rehearse/],
    ]
    try {
      for (const [label, args, env, message] of cases) {
        const r = run(args, env)
        assert.equal(r.status, 2, `${label}: ${r.stderr}`)
        assert.match(r.stderr, message, label)
        assert.doesNotMatch(r.stdout, /"event":"profile"/, `${label}: refused before the profile`)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
