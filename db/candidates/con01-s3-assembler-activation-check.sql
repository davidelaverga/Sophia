-- CON-01 Q13 activation check: owner-run, read-only, psql -v login=<execution login>.
-- Run with search_path=pg_catalog (for example PGOPTIONS=-csearch_path=pg_catalog).
-- Every returned row holds activation; zero rows plus fresh database admission denials and voluntary settlement
-- of pre-existing sessions are required. Re-run after any admission, role, policy, object or privilege change.
-- This file grants/revokes nothing and terminates no connection. It is not run by the migration runner.
-- Fails closed: a missing login or assembler is a hold, and every membership check compares against the assembler's oid
-- as a scalar, so an absent assembler (NULL) makes every membership of the login a hold rather than hiding them.
WITH l AS (SELECT * FROM pg_roles WHERE rolname=:'login'),
     a AS (SELECT * FROM pg_roles WHERE rolname='sophia_conversation_assembler'),
     t AS (SELECT oid FROM pg_database WHERE datname=current_database()),
     -- D-Q13: the one membership a trusted non-superuser installer cannot avoid, on a role it created fresh (0070's
     -- assembler, a login admitted by conversation_admit_assembler_login): its creator edge, ADMIN, granted by the
     -- bootstrap superuser, no INHERIT, no SET, from postgres owning this database and schema sophia, and recorded on
     -- that role as it was made. No other edge is excused anywhere below.
     fresh(edge) AS (SELECT m.oid FROM pg_auth_members m JOIN pg_roles i ON i.oid=m.member JOIN pg_roles g ON g.oid=m.grantor
       WHERE m.grantor=10 AND g.rolsuper AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
        AND i.rolname='postgres' AND NOT i.rolsuper AND i.oid=(SELECT datdba FROM pg_database WHERE datname=current_database())
        AND EXISTS(SELECT FROM pg_namespace n WHERE n.nspname='sophia' AND n.nspowner=i.oid)
        AND shobj_description(m.roleid,'pg_authid') IS NOT DISTINCT FROM
         'con01-q13-fresh-creator v1 edge='||m.oid||' installer='||m.member),
     -- What the assembler may hold, by name, and nothing else (§3.2, §3.3 and the five entry points). Matched by
     -- schema and name, never by a cast, so a database without schema sophia neither errors nor admits.
     rels(r) AS (VALUES ('commands'),('contributions'),('conversation_messages'),('conversations'),('decisions'),
      ('execution_bindings'),('goals'),('jobs'),('mission_confirmation_targets'),('mission_entries'),
      ('mission_note_consents'),('mission_note_policies'),('native_task_view'),('project_members'),('project_revisions'),
      ('projects'),('source_dependencies'),('source_objects'),('source_texts'),('work_attempts')),
     fns(f) AS (VALUES ('actor_id()'),('is_member(uuid)'),('is_task_kind(text)'),('mission_capture_default()'),
      ('conversation_actor_label(uuid, uuid, text)'),
      ('conversation_assembly_project()'),('conversation_assembly_claim(uuid, integer)'),
      ('conversation_assembly_begin(uuid, integer, uuid)'),('conversation_assembly_close(uuid, integer, uuid, text)'),
      ('conversation_assembly_fail(uuid, integer, uuid, text)'),('conversation_record_context(uuid, integer, uuid, jsonb)')),
     -- Reviewed installed identities, with pg_catalog deparsing. Names/ACLs alone cannot preserve isolation if a
     -- policy, row security, view or SECURITY DEFINER body/owner changes (independent review P1).
     -- Private S3 helpers and triggers are bound too: the entry points run through them. The kept trigger has
     -- exactly two reviewed definitions, S3 and S4; neither identity grants any extra execution privilege.
     fn_defs(f,h) AS (VALUES
      ('sophia.actor_id()','27098852bf55bc01c3c6b938a646491c'),
      ('sophia.actor_label(uuid,uuid,text)','8c748d42671b0a38ad081382766d1ffd'),
      ('sophia.conversation_actor_label(uuid,uuid,text)','7857e0b2f76c2c7757522e82814a8722'),
      ('sophia.conversation_assembly_begin(uuid,integer,uuid)','2dcfc3e89145bfd589bcad27ace97d2c'),
      ('sophia.conversation_assembly_claim(uuid,integer)','cf3f6396296e09db6e6106ea29246b85'),
      ('sophia.conversation_assembly_close(uuid,integer,uuid,text)','f7e4015a596e08ad598ba466408197b2'),
      ('sophia.conversation_assembly_current(sophia.conversation_replies,integer,uuid)','86e5cbaaca4fd81b134ef94c66663811'),
      ('sophia.conversation_assembly_fail(uuid,integer,uuid,text)','21d02695524f4d7ebee5c1ec958c8547'),
      ('sophia.conversation_assembly_locked(uuid,boolean)','5079e5924afc581fdd2a1ea70283c889'),
      ('sophia.conversation_assembly_privacy(sophia.conversation_replies)','c2f06bc7252d7f81dabc85b3783b7b55'),
      ('sophia.conversation_assembly_project()','fb00e3b3acdb8572ccdf56a50a2d0aeb'),
      ('sophia.conversation_context_current(sophia.conversation_reply_contexts)','c2a72312063f95baa244b643bec84781'),
      ('sophia.conversation_context_decision(sophia.projects,text,text)','345d797d1a7db120735516504e3fa628'),
      ('sophia.conversation_context_fields(jsonb)','5107fbecb80c1f94fb5abe6feed9ed76'),
      ('sophia.conversation_context_grammar()','66e38fe53af563146dda545e3e14f387'),
      ('sophia.conversation_context_kept()','834329209d7e8e58df3251fe00506574'),
      ('sophia.conversation_context_list(jsonb,integer,integer,bigint,boolean,boolean)','b3577a4d563cb020d94aec36c2308deb'),
      ('sophia.conversation_context_message(sophia.conversation_replies,uuid,boolean)','5b1d4d0144740dfe6749b181bba2a6aa'),
      ('sophia.conversation_context_message_scrubbed()','ebe2cc860016b02dcb6fa76f997fa7fd'),
      ('sophia.conversation_context_mission(sophia.projects)','79277247fe9f210224170415cf1825c9'),
      ('sophia.conversation_context_quoted(text)','c0e2b18f8e47c8590b21459fb9aca7b9'),
      ('sophia.conversation_context_reply_scrubbed()','8020920837ef31faa4ba83db96a4fe0c'),
      ('sophia.conversation_context_scrub(uuid,uuid,integer,text)','b6a614f67c65c249f368f099e5765fb4'),
      ('sophia.conversation_context_template(text,jsonb)','8db1bae2b5a9d505c47c7e7b310e1cd3'),
      ('sophia.conversation_context_time(timestamp with time zone)','aaf27bfea0dcc8fcfceec04f1b482904'),
      ('sophia.conversation_record_context(uuid,integer,uuid,jsonb)','55f808251fc28192c89d890231a5833b'),
      ('sophia.is_member(uuid)','73e40f4a2d8d6af95f8d414c6c2ee784'),
      ('sophia.is_task_kind(text)','ab5390873bf78035cc94d99466f49d12'),
      ('sophia.kept_name(text)','6206e79ec9c0e29173324e2fb00f85c9'),
      ('sophia.mission_capture_default()','d3212aa604efc9363d7d30e4ee0777a5')),
     -- Exact grantees, grantors and options for the entire reviewed callable chain, not only the assembler's
     -- negative allowlist. Extra API/PUBLIC/peer grants on a SECURITY DEFINER entry point are authority too;
     -- missing required grants must hold instead of making a negative scan silently empty (automatic review).
     fn_acl_expected(f,grantee,grantor,privilege_type,is_grantable) AS (
      SELECT f,'postgres'::text,'postgres'::text,'EXECUTE'::text,false FROM fn_defs
      UNION ALL SELECT 'sophia.'||replace(f,' ',''),'sophia_conversation_assembler','postgres','EXECUTE',false FROM fns
      UNION ALL SELECT f,'sophia_api','postgres','EXECUTE',false FROM fn_defs
       WHERE f IN ('sophia.actor_id()','sophia.is_member(uuid)','sophia.is_task_kind(text)','sophia.mission_capture_default()',
        'sophia.actor_label(uuid,uuid,text)')
      UNION ALL SELECT f,'sophia_worker','postgres','EXECUTE',false FROM fn_defs
       WHERE f IN ('sophia.actor_id()','sophia.is_member(uuid)','sophia.is_task_kind(text)')),
     fn_acl_actual(f,grantee,grantor,privilege_type,is_grantable) AS (
      SELECT e.f,CASE x.grantee WHEN 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END,
       x.grantor::regrole::text,x.privilege_type,x.is_grantable
      FROM fn_defs e JOIN pg_proc p ON p.oid=to_regprocedure(e.f)
       CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x),
     fn_acl_delta AS (
      (SELECT * FROM fn_acl_expected EXCEPT SELECT * FROM fn_acl_actual)
      UNION ALL (SELECT * FROM fn_acl_actual EXCEPT SELECT * FROM fn_acl_expected)),
     trigger_defs(n,r,h) AS (VALUES
      ('conversation_assembly_claims_kept','conversation_assembly_claims','6671e60cf3e32d6eb960205d7d44c3f6'),
      ('conversation_context_message_scrub','conversation_messages','89f7af8328ab7282490c0db0aed9c79d'),
      ('conversation_context_reply_scrub','conversation_replies','6bda093a3c0804feb7c43bd07156dd4e'),
      ('conversation_context_tables_kept','conversation_assembly_claims','220bb27d25b18d378204b634c4807196'),
      ('conversation_context_tables_kept','conversation_reply_contexts','99c01de74eb6c96c75362c2b849f704f'),
      ('conversation_context_tables_kept','conversation_reply_messages','6e6161340ad094ec4f713b544fbae737'),
      ('conversation_context_tables_kept','conversation_reply_sources','6e3b4e58553d1dfb929d714d81a6f063'),
      ('conversation_reply_contexts_kept','conversation_reply_contexts','3dfe10eab960e0ccaf0cd5018d5e0371'),
      ('conversation_reply_messages_kept','conversation_reply_messages','90a70d4dc67720d9a00cfdf68250b38d'),
      ('conversation_reply_sources_kept','conversation_reply_sources','ecc9d9b73fa1b68b706dd3b05d682a27')),
     shared_quals(r,h) AS (SELECT r,CASE r
      WHEN 'projects' THEN '2755e13246aa841a78d079f595642542'
      WHEN 'conversation_messages' THEN 'e76fc23de87f4b338688e22f5ab4d6b1'
      WHEN 'conversations' THEN '8c39e31aa575d8d6bb545db05993ba6b'
      WHEN 'source_objects' THEN 'aafc1899b46eebed028871abe57807d2'
      WHEN 'source_texts' THEN '088c91c8879bb4247da7f13658543709'
      ELSE 'c6b5d3e81ef41aae94b11f678470fa70' END FROM rels WHERE r<>'native_task_view'),
     expected_policies(r,p,cmd,permissive,roles,q,wc) AS (
      SELECT q.r, CASE q.r WHEN 'source_objects' THEN 'eligible_sources_read'
       WHEN 'source_texts' THEN 'readable_source' ELSE 'members_read' END,
       'r', true, ARRAY['sophia_api','sophia_conversation_assembler'],q.h,'d41d8cd98f00b204e9800998ecf8427e' FROM shared_quals q
      UNION ALL SELECT r,'con01_assembly_bound','r',false,ARRAY['sophia_conversation_assembler'],
       CASE r WHEN 'projects' THEN 'c7ba3ce0ff80edadaee72f413efd45f5' ELSE 'b31f230c3af4ec22166bcb9bb8f3784a' END,
       'd41d8cd98f00b204e9800998ecf8427e' FROM shared_quals),
     actual_policies(r,p,cmd,permissive,roles,q,wc) AS (
      SELECT c.relname::text,p.polname::text,p.polcmd::text,p.polpermissive,
       ARRAY(SELECT x::regrole::text FROM unnest(p.polroles) x ORDER BY x::regrole::text COLLATE "C"),
       md5(coalesce(pg_get_expr(p.polqual,p.polrelid),'')),md5(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''))
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='sophia' AND c.relname IN (SELECT r FROM rels) AND p.polcmd IN ('r','*')),
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
 AND m.oid NOT IN (SELECT edge FROM fresh)
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
-- Positive availability and complete callable ACL equality supplement the excess-authority checks above.
UNION ALL SELECT 'hold','required: function ACL changed: '||f||' / '||grantee FROM fn_acl_delta
UNION ALL SELECT 'hold','required: assembler SELECT on sophia.'||r.r
 FROM rels r CROSS JOIN a LEFT JOIN pg_namespace n ON n.nspname='sophia'
 LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=r.r
 WHERE c.oid IS NULL OR NOT has_table_privilege(a.oid,c.oid,'SELECT')
