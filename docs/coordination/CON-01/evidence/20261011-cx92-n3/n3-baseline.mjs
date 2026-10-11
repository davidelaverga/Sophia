import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
const root=process.cwd(),req=createRequire(resolve(root,'apps/api/package.json')),{Client,Pool}=req('pg')
const load=p=>import(pathToFileURL(resolve(root,p)))
const support=await load('packages/test-support/src/index.ts'),h=await load('packages/persistence/src/index.ts')
const a=randomUUID(),e=randomUUID(),db=await support.createTestDatabase(),pool=new Pool({connectionString:db.apiUrl,connectionTimeoutMillis:7000,query_timeout:7000})
const owner=async(sql,args=[])=>{const c=new Client({connectionString:db.ownerUrl,connectionTimeoutMillis:7000,query_timeout:7000});await c.connect();try{return(await c.query(sql,args)).rows}finally{await c.end()}}
const result={scope:'Independent actual local PG baseline on unmodified d527; not candidate qualification',cases:[]}
try{
 const {projectId}=await support.seedProject(db.ownerUrl,{admin:a,editors:[e]})
 await owner("SELECT sophia.set_conversation_settings($1,'enabled','synthetic N3 reviewer baseline')",[projectId])
 const s=await h.withActor(pool,e,'write',c=>h.startConversation(c,projectId,randomUUID(),{title:'Synthetic N3 baseline',text:'Synthetic withdrawal canary',askSophia:true},'Synthetic editor'))
 assert.ok(s.replyId)
 await assert.rejects(owner("UPDATE sophia.conversation_replies SET state='outcome_unknown',settled_at=clock_timestamp() WHERE id=$1",[s.replyId]),x=>x.code==='23514')
 result.cases.push({name:'Desired terminal timestamp currently rejected',observed:'23514 CHECK violation for outcome_unknown with non-null settled_at',baseline:'gap reproduced; not pass for desired G2 semantics'})
 await owner("UPDATE sophia.conversation_replies SET state='outcome_unknown',reason='runtime_failed',settled_at=NULL WHERE id=$1",[s.replyId])
 const before=(await owner('SELECT id,asked_by,message_id,cutoff_seq,state,reason,settled_at FROM sophia.conversation_replies WHERE id=$1',[s.replyId]))[0]
 const idx=(await owner("SELECT i.indisunique,pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i WHERE i.indexrelid='sophia.conversation_replies_open'::regclass"))[0]
 assert.equal(idx.indisunique,false);assert.match(idx.definition,/outcome_unknown/)
 result.cases.push({name:'Open index',observed:idx,baseline:'non-unique must remain; predicate still includes outcome_unknown'})
 await h.withActor(pool,e,'write',c=>h.withdrawConversationMessage(c,s.conversationId,s.messageId,randomUUID()))
 const after=(await owner('SELECT id,asked_by,message_id,cutoff_seq,state,reason,settled_at FROM sophia.conversation_replies WHERE id=$1',[s.replyId]))[0]
 assert.equal(after.state,'cancelled');assert.ok(after.settled_at);assert.equal(after.id,before.id)
 const body=(await owner('SELECT body,author_name,withdrawn_at FROM sophia.conversation_messages WHERE id=$1',[s.messageId]))[0]
 assert.equal(body.body,null);assert.equal(body.author_name,null);assert.ok(body.withdrawn_at)
 result.cases.push({name:'API-role withdrawal rewrites old uncertain state',observed:'outcome_unknown -> cancelled; original human body and author_name scrubbed',baseline:'desired terminal-state retention not yet implemented'})
 for(const [role,url]of [['API',db.apiUrl],['worker',db.workerUrl]]){const c=new Client({connectionString:url,connectionTimeoutMillis:7000,query_timeout:7000});await c.connect();try{await assert.rejects(c.query('SELECT sophia.conversation_withdrawn_from($1,$2,1,$3)',[projectId,s.conversationId,'source_withdrawn']),x=>x.code==='42501');result.cases.push({name:role+' direct privileged helper',observed:'42501 denied'})}finally{await c.end()}}
 const counts={}
 for(const t of ['work_attempts','execution_bindings','commands','outbox','runtime_commands','usage_records']){counts[t]=(await owner('SELECT count(*)::int AS n FROM sophia.'+t+' WHERE project_id=$1',[projectId]))[0].n;assert.equal(counts[t],0)}
 result.counts=counts;result.providerCalls=0;result.spend=0;result.finishedAt=new Date().toISOString()
}finally{await pool.end();await db.drop();result.databaseDropped=true;writeFileSync(resolve(process.env.CON01_JOURNAL,'baseline-evidence.json'),JSON.stringify(result,null,2)+'\n')}
console.log(JSON.stringify(result))
