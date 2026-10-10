import { randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import {createServer,request} from 'node:http'
import {unlinkSync} from 'node:fs'
const root=process.cwd(), journal=process.env.CON01_JOURNAL
const support=await import(pathToFileURL(resolve(root,'packages/test-support/src/index.ts')))
const localRequire=createRequire(resolve(root,'apps/api/package.json'))
const {SignJWT}=await import(pathToFileURL(localRequire.resolve('jose')))
const pg=localRequire('pg')
const db=await support.createTestDatabase()
const admin=randomUUID(), editor=randomUUID(), viewer=randomUUID(), outsider=randomUUID(), writerB=randomUUID()
const {projectId}=await support.seedProject(db.ownerUrl,{title:'CON01 independent synthetic browser project',admin,editors:[editor,writerB],viewers:[viewer]})
const owner=new pg.Client({connectionString:db.ownerUrl});await owner.connect()
await owner.query("SELECT sophia.set_conversation_settings($1,'enabled','CON01-local-browser-only')",[projectId])
await owner.end()
const persistence=await import(pathToFileURL(resolve(root,'packages/persistence/src/index.ts')))
const seedPool=new pg.Pool({connectionString:db.apiUrl})
const seeded=await persistence.withActor(seedPool,admin,'write',c=>persistence.startConversation(c,projectId,randomUUID(),{title:'SYNTHETIC receipt order regression',text:'SYNTHETIC C first message',askSophia:false},'Synthetic C'))
await seedPool.end()
writeFileSync(resolve(journal,'seeded-conversation.json'),JSON.stringify({projectId,conversationId:seeded.conversationId,admin,editor,writerB,level:'Actual local persistence setup, synthetic actors; not a UI write or provider call'}),{mode:0o600})
const secret=randomBytes(32).toString('hex'), issuer='http://localhost/con01-independent-auth'
const token=async subject=>new SignJWT({role:'authenticated',email:`${subject.slice(0,8)}@synthetic.example.test`}).setProtectedHeader({alg:'HS256'}).setSubject(subject).setIssuer(issuer).setAudience('authenticated').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(secret))
const identities=await Promise.all([['Review admin','admin',admin],['Review editor','editor',editor],['Review viewer','viewer',viewer],['Review outsider','none',outsider]].map(async([name,role,id])=>({name,role,token:await token(id)})))
const base={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR??'/tmp',LANG:'en_US.UTF-8',NODE_ENV:'development'}
const apiPort=process.env.CON01_API_PORT,studioPort=process.env.CON01_STUDIO_PORT,backendPort=process.env.CON01_BACKEND_PORT
const apiEnv={...base,SOPHIA_API_DATABASE_URL:db.apiUrl,SUPABASE_JWT_ISSUER:issuer,SUPABASE_JWT_SECRET:secret,SOPHIA_CONVERSATIONS:'on',HOST:'127.0.0.1',PORT:backendPort}
const startApi=()=>spawn(process.execPath,['apps/api/src/server.ts'],{cwd:root,stdio:['ignore','inherit','inherit'],env:apiEnv})
let api=startApi()
const streams=new Set()
const proxy=createServer((incoming,outgoing)=>{
 const url=incoming.url??''
 if(incoming.method==='GET'&&/\/mission(?:\?|$)/.test(url)&&existsSync(resolve(journal,'block-mission-reads'))){outgoing.writeHead(503,{'content-type':'application/json'});outgoing.end(JSON.stringify({code:'unavailable',message:'Synthetic local mission read fault'}));return}
 if(incoming.method==='POST'&&/\/erasure$/.test(url)&&existsSync(resolve(journal,'reject-next-erasure-before-upstream'))){unlinkSync(resolve(journal,'reject-next-erasure-before-upstream'));writeFileSync(resolve(journal,'unreached-erasure-receipt.json'),JSON.stringify({at:new Date().toISOString(),path:url,idempotencyKey:incoming.headers['idempotency-key'],actualApiStatus:null,effect:'one local synthetic503 before forwarding to API'}));outgoing.writeHead(503,{'content-type':'application/json'});outgoing.end(JSON.stringify({code:'outcome_unknown',message:'Synthetic local erasure transport failure',requestId:randomUUID(),retry:'same_admission_key'}));return}
 if(incoming.method==='GET'&&/\/conversations(?:\?|$)/.test(url)&&existsSync(resolve(journal,'hold-list-reads'))){
  const file=resolve(journal,'held-list-receipts.json');const rows=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):[];rows.push({at:new Date().toISOString(),path:url,status:'held',upstream:false,delayMs:20000});writeFileSync(file,JSON.stringify(rows,null,2),{mode:0o600});
  const timer=setTimeout(()=>{if(!outgoing.destroyed){outgoing.writeHead(503,{'content-type':'application/json'});outgoing.end(JSON.stringify({code:'unavailable',message:'Synthetic delayed local list outage'}))}},20000);outgoing.once('close',()=>clearTimeout(timer));return
 }
 if(incoming.method==='GET'&&((existsSync(resolve(journal,'block-message-reads'))&&/\/conversations\/[^/]+\/messages(?:\?|$)/.test(url))||(existsSync(resolve(journal,'block-list-reads'))&&/\/conversations(?:\?|$)/.test(url)))){const f=resolve(journal,'conversation-read-receipts.json');const rows=existsSync(f)?JSON.parse(readFileSync(f,'utf8')):[];rows.push({at:new Date().toISOString(),path:url,status:503,upstream:false});writeFileSync(f,JSON.stringify(rows,null,2),{mode:0o600});outgoing.writeHead(503,{'content-type':'application/json'});outgoing.end(JSON.stringify({code:'unavailable',message:'Synthetic local independently controlled read outage'}));return}
 const stream=incoming.method==='GET'&&/\/events(?:\?|$)/.test(url)
 if(stream&&existsSync(resolve(journal,'block-feed'))){outgoing.writeHead(503,{'content-type':'application/json'});outgoing.end('{}');return}
 if(stream){streams.add(outgoing);outgoing.once('close',()=>streams.delete(outgoing))}
 if(incoming.method==='GET'&&existsSync(resolve(journal,'block-api-reads'))&&url.startsWith('/api/v1/')){
  outgoing.writeHead(503,{'content-type':'application/json'});outgoing.end(JSON.stringify({code:'unavailable',message:'Synthetic local API read outage'}));return
 }
 if(incoming.method==='GET'&&existsSync(resolve(journal,'block-conversation-reads'))&&(/\/conversations(?:\?|$)/.test(url)||/\/conversations\/[^/]+\/messages(?:\?|$)/.test(url))){
  outgoing.writeHead(503,{'content-type':'application/json'});outgoing.end(JSON.stringify({code:'unavailable',message:'Synthetic local conversation read fault'}));return
 }
 if(existsSync(resolve(journal,'block-membership'))&&incoming.method==='GET'&&/\/membership(?:\?|$)/.test(incoming.url??'')){
  const file=resolve(journal,'blocked-membership-count.json');const count=existsSync(file)?JSON.parse(readFileSync(file,'utf8')).count:0;
  writeFileSync(file,JSON.stringify({count:count+1,at:new Date().toISOString()}));outgoing.writeHead(503,{'content-type':'application/json'});outgoing.end(JSON.stringify({code:'unavailable',message:'Synthetic local membership read fault'}));return
 }
 const kind=incoming.method==='POST'&&/\/mission\/proposals$/.test(url)?'proposal':incoming.method==='POST'&&/\/withdrawal$/.test(url)?'withdrawal':incoming.method==='POST'&&/\/erasure$/.test(url)?'erasure':incoming.method==='POST'&&/\/mission\/proposals\/[^/]+\/decision$/.test(url)?'decision':incoming.method==='POST'&&/^\/api\/v1\/conversations\/[^/]+\/messages$/.test(url)?'send':null
 const drop=kind&&existsSync(resolve(journal,'drop-next-'+kind))
 if(drop)unlinkSync(resolve(journal,'drop-next-'+kind))
 const delayMarker=kind==='send'?'delay-next-send':kind==='proposal'?'delay-next-proposal':incoming.method==='POST'&&/\/withdrawal$/.test(url)?'delay-next-withdraw':incoming.method==='POST'&&/\/erasure$/.test(url)?'delay-next-erasure':incoming.method==='GET'&&/\/conversations(?:\?|$)/.test(url)?'delay-list-reads':null
 const delayMs=delayMarker==='delay-list-reads'?20000:kind==='send'?60000:kind==='proposal'?12000:3000
 const delay=delayMarker&&existsSync(resolve(journal,delayMarker))
 if(delay&&delayMarker!=='delay-list-reads')unlinkSync(resolve(journal,delayMarker))
 const upstream=request({host:'127.0.0.1',port:backendPort,path:incoming.url,method:incoming.method,headers:incoming.headers},response=>{
  if(incoming.method==='GET'&&(/\/conversations(?:\?|$)/.test(url)||/\/conversations\/[^/]+\/messages(?:\?|$)/.test(url))){const f=resolve(journal,'conversation-read-receipts.json');const rows=existsSync(f)?JSON.parse(readFileSync(f,'utf8')):[];rows.push({at:new Date().toISOString(),path:url,status:response.statusCode});writeFileSync(f,JSON.stringify(rows,null,2),{mode:0o600})}
  if(kind){const file=resolve(journal,'write-receipts.json');const rows=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):[];rows.push({at:new Date().toISOString(),kind,path:url,idempotencyKey:incoming.headers['idempotency-key'],actualApiStatus:response.statusCode,bodyWithheld:!!drop});writeFileSync(file,JSON.stringify(rows,null,2),{mode:0o600})}
  if(kind||delay){outgoing.once('finish',()=>{const file=resolve(journal,'relay-finish-receipts.json');const rows=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):[];rows.push({at:new Date().toISOString(),kind,path:url,idempotencyKey:incoming.headers['idempotency-key'],actualApiStatus:response.statusCode,delayed:!!delay,delayMs:delay?delayMs:0,substituted:!!drop,evidence:'Node outgoing finish: bytes handed to transport, not browser consumption'});writeFileSync(file,JSON.stringify(rows,null,2),{mode:0o600})})}
  if(!drop&&!delay){outgoing.writeHead(response.statusCode,response.headers);response.pipe(outgoing);return}
  const chunks=[];response.on('data',x=>chunks.push(x));response.on('end',()=>{
   const file=resolve(journal,'buffered-response-receipts.json');const rows=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):[];rows.push({at:new Date().toISOString(),kind,path:url,actualApiStatus:response.statusCode,delayed:!!delay,delayMs:delay?delayMs:0,substituted:!!drop,evidence:'Complete upstream body buffered before delay; content omitted'});writeFileSync(file,JSON.stringify(rows,null,2),{mode:0o600})
   const relay=()=>{
    if(drop){
     writeFileSync(resolve(journal,'lost-'+kind+'-receipt.json'),JSON.stringify({at:new Date().toISOString(),path:incoming.url,idempotencyKey:incoming.headers['idempotency-key'],actualApiStatus:response.statusCode,delayMs:delay?delayMs:0,effect:'API response fully received; success body withheld and replaced with incomplete JSON for this one local '+kind}),{mode:0o600})
     outgoing.writeHead(response.statusCode,{'content-type':'application/json'});outgoing.end('{')
    }else{outgoing.writeHead(response.statusCode,response.headers);outgoing.end(Buffer.concat(chunks))}
   }
   if(delay)setTimeout(relay,delayMs);else relay()
  })
 }); upstream.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end()});incoming.pipe(upstream)
})
await new Promise((yes,no)=>{proxy.once('error',no);proxy.listen(Number(apiPort),'127.0.0.1',yes)})

