-- WBC-02: fence the status writes a previous Paperclip instance never answered (WBC-02-CX-0020, CX-0024).
--
-- A write the host never answered stays open, and no delivery of its commission is confirmed, until it is fenced. The
-- plugin never fences one itself: a statement the previous instance had sent can still be waiting in its database
-- session after the instance died, and commit later. This script ends those sessions first; ending a session rolls back
-- whatever it had not committed. Its steps are tested against PostgreSQL, with a killed client whose statement waits
-- on a lock (packages/paperclip-plugin/src/operator-fence.db.test.ts).
--
-- Run it only after verifying, in the deploy's events, that the previous instance stopped. Connect to Paperclip's
-- database as the role its server uses (its DATABASE_URL), so that the server's sessions are this role's:
--   psql "$PAPERCLIP_DATABASE_URL" -v before='<T>' -v operator='<who, which deploy>' -f fence-previous-instance.sql
-- T is any time after the previous instance stopped and no later than the start of the instance running now. Every
-- step can be run again. The settle job then settles the fenced writes within a minute.

-- step: open
-- The writes still open: begun before T, never answered, not fenced.
SELECT effect_id, commission_key, status, host_namespace, host_process, started_at
  FROM plugin_sophia_coordination_00c896da3d.effects
 WHERE settled_at IS NULL AND ended_at IS NULL AND fenced_at IS NULL AND started_at < :'before'::timestamptz;

-- step: end-sessions
-- The previous instance's database sessions: every session of this role begun before T, but this one. Ending one
-- takes a moment; the next step waits for none to remain.
SELECT pid, backend_start, state, wait_event_type, wait_event, pg_terminate_backend(pid) AS ended
  FROM pg_stat_activity
 WHERE datname = current_database() AND usename = current_user AND pid <> pg_backend_pid()
   AND backend_start < :'before'::timestamptz;

-- step: fence
-- The fence, only while none of those sessions remains: run it again until it reports the writes fenced.
UPDATE plugin_sophia_coordination_00c896da3d.effects
   SET fenced_at = now(),
       fence = 'operator ' || :'operator' || ': previous instance stopped before ' || :'before'
               || '; its database sessions ended'
 WHERE settled_at IS NULL AND ended_at IS NULL AND fenced_at IS NULL AND started_at < :'before'::timestamptz
   AND NOT EXISTS (SELECT 1 FROM pg_stat_activity
                    WHERE datname = current_database() AND usename = current_user AND pid <> pg_backend_pid()
                      AND backend_start < :'before'::timestamptz);
