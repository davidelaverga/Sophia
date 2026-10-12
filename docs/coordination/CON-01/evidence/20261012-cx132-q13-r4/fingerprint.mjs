import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire('/Users/davidelaverga/Documents/Codex/2026-10-09/sophia-con01-source-harness-review/package.json');
const {Client}=require('pg');
const j=process.env.CON01_IDENTITY_JOURNAL;
const c=new Client({connectionString:process.env.SOPHIA_DISPOSABLE_DATABASE_URL,connectionTimeoutMillis:3000,query_timeout:12000});
await c.connect();
const result={scope:'Canonical catalog identities only. Not final Q13 candidate qualification.',migrationSource:'7d8f415f45d51d3f536443060f5acbfd3bea9455',migrationsApplied:[],readOnly:false,rollback:false,connectionEnded:false};
try{
 for(const m of JSON.parse(readFileSync(j+'/migrations.private.json','utf8'))){await c.query(m.sql);result.migrationsApplied.push(m.path)}
 await c.query('BEGIN READ ONLY'); await c.query('SET LOCAL search_path=pg_catalog');
 result.readOnly=(await c.query('SHOW transaction_read_only')).rows[0].transaction_read_only==='on';
 result.version=(await c.query("SELECT version(),current_setting('server_version_num') AS version_num")).rows[0];
 const rels=['commands','contributions','conversation_messages','conversations','decisions','execution_bindings','goals','jobs','mission_confirmation_targets','mission_entries','mission_note_consents','mission_note_policies','project_members','project_revisions','projects','source_dependencies','source_objects','source_texts','work_attempts'];
 result.policies=(await c.query(`SELECT c.relname,p.polname,p.polcmd::text,p.polpermissive,
 (SELECT array_agg(x::regrole::text ORDER BY x::regrole::text COLLATE "C") FROM unnest(p.polroles) x) AS roles,
 pg_get_expr(p.polqual,p.polrelid) AS qual,pg_get_expr(p.polwithcheck,p.polrelid) AS withcheck,
 md5(coalesce(pg_get_expr(p.polqual,p.polrelid),'')) AS qual_md5,
 md5(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')) AS withcheck_md5
 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
 WHERE c.relnamespace='sophia'::regnamespace AND c.relname=ANY($1::text[]) AND p.polcmd IN ('r','*')
 ORDER BY c.relname COLLATE "C",p.polname COLLATE "C"`,[rels])).rows;
 result.view=(await c.query(`SELECT pg_get_viewdef(c.oid) AS definition,md5(pg_get_viewdef(c.oid)) AS definition_md5,c.reloptions FROM pg_class c WHERE c.oid='sophia.native_task_view'::regclass`)).rows[0];
 result.functions=(await c.query(`SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition,md5(pg_get_functiondef(p.oid)) AS definition_md5 FROM pg_proc p WHERE p.oid IN ('sophia.actor_id()'::regprocedure,'sophia.is_member(uuid)'::regprocedure,'sophia.is_task_kind(text)'::regprocedure,'sophia.mission_capture_default()'::regprocedure) ORDER BY p.oid::regprocedure::text COLLATE "C"`)).rows;
 assert.equal(result.policies.length,19);assert.equal(result.functions.length,4);
 await c.query('ROLLBACK');result.rollback=true;
 const activation=readFileSync(j+'/activation-exact.sql','utf8').replace(":'login'","'cx131_exec'");
 result.activation={proposal:'9211a35e6b8bf1e895dbe457eca139d201336a78',cases:[]};
 const common="CREATE ROLE cx131_exec LOGIN NOINHERIT; CREATE ROLE sophia_conversation_assembler NOLOGIN; GRANT sophia_conversation_assembler TO cx131_exec; GRANT USAGE ON SCHEMA sophia TO sophia_conversation_assembler";
 const cases=[
 ['missing assembler',"CREATE ROLE cx131_exec LOGIN NOINHERIT; GRANT sophia_api TO cx131_exec",['no assembler role','member of sophia_api','not a member of the assembler']],
 ['control with owned other admission denied',common+'; REVOKE CONNECT ON DATABASE template1 FROM PUBLIC',[]],
 ['login owns target',common+'; ALTER DATABASE postgres OWNER TO cx131_exec',['the login owns something in database postgres']],
 ['direct CREATE and TEMP',common+'; GRANT CREATE,TEMPORARY ON DATABASE postgres TO cx131_exec',['on the target database: CREATE','on the target database: TEMPORARY']],
 ['CONNECT grant option',common+'; GRANT CONNECT ON DATABASE postgres TO cx131_exec WITH GRANT OPTION',['on the target database: CONNECT with grant option']],
 ['assembler owns table',common+'; CREATE TABLE public.cx131_owned(id int); ALTER TABLE public.cx131_owned OWNER TO sophia_conversation_assembler',['the assembler owns something in postgres']],
 ['assembler BYPASSRLS drift',common+"; REVOKE CONNECT ON DATABASE template1 FROM PUBLIC; CREATE TABLE public.cx131_rls(id int); INSERT INTO public.cx131_rls VALUES (1); ALTER TABLE public.cx131_rls ENABLE ROW LEVEL SECURITY; ALTER TABLE public.cx131_rls FORCE ROW LEVEL SECURITY; CREATE POLICY deny_all ON public.cx131_rls FOR SELECT TO sophia_conversation_assembler USING (false); GRANT SELECT ON public.cx131_rls TO sophia_conversation_assembler; ALTER ROLE sophia_conversation_assembler BYPASSRLS",null]
 ];
 for(const [name,setup,expected] of cases){
  await c.query('BEGIN');
  try{await c.query(setup);const rows=(await c.query(activation)).rows;const substantive=rows.map(x=>x.what).filter(x=>!x.startsWith('admitted to ')).sort();
   result.activation.cases.push({name,rows,substantive,expected,match:expected===null?null:JSON.stringify(substantive)===JSON.stringify([...expected].sort())});
   if(expected!==null)assert.deepEqual(substantive,[...expected].sort());
   if(name==='assembler BYPASSRLS drift'){assert.ok(rows.some(x=>x.what==='the assembler has BYPASSRLS'));await c.query('SET LOCAL SESSION AUTHORIZATION cx131_exec');await c.query('SET LOCAL ROLE sophia_conversation_assembler');result.activation.bypassRlsObserved=(await c.query('SELECT current_user,session_user,count(*)::int AS visible FROM public.cx131_rls')).rows[0];assert.equal(result.activation.bypassRlsObserved.visible,1)}
  }finally{await c.query('ROLLBACK')}
 }
 const publicCase={name:'PUBLIC operational writer grant',expected:'Activation holds because execution identity can invoke a Sophia operational writer'};
 await c.query('BEGIN');
 try{
  await c.query(common+'; REVOKE CONNECT ON DATABASE template1 FROM PUBLIC; GRANT EXECUTE ON FUNCTION sophia.create_project(text,text) TO PUBLIC');
  publicCase.holds=(await c.query(activation)).rows;
  await c.query('SET LOCAL SESSION AUTHORIZATION cx131_exec');await c.query('SET LOCAL ROLE sophia_conversation_assembler');
  await c.query("SELECT set_config('sophia.actor_id','00000000-0000-4000-8000-00000000c132',true)");
  publicCase.identity=(await c.query('SELECT current_user,session_user')).rows[0];
  publicCase.writerReceipt=(await c.query("SELECT sophia.create_project('Synthetic Q13 PUBLIC writer qualification','cx132-public-negative') AS receipt")).rows[0].receipt;
  await c.query('RESET ROLE');await c.query('RESET SESSION AUTHORIZATION');
  publicCase.actualRows=(await c.query("SELECT (SELECT count(*)::int FROM sophia.projects WHERE title='Synthetic Q13 PUBLIC writer qualification') AS projects,(SELECT count(*)::int FROM sophia.project_creations WHERE idempotency_key='cx132-public-negative') AS creationLedger")).rows[0];
  publicCase.detected=publicCase.holds.length>0;
 }finally{await c.query('ROLLBACK')}
 result.activation.publicCase=publicCase;
 writeFileSync(j+'/activation-results.json',JSON.stringify(result.activation,null,2)+'\n');
 result.census=(await c.query(`SELECT (SELECT json_agg(datname ORDER BY datname) FROM pg_database WHERE NOT datistemplate) AS databases,(SELECT count(*)::int FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND backend_type='client backend') AS other_clients`)).rows[0];
 assert.deepEqual(result.census,{databases:['postgres'],other_clients:0});
}finally{await c.end();result.connectionEnded=true;writeFileSync(j+'/identities.json',JSON.stringify(result,null,2)+'\n')}
console.log(JSON.stringify({policies:result.policies.length,functions:result.functions.length,version:result.version.version_num,rollback:result.rollback,connectionEnded:result.connectionEnded,census:result.census}));
