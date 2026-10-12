import os,subprocess,tempfile,socket,json,hashlib,shutil,datetime,signal
from pathlib import Path
j=Path(__file__).parent.resolve()
pg=Path('/Users/davidelaverga/.codex/operator-journal/CON-01/attempt-1/pg17-owned/package/native/bin')
assert not (j/'owned-receipt.json').exists()
cluster=Path(tempfile.mkdtemp(prefix='con01-cx133-r5-pg-',dir='/tmp'))
assert cluster.stat().st_uid==os.getuid() and cluster.stat().st_mode & 0o077==0
with socket.socket() as sock:
 sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','TMPDIR')}
env.update(CON01_IDENTITY_JOURNAL=str(j),SOPHIA_DISPOSABLE_DATABASE_URL=f'postgres://postgres@127.0.0.1:{port}/postgres',PGOPTIONS='-c statement_timeout=10000 -c lock_timeout=2000')
r={'scope':'Owned disposable local PG17; no hosted/native/provider effects','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'harnessSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'probeSha256':hashlib.sha256((j/'fingerprint.mjs').read_bytes()).hexdigest(),'syntaxPreparation':'node --check before owned cluster startup','cleanup':{}}
started=False;pid=None
try:
 subprocess.run(['node','--check',str(j/'fingerprint.mjs')],check=True,timeout=10,capture_output=True,env=env)
 subprocess.run([str(pg/'initdb'),'-D',str(cluster/'data'),'-U','postgres','-A','trust','--encoding=UTF8','--locale=C'],check=True,capture_output=True,timeout=30,env=env)
 subprocess.run([str(pg/'pg_ctl'),'-D',str(cluster/'data'),'-l',str(cluster/'server.log'),'-o',f'-h 127.0.0.1 -p {port} -k {cluster}','-w','-t','10','start'],check=True,capture_output=True,timeout=20,env=env)
 started=True;pid=int((cluster/'data/postmaster.pid').read_text().splitlines()[0])
 command=subprocess.check_output(['ps','-p',str(pid),'-o','command='],text=True)
 assert str(cluster/'data') in command and 'postgres' in command
 r['privateBinding']={'cluster':str(cluster),'port':port,'pid':pid}
 with (j/'probe.log').open('x') as log:
  process=subprocess.Popen(['node',str(j/'fingerprint.mjs')],stdout=log,stderr=subprocess.STDOUT,env=env,start_new_session=True)
  try:r['probeExit']=process.wait(timeout=180)
  except subprocess.TimeoutExpired:
   r['timedOut']=True;os.killpg(process.pid,signal.SIGTERM)
   try:r['probeExit']=process.wait(timeout=10)
   except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);r['probeExit']=process.wait(timeout=10)
 r['identityReceiptExists']=(j/'identities.json').exists()
 if r['identityReceiptExists']:r['closingCensus']=json.loads((j/'identities.json').read_text()).get('census')
finally:
 c=r['cleanup']
 if started:
  c['stopExit']=subprocess.run([str(pg/'pg_ctl'),'-D',str(cluster/'data'),'-m','fast','-w','-t','15','stop'],capture_output=True,timeout=25,env=env).returncode
  c['stopped']=subprocess.run([str(pg/'pg_ctl'),'-D',str(cluster/'data'),'status'],capture_output=True,timeout=10,env=env).returncode==3
  c['pidAbsent']=subprocess.run(['ps','-p',str(pid),'-o','pid='],capture_output=True,timeout=10).returncode==1
  shutil.copyfile(cluster/'server.log',j/'owned-postgres.private.log')
  if c['stopped'] and c['pidAbsent']:shutil.rmtree(cluster)
 else:c['startupNotConfirmed']=True
 c['clusterRemoved']=not cluster.exists()
 c['successful']=bool(c.get('stopped') and c.get('pidAbsent') and c['clusterRemoved'])
 (j/'owned-receipt.json').write_text(json.dumps(r,indent=2)+'\n')
 print(json.dumps({k:v for k,v in r.items() if k!='privateBinding'}))
assert r.get('probeExit')==0 and not r.get('timedOut') and r['cleanup']['successful']
