import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire('/Users/davidelaverga/Documents/Codex/2026-10-09/sophia-con01-source-harness-review/package.json');
const {Client}=require('pg');
const j=process.env.CON01_IDENTITY_JOURNAL, root=process.env.SOPHIA_DISPOSABLE_DATABASE_URL;
const proposal=JSON.parse(readFileSync(j+'/source-manifest.json','utf8'));
const result={scope:'Mechanical proposed Q13 composition on owned PG17 only; not canonical candidate, shared write, hosted qualification or app acceptance',proposal,stages:[],connectionEnded:false};
const clients=new Set();
async function connect(user='postgres',db='postgres') {const url=new URL(root);url.username=user;url.pathname='/'+db;const c=new Client({connectionString:url.href,connectionTimeoutMillis:1000,query_timeout:10000});await c.connect();clients.add(c);return c;}
async function end(c){await c.end();clients.delete(c);}
function stage(name,data){result.stages.push({name,...data});writeFileSync(j+'/identities.json',JSON.stringify(result,null,2)+'\n');}
let c;
const A='00000000-0000-4000-8000-00000000c134',B='00000000-0000-4000-8000-00000000b134';
const control=readFileSync(j+'/activation-exact.sql','utf8').replace(":'login'","'cx134_exec'");
const assembled=readFileSync(j+'/composed-s3.private.sql','utf8');
const migrations=JSON.parse(readFileSync(j+'/migrations.private.json','utf8'));
const candidates=JSON.parse(readFileSync(j+'/candidates.private.json','utf8'));
async function base(db){for(const m of migrations)await db.query(m.sql);for(const m of candidates)await db.query('BEGIN;\n'+m.sql+'\nCOMMIT;');}
async function api(sql,params=[]){await c.query('BEGIN; SET LOCAL ROLE sophia_api');try{await c.query("SELECT set_config('sophia.actor_id',$1,true)",[A]);const r=await c.query(sql,params);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}}
async function denied(db,sql,params=[]){await db.query('BEGIN');let code=null,message=null;try{await db.query(sql,params);}catch(e){code=e.code;message=e.message;}finally{await db.query('ROLLBACK');}assert.equal(code,'42501',sql+' : '+message);return{sql,code,message};}
async function scene(project,key){const r=(await api('SELECT sophia.start_conversation($1,$2,$3,$4,true,$5) AS v',[project,key,'Synthetic isolation','Synthetic bounded Ask '+key,'Synthetic member'])).rows[0].v;assert.ok(r.replyId);await c.query("UPDATE sophia.conversation_replies SET state='pending',reason=NULL,settled_at=NULL WHERE id=$1",[r.replyId]);return r;}
const untouched=['commands','goals','jobs','work_attempts','execution_bindings','outbox','runtime_commands','runtime_receipts','native_observations','usage_records','conversation_grants','conversation_reply_allowances','conversation_reservations'];
async function digest(){const data={};for(const table of untouched)data[table]=(await c.query(`SELECT * FROM sophia.${table}`)).rows;return{counts:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])),sha256:createHash('sha256').update(JSON.stringify(data)).digest('hex')};}
try{
 const {assembleReply}=await import(pathToFileURL(j+'/modules/conversation-assembly.ts').href);
 c=await connect();result.version=(await c.query("SELECT version(),current_setting('server_version_num') AS version_num")).rows[0];assert.equal(result.version.version_num,'170006');
 await base(c);await c.query(assembled);stage('full proposed composition installs atomically',{pass:true,hash:proposal.composedS3SHA256});
 await c.query('CREATE DATABASE cx134_outside');const second=await connect('postgres','cx134_outside');await base(second);
 let secondError;try{await second.query(assembled);}catch(e){secondError={code:e.code,message:e.message};await second.query('ROLLBACK');}
 assert.equal(secondError?.code,'42501');assert.match(secondError.message,/privileges or objects of its own/);
 const partial=(await second.query("SELECT to_regclass('sophia.conversation_assembly_claims') AS claims")).rows[0];assert.equal(partial.claims,null);await end(second);stage('second database installation refused before partial state',{pass:true,secondError,partial});
 await c.query('CREATE ROLE cx134_exec LOGIN NOINHERIT; CREATE ROLE cx134_peer LOGIN NOINHERIT; GRANT sophia_conversation_assembler TO cx134_exec,cx134_peer; GRANT CONNECT ON DATABASE postgres TO cx134_exec,cx134_peer');
 result.roleGraph=(await c.query("SELECT m.roleid::regrole::text AS role,m.member::regrole::text AS member,m.inherit_option,m.set_option,m.admin_option FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN ('cx134_exec','cx134_peer','sophia_conversation_assembler') ORDER BY role,member")).rows;
 for(const db of ['template1','cx134_outside']){const x=await connect('cx134_exec',db);await x.query('SELECT current_database()');await end(x);}
 const old=await connect('cx134_exec','cx134_outside');const oldPid=(await old.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
 const before=(await c.query(control)).rows;assert.ok(before.some(x=>x.what.startsWith('admitted to template1')));assert.ok(before.some(x=>x.what.startsWith('admitted to cx134_outside')));assert.ok(before.some(x=>x.what.includes('session open in cx134_outside')));
 await c.query('REVOKE CONNECT ON DATABASE template1,cx134_outside FROM PUBLIC; REVOKE TEMPORARY ON DATABASE postgres FROM PUBLIC');
 const attempts=[];for(const db of ['template1','cx134_outside']){let code=null;try{const x=await connect('cx134_exec',db);await end(x);}catch(e){code=e.code;}assert.equal(code,'42501');attempts.push({database:db,code});}
 const oldStill=(await old.query('SELECT current_database(),current_user,session_user,42 AS answer')).rows[0];assert.equal(oldStill.answer,42);
 const during=(await c.query(control)).rows;assert.ok(during.some(x=>x.what.includes('session open in cx134_outside')));assert.ok(!during.some(x=>x.what.startsWith('admitted to ')));
 await end(old);const after=(await c.query(control)).rows;assert.deepEqual(after,[]);
 const fresh=await connect('cx134_exec');const intended=(await fresh.query('SELECT current_database(),current_user,session_user')).rows[0];assert.equal(intended.current_database,'postgres');await end(fresh);
 stage('actual admission denial and voluntary old-client settlement',{pass:true,beforeHolds:before,duringHolds:during,afterHolds:after,attempts,oldPid,oldStill,intended});
 const projectIds=[];for(const key of ['one','two']){const id=(await api('SELECT sophia.create_project($1,$2) AS v',['Synthetic Q13 '+key,'cx134-'+key])).rows[0].v.projectId;projectIds.push(id);await c.query("SELECT sophia.set_conversation_settings($1,'enabled','OWNED-SYNTHETIC-CX134')",[id]);}
 await c.query("INSERT INTO sophia.project_members(project_id,actor_id,role,active) VALUES($1,$2,'editor',true)",[projectIds[0],B]);
 const s1=await scene(projectIds[0],'claim-bound');const s2=await scene(projectIds[1],'positive');const s3=await scene(projectIds[0],'withdrawn');
 const ex=await connect('cx134_exec');await ex.query('SET ROLE sophia_conversation_assembler');
 const noClaim=(await ex.query('SELECT sophia.conversation_assembly_project() AS p,(SELECT count(*)::int FROM sophia.projects) AS visible')).rows[0];assert.deepEqual(noClaim,{p:null,visible:0});
 const claim=(await ex.query('SELECT sophia.conversation_assembly_claim($1,20000) AS v',[s1.replyId])).rows[0].v;assert.equal(claim.verdict,'claimed');
 await ex.query('BEGIN ISOLATION LEVEL REPEATABLE READ');const begun=(await ex.query('SELECT sophia.conversation_assembly_begin($1,$2,$3) AS v',[s1.replyId,claim.attempt,claim.token])).rows[0].v;assert.equal(begun.verdict,'begun');await ex.query("SELECT set_config('sophia.actor_id',$1,true)",[A]);
 const eligible=(await ex.query('SELECT id FROM sophia.projects ORDER BY id')).rows;assert.deepEqual(eligible,[{id:projectIds[0]}]);
 const wrongProject=(await ex.query('SELECT count(*)::int AS n FROM sophia.projects WHERE id=$1',[projectIds[1]])).rows[0].n;assert.equal(wrongProject,0);
 await ex.query("SELECT set_config('sophia.actor_id',$1,true)",[B]);const wrongActor=(await ex.query('SELECT sophia.conversation_assembly_project() AS p,(SELECT count(*)::int FROM sophia.projects) AS visible')).rows[0];assert.deepEqual(wrongActor,{p:null,visible:0});await ex.query('ROLLBACK');
 let leaseCode;await ex.query('BEGIN ISOLATION LEVEL REPEATABLE READ');try{await ex.query('SELECT sophia.conversation_assembly_begin($1,$2,$3)',[s2.replyId,claim.attempt,claim.token]);}catch(e){leaseCode=e.code;}finally{await ex.query('ROLLBACK');}assert.equal(leaseCode,'55000');
 const settledClaim=(await ex.query("SELECT sophia.conversation_assembly_fail($1,$2,$3,'qualification_done') AS v",[s1.replyId,claim.attempt,claim.token])).rows[0].v;assert.equal(settledClaim.verdict,'failed');
 stage('real login claim-bound reads and wrong actor/project/lease',{pass:true,noClaim,claim,begun,eligible,wrongProject,wrongActor,wrongReplyLeaseCode:leaseCode,settledClaim});
 const baseline=await digest();
 const functions=(await c.query(`SELECT p.oid::regprocedure::text AS signature,format('SELECT %I.%I(%s)',n.nspname,p.proname,(SELECT string_agg('NULL::'||format_type(x,NULL),', ' ORDER BY o) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY z(x,o))) AS sql FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='sophia' AND p.prokind='f' AND p.provariadic=0 AND p.prorettype NOT IN ('trigger'::regtype,'event_trigger'::regtype) AND has_function_privilege('sophia_api',p.oid,'EXECUTE') AND NOT has_function_privilege('sophia_conversation_assembler',p.oid,'EXECUTE') ORDER BY signature COLLATE "C"`)).rows;
 assert.ok(functions.length>=30 && functions.length<200);const denials=[];
 for(const f of functions)denials.push({signature:f.signature,...await denied(ex,f.sql)});
 for(const sql of ['SET ROLE sophia_api','SET ROLE sophia_worker','SET ROLE cx134_peer','UPDATE sophia.goals SET title=title WHERE false','INSERT INTO sophia.jobs DEFAULT VALUES','DELETE FROM sophia.commands WHERE false','TRUNCATE sophia.outbox'])denials.push(await denied(ex,sql));
 const seq=(await c.query("SELECT format('SELECT nextval(%L::regclass)',c.oid::regclass::text) AS sql FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='sophia' AND c.relkind='S'")).rows;for(const x of seq)denials.push(await denied(ex,x.sql));
 await end(ex);const afterDenials=await digest();assert.deepEqual(afterDenials,baseline);stage('actual execution login operational and role denials',{pass:true,apiFunctionCount:functions.length,sequenceCount:seq.length,denials,baseline,afterDenials});
 const url=new URL(root);url.username='cx134_exec';const limits={leaseMs:8000,deadlineMs:2500,connectMs:1000,statementTimeoutMs:2000,lockTimeoutMs:1500,idleInTransactionMs:2000,connectionCheckMs:100};
 const assembledReply=await assembleReply(url.href,s2.replyId,limits);assert.equal(assembledReply.outcome,'recorded');const repeated=await assembleReply(url.href,s2.replyId,limits);assert.equal(repeated.outcome,'already_recorded');assert.equal(repeated.attempt,1);assert.equal(repeated.contextHash,assembledReply.contextHash);
 const context=(await c.query('SELECT body,context_hash,attempt FROM sophia.conversation_reply_contexts WHERE reply_id=$1',[s2.replyId])).rows[0];assert.ok(context.body.includes('Synthetic bounded Ask positive'));assert.equal(context.context_hash,assembledReply.contextHash);
 await api('SELECT sophia.withdraw_conversation_message($1,$2,$3)',[s3.conversationId,s3.messageId,'withdraw-pending']);const withdrawn=await assembleReply(url.href,s3.replyId,limits);assert.deepEqual(withdrawn,{outcome:'not_pending',state:'cancelled'});
 const afterAssembly=await digest();assert.deepEqual(afterAssembly,baseline);
 stage('actual unchanged compiler and assembler record plus reconcile and withdrawal',{pass:true,assembledReply,repeated,context,withdrawn,operationTablesUnchanged:afterAssembly});
 const revBefore=(await c.query('SELECT count(*)::int AS n FROM sophia.conversation_assembly_claims')).rows[0].n;
 await c.query('REVOKE sophia_conversation_assembler FROM cx134_exec');const revoked=await assembleReply(url.href,s2.replyId,limits);assert.equal(revoked.outcome,'retry');assert.equal(revoked.stage,'claim');const revAfter=(await c.query('SELECT count(*)::int AS n FROM sophia.conversation_assembly_claims')).rows[0].n;assert.equal(revBefore,revAfter);
 stage('revoked identity does not add a claim',{pass:true,revoked,claimsBefore:revBefore,claimsAfter:revAfter});
 result.census=(await c.query("SELECT (SELECT json_agg(datname ORDER BY datname) FROM pg_database WHERE NOT datistemplate) AS databases,(SELECT count(*)::int FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND backend_type='client backend') AS other_clients")).rows[0];assert.deepEqual(result.census,{databases:['cx134_outside','postgres'],other_clients:0});result.pass=true;
}finally{for(const x of clients)try{await x.query('ROLLBACK');await x.end();}catch{}clients.clear();result.connectionEnded=true;writeFileSync(j+'/identities.json',JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({pass:result.pass,stages:result.stages.map(x=>({name:x.name,pass:x.pass})),census:result.census,connectionEnded:result.connectionEnded}));
