-- Fails closed: a missing login or assembler is a hold, and every membership check compares against the assembler's oid
-- as a scalar, so an absent assembler (NULL) makes every membership of the login a hold rather than hiding them.
WITH l AS (SELECT * FROM pg_roles WHERE rolname=:'login'),
     a AS (SELECT * FROM pg_roles WHERE rolname='sophia_conversation_assembler'),
     t AS (SELECT oid FROM pg_database WHERE datname=current_database()),
     -- What the assembler may hold, by name, and nothing else (§3.2, §3.3 and the five entry points). Matched by
     -- schema and name, never by a cast, so a database without schema sophia neither errors nor admits.
     rels(r) AS (VALUES ('commands'),('contributions'),('conversation_messages'),('conversations'),('decisions'),
      ('execution_bindings'),('goals'),('jobs'),('mission_confirmation_targets'),('mission_entries'),
      ('mission_note_consents'),('mission_note_policies'),('native_task_view'),('project_members'),('project_revisions'),
      ('projects'),('source_dependencies'),('source_objects'),('source_texts'),('work_attempts')),
     fns(f) AS (VALUES ('actor_id()'),('is_member(uuid)'),('is_task_kind(text)'),('mission_capture_default()'),
      ('conversation_assembly_project()'),('conversation_assembly_claim(uuid, integer)'),
      ('conversation_assembly_begin(uuid, integer, uuid)'),('conversation_assembly_close(uuid, integer, uuid, text)'),
      ('conversation_assembly_fail(uuid, integer, uuid, text)'),('conversation_record_context(uuid, integer, uuid, jsonb)')),
     pols(r, p) AS (SELECT r, CASE r WHEN 'source_objects' THEN 'eligible_sources_read'
       WHEN 'source_texts' THEN 'readable_source' ELSE 'members_read' END FROM rels WHERE r<>'native_task_view'
      UNION ALL SELECT r, 'con01_assembly_bound' FROM rels WHERE r<>'native_task_view'),
     -- Where a shared dependency is named: a database by its own name, anything else by the database it lives in.
     dep AS (SELECT d.*, CASE WHEN d.classid='pg_database'::regclass
               THEN 'database '||coalesce((SELECT datname FROM pg_database WHERE oid=d.objid),'?')
               ELSE coalesce((SELECT datname FROM pg_database WHERE oid=d.dbid),'(shared)') END AS place
               FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass),
     -- Who acts: the login, and the assembler it may SET ROLE to. Where: every schema but PostgreSQL's own.
     w(oid, who) AS (SELECT oid, 'the login' FROM l UNION ALL SELECT oid, 'the assembler' FROM a),
     ns AS (SELECT oid, nspname FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema')
              AND nspname !~ '^pg_(toast|temp_|toast_temp_)'),
     -- What each may actually do there, as the server computes it (a grant to PUBLIC, a default ACL and a membership
     -- all count), and whether PUBLIC alone may. Each privilege is asked only where it exists (MAINTAIN from 17).
     eff(who, what, pub) AS (
      SELECT w.who, x.p||' on '||n.nspname||'.'||c.relname,
             CASE WHEN x.p IN ('SELECT','INSERT','UPDATE','REFERENCES') THEN has_any_column_privilege('public', c.oid, x.p)
                  ELSE has_table_privilege('public', c.oid, x.p) END
        FROM pg_class c JOIN ns n ON n.oid=c.relnamespace CROSS JOIN w
        CROSS JOIN LATERAL unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']
          ||CASE WHEN current_setting('server_version_num')::int>=170000 THEN ARRAY['MAINTAIN'] ELSE '{}' END) x(p)
       WHERE c.relkind IN ('r','p','v','m','f')
         AND CASE WHEN x.p IN ('SELECT','INSERT','UPDATE','REFERENCES') THEN has_any_column_privilege(w.oid, c.oid, x.p)
                  ELSE has_table_privilege(w.oid, c.oid, x.p) END
         AND NOT (n.nspname='sophia' AND c.relname IN (SELECT r FROM rels) AND x.p='SELECT')
      UNION ALL SELECT w.who, x.p||' on sequence '||n.nspname||'.'||c.relname, has_sequence_privilege('public', c.oid, x.p)
        FROM pg_class c JOIN ns n ON n.oid=c.relnamespace CROSS JOIN w CROSS JOIN unnest(ARRAY['USAGE','SELECT','UPDATE']) x(p)
       WHERE c.relkind='S' AND has_sequence_privilege(w.oid, c.oid, x.p)
      -- A trigger or event trigger function cannot be called, so EXECUTE on one is no authority.
      UNION ALL SELECT w.who, 'EXECUTE '||n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')',
             has_function_privilege('public', p.oid, 'EXECUTE')
        FROM pg_proc p JOIN ns n ON n.oid=p.pronamespace CROSS JOIN w
       WHERE p.prorettype NOT IN ('trigger'::regtype, 'event_trigger'::regtype) AND has_function_privilege(w.oid, p.oid, 'EXECUTE')
         AND NOT (n.nspname='sophia' AND p.proname||'('||oidvectortypes(p.proargtypes)||')' IN (SELECT f FROM fns))
      UNION ALL SELECT w.who, 'CREATE on schema '||n.nspname, has_schema_privilege('public', n.oid, 'CREATE')
        FROM pg_namespace n CROSS JOIN w WHERE has_schema_privilege(w.oid, n.oid, 'CREATE')
      -- TEMPORARY too: a temporary table can shadow a relation a function names without its schema.
      UNION ALL SELECT w.who, x.p||' on the target database', has_database_privilege('public', t.oid, x.p)
        FROM t CROSS JOIN w CROSS JOIN unnest(ARRAY['CREATE','TEMPORARY']) x(p) WHERE has_database_privilege(w.oid, t.oid, x.p)
      UNION ALL SELECT w.who, x.privilege_type||' on large object '||m.oid, x.grantee=0
        FROM pg_largeobject_metadata m CROSS JOIN LATERAL aclexplode(coalesce(m.lomacl, acldefault('L', m.lomowner))) x
        CROSS JOIN w WHERE x.grantee IN (0, w.oid)
      UNION ALL SELECT w.who, 'read and write every large object (lo_compat_privileges)', true
        FROM w WHERE current_setting('lo_compat_privileges')::boolean
      UNION ALL SELECT w.who, 'USAGE on foreign-data wrapper '||f.fdwname, has_foreign_data_wrapper_privilege('public', f.oid, 'USAGE')
        FROM pg_foreign_data_wrapper f CROSS JOIN w WHERE has_foreign_data_wrapper_privilege(w.oid, f.oid, 'USAGE')
      UNION ALL SELECT w.who, 'USAGE on server '||s.srvname, has_server_privilege('public', s.oid, 'USAGE')
        FROM pg_foreign_server s CROSS JOIN w WHERE has_server_privilege(w.oid, s.oid, 'USAGE')
      UNION ALL SELECT w.who, x.privilege_type||' on parameter '||g.parname, x.grantee=0
        FROM pg_parameter_acl g CROSS JOIN LATERAL aclexplode(g.paracl) x CROSS JOIN w WHERE x.grantee IN (0, w.oid))
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
-- The assembler's own authority, exactly (CX-0131: BYPASSRLS drift): no attribute; on relations, SELECT on the 20 alone;
-- no column grant; EXECUTE on the 10 alone; USAGE on schema sophia alone; no grant option anywhere; named only by the
-- 38 reviewed policies; and no dependency of any other kind (types, languages, default privileges, large objects…).
UNION ALL SELECT 'hold', 'the assembler has '||concat_ws(', ', CASE WHEN rolsuper THEN 'SUPERUSER' END,
   CASE WHEN rolbypassrls THEN 'BYPASSRLS' END, CASE WHEN rolcanlogin THEN 'LOGIN' END, CASE WHEN rolcreatedb THEN 'CREATEDB' END,
   CASE WHEN rolcreaterole THEN 'CREATEROLE' END, CASE WHEN rolreplication THEN 'REPLICATION' END)
 FROM a WHERE rolsuper OR rolbypassrls OR rolcanlogin OR rolcreatedb OR rolcreaterole OR rolreplication
