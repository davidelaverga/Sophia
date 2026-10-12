-- Fails closed: a missing login or assembler is a hold, and every membership check compares against the assembler's oid
-- as a scalar, so an absent assembler (NULL) makes every membership of the login a hold rather than hiding them.
WITH l AS (SELECT * FROM pg_roles WHERE rolname=:'login'),
     a AS (SELECT oid FROM pg_roles WHERE rolname='sophia_conversation_assembler'),
     t AS (SELECT oid FROM pg_database WHERE datname=current_database()),
     -- Where a shared dependency is named: a database by its own name, anything else by the database it lives in.
     dep AS (SELECT d.*, CASE WHEN d.classid='pg_database'::regclass
               THEN 'database '||coalesce((SELECT datname FROM pg_database WHERE oid=d.objid),'?')
               ELSE coalesce((SELECT datname FROM pg_database WHERE oid=d.dbid),'(shared)') END AS place
               FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass)
SELECT 'hold' AS kind, 'no such login' AS what WHERE NOT EXISTS(SELECT FROM l)
UNION ALL SELECT 'hold', 'no assembler role' WHERE NOT EXISTS(SELECT FROM a)
UNION ALL SELECT 'hold', 'attribute' FROM l
 WHERE rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR NOT rolcanlogin
UNION ALL SELECT 'hold', 'member of '||m.roleid::regrole FROM pg_auth_members m, l
 WHERE m.member=l.oid AND m.roleid IS DISTINCT FROM (SELECT oid FROM a)
UNION ALL SELECT 'hold', 'assembler edge: admin option or no SET' FROM pg_auth_members m, l
 WHERE m.member=l.oid AND m.roleid=(SELECT oid FROM a) AND (m.admin_option OR NOT m.set_option)
UNION ALL SELECT 'hold', 'not a member of the assembler' FROM l
 WHERE NOT EXISTS(SELECT FROM pg_auth_members m WHERE m.member=l.oid AND m.roleid=(SELECT oid FROM a))
UNION ALL SELECT 'hold', 'the login has a member: '||m.member::regrole FROM pg_auth_members m, l WHERE m.roleid=l.oid
UNION ALL SELECT 'hold', 'the assembler is a member of '||m.roleid::regrole FROM pg_auth_members m, a WHERE m.member=a.oid
-- The login's own dependencies: none, except one ACL entry on the target database itself (checked exactly below).
UNION ALL SELECT 'hold', 'the login '||CASE dep.deptype WHEN 'o' THEN 'owns something in ' ELSE 'holds something in ' END||dep.place
 FROM dep, l, t WHERE dep.refobjid=l.oid
  AND NOT (dep.dbid=0 AND dep.classid='pg_database'::regclass AND dep.objid=t.oid AND dep.deptype='a')
-- That ACL entry is CONNECT alone, without the grant option: no CREATE, TEMPORARY or anything else on the target.
UNION ALL SELECT 'hold', 'on the target database: '||x.privilege_type||CASE WHEN x.is_grantable THEN ' with grant option' ELSE '' END
 FROM pg_database db, aclexplode(db.datacl) x, l, t
 WHERE db.oid=t.oid AND x.grantee=l.oid AND (x.privilege_type<>'CONNECT' OR x.is_grantable)
-- The assembler's: grants in the target alone (no database-level or shared entry), and it owns nothing anywhere.
UNION ALL SELECT 'hold', 'the assembler '||CASE dep.deptype WHEN 'o' THEN 'owns something in ' ELSE 'holds something in ' END||dep.place
 FROM dep, a, t WHERE dep.refobjid=a.oid AND (dep.dbid<>t.oid OR dep.deptype='o')
UNION ALL SELECT 'hold', 'session open in '||coalesce(s.datname,'?')||' (pid '||s.pid||')'
 FROM pg_stat_activity s, l WHERE s.usesysid=l.oid AND s.pid<>pg_backend_pid()
UNION ALL SELECT 'hold', 'admitted to '||d.datname||CASE WHEN has_database_privilege('public', d.oid, 'CONNECT')
   THEN ' (PUBLIC CONNECT)' ELSE ' (granted)' END
 FROM pg_database d, l, t WHERE d.datallowconn AND d.oid<>t.oid AND has_database_privilege(l.oid, d.oid, 'CONNECT');
