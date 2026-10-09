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
const admin=randomUUID(), editor=randomUUID(), viewer=randomUUID(), outsider=randomUUID()
const {projectId}=await support.seedProject(db.ownerUrl,{title:'CON01 independent synthetic browser project',admin,editors:[editor],viewers:[viewer]})
const owner=new pg.Client({connectionString:db.ownerUrl});await owner.connect()
await owner.query("SELECT sophia.set_conversation_settings($1,'enabled','CON01-local-browser-only')",[projectId])
await owner.end()
const secret=randomBytes(32).toString('hex'), issuer='http://localhost/con01-independent-auth'
const token=async subject=>new SignJWT({role:'authenticated',email:`${subject.slice(0,8)}@synthetic.example.test`}).setProtectedHeader({alg:'HS256'}).setSubject(subject).setIssuer(issuer).setAudience('authenticated').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(secret))
const identities=await Promise.all([['Review admin','admin',admin],['Review editor','editor',editor],['Review viewer','viewer',viewer],['Review outsider','none',outsider]].map(async([name,role,id])=>({name,role,token:await token(id)})))
const base={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR??'/tmp',LANG:'en_US.UTF-8',NODE_ENV:'development'}
const apiPort=process.env.CON01_API_PORT,studioPort=process.env.CON01_STUDIO_PORT,backendPort=process.env.CON01_BACKEND_PORT
const apiEnv={...base,SOPHIA_API_DATABASE_URL:db.apiUrl,SUPABASE_JWT_ISSUER:issuer,SUPABASE_JWT_SECRET:secret,SOPHIA_CONVERSATIONS:'on',HOST:'127.0.0.1',PORT:backendPort}
const startApi=()=>spawn(process.execPath,['apps/api/src/server.ts'],{cwd:root,stdio:['ignore','inherit','inherit'],env:apiEnv})
let api=startApi()
const proxy=createServer((incoming,outgoing)=>{
 const url=incoming.url??''
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
 const drop=existsSync(resolve(journal,'drop-next-send'))&&incoming.method==='POST'&&/^\/api\/v1\/conversations\/[^/]+\/messages$/.test(incoming.url??'')
 if(drop)unlinkSync(resolve(journal,'drop-next-send'))
 const delayMarker=incoming.method==='POST'&&/\/withdrawal$/.test(url)?'delay-next-withdraw':incoming.method==='POST'&&/\/erasure$/.test(url)?'delay-next-erasure':null
 const delay=delayMarker&&existsSync(resolve(journal,delayMarker))
 if(delay)unlinkSync(resolve(journal,delayMarker))
 const upstream=request({host:'127.0.0.1',port:backendPort,path:incoming.url,method:incoming.method,headers:incoming.headers},response=>{
  if(delay){const chunks=[];response.on('data',x=>chunks.push(x));response.on('end',()=>setTimeout(()=>{outgoing.writeHead(response.statusCode,response.headers);outgoing.end(Buffer.concat(chunks))},3000));return}
  if(!drop){outgoing.writeHead(response.statusCode,response.headers);response.pipe(outgoing);return}
  response.resume();response.on('end',()=>{
   writeFileSync(resolve(journal,'lost-send-receipt.json'),JSON.stringify({at:new Date().toISOString(),path:incoming.url,idempotencyKey:incoming.headers['idempotency-key'],actualApiStatus:response.statusCode,effect:'API response fully received; success body withheld and replaced with incomplete JSON for this one local send'}),{mode:0o600})
   outgoing.writeHead(response.statusCode,{'content-type':'application/json'});outgoing.end('{')
  })
 }); upstream.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end()});incoming.pipe(upstream)
})
await new Promise((yes,no)=>{proxy.once('error',no);proxy.listen(Number(apiPort),'127.0.0.1',yes)})

const vitePath=resolve(root,'apps/studio/node_modules/vite/bin/vite.js')
const studio=spawn(process.execPath,[vitePath,'--host','127.0.0.1','--port',studioPort,'--strictPort'],{cwd:resolve(root,'apps/studio'),stdio:['ignore','inherit','inherit'],env:{...base,SOPHIA_API_ORIGIN:`http://127.0.0.1:${apiPort}`,VITE_SOPHIA_CONVERSATIONS:'1',VITE_DEV_PROJECT_ID:projectId,VITE_DEV_IDENTITIES:JSON.stringify(identities)}})
writeFileSync(resolve(journal,'browser-stack-private.json'),JSON.stringify({projectId,admin,editor,viewer,outsider,ownerUrl:db.ownerUrl,apiPort,studioPort,pid:process.pid,apiPid:api.pid,studioPid:studio.pid}),{mode:0o600})
let stop=false
process.on('SIGTERM',()=>{stop=true});process.on('SIGINT',()=>{stop=true})
const deadline=Date.now()+30*60*1000
try {
  while(!stop&&Date.now()<deadline&&!existsSync(resolve(journal,'browser-stop'))) {
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
