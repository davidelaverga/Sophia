import {randomUUID} from 'node:crypto';import {createRequire} from 'node:module';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {readFileSync,writeFileSync} from 'node:fs';import {execFileSync} from 'node:child_process'
const root=process.cwd(),j=process.env.CON01_JOURNAL,info=JSON.parse(readFileSync(resolve(j,'browser-stack-private.json'),'utf8'))
const require=createRequire(resolve(root,'apps/api/package.json'));const {Client}=require('pg');const p=await import(pathToFileURL(resolve(root,'packages/persistence/src/index.ts')))
const owner=new Client({connectionString:info.ownerUrl});await owner.connect();const role=(await owner.query("SELECT rolname FROM pg_roles WHERE rolname LIKE 'sophia_api%' AND rolcanlogin")).rows[0].rolname
const target=(await owner.query("SELECT id FROM sophia.conversations WHERE project_id=$1 AND title='Cap erasure target next'",[info.projectId])).rows[0].id
const u=new URL(info.ownerUrl);u.username=role;u.password='';const pool=p.createPool(u.toString())
try{
 const action=process.env.CON01_PROBE_ACTION??'seed'
 if(action==='seed')for(let i=0;i<200;i++)await p.withActor(pool,info.admin,'write',c=>p.startConversation(c,info.projectId,randomUUID(),{title:`Synthetic cap arrival ${i}`,text:`Synthetic cap arrival ${i}`,askSophia:false},'Synthetic admin'))
 if(action==='bump')await p.withActor(pool,info.admin,'write',c=>p.sendConversationMessage(c,target,randomUUID(),{text:'Synthetic legitimate new activity brings target back',askSophia:false},'Synthetic admin'))
 const list=await p.withActor(pool,info.admin,'read',c=>p.readConversationList(c,info.projectId))
 const actual=(await owner.query('SELECT id,state,title FROM sophia.conversations WHERE id=$1',[target])).rows[0]
 const result={candidate:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),at:new Date().toISOString(),action,level:'L1 actual non-owner persistence, no provider/runtime',target,listCount:list.conversations.length,more:list.more,targetListed:list.conversations.some(x=>x.id===target),actual}
 writeFileSync(resolve(j,'capped-list-'+action+'-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
}finally{await pool.end();await owner.end()}
