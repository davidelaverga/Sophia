#!/bin/sh
# Q13's exclusive admission and install groups on a PostgreSQL 16 cluster this script owns (V-CON-q02-PG16 proposal),
# then D-Q13's trusted-creator group on a second one shaped like hosted Supabase: its bootstrap superuser is not
# postgres, and postgres is a plain CREATEROLE/CREATEDB login that installs and admits.
# It runs INSIDE the CI database job's own postgres:16 image, started by scripts/q13-owned-pg16.sh with no network, as
# the image's unprivileged postgres user, the repository read-only at /work and the job's Node 24 at /opt/node. So the
# cluster's data directory, its 0700 parent and the Node process share one filesystem and one UID, as the tests'
# unchanged requireOwned() demands; nothing about the job's ordinary service is changed or reused.
# Each failed precondition or census line is printed; the exit is 1 on any, and the cluster is stopped either way.
set -eu
umask 077
export HOME=/tmp
port=55499
fail=0
no() {
  printf 'Q13_OWNED_PG16 failed: %s\n' "$1"
  fail=1
}
root=$(mktemp -d /tmp/con01-q13-owned-pg-XXXXXX)
root2=$(mktemp -d /tmp/con01-q13-owned-pg-XXXXXX)
started=0
started2=0
cleanup() {
  status=$?
  if [ "$started" = 1 ]; then
    if [ "$status" != 0 ] || [ "$fail" != 0 ]; then tail -n 40 "$root/server.log" || true; fi
    pg_ctl -D "$root/data" -m fast -w stop >/dev/null || true
  fi
  if [ "$started2" = 1 ]; then
    if [ "$status" != 0 ] || [ "$fail" != 0 ]; then tail -n 40 "$root2/server.log" || true; fi
    pg_ctl -D "$root2/data" -m fast -w stop >/dev/null || true
  fi
  rm -rf "$root" "$root2"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

initdb -D "$root/data" -U postgres -A trust --encoding=UTF8 --no-locale >/dev/null
pg_ctl -D "$root/data" -l "$root/server.log" -o "-h 127.0.0.1 -p $port -k $root" -w start >/dev/null
started=1
q() { psql -h 127.0.0.1 -p "$port" -U postgres -d postgres -X -At -v ON_ERROR_STOP=1 -c "$1"; }

# Entry: PostgreSQL 16, this cluster's directory, owned by this UID at 0700, and nothing in it but its defaults.
version=$(q "SELECT current_setting('server_version_num')")
datadir=$(q "SELECT current_setting('data_directory')")
owner_mode=$(stat -c '%u %a' "$root")
printf 'Q13_OWNED_PG16 entry: version_num=%s server=%s node=%s uid=%s parent=%s data_directory=%s\n' \
  "$version" "$(q 'SHOW server_version')" "$(/opt/node --version)" "$(id -u)" "$owner_mode" "$datadir"
case "$version" in 16????) ;; *) no "server_version_num $version is not PostgreSQL 16" ;; esac
[ "$datadir" = "$root/data" ] || no "data_directory $datadir is not $root/data"
[ "$owner_mode" = "$(id -u) 700" ] || no "the cluster's parent is $owner_mode, not $(id -u) 700"
census() {
  printf 'Q13_OWNED_PG16 %s: databases=%s logins=%s clients=%s\n' "$1" \
    "$(q "SELECT coalesce(string_agg(datname,',' ORDER BY datname),'') FROM pg_database WHERE datname NOT IN ('postgres','template0','template1')")" \
    "$(q "SELECT coalesce(string_agg(rolname,',' ORDER BY rolname),'') FROM pg_roles WHERE rolcanlogin AND rolname<>'postgres'")" \
    "$(q "SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()")"
}
entry=$(census entry)
printf '%s\n' "$entry"
[ "$entry" = 'Q13_OWNED_PG16 entry: databases= logins= clients=0' ] || no 'the cluster is not fresh'
[ "$fail" = 0 ] || exit 1

# Both groups, run for real: their own requireOwned() checks this cluster again. A skip or a missing stage fails.
out="$root/tests.log"
set +e
SOPHIA_DISPOSABLE_DATABASE_URL="postgres://postgres@127.0.0.1:$port/postgres" \
  SOPHIA_Q13_OWNED_CLUSTER=con01-q13-exclusive-v1 \
  /opt/node --test --test-reporter=spec --test-concurrency=1 --test-timeout=180000 \
  packages/persistence/src/conversation-assembler-admission.db.test.ts \
  packages/persistence/src/conversation-assembler-install.db.test.ts >"$out" 2>&1
tests=$?
set -e
cat "$out"
[ "$tests" = 0 ] || no "the tests exited $tests"
for line in 'ℹ tests 7' 'ℹ pass 7' 'ℹ fail 0' 'ℹ skipped 0' 'ℹ cancelled 0' \
  '✔ Q13 exclusive owned-cluster admission and activation (L1, no hosted effects)' \
  '✔ Q13 exclusive admission over the migrated schema (0070; L1, no hosted effects)' \
  '✔ 0070 installs the assembler role once per cluster (Q13 guard, R-Q13-01)' \
  'ℹ admitted, no session: ' 'ℹ admitted, old session open: ' 'ℹ revoked, old session open: ' \
  'ℹ revoked, old session closed: []'; do
  grep -qF -- "$line" "$out" || no "missing from the test output: $line"
