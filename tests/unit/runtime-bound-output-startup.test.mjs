/** C011-F01: local HTTP fixture startup only; no runtime, database or provider calls.
 * The outer owner captures actual servers independently of the factory and rescues the
 * old implementation too. Faults are installed only after the real double is acquired.
 */
import assert from 'node:assert/strict'
import http from 'node:http'
import { syncBuiltinESMExports } from 'node:module'
import { describe, test } from 'node:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ownedScope, RetainedScratch, startBoundProvider, startRecordingProxy, withOwned } from '../support/runtime-bound-output-provider.mjs'

async function settled(promise) {
  let timer
  const result = await Promise.race([
    promise.then((value) => ({ value }), (error) => ({ error })),
    new Promise((resolve) => { timer = setTimeout(() => resolve({ sentinel: true }), 1000) }),
  ]).finally(() => clearTimeout(timer))
  assert.equal(result.sentinel, undefined, 'startup must settle before the sentinel')
  return result
}

async function withServers(t, inject, body) {
  const servers = []
  const original = http.createServer
  t.mock.method(http, 'createServer', (...args) => {
    if (servers.length === 1 && inject.construct) throw inject.primary
    const server = original(...args)
    servers.push(server)
    if (servers.length === 2) inject.front?.(server, servers[0])
    return server
  })
  syncBuiltinESMExports()
  try {
    await body(servers)
  } finally {
    t.mock.restoreAll()
    syncBuiltinESMExports()
    // Independent outer rescue: it has handles even when the factory never returns.
    for (const server of servers.toReversed()) {
      server.closeAllConnections()
      await new Promise((resolve, reject) => {
        http.Server.prototype.close.call(server, (err) => {
          if (err && err.code !== 'ERR_SERVER_NOT_RUNNING') reject(err)
          else resolve()
        })
      })
      assert.equal(server.listening, false, 'outer owner confirms listener released')
      assert.equal(server.address(), null, 'outer owner confirms address released')
    }
    t.diagnostic(`outer rescue confirmed ${servers.length} actual server(s) closed`)
  }
}

function assertClosed(servers) {
  assert.ok(servers.length >= 1, 'the real double was acquired')
  for (const server of servers) {
    assert.equal(server.listening, false, 'factory released its partial acquisition before rejection')
    assert.equal(server.address(), null)
  }
}

test('C011-F01: synchronous front construction failure releases the actual double', async (t) => {
  const primary = new Error('injected front construction failure')
  await withServers(t, { construct: true, primary }, async (servers) => {
    const result = await settled(startBoundProvider())
    assert.equal(result.error, primary)
    assertClosed(servers)
  })
})

test('C011-F01: synchronous listen setup failure closes both acquisitions', async (t) => {
  const primary = new Error('injected listen setup failure')
  await withServers(t, { front(server) {
    server.listen = () => { throw primary }
  } }, async (servers) => {
    const result = await settled(startBoundProvider())
    assert.equal(result.error, primary)
    assertClosed(servers)
    assert.equal(servers[1].listeners('listening').some((fn) => fn.name === 'ready'), false)
    assert.equal(servers[1].listenerCount('error'), 0)
  })
})

test('C011-F01: real asynchronous EADDRINUSE rejects and releases the actual double', async (t) => {
  let emitted
  await withServers(t, { front(server, double) {
    const listen = server.listen
    // The already-owned real double reserves the port. Observe the error independently
    // so even the old helper cannot emit an unhandled error during the negative control.
    server.once('error', (error) => { emitted = error })
    server.listen = () => listen.call(server, double.address().port, '127.0.0.1')
  } }, async (servers) => {
    const result = await settled(startBoundProvider())
    assert.equal(result.error, emitted, 'the actual server error is retained by identity')
    assert.equal(result.error?.code, 'EADDRINUSE')
    assertClosed(servers)
    assert.equal(servers[1].listeners('listening').some((fn) => fn.name === 'ready'), false)
    assert.equal(servers[1].listenerCount('error'), 0)
  })
})

test('C011-F01: primary and an after-real-close error survive; independent double cleanup continues', async (t) => {
  const primary = new Error('injected after starting front')
  const frontError = new Error('injected after real front close')
  const closed = []
  await withServers(t, { front(server, double) {
    for (const [name, target] of [['front', server], ['double', double]]) {
      const close = target.close
      target.close = (callback) => close.call(target, (err) => {
        if (!err) closed.push(name)
        callback(err ?? (name === 'front' ? frontError : undefined))
      })
    }
    const address = server.address
    let fail = true
    server.address = () => {
      if (fail) {
        fail = false
        throw primary
      }
      return address.call(server)
    }
  } }, async (servers) => {
    const result = await settled(startBoundProvider())
    assert.ok(result.error instanceof AggregateError)
    assert.equal(result.error.errors[0], primary)
    assert.equal(result.error.errors.length, 2)
    assert.equal(result.error.errors[1].cause, frontError)
    assertClosed(servers)
    assert.deepEqual(closed, ['front', 'double'])
  })
})