UNION ALL SELECT 'hold', 'the assembler may '||x.privilege_type||' on '||n.nspname||'.'||c.relname
   ||CASE WHEN x.is_grantable THEN ' with grant option' ELSE '' END
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) x, a
 WHERE x.grantee=a.oid AND NOT (n.nspname='sophia' AND c.relname IN (SELECT r FROM rels)
   AND x.privilege_type='SELECT' AND NOT x.is_grantable)
UNION ALL SELECT 'hold', 'the assembler may '||x.privilege_type||' on column '||c.relname||'.'||att.attname
 FROM pg_attribute att JOIN pg_class c ON c.oid=att.attrelid CROSS JOIN LATERAL aclexplode(att.attacl) x, a
 WHERE x.grantee=a.oid
UNION ALL SELECT 'hold', 'the assembler may EXECUTE '||n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')'
   ||CASE WHEN x.is_grantable THEN ' with grant option' ELSE '' END
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(p.proacl) x, a
 WHERE x.grantee=a.oid AND NOT (n.nspname='sophia' AND p.proname||'('||oidvectortypes(p.proargtypes)||')' IN (SELECT f FROM fns)
   AND NOT x.is_grantable)
UNION ALL SELECT 'hold', 'the assembler may '||x.privilege_type||' on schema '||n.nspname
   ||CASE WHEN x.is_grantable THEN ' with grant option' ELSE '' END
 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) x, a
 WHERE x.grantee=a.oid AND NOT (n.nspname='sophia' AND x.privilege_type='USAGE' AND NOT x.is_grantable)
