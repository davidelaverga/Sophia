import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
const root=process.env.CON01_CANDIDATE_ROOT,j=process.env.CON01_JOURNAL;
const req=createRequire(resolve(root,'apps/api/package.json')),pg=req('pg');
const p=JSON.parse(readFileSync(resolve(j,'browser-stack-private.json'),'utf8')),s=JSON.parse(readFileSync(resolve(j,'seeded-conversation.json'),'utf8'));
const h=await import(pathToFileURL(resolve(root,'packages/persistence/src/index.ts')));
const pool=new pg.Pool({connectionString:p.ownerUrl}),actions=[];
try{for(const [actor,name,text] of [[s.editor,'Synthetic A','SYNTHETIC A surviving'],[s.writerB,'Synthetic B','SYNTHETIC B surviving'],[s.writerB,'Synthetic B Withdrawn','SYNTHETIC B withdraw'],[s.editor,'Synthetic A Withdrawn','SYNTHETIC A withdraw']]){const result=await h.withActor(pool,actor,'write',c=>h.sendConversationMessage(c,s.conversationId,randomUUID(),{text,askSophia:false},name));actions.push({at:new Date().toISOString(),kind:'send',result})}
for(const seq of [4,5]){const q=await pool.query('SELECT id FROM sophia.conversation_messages WHERE conversation_id=$1 AND seq=$2',[s.conversationId,seq]);const result=await h.withActor(pool,p.admin,'write',c=>h.withdrawConversationMessage(c,s.conversationId,q.rows[0].id,randomUUID()));actions.push({at:new Date().toISOString(),kind:'withdraw',seq,result})}
const rows=await pool.query('SELECT seq,actor_id,author_name,body,withdrawn_at FROM sophia.conversation_messages WHERE conversation_id=$1 ORDER BY seq',[s.conversationId]);const out={at:new Date().toISOString(),scope:'External supported persistence under authorized synthetic actors, no UI or API auth write claim',actions,rows:rows.rows};writeFileSync(resolve(j,'external-populate-withdraw-result.json'),JSON.stringify(out,null,2),{mode:0o600});console.log(JSON.stringify({at:out.at,actions:actions.length,rows:out.rows.length}));}finally{await pool.end()}
