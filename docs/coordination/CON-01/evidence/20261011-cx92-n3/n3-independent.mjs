import assert from 'node:assert/strict'
import {createRequire}from'node:module'
import{resolve}from'node:path'
import{pathToFileURL}from'node:url'
import{randomUUID}from'node:crypto'
import{readFileSync,writeFileSync}from'node:fs'
const root=process.cwd(),req=createRequire(resolve(root,'apps/api/package.json')),{Client,Pool}=req('pg'),load=p=>import(pathToFileURL(resolve(root,p)))
const support=await load('packages/test-support/src/index.ts'),h=await load('packages/persistence/src/index.ts')
const candidate=readFileSync(resolve(root,'db/candidates/con01-s1-reply-states.sql'),'utf8')
const db=await support.createTestDatabase(),pool=new Pool({connectionString:db.apiUrl,connectionTimeoutMillis:7000,query_timeout:7000}),a=randomUUID(),e=randomUUID()
const owner=async(sql,args=[])=>{const c=new Client({connectionString:db.ownerUrl,connectionTimeoutMillis:7000,query_timeout:7000});await c.connect();try{return(await c.query(sql,args)).rows}finally{await c.end()}}
const catalog=()=>owner("SELECT pg_get_functiondef('sophia.conversation_withdrawn_from(uuid,uuid,bigint,text)'::regprocedure) AS function,pg_get_indexdef('sophia.conversation_replies_open'::regclass) AS index,(SELECT jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='sophia.conversation_replies'::regclass) AS constraints")
const result={scope:'Independent N3 candidate actual local PG/S2 composition; synthetic subjects; no native/provider/hosted',cases:[]}
try{
 const {projectId}=await support.seedProject(db.ownerUrl,{admin:a,editors:[e]})
 await owner("SELECT sophia.set_conversation_settings($1,'enabled','synthetic N3 independent')",[projectId])
 const ask=()=>h.withActor(pool,e,'write',c=>h.startConversation(c,projectId,randomUUID(),{title:'Synthetic N3 independent',text:'Synthetic withdrawal canary',askSophia:true},'Synthetic editor'))
 const withdraw=s=>h.withActor(pool,e,'write',c=>h.withdrawConversationMessage(c,s.conversationId,s.messageId,randomUUID()))
 const legacy=await ask();assert.ok(legacy.replyId)
 await owner("UPDATE sophia.conversation_replies SET state='outcome_unknown',reason='runtime_failed',settled_at=NULL WHERE id=$1",[legacy.replyId])
 const oldCatalog=await catalog(),oldRows=await owner('SELECT * FROM sophia.conversation_replies WHERE project_id=$1 ORDER BY id',[projectId])
 await assert.rejects(owner(candidate),x=>x.code==='55000')
 assert.deepEqual(await catalog(),oldCatalog);assert.deepEqual(await owner('SELECT * FROM sophia.conversation_replies WHERE project_id=$1 ORDER BY id',[projectId]),oldRows)
 result.cases.push({name:'Legacy uncertain row refuses installation before changes',observed:'55000; exact function/index/constraints and all reply fields unchanged; no timestamp invented',verdict:'PASS_scoped'})
 await withdraw(legacy)
 const before=await owner('SELECT * FROM sophia.conversation_replies WHERE project_id=$1 ORDER BY id',[projectId]);await owner(candidate)
 assert.deepEqual(await owner('SELECT * FROM sophia.conversation_replies WHERE project_id=$1 ORDER BY id',[projectId]),before)
 const idx=(await owner("SELECT indisunique,pg_get_indexdef(indexrelid) AS definition FROM pg_index WHERE indexrelid='sophia.conversation_replies_open'::regclass"))[0]
 assert.equal(idx.indisunique,false);assert.match(idx.definition,/pending/);assert.match(idx.definition,/running/);assert.doesNotMatch(idx.definition,/outcome_unknown/)
 result.cases.push({name:'Successful additive candidate preserves rows and non-unique index',observed:idx,verdict:'PASS_scoped'})
 await owner(readFileSync(resolve(root,'db/candidates/con01-s2-conversation-reply-ledger.sql'),'utf8'))
 const s=await ask();assert.ok(s.replyId);await owner("UPDATE sophia.conversation_replies SET state='running',reason=NULL,settled_at=NULL WHERE id=$1",[s.replyId])
 const grant={unit:'calls_tokens',routeId:'synthetic-route',credentialRef:'synthetic-credential-ref',ownerResourceRef:'synthetic-owner-ref',approvalRef:'synthetic-n3-independent',expiresAt:new Date(Date.now()+600000).toISOString(),maxCallsPerReply:2,totalCallCap:2,replyTokenCap:200,totalTokenCap:400,subjects:[e]}
 await owner('SELECT sophia.conversation_new_lineage($1,$2)',[projectId,JSON.stringify(grant)])
 const call={unit:'calls_tokens',routeId:grant.routeId,credentialRef:grant.credentialRef,ownerResourceRef:grant.ownerResourceRef,tokens:100,priceMicros:0}
 await owner('SELECT sophia.conversation_reserve($1,$2,1,$3)',[projectId,s.replyId,JSON.stringify(call)]);await owner('SELECT sophia.conversation_mark_uncertain($1,$2)',[projectId,s.replyId])
 await assert.rejects(owner("UPDATE sophia.conversation_replies SET state='outcome_unknown',settled_at=NULL WHERE id=$1",[s.replyId]),x=>x.code==='23514')
 await owner("UPDATE sophia.conversation_replies SET state='outcome_unknown',reason='runtime_failed',settled_at=clock_timestamp() WHERE id=$1",[s.replyId])
 const q=(await owner('SELECT * FROM sophia.conversation_replies WHERE id=$1',[s.replyId]))[0]
 const counters=await owner('SELECT * FROM sophia.conversation_grants WHERE project_id=$1',[projectId]),reservations=await owner('SELECT * FROM sophia.conversation_reservations WHERE project_id=$1',[projectId])
 assert.equal(counters[0].uncertain_calls,'1');assert.equal(counters[0].uncertain_tokens,'100')
 await withdraw(s)
 assert.deepEqual((await owner('SELECT * FROM sophia.conversation_replies WHERE id=$1',[s.replyId]))[0],q)
 assert.deepEqual(await owner('SELECT * FROM sophia.conversation_grants WHERE project_id=$1',[projectId]),counters);assert.deepEqual(await owner('SELECT * FROM sophia.conversation_reservations WHERE project_id=$1',[projectId]),reservations)
 const body=(await owner('SELECT body,author_name,withdrawn_at FROM sophia.conversation_messages WHERE id=$1',[s.messageId]))[0];assert.equal(body.body,null);assert.equal(body.author_name,null);assert.ok(body.withdrawn_at)
 result.cases.push({name:'Terminal uncertain withdrawal preserves request and cumulative S2 allowance',observed:'exact reply/timestamp/reason/ids unchanged; human body/name scrubbed; uncertain1call/100tokens and reservation exact; no fresh call',verdict:'PASS_scoped'})
 for(const[role,url]of[['API',db.apiUrl],['worker',db.workerUrl]]){const c=new Client({connectionString:url,connectionTimeoutMillis:7000,query_timeout:7000});await c.connect();try{await assert.rejects(c.query('SELECT sophia.conversation_withdrawn_from($1,$2,1,$3)',[projectId,s.conversationId,'source_withdrawn']),x=>x.code==='42501')}finally{await c.end()}}
 result.cases.push({name:'Actual API and worker invocation remains denied',observed:'42501 for both; no added helper grant',verdict:'PASS_scoped'})
 const c=new Client({connectionString:db.ownerUrl,connectionTimeoutMillis:7000,query_timeout:7000});await c.connect();try{await c.query('BEGIN');await c.query("ALTER TABLE sophia.conversation_replies ADD CONSTRAINT synthetic_old_terminal CHECK((state IN ('answered','failed','cancelled','blocked'))=(settled_at IS NOT NULL))").then(()=>assert.fail('Old CHECK unexpectedly accepted governed terminal uncertain row'),x=>assert.equal(x.code,'23514'));await c.query('ROLLBACK')}finally{await c.end()}
 assert.deepEqual((await owner('SELECT * FROM sophia.conversation_replies WHERE id=$1',[s.replyId]))[0],q)
 result.cases.push({name:'Old-schema rollback incompatibility remains explicit',observed:'old CHECK installation rejected23514; rollback of attempted DDL retains governed terminal uncertain row and new schema. No old-code-only live rollback qualification.',verdict:'PASS_preservation_limit'})
 const counts={};for(const t of['work_attempts','execution_bindings','commands','outbox','runtime_commands','usage_records']){counts[t]=(await owner('SELECT count(*)::int AS n FROM sophia.'+t+' WHERE project_id=$1',[projectId]))[0].n;assert.equal(counts[t],0)}
 result.counts=counts;result.providerCalls=0;result.spend=0;result.finishedAt=new Date().toISOString()
}finally{await pool.end();await db.drop();result.databaseDropped=true;writeFileSync(resolve(process.env.CON01_JOURNAL,'n3-independent-evidence.json'),JSON.stringify(result,null,2)+'\n')}
console.log(JSON.stringify(result))