UNION ALL SELECT 'hold', 'a policy names the assembler: '||p.polname||' on '||n.nspname||'.'||c.relname
 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace, a
 WHERE a.oid=ANY(p.polroles) AND NOT (n.nspname='sophia' AND (c.relname::text, p.polname::text) IN (SELECT r, p FROM pols))
UNION ALL SELECT 'hold', 'the assembler holds something of another kind in '||dep.place
 FROM dep, a WHERE dep.refobjid=a.oid AND dep.classid NOT IN ('pg_class'::regclass, 'pg_namespace'::regclass,
   'pg_proc'::regclass, 'pg_policy'::regclass)
-- Effective authority (CX-0132: PUBLIC EXECUTE on sophia.create_project passed r4, whose checks named the assembler
-- alone): nothing beyond the allowlist, however it is held. USAGE on a schema, a type or a trusted language grants
-- nothing by itself and stays, as do PostgreSQL's own defaults in pg_catalog and information_schema.
UNION ALL SELECT 'hold', 'effective: '||string_agg(who, ' and ' ORDER BY who DESC)||' may '||what
   ||CASE WHEN bool_or(pub) THEN ' (PUBLIC)' ELSE '' END
 FROM eff GROUP BY what
-- Those defaults are kept, not widened: a function PostgreSQL withholds from PUBLIC executable by PUBLIC, PUBLIC
-- writing a system relation (pg_settings aside), or reading one PostgreSQL keeps from PUBLIC (as on 16).
UNION ALL SELECT 'hold', 'PUBLIC may EXECUTE '||n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')'
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('pg_catalog','information_schema') AND p.proacl IS NOT NULL
   AND has_function_privilege('public', p.oid, 'EXECUTE')
UNION ALL SELECT 'hold', 'PUBLIC may '||x.privilege_type||' on '||n.nspname||'.'||c.relname
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) x
 WHERE n.nspname IN ('pg_catalog','information_schema') AND x.grantee=0
   AND (x.privilege_type NOT IN ('SELECT','UPDATE') OR (x.privilege_type='UPDATE' AND c.relname<>'pg_settings')
     OR (x.privilege_type='SELECT' AND n.nspname='pg_catalog' AND c.relname IN ('pg_authid','pg_backend_memory_contexts',
       'pg_config','pg_file_settings','pg_hba_file_rules','pg_ident_file_mappings','pg_largeobject',
       'pg_replication_origin_status','pg_shadow','pg_shmem_allocations','pg_statistic','pg_statistic_ext_data',
       'pg_subscription','pg_user_mapping')))
-- Every identity that can act as the assembler, not only this login: each member must be a bare login.
UNION ALL SELECT 'hold', 'a member of the assembler is not a bare login: '||r.rolname
 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member, a
 WHERE m.roleid=a.oid AND (NOT r.rolcanlogin OR r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole
   OR r.rolreplication OR m.admin_option OR EXISTS(SELECT FROM pg_auth_members o WHERE o.member=r.oid AND o.roleid<>a.oid)
   OR EXISTS(SELECT FROM pg_auth_members o WHERE o.roleid=r.oid))
UNION ALL SELECT 'hold', 'session open in '||coalesce(s.datname,'?')||' (pid '||s.pid||')'
 FROM pg_stat_activity s, l WHERE s.usesysid=l.oid AND s.pid<>pg_backend_pid()
UNION ALL SELECT 'hold', 'admitted to '||d.datname||CASE WHEN has_database_privilege('public', d.oid, 'CONNECT')
   THEN ' (PUBLIC CONNECT)' ELSE ' (granted)' END
 FROM pg_database d, l, t WHERE d.datallowconn AND d.oid<>t.oid AND has_database_privilege(l.oid, d.oid, 'CONNECT');
