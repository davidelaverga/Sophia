import assert from 'node:assert/strict'
import { Agent, request } from 'node:http'
import { clearTimeout as clearWallTimer, setTimeout as wallTimer } from 'node:timers'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { it } from 'node:test'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import type { ByteWriteControl } from './byte-store.ts'
import {
  rendererUploadHooks,
  RENDER_AUTHORIZATIONS,
  RENDER_BODY_MS,
  withRendererUpload,
} from './renderer-upload-admission.ts'

const MIB = 1024 * 1024
const noop = () => {}
function deferred() {
  let finish = noop
  const promise = new Promise<void>((resolve) => {
    finish = resolve
  })
  return { promise, finish }
}
async function beforeSentinel<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const sentinel = Symbol('sentinel')
  try {
    const result = await Promise.race([
      promise,
      new Promise<typeof sentinel>((resolve) => {
        timer = wallTimer(() => resolve(sentinel), 2000)
      }),
    ])
    assert.notEqual(result, sentinel, 'operation settled before the sentinel')
    if (result === sentinel) throw new Error('sentinel')
    return result
  } finally {
    clearWallTimer(timer)
  }
}
function appFor(
  bytes: number,
  gate: ReturnType<typeof deferred>,
  entered: (control: ByteWriteControl) => void,
  authorize: (req: FastifyRequest) => Promise<void> = () => Promise.resolve(),
): FastifyInstance {
  const app = Fastify()
  app.addContentTypeParser('application/pdf', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))
  app.put(
    '/upload',
    {
      ...rendererUploadHooks(bytes, authorize),
      schema: {
        querystring: {
          type: 'object',
          properties: { valid: { type: 'string', const: 'yes' } },
          required: ['valid'],
        },
      },
    },
    (req) =>
      withRendererUpload(req, async (control) => {
        entered(control)
        await gate.promise
        return { ok: true }
      }),
  )
  return app
}
const upload = (app: FastifyInstance) =>
  app.inject({
    method: 'PUT',
    url: '/upload?valid=yes',
    headers: { 'content-type': 'application/pdf' },
    payload: '%PDF-small',
  })

function partialUpload(app: FastifyInstance, contentType = 'application/pdf') {
  const address = app.server.address()
  assert.ok(address && typeof address === 'object')
  const closed = deferred()
  const agent = new Agent({ keepAlive: true })
  const req = request({
    hostname: '127.0.0.1',
    port: address.port,
    path: '/upload?valid=yes',
    method: 'PUT',
    agent,
    headers: { 'content-type': contentType, 'content-length': '100' },
  })
  req.on('error', () => {})
  req.once('socket', (socket) => socket.once('close', closed.finish))
  const response = new Promise<number>((resolve) => {
    req.once('response', (res) => {
      res.resume()
      res.once('end', () => resolve(res.statusCode ?? 0))
    })
  })
  req.write('%PDF-')
  return { req, agent, closed, response }
}

it('reserves route maxima before parsing, across app factories, and releases after actual handler settlement', async (t) => {
  const gate = deferred()
  const arrived = deferred()
  let entries = 0
  const app = appFor(32 * MIB, gate, () => {
    if (++entries === 2) arrived.finish()
  })
  const other = appFor(8 * MIB, gate, () => {
    entries += 1
  })
  const pending = [upload(app), upload(app)]
  t.after(async () => {
    gate.finish()
    await Promise.all(pending)
    await app.close()
    await other.close()
  })
  try {
    await beforeSentinel(arrived.promise)
    // The literal body and Content-Length are tiny: each PDF reserves its route maximum nonetheless.
    const refused = await beforeSentinel(upload(other))
    assert.equal(refused.statusCode, 503)
    assert.equal(entries, 2, 'refused request reached no handler')
  } finally {
    gate.finish()
    await beforeSentinel(Promise.all(pending))
    await app.close()
  }
  assert.equal((await upload(other)).statusCode, 200)
  await other.close()
})

