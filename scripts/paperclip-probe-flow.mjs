// WBC-02: the operator's flow against a running Paperclip server, over HTTP only, shared by the service probe's two
// modes (scripts/paperclip-service-probe.mjs): a server it starts itself, or one already running at a loopback origin
// (a container, WBC-02-CX-0031/CX-0032). Nothing here starts a process, opens a database or reads /proc.
import { createHash, generateKeyPairSync, randomBytes, randomUUID, createPrivateKey, createPublicKey } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import assert from 'node:assert/strict'
import { signEnvelope } from '../packages/coordination/src/envelope.ts'

export const PRIVATE_NAME = 'paperclip-private'
export const REQUEST_TIMEOUT_MS = 20_000

export const hex = (bytes) => randomBytes(bytes).toString('hex')
export const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const sha256 = (text) => createHash('sha256').update(text).digest('hex')

/** Waits for check() to return a value, polling every second, and fails after timeoutMs: never for ever. */
export async function until(what, check, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what} (${Math.round(timeoutMs / 1000)} s)`)
    await sleep(1000)
  }
}

/** A loopback origin, refused otherwise: this probe signs up an admin and must only ever reach a disposable server. */
export function loopbackOrigin(text) {
  const url = new URL(text)
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'http:' || !loopback || !url.port || url.pathname !== '/' || url.search || url.hash)
    throw new Error(`--url must be a plain loopback origin such as http://127.0.0.1:3100 (got ${text})`)
  return { host: url.hostname.replaceAll(/[[\]]/g, ''), port: Number(url.port), origin: url.origin }
}

/**
 * The flow against one server. `identity` is Sophia's side (its signing key, project and work); a later phase passes
 * the one an earlier phase saved, so its signed requests name the same commission.
 */