UNION ALL SELECT 'hold','required: assembler USAGE on schema sophia'
 FROM a WHERE NOT EXISTS(SELECT FROM pg_namespace n WHERE n.nspname='sophia' AND has_schema_privilege(a.oid,n.oid,'USAGE'))
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
 WHERE m.roleid=a.oid AND m.oid NOT IN (SELECT edge FROM fresh)
  AND (NOT r.rolcanlogin OR r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole
   OR r.rolreplication OR m.admin_option OR EXISTS(SELECT FROM pg_auth_members o WHERE o.member=r.oid AND o.roleid<>a.oid)
   OR EXISTS(SELECT FROM pg_auth_members o WHERE o.roleid=r.oid AND o.oid NOT IN (SELECT edge FROM fresh)))
UNION ALL SELECT 'hold', 'session open in '||coalesce(s.datname,'?')||' (pid '||s.pid||')'
 FROM pg_stat_activity s, l WHERE s.usesysid=l.oid AND s.pid<>pg_backend_pid()
UNION ALL SELECT 'hold', 'admitted to '||d.datname||CASE WHEN has_database_privilege('public', d.oid, 'CONNECT')
   THEN ' (PUBLIC CONNECT)' ELSE ' (granted)' END
 FROM pg_database d, l, t WHERE d.datallowconn AND d.oid<>t.oid AND has_database_privilege(l.oid, d.oid, 'CONNECT')
