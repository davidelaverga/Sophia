import {randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {readFileSync,writeFileSync} from 'node:fs'
const root=process.cwd(), journal=process.env.CON01_JOURNAL
const info=JSON.parse(readFileSync(resolve(journal,'browser-stack-private.json'),'utf8'))
const require=createRequire(resolve(root,'apps/api/package.json'))
const pg=require('pg')
const support=await import(pathToFileURL(resolve(root,'packages/test-support/src/index.ts')))
const persistence=await import(pathToFileURL(resolve(root,'packages/persistence/src/index.ts')))
const validate=await import(pathToFileURL(require.resolve('@sophia/contracts/validate')))
const editors=Array.from({length:200},()=>randomUUID())
const {projectId}=await support.seedProject(info.ownerUrl,{title:'Synthetic contributor bound 447',admin:info.admin,editors})
const owner=new pg.Client({connectionString:info.ownerUrl}); await owner.connect()
const roles=await owner.query("SELECT rolname FROM pg_roles WHERE rolname LIKE 'sophia_api%' AND rolcanlogin")
await owner.query("SELECT sophia.set_conversation_settings($1,'enabled','CON01-local-contract-bound-only')",[projectId])
// Connect to the exact test database under its test-only non-owner API role.
const u=new URL(info.ownerUrl);u.username=roles.rows[0].rolname;u.password=''
const pool=persistence.createPool(u.toString())
try {
 const first=await persistence.withActor(pool,info.admin,'write',c=>persistence.startConversation(c,projectId,randomUUID(),{title:'201 actual contributors',text:'Synthetic admin contribution',askSophia:false},'Admin synthetic'))
 for(let i=0;i<199;i++) await persistence.withActor(pool,editors[i],'write',c=>persistence.sendConversationMessage(c,first.conversationId,randomUUID(),{text:`Synthetic contribution ${i+1}`,askSophia:false},`Member ${i+1}`))
 const read=()=>persistence.withActor(pool,info.admin,'read',c=>persistence.readConversationList(c,projectId))
 const before=await read();validate.parseConversationList(before)
 await persistence.withActor(pool,editors[199],'write',c=>persistence.sendConversationMessage(c,first.conversationId,randomUUID(),{text:'Synthetic contribution 201',askSophia:false},'Member 201'))
 const after=await read();let failure=null;try{validate.parseConversationList(after)}catch(e){failure=e.message}
 const result={candidate:'447e7aec0ef923e58e386155089cf64d63422f2c',at:new Date().toISOString(),projectId,conversationId:first.conversationId,controlContributors:before.conversations[0].contributors.length,controlValidated:true,afterContributors:after.conversations[0].contributors.length,afterValidationFailure:failure}
 writeFileSync(resolve(journal,'contributor-bound-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
}finally{await pool.end();await owner.end()}
