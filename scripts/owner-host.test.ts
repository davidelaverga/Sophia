import { ownerHostFixtures } from '../tests/helpers/owner-host-fixture-resources.ts'
// Actual CLI children use only owned temporary secrets/journals and loopback Sophia/T3 protocol fixtures.
import assert from 'node:assert/strict'
import { createServer, type RequestListener } from 'node:http'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { RunnerJournal } from '../packages/coordination/src/runner-journal.ts'
import { exchangeRequest } from '../packages/coordination/src/owner-host-channel.ts'
import { launchCommandId, clientRequestIdOf } from '../packages/coordination/src/t3-port-mapping.ts'
import type { RunnerEnvelope } from '../packages/coordination/src/runner-port.ts'
const ID = '10000000-0000-4000-8000-000000000001'
const PIN = 'ade473018d32003658b7d38693e083ee2e314bd8'
const CLI = process.env.SOPHIA_H_TEST_CLI ?? new URL('./owner-host.ts', import.meta.url).pathname
async function server(t: TestContext, listener: RequestListener) {
  const s = ownerHostFixtures(t).server(createServer(listener))
  s.listen(0, '127.0.0.1')
  await once(s, 'listening')
  const address = s.address()
  assert.ok(address && typeof address === 'object')

  return `http://127.0.0.1:${address.port}`
}
function fixture(t: TestContext) {
  const dir = ownerHostFixtures(t).directory('h-cli-')
  const journalFile = join(dir, 'journal')
  const journal = new RunnerJournal(journalFile)
  let journalId: string
  try {
    journalId = journal.id
  } finally {
    journal.close()
  }
  const identity = {
    environmentRef: 'fixture-env',
    adapterPin: PIN,
    profileId: 'fixture-profile',
    profileRevision: 1,
    accountKey: 'fixture-account',
    t3Namespace: 'client:fixture',
  }
  const profile = {
    ...identity,
    ownerId: ID,
    journalId,
    nativeProjectRefs: ['fixture-project'],
    operations: ['create', 'input', 'stop'],
  }
  const tokenFile = join(dir, 'token'),
    capabilityFile = join(dir, 'cap'),
    gatewayProfileFile = join(dir, 'profile'),
    codeFile = join(dir, 'code'),
    configFile = join(dir, 'config')
  writeFileSync(tokenFile, 'synthetic-t3-bearer-test-only', { mode: 0o600 })
  writeFileSync(capabilityFile, 'a'.repeat(43), { mode: 0o600 })
  writeFileSync(codeFile, 'c'.repeat(43), { mode: 0o600 })
  writeFileSync(gatewayProfileFile, JSON.stringify(profile), { mode: 0o600 })
  const config = {
    ...identity,
    tokenFile,
    capabilityFile,
    journalFile,
    gatewayProfileFile,
    collectionVersion: null,
    loopbackTest: true,
  }
  return {
    dir,
    journalId,
    identity,
    profile,
    tokenFile,
    capabilityFile,
    gatewayProfileFile,
    codeFile,
    configFile,
    config,
  }
}
function start(t: TestContext, config: string, command = 'run', codeFile?: string) {
  const p = spawn(
    process.execPath,
    [CLI, command, '--config', config, ...(codeFile ? ['--code-file', codeFile] : [])],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const owned = ownerHostFixtures(t).child(p)
  let output = ''
  p.stdout?.on('data', (b: Buffer) => {
    output += b.toString()
  })
  p.stderr?.on('data', (b: Buffer) => {
    output += b.toString()
  })
  const done = owned.closed
  return { p, done, output: () => output }
}
async function bounded<T>(promise: Promise<T>, ms = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_r, reject) => {
        timer = setTimeout(() => reject(new Error('fixture deadline')), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
function envelope(): RunnerEnvelope {
  return {
    v: 1,
    operationId: ID,
    kind: 'create',
    projectId: ID,
    ownerId: ID,
    resourceId: ID,
    bindingId: ID,
    goalId: ID,
    qualificationId: ID,
    qualificationRevision: 1,
    adapterPin: PIN,
    environmentRef: 'fixture-env',
    nativeProjectRef: 'fixture-project',
    profileId: 'fixture-profile',
    profileRevision: 1,
    accountKey: 'fixture-account',
    authorityEpoch: 1,
    message: 'inert synthetic fixture',
    title: 'fixture',
    targetOperationId: null,
    nativeThreadId: null,
  }
}
function hello(hostId = ID) {
  return JSON.stringify({ result: 'ok', hostId, state: 'active', first: false })
}

test('redeem uses only existing secret files, same key on ambiguous retry, same journal on restart', async (t) => {
  const f = fixture(t)
  let calls = 0
  let prior = ''
  const journals: string[] = []
  const origin = await server(t, (req, res) => {
    let body = ''
    req.on('data', (b: Buffer) => {
      body += b.toString()
    })
    req.on('end', () => {
      calls++
      if (calls === 1) {
        prior = body
        req.socket.destroy()
        return
      }
      assert.equal(body === prior, true)
      res.end(JSON.stringify({ result: 'bound', hostId: ID, ownerId: ID, connectionId: ID, replayed: true }))
    })
  })
  writeFileSync(f.configFile, JSON.stringify({ ...f.config, sophiaOrigin: origin, t3Url: 'http://127.0.0.1:1/mcp' }))
  const first = start(t, f.configFile, 'redeem', f.codeFile)
  assert.equal((await bounded(first.done))[0], 1)
  const second = start(t, f.configFile, 'redeem', f.codeFile)
  assert.equal((await bounded(second.done))[0], 0)
  assert.equal(calls, 2)
  for (let i = 0; i < 2; i++) {
    const j = new RunnerJournal(f.config.journalFile)
    journals.push(j.id)
    j.close()
  }
  assert.deepEqual(journals, [f.journalId, f.journalId])
  assert.equal(first.output().includes('a'.repeat(43)), false)
  assert.equal(second.output().includes('c'.repeat(43)), false)
})

test('signal while poll is pending fences GO/send and releases the same locked journal only after drain', async (t) => {
  const f = fixture(t)
  const child: { current?: ChildProcess } = {}
  const deferred = Promise.withResolvers<void>()
  const pending = deferred.promise
  let gos = 0
  const origin = await server(t, (req, res) => {
    if (req.url?.endsWith('/hello')) {
      res.end(hello())
      return
    }
    if (req.url?.endsWith('/poll')) {
      deferred.resolve()
      child.current?.kill('SIGTERM')
      setTimeout(
        () =>
          res.end(
            JSON.stringify([
              {
                exchangeId: ID,
                kind: 'send',
                request: exchangeRequest('send', envelope(), f.journalId),
                deadlineAt: new Date(Date.now() + 30000).toISOString(),
              },
            ]),
          ),
        50,
      )
      return
    }
    gos++
    res.end('{"result":"go"}')
  })
  writeFileSync(f.configFile, JSON.stringify({ ...f.config, sophiaOrigin: origin, t3Url: 'http://127.0.0.1:1/mcp' }))
  const run = start(t, f.configFile)
  child.current = run.p
  await bounded(pending)
  assert.throws(() => new RunnerJournal(f.config.journalFile))
  assert.equal((await bounded(run.done))[0], 0)
  assert.equal(gos, 0)
  const reopened = new RunnerJournal(f.config.journalFile)
  assert.equal(reopened.id, f.journalId)
  assert.equal(reopened.entry(ID), undefined)
  reopened.close()
})

for (const kind of ['received', 'unknown', 'abort-initialize'] as const)
  test('signal during native call drains ' + kind + ' and fences every later call', async (t) => {
    const f = fixture(t)
    const child: { current?: ChildProcess } = {}
    let calls = 0
    const deferred = Promise.withResolvers<void>()
    const answered = deferred.promise
    const namespace = 'client:fixture'
    const thread = launchCommandId(namespace, clientRequestIdOf(ID))
    const t3 = await server(t, (req, res) => {
      let raw = ''
      req.on('data', (b: Buffer) => {
        raw += b.toString()
      })
      req.on('end', () => {
        const v: unknown = JSON.parse(raw)
        assert.ok(v && typeof v === 'object' && 'method' in v)
        if (v.method === 'notifications/initialized') {
          res.statusCode = 202
          res.end()
          return
        }
        assert.ok('id' in v)
        if (v.method === 'initialize') {
          res.setHeader('mcp-session-id', 'fixture-session')
          const respond = () =>
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: v.id,
                result: {
                  protocolVersion: '2025-06-18',
                  capabilities: {},
                  serverInfo: { name: 'fixture', version: '1' },
                },
              }),
            )
          if (kind === 'abort-initialize') {
            child.current?.kill('SIGTERM')
            setTimeout(respond, 50)
          } else respond()
          return
        }
        calls++
        child.current?.kill('SIGTERM')
        setTimeout(
          () =>
            kind === 'unknown'
              ? res.destroy()
              : res.end(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    id: v.id,
                    result: {
                      content: [
                        {
                          type: 'text',
                          text: JSON.stringify({
                            threadId: thread,
                            messageId: thread,
                            runId: 'fixture-run',
                            status: 'running',
                            delivery: 'started',
                          }),
                        },
                      ],
                      isError: false,
                    },
                  }),
                ),
          80,
        )
      })
    })
    let polled = false
    const origin = await server(t, (req, res) => {
      if (req.url?.endsWith('/hello')) {
        res.end(hello())
        return
      }
      if (req.url?.endsWith('/poll')) {
        res.end(
          JSON.stringify(
            polled
              ? []
              : [
                  {
                    exchangeId: ID,
                    kind: 'send',
                    request: exchangeRequest('send', envelope(), f.journalId),
                    deadlineAt: new Date(Date.now() + 30000).toISOString(),
                  },
                ],
          ),
        )
        polled = true
        return
      }
      if (req.url?.endsWith('/go')) {
        res.end('{"result":"go"}')
        return
      }
      deferred.resolve()
      res.end('{"result":"ok"}')
    })
    writeFileSync(f.configFile, JSON.stringify({ ...f.config, sophiaOrigin: origin, t3Url: t3 + '/mcp' }))
    const run = start(t, f.configFile)
    child.current = run.p
    await bounded(answered)
    assert.equal((await bounded(run.done))[0], 0)
    assert.equal(calls, kind === 'abort-initialize' ? 0 : 1)
    const reopened = new RunnerJournal(f.config.journalFile)
    const entry = reopened.entry(ID)
    assert.ok(entry)
    if (kind === 'received') assert.equal(entry.answer?.kind, 'received')
    else {
      assert.equal(entry.answer, null)
      assert.equal(entry.possibleSend, true)
      assert.ok(entry.unknownNotes > 0)
      assert.equal(entry.refused, null)
    }
    reopened.close()
    assert.equal(run.output().includes('synthetic-t3-bearer-test-only'), false)
  })

test('local profile mismatch refuses before any HTTP call and leaves journal restartable', (t) => {
  const f = fixture(t)
  writeFileSync(f.gatewayProfileFile, JSON.stringify({ ...f.profile, accountKey: 'other-account' }))
  writeFileSync(
    f.configFile,
    JSON.stringify({ ...f.config, sophiaOrigin: 'https://fixture.invalid', t3Url: 'http://127.0.0.1:1/mcp' }),
  )
  const r = spawnSync(process.execPath, [CLI, 'run', '--config', f.configFile], { encoding: 'utf8', timeout: 5000 })
  assert.equal(r.status, 1)
  const j = new RunnerJournal(f.config.journalFile)
  assert.equal(j.id, f.journalId)
  j.close()
  assert.equal(readFileSync(f.capabilityFile, 'utf8').length, 43)
})
