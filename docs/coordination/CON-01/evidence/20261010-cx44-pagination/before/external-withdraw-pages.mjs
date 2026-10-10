import{readFileSync,writeFileSync,existsSync}from'node:fs';import{createRequire}from'node:module';import{resolve}from'node:path';import{pathToFileURL}from'node:url';import{randomUUID}from'node:crypto';
const root=process.cwd(),j=process.env.CON01_JOURNAL,req=createRequire(resolve(root,'apps/api/package.json')),pg=req('pg'),p=JSON.parse(readFileSync(resolve(j,'browser-stack-private.json'),'utf8')),s=JSON.parse(readFileSync(resolve(j,'seeded-conversation.json'),'utf8')),h=await import(pathToFileURL(resolve(root,'packages/persistence/src/index.ts'))),pool=new pg.Pool({connectionString:p.ownerUrl});
try {
 const keyPath=resolve(j,'later-keys.json');
 const keys=existsSync(keyPath)?JSON.parse(readFileSync(keyPath,'utf8')):{a:randomUUID(),b:randomUUID()};writeFileSync(keyPath,JSON.stringify(keys),{mode:0o600});
 const withdrawals=[];
 for(const [seq,key] of [[54,keys.a],[105,keys.b]]) {
  const q=await pool.query('SELECT id FROM sophia.conversation_messages WHERE conversation_id=$1 AND seq=$2',[s.conversationId,seq]);
  if(q.rows.length!==1)throw Error('Expected exact withdrawal sequence');
  withdrawals.push(await h.withActor(pool,p.admin,'write',c=>h.withdrawConversationMessage(c,s.conversationId,q.rows[0].id,key)));
 }
 const canonical=await h.withActor(pool,p.viewer,'read',c=>h.readConversationList(c,s.projectId));
 const out={at:new Date().toISOString(),scope:'External supported withdrawals A54/B105; no provider',keys,withdrawals,canonical};
 writeFileSync(resolve(j,'external-withdraw-pages-result.json'),JSON.stringify(out,null,2),{mode:0o600});console.log(JSON.stringify({at:out.at,contributors:canonical.conversations[0].contributors}));
} finally {await pool.end()}
