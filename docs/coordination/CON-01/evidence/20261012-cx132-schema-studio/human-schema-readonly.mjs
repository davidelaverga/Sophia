import { readFileSync, writeFileSync } from 'node:fs';
import pg from '/Users/davidelaverga/Documents/Codex/2026-10-09/sophia-con01-review/node_modules/pg/lib/index.js';
const source=JSON.parse(readFileSync('/Users/davidelaverga/.codex/operator-journal/CON-01/attempt-1/cx132/human-schema-source-manifest.json','utf8'));
const out={observedAt:new Date().toISOString(),mode:'READ ONLY; metadata only',source:source.candidate,currentMain:source.main,comparisonScope:'exact main migration manifest plus candidate API required-function metadata; no operational approval',credentialRef:'~/.config/sophia/smc-m01-owner-db-url'};
let c;
try {
 const u=new URL(readFileSync('/Users/davidelaverga/.config/sophia/smc-m01-owner-db-url','utf8').trim());
 out.targetReferenceMatched = u.hostname === 'db.ikigawvpaxnvdjzzzhws.supabase.co' || u.username.includes('ikigawvpaxnvdjzzzhws');
 if(!out.targetReferenceMatched) throw new Error('Target reference mismatch; no connection');
 if(u.searchParams.has('sslrootcert'))u.searchParams.set('sslrootcert','/Users/davidelaverga/Documents/Codex/2026-10-09/sophia-con01-review/deploy/supabase/prod-ca-2021.crt');
 c=new pg.Client({connectionString:u.toString(),connectionTimeoutMillis:7000,query_timeout:7000,application_name:'codex-con01-readonly-discovery'});
 await c.connect();await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL statement_timeout='5s'");
 await c.query("SET LOCAL lock_timeout='2s'");out.server=(await c.query("SELECT current_setting('server_version') AS version,current_setting('transaction_read_only') AS read_only")).rows[0];
 out.ledger=(await c.query('SELECT version,filename,sha256 FROM sophia_meta.schema_migrations ORDER BY version LIMIT 501')).rows;
 const files=source.migrations;out.drift=out.ledger.filter(x=>files.find(f=>f.version===x.version)?.sha256!==x.sha256).map(x=>x.version);out.pending=files.filter(f=>!out.ledger.some(x=>x.version===f.version)).map(f=>f.filename);
 out.conversationTables=(await c.query("SELECT to_regclass('sophia.conversations') IS NOT NULL AS conversations, to_regclass('sophia.conversation_replies') IS NOT NULL AS replies, to_regclass('sophia.conversation_reply_contexts') IS NOT NULL AS contexts")).rows[0];
 out.requiredSignatures=(await c.query('SELECT s AS signature,to_regprocedure(s) IS NOT NULL AS present FROM unnest($1::text[]) s ORDER BY s',[source.requiredSignatures])).rows;
 out.truncated=out.ledger.length===501;
 out.serverObservedAt=(await c.query('SELECT clock_timestamp() AS at')).rows[0].at;
 await c.query('ROLLBACK');out.rollbackConfirmed=true;
} catch(e){out.error={code:e.code??null,message:'Read-only discovery failed; credentials withheld'};}
finally{if(c){await c.query('ROLLBACK').catch(()=>{});await c.end().then(()=>out.connectionEnded=true,()=>out.connectionEnded=false);}}
writeFileSync('/Users/davidelaverga/.codex/operator-journal/CON-01/attempt-1/cx132/human-schema-readonly.private.json',JSON.stringify(out,null,2)+'\n',{mode:0o600});
const safe={...out,ledger:undefined,requiredSignatures:undefined,lastApplied:out.ledger?.at(-1)?.version,applied:out.ledger?.length,missingRequiredSignatures:out.requiredSignatures?.filter(x=>!x.present).map(x=>x.signature)};writeFileSync('/Users/davidelaverga/.codex/operator-journal/CON-01/attempt-1/cx132/human-schema-readonly.safe.json',JSON.stringify(safe,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(safe));
