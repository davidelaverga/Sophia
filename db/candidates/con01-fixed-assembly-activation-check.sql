-- CON-01 FIXED assembly activation check (0084, FND-B-ASK-ALTERNATIVE-01): owner-run, read-only, no variables.
-- Run with search_path=pg_catalog (for example PGOPTIONS=-csearch_path=pg_catalog).
-- Every returned row holds the fixed mode's activation; zero rows are required, and so is re-running after any role,
-- policy, object or privilege change. It grants, revokes and terminates nothing; no migration runner applies it.
-- It sits BESIDE the login route's Q13 check (con01-s3-assembler-activation-check.sql), which is unchanged, stays that
-- route's gate and is not passed by this one. What differs, and why (the stated policy change, not a Q13 result):
-- * There is no execution login to check. Instead no session may act as the assembler at all: it is a bare NOLOGIN
--   role, a member of nothing, with no member but its recorded D-Q13 creator edge. Its privileges, PUBLIC-derived ones
--   included (TEMP, routine EXECUTE, CONNECT anywhere), are therefore exercised only inside its eight fixed readers,
--   whose definitions are bound below; PUBLIC-derived authority is not held here, as the login route's check holds it.
-- * Its explicit grants are the login route's allowlist plus EXECUTE on conversation_assembly_bind and
--   conversation_assembly_reader; it owns the eight readers (0084) and nothing else, anywhere.
-- * sophia_worker holds EXECUTE on the five entry points and the eight readers; every reviewed callable's ACL is exact.
-- Every shared reviewed identity (relations, row security, policies, view, triggers, function definitions) is the
-- login route's, byte for byte, plus the 0084 functions. Fails closed: a missing role or object is a hold.
WITH a AS (SELECT * FROM pg_roles WHERE rolname='sophia_conversation_assembler'),
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
      ('conversation_assembly_fail(uuid, integer, uuid, text)'),('conversation_record_context(uuid, integer, uuid, jsonb)'),
      ('conversation_assembly_bind(uuid, integer, uuid)'),('conversation_assembly_reader()')),
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
      ('sophia.mission_capture_default()','d3212aa604efc9363d7d30e4ee0777a5'),
      ('sophia.conversation_assembly_bind(uuid,integer,uuid)','b590ef3f16bc41001f0b556bc77bea54'),
      ('sophia.conversation_assembly_reader()','bb3d0b9c618761ec3847201300c7b7cd'),
      ('sophia.conversation_assembler_admitted()','edbde52747c0a279cd36678631e6d4a7'),
      ('sophia.conversation_fixed_assembly_selected()','19ed4297589bc604604f9f82483a2520'),
      ('sophia.conversation_fixed_assembly_whole()','59260f4e0ed726e56a5f566922b5e96b')),
     -- The eight fixed readers (0084), owned by the assembler; any other definition holds.
     reader_defs(f,h) AS (VALUES
      ('sophia.conversation_assembly_count_entries(uuid,integer,uuid,text)','0cc657ab6ff2ffd2ec5f78e1214525d6'),
      ('sophia.conversation_assembly_has_history(uuid,integer,uuid)','54ca809a3c47028f32dd406954ed1099'),
      ('sophia.conversation_assembly_read_decisions(uuid,integer,uuid,text)','3379c64dc16766412d75761e23ed92d1'),
      ('sophia.conversation_assembly_read_entries(uuid,integer,uuid,text)','be67a7f83ad7330c4fa2b3750a30eb6e'),
      ('sophia.conversation_assembly_read_note_policy(uuid,integer,uuid)','0b4bb4d4748fa8cfdf219aca381bd753'),
      ('sophia.conversation_assembly_read_project(uuid,integer,uuid)','11038e37a86198e78363f5f5bd74e293'),
      ('sophia.conversation_assembly_read_window(uuid,integer,uuid)','dd6e864340a8dfd95cc1a488ff5cf3c3'),
      ('sophia.conversation_assembly_read_work(uuid,integer,uuid)','247eb6ec1ba22b450e8cf55d3bddd1e7')),
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
       WHERE f IN ('sophia.actor_id()','sophia.is_member(uuid)','sophia.is_task_kind(text)',
        'sophia.conversation_assembly_claim(uuid,integer)','sophia.conversation_assembly_begin(uuid,integer,uuid)',
        'sophia.conversation_assembly_close(uuid,integer,uuid,text)','sophia.conversation_assembly_fail(uuid,integer,uuid,text)',
        'sophia.conversation_record_context(uuid,integer,uuid,jsonb)')
      UNION ALL SELECT f,'sophia_conversation_assembler','sophia_conversation_assembler','EXECUTE',false FROM reader_defs
      UNION ALL SELECT f,'sophia_worker','sophia_conversation_assembler','EXECUTE',false FROM reader_defs),
     fn_acl_actual(f,grantee,grantor,privilege_type,is_grantable) AS (
      SELECT e.f,CASE x.grantee WHEN 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END,
       x.grantor::regrole::text,x.privilege_type,x.is_grantable
      FROM (SELECT f FROM fn_defs UNION ALL SELECT f FROM reader_defs) e JOIN pg_proc p ON p.oid=to_regprocedure(e.f)
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
               FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass)

