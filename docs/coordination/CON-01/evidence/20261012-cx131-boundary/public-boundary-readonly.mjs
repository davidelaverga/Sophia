// Bounded catalog discovery only. No user data, function invocation, grants or session termination.
import { readFileSync, writeFileSync } from 'node:fs'
import pg from '/Users/davidelaverga/Documents/Codex/2026-10-09/sophia-con01-review/node_modules/pg/lib/index.js'
const dir = '/Users/davidelaverga/.codex/operator-journal/CON-01/attempt-1/cx131'
const result = { observedAt: new Date().toISOString(), scope: 'READ ONLY metadata; no final identity qualification', credentialReference: '~/.config/sophia/smc-m01-owner-db-url' }
let client
try {
  const url = new URL(readFileSync('/Users/davidelaverga/.config/sophia/smc-m01-owner-db-url', 'utf8').trim())
  if (!(url.hostname === 'db.ikigawvpaxnvdjzzzhws.supabase.co' || url.username.includes('ikigawvpaxnvdjzzzhws'))) throw new Error('target mismatch')
  if (url.searchParams.has('sslrootcert')) url.searchParams.set('sslrootcert', '/Users/davidelaverga/Documents/Codex/2026-10-09/sophia-con01-review/deploy/supabase/prod-ca-2021.crt')
  client = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 7000, query_timeout: 7000, application_name: 'codex-con01-public-boundary-readonly' })
  await client.connect()
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  await client.query("SET LOCAL statement_timeout='5s'")
  await client.query("SET LOCAL lock_timeout='2s'")
  result.server = (await client.query("SELECT current_database() AS database, current_user AS reader, current_setting('server_version') AS version, current_setting('transaction_read_only') AS read_only, clock_timestamp() AS at")).rows[0]
  result.databases = (await client.query("SELECT d.datname,d.datallowconn,d.datistemplate,pg_get_userbyid(d.datdba) AS owner,d.datdba=(SELECT oid FROM pg_roles WHERE rolname=current_user) AS reader_is_owner,EXISTS(SELECT FROM aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a WHERE a.grantee=0 AND a.privilege_type='CONNECT') AS public_connect FROM pg_database d ORDER BY d.datname LIMIT 101")).rows
  result.reader = (await client.query('SELECT rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0]
  result.extensions = (await client.query("SELECT extname,extversion FROM pg_extension WHERE extname IN ('pg_net','http','pg_cron','supautils') ORDER BY extname")).rows
  result.schemas = (await client.query("SELECT n.nspname,pg_get_userbyid(n.nspowner) AS owner,a.privilege_type FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a WHERE a.grantee=0 AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\\_%' ORDER BY n.nspname,a.privilege_type LIMIT 201")).rows
  result.relations = (await client.query("SELECT n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,array_agg(a.privilege_type ORDER BY a.privilege_type) AS public_privileges FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's'::\"char\" ELSE 'r'::\"char\" END,c.relowner))) a WHERE a.grantee=0 AND c.relkind IN ('r','p','v','m','f','S') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\\_%' GROUP BY n.nspname,c.relname,c.relkind,c.relowner ORDER BY n.nspname,c.relname LIMIT 501")).rows
  result.functions = (await client.query("SELECT n.nspname,count(*)::integer AS public_execute, count(*) FILTER(WHERE p.prosecdef)::integer AS security_definer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\\_%' AND EXISTS(SELECT FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') GROUP BY n.nspname ORDER BY n.nspname LIMIT 201")).rows
  result.netFunctions = (await client.query("SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,p.prosecdef,pg_get_userbyid(p.proowner) AS owner,EXISTS(SELECT FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='net' ORDER BY p.proname,p.oid LIMIT 101")).rows
  result.assemblerPresent = (await client.query("SELECT EXISTS(SELECT FROM pg_roles WHERE rolname='sophia_conversation_assembler') AS present")).rows[0].present
  await client.query('ROLLBACK'); result.rollbackConfirmed = true
} catch (error) { result.error = { code: error.code ?? null, category: 'catalog discovery failed; details and credentials withheld' } }
finally {
  if (client) { await client.query('ROLLBACK').catch(() => {}); await client.end().then(() => result.connectionEnded = true, () => result.connectionEnded = false) }
}
result.truncated = result.databases?.length === 101 || result.schemas?.length === 201 || result.relations?.length === 501 || result.functions?.length === 201 || result.netFunctions?.length === 101
writeFileSync(dir + '/public-boundary.private.json', JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
const safe = { observedAt: result.observedAt, serverObservedAt: result.server?.at, serverVersion: result.server?.version, readOnly: result.server?.read_only, readerSuperuser: result.reader?.rolsuper, otherConnectableDatabaseNotOwnedByReader: result.databases?.filter(d => d.datname !== result.server?.database && d.datallowconn && !d.reader_is_owner).map(d => ({ name: d.datname, owner: d.owner, publicConnect: d.public_connect })), extensions: result.extensions, publicSchemaPrivileges: result.schemas, publicRelationCount: result.relations?.length, netRelations: result.relations?.filter(r => r.nspname === 'net'), publicExecuteBySchema: result.functions, netFunctions: result.netFunctions, assemblerPresent: result.assemblerPresent, truncated: result.truncated, rollbackConfirmed: result.rollbackConfirmed, connectionEnded: result.connectionEnded, error: result.error, limits: 'Metadata only, no table content or function execution. PUBLIC grants are effective for future roles, but no execution identity exists or has been tested; no other-database connection, revoke, HBA change or termination.' }
writeFileSync(dir + '/public-boundary.safe.json', JSON.stringify(safe, null, 2) + '\n', { mode: 0o600 })
console.log(JSON.stringify(safe))
