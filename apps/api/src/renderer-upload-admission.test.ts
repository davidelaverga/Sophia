import assert from 'node:assert/strict'
import { request } from 'node:http'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { it } from 'node:test'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import { rendererUploadHooks, RENDER_BODY_MS, withRendererUpload } from './renderer-upload-admission.ts'

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
        timer = setTimeout(() => resolve(sentinel), 2000)
      }),
    ])
    assert.notEqual(result, sentinel, 'operation settled before the sentinel')
    if (result === sentinel) throw new Error('sentinel')
    return result
  } finally {
    clearTimeout(timer)
  }
}
function appFor(
  bytes: number,
  gate: ReturnType<typeof deferred>,
  entered: () => void,
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
      withRendererUpload(req, async () => {
        entered()
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
  const app = appFor(64 * MIB, gate, arrived.finish)
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
    req.destroy()
    await nextTurn()
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
