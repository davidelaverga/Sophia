/**
 * INC04-R07-C2-MAINTAINED-BOUND-OUTPUT-001 (Root81; coherent-010 Root123) test support, LABELLED: the controlled pieces
 * around the REAL runtime, bridge, patched adapter, pi-ai and the maintained API app. Nothing here is a provider, an
 * account, a live qualification or an activation.
 * - `startBoundProvider()`: the Responses test double (mock-responses.mjs) behind a front that records each request's
 *   exact body and arrival instant, and can drop the next connection BEFORE any response header (`dropNext()`): the
 *   request was sent, nothing was observed. Its `close()` closes the front AND the double, keeping both errors.
 * - `boundOverlayJson()`: one strict JSON overlay: the recorded provider pointed at the front, its compat optionally
 *   narrowed, and the bridge row with `boundProfiles` and service-mode `replies` (the verified emitter) when given.
 * - `startRecordingProxy()`: what the bridge sent and was answered, per path, forwarded to the server `route()` names;
 *   `before(path, raw)`, when given, is awaited before a POST is forwarded (a test's own controlled action between steps).
 * - `ownedScope()` (C2W-F02): the owner of a test's acquisitions. Each is registered the moment it exists; `close()`
 *   attempts every cleanup in reverse order even when one rejects, keeps the primary error and every cleanup error, and
 *   never removes a scratch directory while a reader of it (a runtime whose exit is not confirmed) remains: that
 *   scratch is RETAINED and reported.
 * The Phase A scoped server is gone: coherent-010 serves the bound steps from the maintained app (`buildApp`) itself.
 */

import { rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { parseCordisYaml } from '../../scripts/lib/patch-lint.mjs'
import { startMockResponses } from './mock-responses.mjs'

const listen = (server) => new Promise((resolve, reject) => {
  const failed = (err) => {
    server.removeListener('listening', ready)
    reject(err)
  }
  const ready = () => {
    server.removeListener('error', failed)
    try {
      resolve(server.address().port)
    } catch (err) {
      reject(err)
    }
  }
  server.once('error', failed)
  server.once('listening', ready)
  try {
    server.listen(0, '127.0.0.1')
  } catch (err) {
    server.removeListener('error', failed)
    failed(err)
  }
})
const close = (server) => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
const read = async (req) => {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

/** The Responses double behind a recording front. `requests[i]` = { arrivedAt (ms), raw, body, dropped }. */
export async function startBoundProvider() {
  const double = await startMockResponses()
  let front
  try {
    const requests = []
    let drop = 0
    front = createServer(async (req, res) => {
      const raw = await read(req)
      const arrivedAt = Date.now()
      let body = null
      try {
        body = JSON.parse(raw.toString('utf8'))
      } catch {}
      const dropped = drop > 0
      if (dropped) drop -= 1
      requests.push({ arrivedAt, url: req.url, raw: raw.toString('utf8'), body, dropped })
      if (dropped) {
        req.socket.destroy()
        return
      }
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !['host', 'content-length', 'connection'].includes(k)))
      try {
        const answer = await fetch(`${double.baseURL.replace(/\/v1$/, '')}${req.url}`, { method: req.method, headers, ...(raw.length ? { body: raw } : {}) })
        res.writeHead(answer.status, Object.fromEntries([...answer.headers].filter(([k]) => !['content-length', 'transfer-encoding', 'connection'].includes(k))))
        if (answer.body) for await (const chunk of answer.body) res.write(chunk)
        res.end()
      } catch {
        res.destroy()
      }
    })
    const port = await listen(front)
    return {
      baseURL: `http://127.0.0.1:${port}/v1`,
      requests,
      script: (...steps) => double.script(...steps),
      dropNext: (n = 1) => {
        drop += n
      },
      /** Both halves are closed even when one rejects; every error is kept (C2W-F02). */
      close: () => closeBoundProvider(front, double),
    }
  } catch (primary) {
    await closeBoundProvider(front, double, primary)
  }
}

/** Until return, the factory owns both acquisitions. A failed listen may never have opened the front. */
async function closeBoundProvider(front, double, primary) {
  const errors = []
  const closeFront = async () => {
    if (!front) return
    try {
      await close(front)
    } catch (err) {
      if (primary !== undefined && err?.code === 'ERR_SERVER_NOT_RUNNING') return
      throw err
    }
  }
  for (const [name, fn] of [['front', closeFront], ['double', () => double.close()]]) {
    try {
      await fn()
    } catch (err) {
      errors.push(Object.assign(new Error(`bound provider ${name} close failed`), { cause: err }))
    }
  }
  if (primary !== undefined) {
    if (errors.length === 0) throw primary
    throw new AggregateError([primary, ...errors], 'bound provider startup and cleanup failed')
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, 'bound provider close failed')
}

/** The bundle patch's bridge row config. */
export function bridgeRow(bundlePatchText) {
  const rows = parseCordisYaml(bundlePatchText)
  const row = rows.flatMap((r) => r.insert ?? []).find((r) => r.id === 'sophia-control-bridge')?.config
  if (!row) throw new Error('the bundle patch inserts no sophia-control-bridge row')
  return row
}

/**
 * One strict JSON overlay: `provider` of the recorded llm-pi-ai row pointed at `baseURL` (compat merged with `compat`),
 * and, with `bridge`, the bridge row with those members added (boundProfiles, replies).
 */