it('bounds request count and releases parsing/schema errors without leaking admission', async (t) => {
  const gate = deferred()
  const arrived = deferred()
  let entries = 0
  const app = appFor(8 * MIB, gate, () => {
    if (++entries === 4) arrived.finish()
  })
  const pending = Array.from({ length: 4 }, () => upload(app))
  t.after(async () => {
    gate.finish()
    await Promise.all(pending)
    await app.close()
  })
  try {
    await beforeSentinel(arrived.promise)
    assert.equal((await beforeSentinel(upload(app))).statusCode, 503)
  } finally {
    gate.finish()
    await beforeSentinel(Promise.all(pending))
  }
  for (let i = 0; i < 5; i += 1) {
    const invalid = await app.inject({
      method: 'PUT',
      url: '/upload',
      headers: { 'content-type': 'application/pdf' },
      payload: 'bad',
    })
    assert.equal(invalid.statusCode, 400)
    const unsupported = await app.inject({
      method: 'PUT',
      url: '/upload?valid=yes',
      headers: { 'content-type': 'unknown/unknown' },
      payload: 'bad',
    })
    assert.equal(unsupported.statusCode, 415)
  }
  assert.equal((await upload(app)).statusCode, 200)
  await app.close()
})

it('keeps a disconnected handling request admitted and clears its body only after settlement', async () => {
  const gate = deferred()
  const arrived = deferred()
  let control: ByteWriteControl | undefined
  const app = appFor(64 * MIB, gate, (active) => {
    control = active
    arrived.finish()
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  const address = app.server.address()
  assert.ok(address && typeof address === 'object')
  const req = request({
    hostname: '127.0.0.1',
    port: address.port,
    path: '/upload?valid=yes',
    method: 'PUT',
    headers: { 'content-type': 'application/pdf' },
  })
  req.on('error', () => {})
  req.end('%PDF-body')
  try {
    await beforeSentinel(arrived.promise)
    assert.ok(control)
    const aborted = new Promise<void>((resolve) =>
      control?.signal.addEventListener('abort', () => resolve(), { once: true }),
    )
    req.destroy()
    await beforeSentinel(aborted)
    assert.equal((await beforeSentinel(upload(app))).statusCode, 503)
  } finally {
    gate.finish()
    await app.close()
  }
})

it('destroys an unfinished body at its wall deadline and admits a subsequent request', async () => {
  const gate = deferred()
  gate.finish()
  const app = appFor(64 * MIB, gate, () => {})
  await app.listen({ host: '127.0.0.1', port: 0 })
  const address = app.server.address()
  assert.ok(address && typeof address === 'object')
  const closed = deferred()
  const req = request({
    hostname: '127.0.0.1',
    port: address.port,
    path: '/upload?valid=yes',
    method: 'PUT',
    headers: { 'content-type': 'application/pdf', 'content-length': '100' },
  })
  req.on('error', () => {})
  req.once('close', closed.finish)
  req.write('%PDF-')
  try {
    // An actual socket/read/parser, not an injected complete body. The generous sentinel is still asserted.
    const deadline = setTimeout(() => req.destroy(), RENDER_BODY_MS + 2000)
    const started = performance.now()
    await closed.promise
    clearTimeout(deadline)
    assert.ok(performance.now() - started < RENDER_BODY_MS + 1500, 'body deadline beat the cleanup sentinel')
    assert.equal((await beforeSentinel(upload(app))).statusCode, 200)
  } finally {
    req.destroy()
    await app.close()
  }
})

it('refuses parsed-late bodies before an overdue timer can be cleared and releases their capacity', async (t) => {
  let now = 0
  t.mock.method(performance, 'now', () => now)
  const gate = deferred()
  gate.finish()
  let entries = 0
  const app = appFor(64 * MIB, gate, () => {
    entries += 1
  })
  let late = true
  app.addHook('preValidation', (_req, _reply, done) => {
    if (late) now = RENDER_BODY_MS + 1
    done()
  })
  try {
    assert.equal((await upload(app)).statusCode, 503)
    assert.equal(entries, 0)
    late = false
    now = 0
    assert.equal((await upload(app)).statusCode, 200)
    assert.equal(entries, 1)
  } finally {
    await app.close()
  }
})

it('authorizes before shared body admission, refusing invalid callers without consuming capacity', async () => {
  const gate = deferred()
  gate.finish()
  const entered = deferred()
  const auth = deferred()
  const app = Fastify()
  app.addContentTypeParser('application/pdf', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))
  app.put(
    '/blocked',
    {
      ...rendererUploadHooks(64 * MIB, async () => {
        entered.finish()
        await auth.promise
        throw new Error('synthetic refused capability')
      }),
    },
    (req) => withRendererUpload(req, () => Promise.resolve({ ok: true })),
  )
  const other = appFor(64 * MIB, gate, () => {})
  const refused = app.inject({
    method: 'PUT',
    url: '/blocked',
    headers: { 'content-type': 'application/pdf' },
    payload: '%PDF-small',
  })
  const observed = Promise.resolve(refused)
  try {
    await beforeSentinel(entered.promise)
    assert.equal(
      (await beforeSentinel(upload(other))).statusCode,
      200,
      'pending capability check has reserved no shared body bytes',
    )
    auth.finish()
    assert.equal((await beforeSentinel(observed)).statusCode, 500)
    assert.equal(
      (await beforeSentinel(upload(other))).statusCode,
      200,
      'refused capability has reserved no shared body bytes',
    )
  } finally {
    auth.finish()
    await beforeSentinel(observed)
    await app.close()
    await other.close()
  }
})

it('never charges a request that disconnects while its capability authorization is pending', async () => {
  const auth = deferred()
  const entered = deferred()
  const closed = deferred()
  const gate = deferred()
  gate.finish()
  let first = true
  const app = appFor(
    64 * MIB,
    gate,
    () => {},
    async () => {
      if (!first) return
      first = false
      entered.finish()
      await auth.promise
    },
  )
  app.addHook('onRequest', (req, _reply, done) => {
    req.raw.once('close', closed.finish)
    done()
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  const address = app.server.address()
  assert.ok(address && typeof address === 'object')
  const req = request({
    hostname: '127.0.0.1',
    port: address.port,
    path: '/upload?valid=yes',
    method: 'PUT',
    headers: { 'content-type': 'application/pdf', 'content-length': '100' },
  })
  req.on('error', () => {})
  req.write('%PDF-')
  try {
    await beforeSentinel(entered.promise)
    req.destroy()
    await beforeSentinel(closed.promise)
    auth.finish()
    await nextTurn()
    assert.equal(
      (await beforeSentinel(upload(app))).statusCode,
      200,
      'closed-during-auth request reserved no body capacity',
    )
  } finally {
    auth.finish()
    req.destroy()
    await app.close()
  }
})

it('includes authorization time in the body deadline instead of granting a fresh body budget', async (t) => {
  let now = 0
  t.mock.method(performance, 'now', () => now)
  const gate = deferred()
  gate.finish()
  let entries = 0
  const app = appFor(
    64 * MIB,
    gate,
    () => entries++,
    () => {
      now = RENDER_BODY_MS - 1000
      return Promise.resolve()
    },
  )
  app.addHook('preValidation', (_req, _reply, done) => {
    now = RENDER_BODY_MS + 1
    done()
  })
  try {
    assert.equal((await beforeSentinel(upload(app))).statusCode, 503)
    assert.equal(entries, 0)
  } finally {
    await app.close()
  }
})

it('refuses authorization that returns past the absolute deadline before its timer runs', async (t) => {
  let now = 0
  t.mock.method(performance, 'now', () => now)
  const gate = deferred()
  gate.finish()
  let entries = 0
  let parsing = 0
  const app = appFor(
    64 * MIB,
    gate,
    () => entries++,
    () => {
      now = RENDER_BODY_MS + 1
      return Promise.resolve()
    },
  )
  app.addHook('preParsing', (_req, _reply, payload, done) => {
    parsing += 1
    done(null, payload)
  })
  try {
    assert.equal((await beforeSentinel(upload(app))).statusCode, 503)
    assert.equal(entries, 0)
    assert.equal(parsing, 0, 'expired authorization never begins body parsing')
  } finally {
    await app.close()
  }
})

it('bounds original authorizations across factories until actual settlement, even after public timeouts', async (t) => {
  const gate = deferred()
  gate.finish()
  const auth = deferred()
  let calls = 0
  let entries = 0
  const authorize = async () => {
    const index = calls++
    await auth.promise
    if (index % 2) throw new Error('late synthetic refusal')
  }
  const app = appFor(64 * MIB, gate, () => entries++, authorize)
  const other = appFor(64 * MIB, gate, () => entries++, authorize)
  await Promise.all([app.ready(), other.ready()])
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const pending = Array.from({ length: RENDER_AUTHORIZATIONS }, (_, i) => Promise.resolve(upload(i % 2 ? other : app)))
  // Observe socket errors immediately as well as successful refusal responses.
  const settled = Promise.allSettled(pending)
  try {
    await nextTurn()
    assert.equal(calls, RENDER_AUTHORIZATIONS)
    const refused = await beforeSentinel(upload(other))
    assert.equal(refused.statusCode, 503)
    assert.equal(calls, RENDER_AUTHORIZATIONS, 'overflow never invoked authorization')
    t.mock.timers.tick(RENDER_BODY_MS)
    t.mock.timers.reset()
    await beforeSentinel(settled)
    assert.equal(entries, 0, 'timed-out authorization reached no handler')
    assert.equal((await beforeSentinel(upload(other))).statusCode, 503)
    assert.equal(calls, RENDER_AUTHORIZATIONS, 'public timeout did not refund original operation permits')
    auth.finish()
    await nextTurn()
    assert.equal((await beforeSentinel(upload(other))).statusCode, 200)
    assert.equal(entries, 1, 'late successes and rejections admitted no old requests')
  } finally {
    t.mock.timers.reset()
    auth.finish()
    await beforeSentinel(settled)
    await app.close()
    await other.close()
  }
})

it('closes a partial real socket at the request deadline while authorization is still pending', async () => {
  const gate = deferred()
  gate.finish()
  const auth = deferred()
  const entered = deferred()
  let entries = 0
  const app = appFor(
    64 * MIB,
    gate,
    () => entries++,
    async () => {
      entered.finish()
      await auth.promise
    },
  )
  await app.listen({ host: '127.0.0.1', port: 0 })
  const address = app.server.address()
  assert.ok(address && typeof address === 'object')
  const closed = deferred()
  const req = request({
    hostname: '127.0.0.1',
    port: address.port,
    path: '/upload?valid=yes',
    method: 'PUT',
    headers: { 'content-type': 'application/pdf', 'content-length': '100' },
  })
  req.on('error', () => {})
  req.once('close', closed.finish)
  req.write('%PDF-')
  try {
    await beforeSentinel(entered.promise)
    const started = performance.now()
    const sentinel = setTimeout(() => req.destroy(), RENDER_BODY_MS + 2000)
    try {
      await closed.promise
      assert.ok(performance.now() - started < RENDER_BODY_MS + 1500, 'authorization deadline beat cleanup sentinel')
    } finally {
      clearTimeout(sentinel)
    }
    auth.finish()
    await nextTurn()
    assert.equal(entries, 0)
    assert.equal((await beforeSentinel(upload(app))).statusCode, 200)
  } finally {
    auth.finish()
    req.destroy()
    await app.close()
  }
})

it('delivers early refusal responses and retains the original deadline for unfinished keep-alive bodies', async (t) => {
  const gate = deferred()
  gate.finish()
  const held = deferred()
  const entered = deferred()
  const busy = appFor(64 * MIB, held, entered.finish)
  const refused = appFor(0, gate, noop, () => Promise.reject(Object.assign(new Error('refused'), { statusCode: 401 })))
  const parser = appFor(0, gate, noop)
  const apps = [busy, refused, parser]
  await Promise.all(apps.map((app) => app.listen({ host: '127.0.0.1', port: 0 })))
  const holding = Promise.resolve(upload(busy))
  await beforeSentinel(entered.promise)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const sockets = [partialUpload(refused), partialUpload(busy), partialUpload(parser, 'unknown/unknown')]
  try {
    assert.deepEqual(await beforeSentinel(Promise.all(sockets.map((socket) => socket.response))), [401, 503, 415])
    t.mock.timers.tick(RENDER_BODY_MS)
    t.mock.timers.reset()
    await beforeSentinel(Promise.all(sockets.map((socket) => socket.closed.promise)))
  } finally {
    t.mock.timers.reset()
    held.finish()
    for (const socket of sockets) {
      socket.req.destroy()
      socket.agent.destroy()
    }
    await beforeSentinel(holding)
    await Promise.all(apps.map((app) => app.close()))
  }
})

it('keeps the absolute deadline after parsing and retains the body until a timed-out handler settles', async (t) => {
  const held = deferred()
  const entered = deferred()
  const app = Fastify()
  let body: FastifyRequest | undefined
  let signal: AbortSignal | undefined
  app.addContentTypeParser('application/pdf', { parseAs: 'buffer' }, (_req, bytes, done) => done(null, bytes))
  app.put('/upload', { ...rendererUploadHooks(64 * MIB, () => Promise.resolve()) }, (req) =>
    withRendererUpload(req, async (control) => {
      body = req
      signal = control.signal
      entered.finish()
      await held.promise
      return { ok: true }
    }),
  )
  const gate = deferred()
  gate.finish()
  const other = appFor(64 * MIB, gate, noop)
  await app.ready()
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const pending = Promise.resolve(
    app.inject({ method: 'PUT', url: '/upload', headers: { 'content-type': 'application/pdf' }, payload: '%PDF-body' }),
  )
  try {
    await beforeSentinel(entered.promise)
    t.mock.timers.tick(RENDER_BODY_MS)
    t.mock.timers.reset()
    assert.equal((await beforeSentinel(pending)).statusCode, 503, 'parsed handler deadline beats the sentinel')
    assert.equal(signal?.aborted, true)
    assert.ok(Buffer.isBuffer(body?.body), 'original pipeline still owns the body')
    assert.equal((await beforeSentinel(upload(other))).statusCode, 503, 'public timeout refunds no live body')
    held.finish()
    await nextTurn()
    assert.equal(body?.body, undefined)
    assert.equal((await beforeSentinel(upload(other))).statusCode, 200)
  } finally {
    t.mock.timers.reset()
    held.finish()
    await beforeSentinel(pending)
    await Promise.all([app.close(), other.close()])
  }
})

it('normal complete-body close preserves a slow healthy HTTP handler and its control', async () => {
  const held = deferred()
  const parsed = deferred()
  const app = Fastify()
  app.addHook('onRequest', (req, _reply, done) => {
    req.raw.once('close', parsed.finish)
    done()
  })
  let signal: AbortSignal | undefined
  app.addContentTypeParser('application/pdf', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))
  app.put('/upload', { ...rendererUploadHooks(64 * MIB, () => Promise.resolve()) }, (req) =>
    withRendererUpload(req, async (control) => {
      signal = control.signal
      await held.promise
      assert.equal(control.signal.aborted, false)
      return { ok: true }
    }),
  )
  await app.listen({ host: '127.0.0.1', port: 0 })
  const address = app.server.address()
  assert.ok(address && typeof address === 'object')
  const req = request({
    hostname: '127.0.0.1',
    port: address.port,
    method: 'PUT',
    path: '/upload',
    headers: { 'content-type': 'application/pdf' },
  })
  req.on('error', noop)
  const response = new Promise<number>((resolve) =>
    req.once('response', (res) => {
      res.resume()
      res.once('end', () => resolve(res.statusCode ?? 0))
    }),
  )
  req.end('%PDF-body')
  try {
    await beforeSentinel(parsed.promise)
    assert.equal(signal?.aborted, false, 'normal parsed request close is not client disconnect')
    held.finish()
    assert.equal(await beforeSentinel(response), 200)
  } finally {
    held.finish()
    req.destroy()
    await app.close()
  }
})

it('refuses a completed handler past the absolute deadline even before a delayed timer runs', async (t) => {
  let now = 0
  t.mock.method(performance, 'now', () => now)
  const app = Fastify()
  app.addContentTypeParser('application/pdf', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))
  app.put('/upload', { ...rendererUploadHooks(64 * MIB, () => Promise.resolve()) }, (req) =>
    withRendererUpload(req, () => {
      now = RENDER_BODY_MS + 1
      return Promise.resolve({ ok: true })
    }),
  )
  try {
    const response = await beforeSentinel(
      app.inject({
        method: 'PUT',
        url: '/upload',
        headers: { 'content-type': 'application/pdf' },
        payload: '%PDF-body',
      }),
    )
    assert.equal(response.statusCode, 503, 'late fulfilled handler cannot clear the deadline and answer200')
  } finally {
    await app.close()
  }
})