-- This qualification deliberately binds the existing installation owner postgres. A different owner or PostgreSQL
-- major needs a reviewed identity, never silent adoption. Function definitions do not include their owner.
UNION ALL SELECT 'hold','semantic: use search_path pg_catalog for the reviewed identities'
 WHERE current_setting('search_path')<>'pg_catalog'
UNION ALL SELECT 'hold','semantic: PostgreSQL major not reviewed'
 WHERE current_setting('server_version_num')::int/10000 NOT IN (16,17)
UNION ALL SELECT 'hold','semantic: schema owner changed or schema missing'
 WHERE NOT EXISTS(SELECT FROM pg_namespace n JOIN pg_roles o ON o.oid=n.nspowner WHERE n.nspname='sophia' AND o.rolname='postgres')
UNION ALL SELECT 'hold','semantic: row security or relation identity changed: '||r.r
 FROM rels r LEFT JOIN pg_namespace n ON n.nspname='sophia' LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=r.r
 LEFT JOIN pg_roles o ON o.oid=c.relowner
 WHERE c.oid IS NULL OR o.rolname IS DISTINCT FROM 'postgres'
    OR (r.r<>'native_task_view' AND (c.relkind<>'r' OR NOT c.relrowsecurity OR c.relforcerowsecurity))
UNION ALL SELECT 'hold','semantic: read policies changed'
 WHERE EXISTS((SELECT * FROM expected_policies EXCEPT SELECT * FROM actual_policies)
    UNION ALL (SELECT * FROM actual_policies EXCEPT SELECT * FROM expected_policies))