done
if grep -q '# SKIP' "$out"; then no 'a test or group was skipped'; fi

# Exit: no test database, login or client left, and the assembler role, where a migration left it, bare.
exit_census=$(census exit)
printf '%s\n' "$exit_census"
[ "$exit_census" = 'Q13_OWNED_PG16 exit: databases= logins= clients=0' ] || no 'the tests left something behind'
assembler=$(q "SELECT count(*) FROM pg_auth_members m JOIN pg_roles a ON a.oid IN (m.roleid,m.member) WHERE a.rolname='sophia_conversation_assembler'")/$(q "SELECT count(*) FROM pg_shdepend d JOIN pg_roles a ON a.oid=d.refobjid WHERE d.refclassid='pg_authid'::regclass AND a.rolname='sophia_conversation_assembler'")
printf 'Q13_OWNED_PG16 exit: assembler memberships/dependencies=%s\n' "$assembler"
[ "$assembler" = 0/0 ] || no "the assembler role is not bare after the tests ($assembler)"
pg_ctl -D "$root/data" -m fast -w stop >/dev/null
started=0
[ "$fail" = 0 ] || exit 1

# D-Q13: the second cluster, its own 0700 directory and port. Its bootstrap superuser (OID 10) is q13_bootstrap; postgres
# is made a plain installer, as the hosted one is, and runs the trusted-creator group with that group's own marker.
port2=55500
initdb -D "$root2/data" -U q13_bootstrap -A trust --encoding=UTF8 --no-locale >/dev/null
pg_ctl -D "$root2/data" -l "$root2/server.log" -o "-h 127.0.0.1 -p $port2 -k $root2" -w start >/dev/null
started2=1
b() { psql -h 127.0.0.1 -p "$port2" -U q13_bootstrap -d postgres -X -At -v ON_ERROR_STOP=1 -c "$1"; }
b 'CREATE ROLE postgres LOGIN NOSUPERUSER CREATEROLE CREATEDB BYPASSRLS REPLICATION' >/dev/null
census2() {
  printf 'Q13_OWNED_PG16 trusted-creator %s: databases=%s logins=%s clients=%s assembler=%s\n' "$1" \
    "$(b "SELECT coalesce(string_agg(datname,',' ORDER BY datname),'') FROM pg_database WHERE datname NOT IN ('postgres','template0','template1')")" \
    "$(b "SELECT coalesce(string_agg(rolname,',' ORDER BY rolname),'') FROM pg_roles WHERE rolcanlogin AND rolname NOT IN ('postgres','q13_bootstrap')")" \
    "$(b "SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()")" \
    "$(b "SELECT count(*) FROM pg_roles WHERE rolname='sophia_conversation_assembler'")"
}
printf 'Q13_OWNED_PG16 trusted-creator entry: version_num=%s installer=%s data_directory=%s\n' \
  "$(b "SELECT current_setting('server_version_num')")" \
  "$(b "SELECT rolname||' super='||rolsuper||' createrole='||rolcreaterole FROM pg_roles WHERE rolname='postgres'")" \
  "$(b "SELECT current_setting('data_directory')")"
entry2=$(census2 entry)
printf '%s\n' "$entry2"
[ "$entry2" = 'Q13_OWNED_PG16 trusted-creator entry: databases= logins= clients=0 assembler=0' ] || no 'the second cluster is not fresh'
[ "$fail" = 0 ] || exit 1
out2="$root2/tests.log"
set +e
SOPHIA_DISPOSABLE_DATABASE_URL="postgres://postgres@127.0.0.1:$port2/postgres" \
  SOPHIA_Q13_TRUSTED_CREATOR=con01-q13-trusted-creator-v1 \
  /opt/node --test --test-reporter=spec --test-concurrency=1 --test-timeout=180000 \
  packages/persistence/src/conversation-assembler-trusted-creator.db.test.ts >"$out2" 2>&1
tests2=$?
set -e
cat "$out2"
[ "$tests2" = 0 ] || no "the trusted-creator tests exited $tests2"
for line in 'ℹ tests 7' 'ℹ pass 7' 'ℹ fail 0' 'ℹ skipped 0' 'ℹ cancelled 0' \
  '✔ D-Q13: the trusted owner creates the assembler and its login fresh (owned cluster, no hosted effects)' \
  'ℹ admitted, no session: ' 'ℹ admitted, old session open: ' 'ℹ revoked, old session open: ' \
  'ℹ revoked, old session closed: []'; do
  grep -qF -- "$line" "$out2" || no "missing from the trusted-creator output: $line"
done
if grep -q '# SKIP' "$out2"; then no 'a trusted-creator test was skipped'; fi
exit2=$(census2 exit)
printf '%s\n' "$exit2"
[ "$exit2" = 'Q13_OWNED_PG16 trusted-creator exit: databases= logins= clients=0 assembler=0' ] || no 'the trusted-creator tests left something behind'
exit "$fail"
