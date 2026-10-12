import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {migrate} from '/Users/davidelaverga/Documents/Codex/2026-10-09/sophia-con01-source-harness-review/packages/persistence/src/migrate.ts';
const require=createRequire('/Users/davidelaverga/Documents/Codex/2026-10-09/sophia-con01-source-harness-review/package.json');
const {Client}=require('pg');const j=process.env.CON01_IDENTITY_JOURNAL;const url=process.env.SOPHIA_DISPOSABLE_DATABASE_URL;
assert.ok(new URL(url).hostname==='127.0.0.1');
const result={scope:'Owned PG17 incremental 0036 -> exact7d8 human-chat schema rehearsal; no installed/provider/app qualification',source:'7d8f415f45d51d3f536443060f5acbfd3bea9455',connectionEnded:false};
const c=new Client({connectionString:url,connectionTimeoutMillis:3000,query_timeout:12000});
const app=readFileSync(j+'/candidate-app.private.ts','utf8');const required=app.match(/export const REQUIRED_SCHEMA = `([\s\S]*?)`/)[1];
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
try{
 result.baseline=await migrate(url,j+'/baseline36');assert.equal(result.baseline.rows.length,36);
 await c.connect();
 result.beforeReady=(await c.query(required)).rows[0].ok;assert.equal(result.beforeReady,false);
 await c.query('BEGIN');await c.query("SELECT set_config('sophia.actor_id','00000000-0000-4000-8000-00000000c133',true)");
 result.syntheticReceipt=(await c.query("SELECT sophia.create_project('Synthetic incremental preservation rehearsal','cx133-incremental-project') AS receipt")).rows[0].receipt;
 await c.query('COMMIT');
 const tables=['projects','project_members','project_creations','project_revisions','room_state'];
 const snap=async()=>Object.fromEntries(await Promise.all(tables.map(async t=>[t,(await c.query(`SELECT to_jsonb(t) AS row FROM sophia.${t} t ORDER BY to_jsonb(t)::text`)).rows.map(x=>x.row)])));
 const before=await snap();result.before={counts:Object.fromEntries(tables.map(t=>[t,before[t].length])),sha256:hash(before)};
 result.dryRun=await migrate(url,j+'/candidate',{dryRun:true});
 const pending=result.dryRun.rows.filter(x=>x.status==='pending').map(x=>x.version);
 assert.deepEqual(pending,['0037','0038','0039','0040','0041','0042','0043','0044','0045','0048']);
 result.upgrade=await migrate(url,j+'/candidate');assert.deepEqual(result.upgrade.rows.filter(x=>x.status==='applied').map(x=>x.version),pending);
 const after=await snap();result.after={counts:Object.fromEntries(tables.map(t=>[t,after[t].length])),sha256:hash(after)};assert.deepEqual(after,before);result.syntheticPreserved=true;
 result.afterReady=(await c.query(required)).rows[0].ok;assert.equal(result.afterReady,true);
 result.ledger=(await c.query('SELECT version,filename,sha256 FROM sophia_meta.schema_migrations ORDER BY version')).rows;assert.equal(result.ledger.length,46);
 result.repeat=await migrate(url,j+'/candidate');assert.equal(result.repeat.rows.filter(x=>x.status==='applied').length,0);
 try{await migrate(url,j+'/baseline36',{dryRun:true});result.oldInputUnexpectedlyAccepted=true;}catch(e){result.oldInputRefused={name:e.constructor.name,message:e.message};assert.match(e.message,/Applied migration 0037 .* missing/)}
 result.census=(await c.query("SELECT (SELECT json_agg(datname ORDER BY datname) FROM pg_database WHERE NOT datistemplate) AS databases,(SELECT count(*)::int FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND backend_type='client backend') AS other_clients")).rows[0];assert.deepEqual(result.census,{databases:['postgres'],other_clients:0});
}finally{await c.end();result.connectionEnded=true;writeFileSync(j+'/identities.json',JSON.stringify(result,null,2)+'\n')}
console.log(JSON.stringify({scope:result.scope,beforeReady:result.beforeReady,afterReady:result.afterReady,syntheticPreserved:result.syntheticPreserved,baseline:result.baseline.rows.length,upgraded:result.upgrade.rows.filter(x=>x.status==='applied').map(x=>x.version),repeatApplied:result.repeat.rows.filter(x=>x.status==='applied').length,oldInputRefused:result.oldInputRefused,census:result.census}));
