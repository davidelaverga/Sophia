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
 result.census=(await c.query(`SELECT (SELECT json_agg(datname ORDER BY datname) FROM pg_database WHERE NOT datistemplate) AS databases,(SELECT count(*)::int FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND backend_type='client backend') AS other_clients`)).rows[0];
 assert.deepEqual(result.census,{databases:['postgres'],other_clients:0});
}finally{await c.end();result.connectionEnded=true;writeFileSync(j+'/identities.json',JSON.stringify(result,null,2)+'\n')}
console.log(JSON.stringify({policies:result.policies.length,functions:result.functions.length,version:result.version.version_num,rollback:result.rollback,connectionEnded:result.connectionEnded,census:result.census}));
