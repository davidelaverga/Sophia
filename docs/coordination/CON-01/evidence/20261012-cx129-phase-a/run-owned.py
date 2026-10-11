"""Prepared operator harness, not test evidence. Review immutable sources before use.

Only a freshly initialized, privately owned PG cluster is started or removed.
Runtime URLs and all raw logs stay in the private operator journal.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--worktree', type=Path, required=True)
parser.add_argument('--sha', required=True)
parser.add_argument('--journal', type=Path, required=True)
parser.add_argument('--expected-probe-exit', type=int, choices=[0,1], required=True)
args = parser.parse_args()
root = args.worktree.resolve(strict=True)
journal = args.journal.resolve(strict=True)
independent = Path(__file__).resolve(strict=True)
pg = Path('/Users/davidelaverga/.codex/operator-journal/CON-01/attempt-1/pg17-owned/package/native/bin')

def capture(command, **kw):
    return subprocess.check_output(command, cwd=root, text=True, **kw).strip()

sha = capture(['git', 'rev-parse', 'HEAD'])
assert len(args.sha) == 40 and sha == args.sha
assert not capture(['git', 'status', '--porcelain'])
assert capture(['node', '--version']) == 'v24.21.0'
assert capture(['pnpm', '--version']) == '11.7.0'
assert not (journal / 'phase-a-owned-receipt.json').exists(), 'Do not overwrite an execution receipt'
files = ['db/migrations/0012_runtime_service.sql','apps/worker/src/runtime-dispatch.ts','packages/persistence/src/dispatch.ts']
if (root / 'db/migrations/0053_runtime_outbox_reconcile.sql').exists():
    files.append('db/migrations/0053_runtime_outbox_reconcile.sql')
receipt = {
    'schema': 'sophia.con01.private-owned-pg-run.v1',
    'candidate': sha,
    'tree': capture(['git', 'rev-parse', 'HEAD^{tree}']),
    'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'postgresVersion': capture([str(pg / 'postgres'), '--version']),
    'scope': 'Owned local synthetic PG only; no app/native/provider/hosted execution',
    'hashes': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in files},
    'operatorHarnessHash': hashlib.sha256(independent.read_bytes()).hexdigest(),
    'probeHash': hashlib.sha256((journal/'dispatch-probe.mjs').read_bytes()).hexdigest(),
    'commands': [],
    'cleanup': {},
}
cluster = Path(tempfile.mkdtemp(prefix='con01-phase-a-review-owned-pg-'))
assert cluster.stat().st_uid == os.getuid() and cluster.stat().st_mode & 0o077 == 0
with socket.socket() as reserved:
    reserved.bind(('127.0.0.1', 0))
    port = reserved.getsockname()[1]
started = False
postmaster = None
try:
    subprocess.run([str(pg / 'initdb'), '-D', str(cluster / 'data'), '-U', 'postgres', '-A', 'trust',
                    '--encoding=UTF8', '--locale=C'], check=True, capture_output=True, timeout=30)
    subprocess.run([str(pg / 'pg_ctl'), '-D', str(cluster / 'data'), '-l', str(cluster / 'server.log'),
                    '-o', f'-h 127.0.0.1 -p {port} -k {cluster}', '-w', '-t', '10', 'start'],
                   check=True, capture_output=True, timeout=20)
    started = True
    postmaster = int((cluster / 'data/postmaster.pid').read_text().splitlines()[0])
    command = capture(['ps', '-p', str(postmaster), '-o', 'command='])
    assert str(cluster / 'data') in command and 'postgres' in command
    receipt['privateBinding'] = {'cluster': str(cluster), 'port': port, 'pid': postmaster}
    env = {key: value for key, value in os.environ.items() if key in ('PATH', 'HOME', 'TMPDIR')}
    env.update(SOPHIA_DISPOSABLE_DATABASE_URL=f'postgres://postgres@127.0.0.1:{port}/postgres',
               CON01_JOURNAL=str(journal), CON01_WORKTREE=str(root), CON01_CANDIDATE=sha, PGOPTIONS='-c statement_timeout=45000 -c lock_timeout=45000')
    commands = [('dispatch-probe', ['node',str(journal/'dispatch-probe.mjs')])]
    for label, cmd in commands:
        entry = {'label': label, 'command': cmd, 'outerSeconds': 180, 'timedOut': False, 'expectedExit': args.expected_probe_exit}
        with (journal / (label + '.log')).open('x') as log:
            process = subprocess.Popen(cmd, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT,
                                       start_new_session=True)
            try:
                entry['exit'] = process.wait(timeout=180)
            except subprocess.TimeoutExpired:
                entry['timedOut'] = True
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    entry['exit'] = process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    entry['exit'] = process.wait(timeout=10)
        receipt['commands'].append(entry)
    probe = json.loads((journal/'probe-results.json').read_text())
    assert probe['fatal'] is None, 'Probe setup/program failure is not fail-before evidence'
    assert probe['candidate'] == sha
    census_code = """import pg from 'pg'; const c=new pg.Client({connectionString:process.env.SOPHIA_DISPOSABLE_DATABASE_URL,connectionTimeoutMillis:3000,query_timeout:5000});await c.connect();try{await c.query('BEGIN READ ONLY');const r=await c.query("SELECT json_build_object('databases',(SELECT json_agg(datname ORDER BY datname) FROM pg_database WHERE NOT datistemplate),'otherClients',(SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND backend_type='client backend')) AS census");await c.query('ROLLBACK');console.log(JSON.stringify(r.rows[0].census));}finally{await c.end()}"""
    receipt['closingCensus'] = json.loads(capture(['node','--input-type=module','--eval',census_code],env=env,timeout=15))
    assert receipt['closingCensus'] == {'databases':['postgres'],'otherClients':0}, 'Owned test clients/databases not settled'
except BaseException as error:
    receipt['failureClass'] = type(error).__name__
    raise
finally:
    receipt['checkoutCleanAfter'] = not capture(['git','status','--porcelain'])
    # Failed startup does not authorize stopping an unrelated port occupant.
    cleanup = receipt['cleanup']
    try:
        if started:
            result = subprocess.run([str(pg / 'pg_ctl'), '-D', str(cluster / 'data'), '-m', 'fast',
                                     '-w', '-t', '15', 'stop'], capture_output=True, timeout=25)
            cleanup['stopExit'] = result.returncode
            cleanup['stopped'] = subprocess.run([str(pg / 'pg_ctl'), '-D', str(cluster / 'data'), 'status'],
                                                capture_output=True, timeout=10).returncode == 3
            if postmaster:
                cleanup['pidAbsent'] = subprocess.run(['ps', '-p', str(postmaster), '-o', 'pid='],
                                                      capture_output=True, timeout=10).returncode == 1
            if (cluster / 'server.log').exists():
                shutil.copyfile(cluster / 'server.log', journal / 'owned-postgres.log')
            # A reused listening port is not evidence that this owned postmaster lives.
            if cleanup.get('stopped') and cleanup.get('pidAbsent'):
                shutil.rmtree(cluster)
        else:
            # Preserve uncertain startup state for inspection; never infer stopped from a timeout.
            cleanup['startupNotConfirmed'] = True
    except BaseException as error:
        cleanup['failureClass'] = type(error).__name__
    cleanup['clusterRemoved'] = not cluster.exists()
    cleanup['successful'] = bool(cleanup.get('stopped') and cleanup.get('pidAbsent') and cleanup['clusterRemoved'])
    (journal / 'phase-a-owned-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'candidate': sha, 'commands': receipt['commands'], 'cleanup': cleanup}))

raise SystemExit(0 if len(receipt['commands']) == 1
                 and all(item['exit'] == item['expectedExit'] and not item['timedOut'] for item in receipt['commands'])
                 and receipt['checkoutCleanAfter']
                 and receipt['cleanup']['successful'] else 1)