test('C011-F01: successful startup transfers two live servers and preserves provider/proxy HTTP behavior', async (t) => {
  await withServers(t, {}, async (servers) => {
    const provider = await startBoundProvider()
    try {
      assert.equal(servers.length, 2)
      assert.ok(servers.every((server) => server.listening), 'ownership is transferred while live')
      provider.script({ text: 'startup positive' })
      const proxy = await startRecordingProxy(() => provider.baseURL.replace(/\/v1$/, ''))
      try {
        const answer = await fetch(`${proxy.url}/v1/responses`, {
          method: 'POST', body: JSON.stringify({ model: 'local-test', input: 'local' }),
          signal: AbortSignal.timeout(3000),
        })
        assert.equal(answer.status, 200)
        assert.match(await answer.text(), /startup positive/)
        assert.equal(provider.requests.length, 1)
        assert.equal(provider.requests[0].body.input, 'local')
        assert.equal(proxy.sent.length, 1)
      } finally {
        await proxy.close()
      }
    } finally {
      await provider.close()
    }
    assertClosed(servers)
  })
})


// Exact existing three F02 checks, extracted without changing assertions or timeouts.
describe('C2W-F02: fixture ownership, every cleanup attempted, primary and cleanup errors kept, a scratch kept under a reader', () => {
  const refused = async (url) => {
    try {
      await fetch(url, { method: 'POST', body: '{}', signal: AbortSignal.timeout(3000) })
      return false
    } catch {
      return true
    }
  }

  test('a failure after the real provider and proxy were acquired, before any runtime: each is closed, the failure stays visible, nothing sent', async () => {
    const seen = {}
    const error = await withOwned(async (scope) => {
      const sc = scope.scratch(mkdtempSync(join(tmpdir(), 'sophia-r123-f02-')))
      seen.dir = sc.dir
      const provider = await startBoundProvider()
      scope.own('provider', () => provider.close())
      seen.provider = provider
      const proxy = await startRecordingProxy(() => provider.baseURL.replace(/\/v1$/, ''))
      scope.own('proxy', () => proxy.close())
      seen.proxy = proxy
      throw new Error('injected: failed before the runtime completed')
    }).then(() => null, (e) => e)
    assert.equal(error?.message, 'injected: failed before the runtime completed', 'the primary error alone, unchanged')
    assert.equal(await refused(`${seen.provider.baseURL}/responses`), true, 'the provider front is closed')
    assert.equal(await refused(`${seen.proxy.url}/x`), true, 'the proxy is closed')
    assert.equal(existsSync(seen.dir), false, 'the scratch (no reader) is removed')
    assert.equal(seen.provider.requests.length, 0, 'no request reached the provider: nothing is credited')
  })

  test('one cleanup failing after its real close: the remaining cleanups still run; the primary and the cleanup error are both kept', async () => {
    const seen = {}
    const primary = new Error('injected: the test body failed')
    const error = await withOwned(async (scope) => {
      const sc = scope.scratch(mkdtempSync(join(tmpdir(), 'sophia-r123-f02-')))
      seen.dir = sc.dir
      const proxy = await startRecordingProxy(() => 'http://127.0.0.1:9')
      scope.own('proxy', () => proxy.close())
      seen.proxy = proxy
      const provider = await startBoundProvider()
      scope.own('provider', async () => {
        await provider.close()
        throw new Error('injected: after the real close')
      })
      seen.provider = provider
      throw primary
    }).then(() => null, (e) => e)
    assert.ok(error instanceof AggregateError, String(error))
    assert.equal(error.errors[0], primary, 'the primary error first')
    assert.equal(error.errors.length, 2, error.errors.map((e) => e.message).join(' | '))
    assert.equal(error.errors[1].message, 'cleanup provider failed')
    assert.equal(error.errors[1].cause?.message, 'injected: after the real close')
    assert.equal(await refused(`${seen.provider.baseURL}/responses`), true, 'the failing cleanup had really closed the provider')
    assert.equal(await refused(`${seen.proxy.url}/x`), true, 'the later proxy cleanup still ran')
    assert.equal(existsSync(seen.dir), false, 'the later scratch cleanup still ran')
  })

  test('a runtime whose stop rejects, or whose exit is not confirmed, keeps its scratch (HOLD); its other cleanups still run', async () => {
    for (const [what, run, ms] of [
      ['stop rejected', { stop: async () => { throw new Error('injected: stop failed') } }, 20_000],
      ['exit unconfirmed', { stop: () => new Promise(() => {}) }, 200],
    ]) {
      const scope = ownedScope()
      const sc = scope.scratch(mkdtempSync(join(tmpdir(), 'sophia-r123-f02-')))
      let after = false
      scope.own('after the runtime', () => {
        after = true
      })
      scope.runtime('stub runtime', run, sc, ms)
      const error = await scope.close().then(() => null, (e) => e)
      assert.ok(error instanceof AggregateError, `${what}: ${String(error)}`)
      assert.match(error.errors[0].message, /cleanup stub runtime failed/, what)
      assert.ok(error.errors[1] instanceof RetainedScratch && error.errors[1].dir === sc.dir, `${what}: the scratch is reported retained`)
      assert.equal(existsSync(sc.dir), true, `${what}: the scratch is NOT removed beneath a possible reader`)
      assert.equal(after, true, `${what}: an independent cleanup still ran`)
      // The stub had no process at all: its empty scratch is this test's own to remove now.
      rmSync(sc.dir, { recursive: true, force: true })
    }
  })
})