UNION ALL SELECT 'hold','semantic: native task view changed'
 WHERE (SELECT md5(pg_get_viewdef(c.oid))||' '||array_to_string(c.reloptions,',') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='sophia' AND c.relname='native_task_view' AND c.relkind='v')
    IS DISTINCT FROM 'c0d03ea473637eab9be98b68e0216d65 security_barrier=true,security_invoker=true'
UNION ALL SELECT 'hold','semantic: function definition or owner changed: '||e.f
 FROM fn_defs e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.f) LEFT JOIN pg_roles o ON o.oid=p.proowner
 WHERE p.oid IS NULL OR o.rolname IS DISTINCT FROM 'postgres' OR (md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM e.h
      AND NOT (e.f='sophia.conversation_context_kept()' AND md5(pg_get_functiondef(p.oid))='d9d7573af29ebe996dceee4d3fe338f4'))


UNION ALL SELECT 'hold','semantic: trigger registration or enabled state changed: '||e.r||'.'||e.n
 FROM trigger_defs e LEFT JOIN pg_namespace n ON n.nspname='sophia' LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.r
 LEFT JOIN pg_trigger g ON g.tgrelid=c.oid AND g.tgname=e.n
 WHERE g.oid IS NULL OR g.tgisinternal OR g.tgenabled<>'O' OR md5(pg_get_triggerdef(g.oid)) IS DISTINCT FROM e.h;