export function boundOverlayJson(bundlePatchText, baseURL, provider, { compat, bridge } = {}) {
  const rows = parseCordisYaml(bundlePatchText)
  const route = rows.find((row) => row.id === 'llm-pi-ai')?.config
  const declared = route?.providers?.[provider]
  if (!declared) throw new Error(`the bundle patch declares no ${provider} route`)
  const narrowed = compat ? { compat: { ...(declared.compat ?? {}), ...compat } } : {}
  const out = [{ id: 'llm-pi-ai', config: { ...route, providers: { ...route.providers, [provider]: { ...declared, baseURL, ...narrowed } } } }]
  if (bridge) out.push({ id: 'sophia-control-bridge', config: { ...bridgeRow(bundlePatchText), ...bridge } })
  return JSON.stringify(out)
}

/** A pass-through that records each POST the bridge sent (path, raw body, status, answer, instants). */
export async function startRecordingProxy(route, { before } = {}) {
  const sent = []
  const server = createServer(async (req, res) => {
    const raw = await read(req)
    if (before && req.method === 'POST') {
      try {
        await before(req.url, raw.toString('utf8'))
      } catch (err) {
        sent.push({ path: req.url, raw: raw.toString('utf8'), at: Date.now(), beforeError: String(err?.message ?? err) })
      }
    }
    const record = req.method === 'POST' ? { path: req.url, raw: raw.toString('utf8'), at: Date.now(), instance: req.headers['x-sophia-bridge-instance'] } : null
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !['host', 'content-length', 'connection'].includes(k)))
    try {
      const answer = await fetch(`${route(req.url)}${req.url}`, { method: req.method, headers, ...(raw.length > 0 ? { body: raw } : {}) })
      const body = Buffer.from(await answer.arrayBuffer())
      if (record) sent.push({ ...record, status: answer.status, answer: body.toString('utf8'), answeredAt: Date.now() })
      res.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? 'application/json' })
      res.end(body)
    } catch {
      res.writeHead(502)
      res.end()
    }
  })
  const port = await listen(server)
  return { url: `http://127.0.0.1:${port}`, sent, of: (suffix) => sent.filter((s) => s.path.endsWith(suffix)), close: () => close(server) }
}

/** A cleanup refused because a reader of the scratch may remain: the directory is kept (never removed beneath it). */
export class RetainedScratch extends Error {
  constructor(dir, readers) {
    super(`scratch retained (readers not confirmed released: ${readers.join(', ')}): ${dir}`)
    this.dir = dir
    this.readers = readers
  }
}

/**
 * C2W-F02: the owner of one test's acquisitions. `own(name, cleanup)` right after each acquisition; `scratch(dir)`
 * owns a directory that is removed only once every reader registered on it (`reader(name)` -> its `released()`) has
 * been released; `close(primary)` attempts every cleanup (reverse order), and returns nothing or THROWS: the primary
 * error alone, or an AggregateError holding the primary error (first) and each cleanup error.
 */
export function ownedScope() {
  const cleanups = []
  const failures = []
  let closed = false
  const own = (name, cleanup) => {
    if (closed) throw new Error(`owned scope already closed: ${name}`)
    cleanups.push({ name, cleanup })
  }
  const scratch = (dir) => {
    const readers = new Set()
    own(`scratch ${dir}`, () => {
      if (readers.size > 0) throw new RetainedScratch(dir, [...readers])
      rmSync(dir, { recursive: true, force: true })
    })
    return {
      dir,
      reader(name) {
        readers.add(name)
        return { released: () => readers.delete(name) }
      },
    }
  }
  /**
   * A launched runtime reading `scratch`: stop it (SIGTERM) and wait at most `ms` for its exit; only a confirmed exit
   * releases its read of the scratch. A rejected or unconfirmed stop keeps the scratch (HOLD), and is an error.
   */
  const runtime = (name, run, scratchOwner, ms = 20_000) => {
    const read = scratchOwner.reader(name)
    own(name, async () => {
      let timer
      const outcome = await Promise.race([
        Promise.resolve().then(() => run.stop()).then((exit) => ({ exit })),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve({ timeout: true }), ms)
        }),
      ]).finally(() => clearTimeout(timer))
      if (outcome.timeout) throw new Error(`${name}: stop not confirmed within ${ms} ms (exit unknown)`)
      read.released()
    })
  }
  const close = async (primary) => {
    closed = true
    for (const { name, cleanup } of cleanups.toReversed()) {
      try {
        await cleanup()
      } catch (err) {
        failures.push(err instanceof RetainedScratch ? err : Object.assign(new Error(`cleanup ${name} failed`), { cause: err }))
      }
    }
    if (failures.length === 0) {
      if (primary !== undefined) throw primary
      return
    }
    throw new AggregateError(primary === undefined ? failures : [primary, ...failures], primary === undefined ? 'cleanup failed' : 'test failed and cleanup failed')
  }
  return { own, scratch, runtime, close, failures }
}

/** Run `body(scope)` and then close its scope, keeping the body's error and every cleanup error (C2W-F02). */
export async function withOwned(body) {
  const scope = ownedScope()
  let primary
  try {
    return await body(scope)
  } catch (err) {
    primary = err
  } finally {
    await scope.close(primary)
  }
}
