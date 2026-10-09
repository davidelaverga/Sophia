// Independent CON-01 G1 adversarial probes. No provider or hosted target.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { readFileSync, readdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
const root = process.cwd()
const require = createRequire(resolve(root, 'package.json'))
const pg = require('pg')
const support = await import(pathToFileURL(resolve(root, 'packages/test-support/src/index.ts')))
const p = await import(pathToFileURL(resolve(root, 'packages/persistence/src/index.ts')))

async function episode(fn) {
  const db = await support.createTestDatabase()
  const owner = new pg.Client({ connectionString: db.ownerUrl })
  const pool = p.createPool(db.apiUrl, { max: 6 })
  await owner.connect()
  try { await fn({ db, owner, pool }) }
  finally { await pool.end(); await owner.end(); await db.drop() }
}

test('independent: durable, isolated human-only messages, rejected access/replay and read-only privacy controls', async () => {
  await episode(async ({ db, owner, pool }) => {
    const admin = randomUUID(), editor = randomUUID(), viewer = randomUUID(), outsider = randomUUID()
    const { projectId } = await support.seedProject(db.ownerUrl, { admin, editors: [editor], viewers: [viewer] })
    await owner.query("SELECT sophia.set_conversation_settings($1,'enabled','independent-local-only')", [projectId])
    const counts = async () => {
      const result = {}
      for (const table of ['goals','work_attempts','execution_bindings','commands','jobs','outbox','runtime_commands','research_allowances','conversation_replies']) {
        result[table] = (await owner.query(`SELECT count(*)::integer AS n FROM sophia.${table} WHERE project_id=$1`, [projectId])).rows[0].n
      }
      return result
    }
    const initial = await counts()
    const key = randomUUID()
    const start = () => p.withActor(pool, editor, 'write', c => p.startConversation(c, projectId, key, { title:'Independent synthetic direction', text:'Keep the map first.', askSophia:false }, 'same@example.test'))
    const [first, retry] = await Promise.all([start(), start()])
    assert.deepEqual(retry, first)
    const second = await p.withActor(pool, editor, 'write', c => p.startConversation(c, projectId, randomUUID(), {title:'Other synthetic conversation',text:'Keep numbers here.',askSophia:false},'renamed@example.test'))
    assert.notEqual(first.conversationId, second.conversationId)
    assert.deepEqual(await counts(), initial, 'human-only writes must admit no operational/model work or reply request')
    // A separate API login pool proves this is not client memory or a retained transaction.
    const returned = p.createPool(db.apiUrl, { max:1 })
    try {
      const page = await p.withActor(returned, viewer, 'read', c => p.readConversationPage(c, first.conversationId, null))
      assert.deepEqual(page.messages.map(m=>m.text), ['Keep the map first.'])
      assert.equal(page.messages[0].actorId, editor)
      await assert.rejects(p.withActor(returned, outsider,'read',c=>p.readConversationPage(c,first.conversationId,null)),e=>e.code==='not_found')
      await assert.rejects(p.withActor(returned, viewer,'write',c=>p.sendConversationMessage(c,first.conversationId,randomUUID(),{text:'Denied',askSophia:false},'viewer')),e=>e.code==='forbidden')
    } finally { await returned.end() }
    await owner.query("SELECT sophia.set_conversation_settings($1,'read_only','independent-local-rollback')", [projectId])
    assert.deepEqual(await start(), first)
    await assert.rejects(p.withActor(pool,editor,'write',c=>p.sendConversationMessage(c,first.conversationId,randomUUID(),{text:'New refused',askSophia:false},'editor')),e=>e.code==='conversations_closed')
    await p.withActor(pool,editor,'write',c=>p.withdrawConversationMessage(c,first.conversationId,first.messageId,randomUUID()))
    await assert.rejects(start(),e=>e.code==='request_erased')
    const withdrawn = await p.withActor(pool,viewer,'read',c=>p.readConversationPage(c,first.conversationId,null))
    assert.equal(withdrawn.messages[0].text,null)
    assert.equal(withdrawn.messages[0].name,null)
    assert.deepEqual(await counts(), initial)
    await owner.query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2',[projectId,editor])
    await assert.rejects(start(),e=>e.code==='forbidden')
  })
})

