// Independent HTTP identity namespace probe, synthetic identities and disposable PostgreSQL only.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
const root = process.cwd()
const req = createRequire(resolve(root, 'package.json'))
const { Client } = req('pg')
const load = path => import(pathToFileURL(resolve(root, path)))
const { createTestDatabase, seedProject } = await load('packages/test-support/src/index.ts')
const { createPool } = await load('packages/persistence/src/index.ts')
const { buildApp } = await load('apps/api/src/app.ts')
const { createActorVerifier } = await load('apps/api/src/auth.ts')
const apiReq = createRequire(resolve(root, 'apps/api/package.json'))
const { SignJWT } = await import(pathToFileURL(apiReq.resolve('jose')))

test('distinct JWT subjects sharing an email remain isolated; rename and project key scopes retain exact receipts', async () => {
  const db = await createTestDatabase()
  const owner = new Client({ connectionString: db.ownerUrl })
  const pool = createPool(db.apiUrl, { max: 4 })
  const secret = 'independent-identity-synthetic-only-secret-32-bytes'
  const issuer = 'https://independent.synthetic.test/auth/v1'
  const app = buildApp({ pool, conversations: true, verifyActor: createActorVerifier({ issuer, audience: 'authenticated', secret }) })
  await owner.connect()
  try {
    const admin = randomUUID(), a = randomUUID(), b = randomUUID(), outsider = randomUUID()
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [a, b] })
    const { projectId: other } = await seedProject(db.ownerUrl, { admin, editors: [a] })
    for (const id of [projectId, other]) await owner.query("SELECT sophia.set_conversation_settings($1,'enabled','independent-synthetic-identity-probe')", [id])
    await app.listen({ host: '127.0.0.1', port: 0 })
    const base = `http://127.0.0.1:${app.server.address().port}`
    const token = (sub, email) => new SignJWT({ role: 'authenticated', email }).setProtectedHeader({ alg: 'HS256' }).setSubject(sub).setIssuer(issuer).setAudience('authenticated').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(secret))
    const call = async (path, sub, email, key, body) => {
      const res = await fetch(base + path, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(6000), headers: { connection: 'close', authorization: `Bearer ${await token(sub,email)}`, ...(key ? {'idempotency-key':key} : {}), ...(body ? {'content-type':'application/json'} : {}) }, ...(body ? {body:JSON.stringify(body)} : {}) })
      return { status: res.status, body: await res.json() }
    }
    const key = randomUUID(), email = 'same-email@synthetic.example.test'
    const body = { title: 'Synthetic identity namespace', text: 'Synthetic saved message', askSophia: false }
    const path = `/api/v1/projects/${projectId}/conversations`
    const first = await call(path, a, email, key, body)
    assert.equal(first.status,202)
    const renamed = await call(path, a, 'renamed@synthetic.example.test', key, body)
    assert.deepEqual(renamed,first,'rename must replay the existing receipt and stored attribution')
    const distinct = await call(path, b, email, key, body)
    assert.equal(distinct.status,202)
    assert.notEqual(distinct.body.conversation.id,first.body.conversation.id)
    assert.equal(first.body.message.actorId,a)
    assert.equal(distinct.body.message.actorId,b)
    const otherProject = await call(`/api/v1/projects/${other}/conversations`,a,email,key,body)
    assert.equal(otherProject.status,202)
    assert.notEqual(otherProject.body.conversation.id,first.body.conversation.id)
    const denied = await call(`/api/v1/conversations/${first.body.conversation.id}/messages`,outsider,email)
    assert.equal(denied.status,422)
    assert.equal(denied.body.code,'not_found','same email must not confer the member subject identity')
    const crossProject = await call(`/api/v1/conversations/${otherProject.body.conversation.id}/messages`,b,email)
    assert.equal(crossProject.status,422)
    assert.equal(crossProject.body.code,'not_found')
    const rows = (await owner.query('SELECT actor_id, count(*)::integer AS n FROM sophia.conversation_requests GROUP BY actor_id ORDER BY actor_id')).rows
    assert.deepEqual(new Map(rows.map(r => [r.actor_id,r.n])),new Map([[a,2],[b,1]]))
    for (const table of ['work_attempts','jobs','commands','outbox','runtime_commands','usage_records','conversation_replies']) {
      assert.equal((await owner.query(`SELECT count(*)::integer AS n FROM sophia.${table}`)).rows[0].n,0,table)
    }
    console.log('Independent actual HTTP/PG: rename replay, same-email distinct subjects, project key scope, outsider and cross-project denial; zero operational/model records')
  } finally { await app.close(); await pool.end(); await owner.end(); await db.drop() }
})
