import { ownerHostFixtures } from '../../../tests/helpers/owner-host-fixture-resources.ts'
import assert from 'node:assert/strict'
import { createServer, type RequestListener } from 'node:http'
import { writeFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { once } from 'node:events'
import { test, type TestContext } from 'node:test'
import type { RunnerCollection } from './runner-port.ts'
import { HttpHostChannel, ownerHostOrigin, OwnerHostHttpError, readOwnerSecret } from './owner-host-http.ts'
const ID = '10000000-0000-4000-8000-000000000001'
const CAP = 'a'.repeat(43)
async function fixture(t: TestContext, handler: RequestListener) {
  const resources = ownerHostFixtures(t)
  const dir = resources.directory('h-http-')
  const capabilityFile = join(dir, 'cap')
  writeFileSync(capabilityFile, CAP, { mode: 0o600 })
  const server = resources.server(createServer(handler))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const origin = `http://127.0.0.1:${address.port}`
  return {
    dir,
    capabilityFile,
    origin,
    channel: new HttpHostChannel({ origin, capabilityFile, loopbackTest: true, timeoutMs: 150 }),
  }
}
function outcome(value: 'unknown' | 'refused' | 'conflict') {
  return (err: unknown) =>
    err instanceof OwnerHostHttpError && err.outcome === value && err.message === `Owner host request ${value}`
}
test('origin is fixed HTTPS, or explicitly selected local loopback; no authority from URL components', () => {
  assert.equal(ownerHostOrigin('https://sophia.invalid/'), 'https://sophia.invalid')
  for (const value of [
    'http://sophia.invalid',
    'http://127.0.0.1',
    'https://user:secret@sophia.invalid',
    'https://sophia.invalid/?code=private',
    'https://sophia.invalid/#x',
    'https://sophia.invalid/path',
  ])
    assert.throws(() => ownerHostOrigin(value), outcome('refused'))
  assert.equal(ownerHostOrigin('http://127.0.0.1:1000', true), 'http://127.0.0.1:1000')
  assert.throws(() => ownerHostOrigin('http://remote.invalid', true), outcome('refused'))
})
test('capability is read from an owner-only no-follow file on every request', async (t) => {
  const headers: boolean[] = []
  const f = await fixture(t, (req, res) => {
    headers.push(req.headers.authorization === `Bearer ${headers.length ? 'b'.repeat(43) : CAP}`)
    res.end('{"result":"ok"}')
  })
  await f.channel.answer(ID, { kind: 'refused', reason: 'fixture' })
  writeFileSync(f.capabilityFile, 'b'.repeat(43))
  await f.channel.answer(ID, { kind: 'refused', reason: 'fixture' })
  assert.deepEqual(headers, [true, true])
  const link = join(f.dir, 'link')
  symlinkSync(f.capabilityFile, link)
  assert.throws(() => readOwnerSecret(link), outcome('refused'))
})
test('redirect is never followed and server errors cannot echo a code or capability', async (t) => {
  let requests = 0
  const f = await fixture(t, (_req, res) => {
    requests++
    res.writeHead(302, { location: '/redirect-secret' })
    res.end(CAP)
  })
  await assert.rejects(f.channel.go(ID), outcome('unknown'))
  assert.equal(requests, 1)
})
for (const [status, result] of [
  [403, 'refused'],
  [409, 'conflict'],
  [503, 'unknown'],
] as const)
  test(`HTTP ${status} is a finite ${result}`, async (t) => {
    const f = await fixture(t, (_req, res) => {
      res.statusCode = status
      res.end('private-code-and-error')
    })
    await assert.rejects(f.channel.go(ID), outcome(result))
  })
test('UTF8 response cap is actual streamed bytes; oversized body is no answer', async (t) => {
  const f = await fixture(t, (_req, res) => res.end(JSON.stringify({ result: 'go', payload: 'é'.repeat(32768) })))
  await assert.rejects(f.channel.go(ID), outcome('unknown'))
})
test('deadline includes a stalled response body', async (t) => {
  const f = await fixture(t, (_req, res) => {
    res.writeHead(200)
    res.write('{')
  })
  await assert.rejects(f.channel.go(ID), outcome('unknown'))
})
test('strict response vocabulary and decoded secret echo are refused whole', async (t) => {
  let reply = '{"result":"go","extra":"unexpected"}'
  const f = await fixture(t, (_req, res) => res.end(reply))
  await assert.rejects(f.channel.go(ID), outcome('unknown'))
  reply = '{"result":"go","payload":"' + CAP.replaceAll('a', '\\u0061') + '"}'
  await assert.rejects(f.channel.go(ID), outcome('unknown'))
})
test('65536-byte request bound applies before any HTTP effect, including collection wire', async (t) => {
  let calls = 0
  const f = await fixture(t, (_req, res) => {
    calls++
    res.end('{"result":"ok"}')
  })
  await assert.rejects(f.channel.answer(ID, { kind: 'refused', reason: 'é'.repeat(32768) }), outcome('refused'))
  const oversizedCollection: RunnerCollection = {
    v: 1,
    kind: 'collected',
    operationId: ID,
    bindingId: ID,
    journalId: ID,
    envelopeDigest: 'a'.repeat(64),
    threadId: 'fixture',
    runId: 'fixture',
    inputMessageId: 'fixture',
    messageId: 'fixture',
    itemId: 'fixture',
    text: 'é'.repeat(32768),
    textSha256: 'a'.repeat(64),
    byteLength: 65536,
    pages: 1,
    lastPosition: 1,
    coverageDigest: 'a'.repeat(64),
    resultDigest: 'a'.repeat(64),
  }
  await assert.rejects(f.channel.answer(ID, oversizedCollection), outcome('refused'))
  assert.equal(calls, 0)
})
test('ambiguous redemption retries exactly the same code and capability; no automatic retry', async (t) => {
  const requests: string[] = []
  const f = await fixture(t, (req, res) => {
    let body = ''
    req.on('data', (data: Buffer) => {
      body += data.toString()
    })
    req.on('end', () => {
      requests.push(body)
      if (requests.length === 1) {
        req.socket.destroy()
        return
      }
      res.end(JSON.stringify({ result: 'bound', hostId: ID, ownerId: ID, connectionId: ID, replayed: true }))
    })
  })
  await assert.rejects(f.channel.redeem('c'.repeat(43)), outcome('unknown'))
  assert.equal(requests.length, 1)
  assert.equal((await f.channel.redeem('c'.repeat(43))).result, 'bound')
  assert.equal(requests[0] === requests[1], true)
})