export function flowFor({ host = '127.0.0.1', port, origin, pluginPath }, identity = newIdentity()) {
  const sophia = keysOf(identity)
  const key = `sophia-wbc02-${identity.workId}`

  /** One HTTP exchange, with an explicit Host header when asked (fetch cannot set one), and a finite wait. */
  const call = (method, path, { body, headers = {}, hostHeader } = {}) =>
    new Promise((done, fail) => {
      const payload = body === undefined ? undefined : JSON.stringify(body)
      const req = httpRequest(
        {
          host,
          port,
          method,
          path,
          headers: {
            ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
            ...(hostHeader === undefined ? {} : { host: hostHeader }),
            ...headers,
          },
        },
        (res) => {
          let text = ''
          res.setEncoding('utf8')
          res.on('data', (chunk) => (text += chunk))
          res.on('end', () => done({ status: res.statusCode ?? 0, json: parse(text), text, cookies: res.headers['set-cookie'] ?? [] }))
        },
      )
      req.on('error', fail)
      // a server that accepts and never answers (one thrashing in garbage collection, say) must not hang the probe
      req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error(`${method} ${path}: no answer in ${REQUEST_TIMEOUT_MS / 1000} s`)))
      if (payload !== undefined) req.write(payload)
      req.end()
    })

  const envelope = (ids, op, deliveryKey, body) => {
    const now = Math.floor(Date.now() / 1000)
    const claims = {
      op,
      companyId: ids.companyId,
      paperclipProjectId: ids.projectId,
      sophiaProjectId: identity.sophiaProject,
      workId: identity.workId,
      commissionKey: key,
      deliveryKey,
      initiator: { kind: 'member', id: randomUUID() },
      nonce: randomUUID(),
      iat: now,
      exp: now + 120,
    }
    return signEnvelope(claims, body, sophia.privateKey)
  }

  const health = async () => {
    const reply = await call('GET', '/api/health').catch(() => null)
    return reply?.status === 200 && reply.json?.status === 'ok' ? reply.json : null
  }

  /** The private name is admitted and any other host name refused. */
  const hostGuard = async () => {
    const named = await call('GET', '/api/health', { hostHeader: `${PRIVATE_NAME}:${port}` })
    const other = await call('GET', '/api/health', { hostHeader: `evil.example:${port}` })
    assert.equal(named.status, 200, 'the private name is admitted')
    assert.equal(other.status, 403, 'any other host name is refused')
  }

  /** The first instance admin over loopback: sign-up, the private-mode claim, and a board API key that does not expire. */
  const bootstrap = async () => {
    const signUp = await call('POST', '/api/auth/sign-up/email', {
      body: { email: 'operator@example.invalid', password: hex(16), name: 'Synthetic operator' },
      headers: { origin },
    })
    assert.equal(signUp.status, 200, signUp.text)
    const session = { cookie: signUp.cookies.map((c) => c.split(';')[0]).join('; '), origin }
    const claim = await call('POST', '/api/bootstrap/claim', { body: {}, headers: session })
    assert.ok(claim.status < 300, `claim: ${claim.status} ${claim.text}`)
    const minted = await call('POST', '/api/board-api-keys', { body: { name: 'operator', expiresAt: null }, headers: session })
    assert.ok(minted.status < 300, `board key: ${minted.status} ${minted.text}`)
    return { userId: signUp.json.user.id, token: minted.json.token }
  }

  const auth = (op) => ({ authorization: `Bearer ${op.token}` })
  const pluginStatus = async (op, pluginId) => (await call('GET', `/api/plugins/${pluginId}`, { headers: auth(op) })).json?.status

  /** Install from the fixed path, configure for one company. */
  const plugin = async (op) => {
    const company = await call('POST', '/api/companies', { body: { name: 'Synthetic company' }, headers: auth(op) })
    assert.ok(company.status < 300, company.text)
    const companyId = company.json.id
    const project = await call('POST', `/api/companies/${companyId}/projects`, { body: { name: 'Synthetic project' }, headers: auth(op) })
    assert.ok(project.status < 300, project.text)
    const installed = await call('POST', '/api/plugins/install', {
      body: { packageName: pluginPath, isLocalPath: true },
      headers: auth(op),
    })
    assert.equal(installed.status, 200, installed.text)
    const ids = { companyId, projectId: project.json.id, pluginId: installed.json.id }
    await until('the plugin to be ready', async () => (await pluginStatus(op, ids.pluginId)) === 'ready', 60_000)
    const configJson = {
      signingPublicKey: sophia.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      integrationUserId: op.userId,
      projects: [{ sophiaProjectId: identity.sophiaProject, companyId, paperclipProjectId: ids.projectId }],
    }
    const configured = await call('POST', `/api/plugins/${ids.pluginId}/config`, { body: { companyId, configJson }, headers: auth(op) })
    assert.ok(configured.status < 300, configured.text)
    return ids
  }

  /** The digest of the plugin's stored configuration for the company: unchanged across a restart. */
  const configDigest = async (op, ids) => {
    const read = await call('GET', `/api/plugins/${ids.pluginId}/config?companyId=${ids.companyId}`, { headers: auth(op) })
    assert.equal(read.status, 200, read.text)
    return sha256(JSON.stringify(read.json?.configJson ?? read.json))
  }

  /** The signed commission; sent again, the same issue answers (the plugin creates by key, never twice). */
  const commission = async (op, ids) => {
    const body = {
      key,
      sophiaProjectId: identity.sophiaProject,
      paperclipProjectId: ids.projectId,
      workId: identity.workId,
      title: 'Source review: synthetic',
      description: 'A synthetic commission. Source text stays in Sophia.',
      initialStatus: 'blocked',
      wake: false,
    }
    const send = () =>
      call('POST', '/api/plugins/sophia.coordination/api/commissions', {
        body: { companyId: ids.companyId, envelope: envelope(ids, 'commission', `commission-${identity.workId}`, body), commission: body },
        headers: auth(op),
      })
    const reply = await send()
    assert.equal(reply.status, 200, reply.text)
    return { reply: reply.json, resend: send }
  }

  /** A signed Stop of the commission's issue; sent again with the same key, it is already applied. */
  const stop = async (op, ids, issueId) => {
    const control = { op: 'stop', key: 'stop-1', commissionKey: key, sophiaProjectId: identity.sophiaProject, workId: identity.workId }
    const send = () =>
      call('POST', `/api/plugins/sophia.coordination/api/issues/${issueId}/control`, {
        body: { envelope: envelope(ids, 'stop', control.key, control), control },
        headers: auth(op),
      })
    const first = await send()
    assert.equal(first.status, 200, first.text)
    const again = await send()
    assert.equal(again.status, 200, again.text)
    return { first: first.json, again: again.json }
  }

  /** The settle job, run by the host's own scheduler (every minute; the scheduler ticks every 30 s). */
  const scheduledJob = async (op, pluginId) => {
    const jobs = (await call('GET', `/api/plugins/${pluginId}/jobs`, { headers: auth(op) })).json
    const job = Array.isArray(jobs) ? jobs.find((j) => j.jobKey === 'settle-status-writes') : null
    assert.ok(job, 'the settle job is registered')
    return until(
      'a scheduled run of the settle job',
      async () => {
        const runs = (await call('GET', `/api/plugins/${pluginId}/jobs/${job.id}/runs`, { headers: auth(op) })).json
        return Array.isArray(runs) ? runs.find((r) => r.status === 'succeeded') : null
      },
      150_000,
    )
  }

  const lookup = async (op, ids) => {
    const body = { key, sophiaProjectId: identity.sophiaProject, workId: identity.workId }
    const reply = await call('POST', '/api/plugins/sophia.coordination/api/commissions/lookup', {
      body: { companyId: ids.companyId, envelope: envelope(ids, 'lookup', `lookup-${identity.workId}`, body), lookup: body },
      headers: auth(op),
    })
    assert.equal(reply.status, 200, reply.text)
    return reply.json
  }

  /** A new sign-up, once the server runs with sign-up closed: refused. */
  const signUpRefused = async () => {
    const late = await call('POST', '/api/auth/sign-up/email', {
      body: { email: 'late@example.invalid', password: hex(16), name: 'Late' },
      headers: { origin },
    })
    assert.ok(late.status >= 400, `sign-up after close: ${late.status}`)
    return late.status
  }

  return { identity, call, health, hostGuard, bootstrap, pluginStatus, plugin, configDigest, commission, stop, scheduledJob, lookup, signUpRefused }
}

/** Sophia's side of a probe: a synthetic signing key, project and work, saved by one phase for the next. */
export function newIdentity() {
  const { privateKey } = generateKeyPairSync('ed25519')
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    sophiaProject: randomUUID(),
    workId: randomUUID(),
  }
}

function keysOf(identity) {
  const privateKey = createPrivateKey(identity.privateKeyPem)
  return { privateKey, publicKey: createPublicKey(privateKey) }
}

function parse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
