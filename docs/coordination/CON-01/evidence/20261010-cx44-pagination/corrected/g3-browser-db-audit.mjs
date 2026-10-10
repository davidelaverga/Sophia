import {readFileSync,writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
const journal=process.env.CON01_JOURNAL
const receipt=JSON.parse(readFileSync(resolve(journal,'browser-stack-receipt.json'),'utf8'))
const info=JSON.parse(readFileSync(resolve(journal,'browser-stack-private.json'),'utf8'))
const require=createRequire(resolve(process.cwd(),'apps/api/package.json'))
const {Client}=require('pg')
const client=new Client({connectionString:info.ownerUrl}); await client.connect()
try {
 const messages=(await client.query('SELECT c.title,m.id,m.conversation_id,m.actor_id,m.seq,m.body,m.withdrawn_at FROM sophia.conversation_messages m JOIN sophia.conversations c ON c.id=m.conversation_id WHERE c.project_id=$1 ORDER BY c.created_at,m.seq',[info.projectId])).rows
 const counts={}
 for(const name of ['goals','jobs','work_attempts','execution_bindings','commands','outbox','runtime_commands','usage_records','conversation_replies']) {
  counts[name]=Number((await client.query(`SELECT count(*) AS n FROM sophia.${name}`)).rows[0].n)
 }
 const replies=(await client.query('SELECT id,conversation_id,message_id,asked_by,cutoff_seq,state,reason FROM sophia.conversation_replies WHERE project_id=$1',[info.projectId])).rows
 const decisions=(await client.query('SELECT d.id,d.kind,d.state,d.revision,t.body FROM sophia.decisions d LEFT JOIN sophia.source_texts t ON t.project_id=d.project_id AND t.source_id=d.body_source_id WHERE d.project_id=$1',[info.projectId])).rows
 const requests=(await client.query('SELECT actor_id,idempotency_key,operation,semantic_request,message_id FROM sophia.conversation_requests WHERE project_id=$1 ORDER BY created_at',[info.projectId])).rows
 const result={candidate:receipt.candidate,tree:receipt.tree,observedAt:new Date().toISOString(),level:'L1 actual local browser/API/PostgreSQL only',projectId:info.projectId,messages,replies,decisions,requests,counts}
 writeFileSync(resolve(journal,'browser-db-audit.json'),JSON.stringify(result,null,2),{mode:0o600})
 console.log(JSON.stringify(result,null,2))
} finally {await client.end()}
