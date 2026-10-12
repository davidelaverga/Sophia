import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire('/Users/davidelaverga/Documents/Codex/2026-10-09/sophia-con01-source-harness-review/package.json');
const {Client}=require('pg');
const j=process.env.CON01_IDENTITY_JOURNAL;
const c=new Client({connectionString:process.env.SOPHIA_DISPOSABLE_DATABASE_URL,connectionTimeoutMillis:3000,query_timeout:12000});
const result={scope:'Exact Q13 r5 activation query only on owned synthetic PG17; not installed S3 qualification',proposal:JSON.parse(readFileSync(j+'/proposal-manifest.json','utf8')),migrationSource:'7d8f415f45d51d3f536443060f5acbfd3bea9455',migrationsApplied:[],cases:[],connectionEnded:false};
await c.connect();
try {
 for(const m of JSON.parse(readFileSync(j+'/migrations.private.json','utf8'))){await c.query(m.sql);result.migrationsApplied.push(m.path)}
 result.version=(await c.query("SELECT version(),current_setting('server_version_num') AS version_num")).rows[0];
 assert.equal(result.version.version_num,'170006');
 const activation=readFileSync(j+'/activation-exact.sql','utf8').replace(":'login'","'cx131_exec'");
 const common='CREATE ROLE cx131_exec LOGIN NOINHERIT; CREATE ROLE sophia_conversation_assembler NOLOGIN; GRANT sophia_conversation_assembler TO cx131_exec; GRANT USAGE ON SCHEMA sophia TO sophia_conversation_assembler; REVOKE CONNECT ON DATABASE template1 FROM PUBLIC; REVOKE TEMPORARY ON DATABASE postgres FROM PUBLIC';
 const cases=[
  ['clean authority control',common,[]],
  ['PUBLIC default TEMPORARY',common+'; GRANT TEMPORARY ON DATABASE postgres TO PUBLIC',['effective: the login and the assembler may TEMPORARY on the target database (PUBLIC)']],
  ['PG17 PUBLIC MAINTAIN on allowlisted goals',common+'; GRANT MAINTAIN ON sophia.goals TO PUBLIC',['effective: the login and the assembler may MAINTAIN on sophia.goals (PUBLIC)']],
  ['PG17 direct assembler MAINTAIN on allowlisted goals',common+'; GRANT MAINTAIN ON sophia.goals TO sophia_conversation_assembler',['the assembler may MAINTAIN on sophia.goals','effective: the assembler may MAINTAIN on sophia.goals']],
  ['PUBLIC column operational write',common+'; GRANT UPDATE(title) ON sophia.projects TO PUBLIC',['effective: the login and the assembler may UPDATE on sophia.projects (PUBLIC)']],
  ['missing assembler with broad role',"CREATE ROLE cx131_exec LOGIN NOINHERIT; GRANT sophia_api TO cx131_exec; REVOKE CONNECT ON DATABASE template1 FROM PUBLIC; REVOKE TEMPORARY ON DATABASE postgres FROM PUBLIC",null],
 ];
 for(const [name,setup,expected] of cases){
  await c.query('BEGIN'); const t={name,expected,rolledBack:false}; result.cases.push(t);
  try {await c.query(setup);t.rows=(await c.query(activation)).rows;const actual=t.rows.map(x=>x.what).sort();
   if(expected!==null)assert.deepEqual(actual,[...expected].sort());else for(const x of ['no assembler role','member of sophia_api','not a member of the assembler'])assert.ok(actual.includes(x));
   t.pass=true;
  }finally{await c.query('ROLLBACK');t.rolledBack=true;}
 }
 await c.query('BEGIN');const t={name:'PUBLIC real Sophia operational writer',rolledBack:false};result.cases.push(t);
 try{
  await c.query(common+'; GRANT EXECUTE ON FUNCTION sophia.create_project(text,text) TO PUBLIC');
  t.rows=(await c.query(activation)).rows;
  assert.ok(t.rows.some(x=>x.what==='effective: the login and the assembler may EXECUTE sophia.create_project(text, text) (PUBLIC)'));
  await c.query('SET LOCAL SESSION AUTHORIZATION cx131_exec; SET LOCAL ROLE sophia_conversation_assembler');
  await c.query("SELECT set_config('sophia.actor_id','00000000-0000-4000-8000-00000000c133',true)");
  t.identity=(await c.query('SELECT current_user,session_user')).rows[0];
  t.writerReceipt=(await c.query("SELECT sophia.create_project('Synthetic Q13 r5 PUBLIC writer','cx133-r5-public-negative') AS receipt")).rows[0].receipt;
  await c.query('RESET ROLE; RESET SESSION AUTHORIZATION');
  t.actualRows=(await c.query("SELECT (SELECT count(*)::int FROM sophia.projects WHERE title='Synthetic Q13 r5 PUBLIC writer') AS projects,(SELECT count(*)::int FROM sophia.project_creations WHERE idempotency_key='cx133-r5-public-negative') AS creationLedger")).rows[0];
  assert.deepEqual(t.actualRows,{projects:1,creationledger:1});t.pass=true;
 }finally{await c.query('ROLLBACK');t.rolledBack=true;}
 result.writerRowsAfterRollback=(await c.query("SELECT count(*)::int AS projects FROM sophia.projects WHERE title='Synthetic Q13 r5 PUBLIC writer'")).rows[0];assert.equal(result.writerRowsAfterRollback.projects,0);
 result.census=(await c.query("SELECT (SELECT json_agg(datname ORDER BY datname) FROM pg_database WHERE NOT datistemplate) AS databases,(SELECT count(*)::int FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND backend_type='client backend') AS other_clients")).rows[0];
 assert.deepEqual(result.census,{databases:['postgres'],other_clients:0});result.pass=true;
}finally{await c.end();result.connectionEnded=true;writeFileSync(j+'/identities.json',JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({pass:result.pass,cases:result.cases.map(x=>({name:x.name,pass:x.pass,rolledBack:x.rolledBack})),census:result.census,connectionEnded:result.connectionEnded}));