test('independent: membership revoked while withdrawal waits must be rechecked at the SQL writer boundary', async () => {
  await episode(async ({ db, owner, pool }) => {
    const admin = randomUUID(), editor = randomUUID()
    const { projectId } = await support.seedProject(db.ownerUrl,{admin,editors:[editor]})
    await owner.query("SELECT sophia.set_conversation_settings($1,'enabled','independent-local-only')",[projectId])
    const first = await p.withActor(pool,editor,'write',c=>p.startConversation(c,projectId,randomUUID(),{title:'Revocation race',text:'Synthetic body to preserve',askSophia:false},'editor'))
    const writer = await pool.connect()
    let transaction = false
    try {
      await writer.query('BEGIN')
      transaction = true
      await writer.query("SELECT set_config('sophia.actor_id',$1,true)",[editor])
      const pid = (await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      await owner.query('BEGIN')
      await owner.query('SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE',[projectId])
      await owner.query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2',[projectId,editor])
      const pending = writer.query('SELECT sophia.withdraw_conversation_message($1,$2,$3) AS receipt',[first.conversationId,first.messageId,randomUUID()]).then(r=>({ok:true,result:r.rows[0]}),e=>({ok:false,code:e.code,message:e.message}))
      // Assert an actual lock wait, bounded by a deadline; do not infer the race from a sleep.
      const deadline = Date.now()+3000
      let waiting = false
      while(Date.now()<deadline) {
        await owner.query('SELECT pg_stat_clear_snapshot()')
        const row = (await owner.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0]
        if(row?.wait_event_type==='Lock') { waiting=true; break }
        await new Promise(resolve=>setTimeout(resolve,10))
      }
      assert.equal(waiting,true,'the withdrawal must cross the controlled project lock')
      await owner.query('COMMIT')
      const result = await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve({timeout:true}),3000))])
      assert.equal(result.timeout,undefined,'withdrawal must settle within the bounded probe')
      await writer.query(result.ok ? 'COMMIT' : 'ROLLBACK')
      transaction = false
      const body = (await owner.query('SELECT body FROM sophia.conversation_messages WHERE id=$1',[first.messageId])).rows[0].body
      assert.deepEqual({accepted:result.ok,body},{accepted:false,body:'Synthetic body to preserve'},'a revoked member cannot cross the SQL withdrawal boundary after waiting')
    } finally {
      if(transaction)await writer.query('ROLLBACK')
      await owner.query('ROLLBACK')
      writer.release()
    }
  })
})

test('independent HTTP: RLS readback rolls back a withdrawal revoked while waiting', async () => {
  await episode(async ({ db, owner, pool }) => {
    const { buildApp } = await import(pathToFileURL(resolve(root,'apps/api/src/app.ts')))
    const { createActorVerifier } = await import(pathToFileURL(resolve(root,'apps/api/src/auth.ts')))
    const apiRequire = createRequire(resolve(root,'apps/api/package.json'))
    const { SignJWT } = await import(pathToFileURL(apiRequire.resolve('jose')))
    const secret='independent-synthetic-secret-more-than-32-bytes'
    const issuer='https://independent.synthetic.test/auth/v1'
    const admin=randomUUID(), editor=randomUUID()
    const { projectId }=await support.seedProject(db.ownerUrl,{admin,editors:[editor]})
    await owner.query("SELECT sophia.set_conversation_settings($1,'enabled','independent-local-only')",[projectId])
    const first=await p.withActor(pool,editor,'write',c=>p.startConversation(c,projectId,randomUUID(),{title:'HTTP revocation race',text:'HTTP synthetic body preserved',askSophia:false},'editor'))
    const app=buildApp({pool,verifyActor:createActorVerifier({issuer,audience:'authenticated',secret}),conversations:true})
    await app.listen({host:'127.0.0.1',port:0})
    try {
      const token=await new SignJWT({role:'authenticated',email:'synthetic@example.test'}).setProtectedHeader({alg:'HS256'}).setSubject(editor).setIssuer(issuer).setAudience('authenticated').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(secret))
      await owner.query('BEGIN')
      await owner.query('SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE',[projectId])
      await owner.query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2',[projectId,editor])
      const pending=fetch(`http://127.0.0.1:${app.server.address().port}/api/v1/conversations/${first.conversationId}/messages/${first.messageId}/withdrawal`,{method:'POST',signal:AbortSignal.timeout(6000),headers:{connection:'close',authorization:`Bearer ${token}`,'idempotency-key':randomUUID()}}).then(async res=>({status:res.status,body:await res.json()}))
      const deadline=Date.now()+3000
      let waiting=false
      while(Date.now()<deadline) {
        await owner.query('SELECT pg_stat_clear_snapshot()')
        const rows=(await owner.query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND query LIKE 'SELECT sophia.withdraw_conversation_message%' AND wait_event_type='Lock'")).rows
        if(rows.length>0){waiting=true;break}
        await new Promise(resolve=>setTimeout(resolve,10))
      }
      assert.equal(waiting,true,'HTTP call must reach the controlled SQL project lock')
      await owner.query('COMMIT')
      const result=await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve({timeout:true}),3000))])
      assert.equal(result.timeout,undefined)
      assert.equal(result.status,422)
      assert.equal(result.body.code,'not_found')
      const stored=(await owner.query('SELECT body FROM sophia.conversation_messages WHERE id=$1',[first.messageId])).rows[0]
      assert.equal(stored.body,'HTTP synthetic body preserved','failed RLS readback rolls the same transaction back')
    } finally {await owner.query('ROLLBACK');await app.close()}
  })
})

test('independent: the actual SQL boundary suite runs on the migrated disposable database', async () => {
  await episode(async ({owner}) => {
    const directory=resolve(root,'db/tests')
    const files=readdirSync(directory).filter(name=>name.endsWith('.sql')).sort()
    assert.ok(files.includes('0048_conversations.sql'))
    for(const file of files)await owner.query(readFileSync(resolve(directory,file),'utf8'))
    console.log(`SQL boundary files executed: ${files.join(', ')}`)
  })
})