SELECT 'hold' AS kind, 'no assembler role' AS what WHERE NOT EXISTS(SELECT FROM a)
UNION ALL SELECT 'hold', 'not enabled or not whole: conversation_assembler_admitted() is not true for the fixed mode'
 WHERE NOT coalesce((SELECT sophia.conversation_fixed_assembly_selected() AND sophia.conversation_assembler_admitted()),false)
-- No session can act as the assembler: no member but the recorded creator edge, and it belongs to nothing.
UNION ALL SELECT 'hold', 'a role can act as the assembler: '||m.member::regrole||CASE WHEN r.rolcanlogin THEN ' (a login)' ELSE '' END
 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member, a WHERE m.roleid=a.oid AND m.oid NOT IN (SELECT edge FROM fresh)
UNION ALL SELECT 'hold', 'the assembler is a member of '||m.roleid::regrole FROM pg_auth_members m, a WHERE m.member=a.oid
-- It owns the eight readers and nothing else, anywhere; it holds grants in the target database alone.
UNION ALL SELECT 'hold', 'the assembler owns something besides its readers in '||dep.place
 FROM dep, a, t WHERE dep.refobjid=a.oid AND dep.deptype='o'
  AND NOT (dep.dbid=t.oid AND dep.classid='pg_proc'::regclass
   AND dep.objid IN (SELECT to_regprocedure(f)::oid FROM reader_defs))
UNION ALL SELECT 'hold', 'the assembler holds something in '||dep.place
 FROM dep, a, t WHERE dep.refobjid=a.oid AND dep.deptype<>'o' AND dep.dbid<>t.oid
-- The assembler's own explicit authority, exactly (CX-0131: BYPASSRLS drift): no attribute; on relations, SELECT on the 20 alone;
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
   -- Its own EXECUTE as the owner of one of its eight readers (whose ACL is bound exactly below) is not a grant to hold.
   AND NOT (p.proowner=a.oid AND x.grantor=a.oid AND p.oid IN (SELECT to_regprocedure(f)::oid FROM reader_defs))
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
UNION ALL SELECT 'hold','semantic: reader definition or owner changed: '||e.f
 FROM reader_defs e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.f) LEFT JOIN pg_roles o ON o.oid=p.proowner
 WHERE p.oid IS NULL OR o.rolname IS DISTINCT FROM 'sophia_conversation_assembler' OR NOT p.prosecdef
    OR md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM e.h
UNION ALL SELECT 'hold','semantic: function definition or owner changed: '||e.f
 FROM fn_defs e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.f) LEFT JOIN pg_roles o ON o.oid=p.proowner
 WHERE p.oid IS NULL OR o.rolname IS DISTINCT FROM 'postgres' OR (md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM e.h
      AND NOT (e.f='sophia.conversation_context_kept()' AND md5(pg_get_functiondef(p.oid))='d9d7573af29ebe996dceee4d3fe338f4'))


UNION ALL SELECT 'hold','semantic: trigger registration or enabled state changed: '||e.r||'.'||e.n
 FROM trigger_defs e LEFT JOIN pg_namespace n ON n.nspname='sophia' LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.r
 LEFT JOIN pg_trigger g ON g.tgrelid=c.oid AND g.tgname=e.n
 WHERE g.oid IS NULL OR g.tgisinternal OR g.tgenabled<>'O' OR md5(pg_get_triggerdef(g.oid)) IS DISTINCT FROM e.h;