const vitePath=resolve(root,'apps/studio/node_modules/vite/bin/vite.js')
const studio=spawn(process.execPath,[vitePath,'--host','127.0.0.1','--port',studioPort,'--strictPort'],{cwd:resolve(root,'apps/studio'),stdio:['ignore','inherit','inherit'],env:{...base,SOPHIA_API_ORIGIN:`http://127.0.0.1:${apiPort}`,VITE_SOPHIA_CONVERSATIONS:'1',VITE_DEV_PROJECT_ID:projectId,VITE_DEV_IDENTITIES:JSON.stringify(identities)}})
writeFileSync(resolve(journal,'browser-stack-private.json'),JSON.stringify({projectId,admin,editor,viewer,outsider,ownerUrl:db.ownerUrl,apiPort,studioPort,pid:process.pid,apiPid:api.pid,studioPid:studio.pid}),{mode:0o600})
let stop=false
process.on('SIGTERM',()=>{stop=true});process.on('SIGINT',()=>{stop=true})
const deadline=Date.now()+8*60*1000
try {
  while(!stop&&Date.now()<deadline&&!existsSync(resolve(journal,'browser-stop'))) {
    if(existsSync(resolve(journal,'block-feed')))for(const stream of streams)stream.destroy()
    if(existsSync(resolve(journal,'restart-api'))){
      unlinkSync(resolve(journal,'restart-api'));const old=api;old.kill('SIGTERM')
      await new Promise(yes=>{old.once('exit',yes);setTimeout(()=>old.kill('SIGKILL'),5000).unref()});api=startApi()
      writeFileSync(resolve(journal,'api-restart-receipt.json'),JSON.stringify({at:new Date().toISOString(),previousPid:old.pid,newPid:api.pid,sameDatabase:true,sameIdentityConfiguration:true}),{mode:0o600})
    }
    if(api.exitCode!==null||studio.exitCode!==null)throw new Error('Owned local child exited before completion')
    await new Promise(resolve=>setTimeout(resolve,250))
  }
} finally {
  proxy.closeAllConnections();await new Promise(yes=>proxy.close(yes))
  api.kill('SIGTERM');studio.kill('SIGTERM')
  await Promise.all([api,studio].map(child=>child.exitCode!==null?Promise.resolve():new Promise(resolve=>{child.once('exit',resolve);setTimeout(()=>{child.kill('SIGKILL');resolve()},5000).unref()})))
  await db.drop()
  const receipt=JSON.parse(readFileSync(resolve(journal,'browser-stack-private.json'),'utf8'))
  writeFileSync(resolve(journal,'browser-stack-cleanup.json'),JSON.stringify({projectId:receipt.projectId,apiStopped:api.exitCode!==null||api.signalCode!==null,studioStopped:studio.exitCode!==null||studio.signalCode!==null,databaseDropped:true}),{mode:0o600})
}
