import os, pathlib, socket, tempfile, subprocess, signal, json, shutil
root=pathlib.Path(os.environ['CON01_CANDIDATE_ROOT'])
journal=pathlib.Path(os.environ['CON01_JOURNAL']);journal.mkdir(parents=True,exist_ok=True)
pg_bin=pathlib.Path(os.environ['CON01_PG_BIN'])
cluster=pathlib.Path(tempfile.mkdtemp(prefix='con01-browser-owned-pg-'))
def port():
 with socket.socket() as sock:
  sock.bind(('127.0.0.1',0));return sock.getsockname()[1]
pg_port,api_port,studio_port,backend_port=port(),port(),port(),port()
started=False
proc=None
receipt={'candidate':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'tree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=root,text=True).strip(),'level':'L1 actual local UI/API/PostgreSQL, synthetic accounts, no fixtures/provider/runtime','apiPort':api_port,'studioPort':studio_port,'pid':os.getpid()}
def stop(signum,frame):
 if proc is not None:proc.send_signal(signal.SIGTERM)
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
try:
 subprocess.run([str(pg_bin/'initdb'),'-D',str(cluster/'data'),'-U','postgres','-A','trust','--encoding=UTF8','--locale=C'],check=True,capture_output=True,timeout=30)
 subprocess.run([str(pg_bin/'pg_ctl'),'-D',str(cluster/'data'),'-l',str(cluster/'server.log'),'-o',f'-h 127.0.0.1 -p {pg_port} -k {cluster}','-w','-t','10','start'],check=True,capture_output=True,timeout=20);started=True
 env={k:v for k,v in os.environ.items() if k in ['PATH','HOME','TMPDIR']}
 env.update(SOPHIA_DISPOSABLE_DATABASE_URL=f'postgres://postgres@127.0.0.1:{pg_port}/postgres',CON01_JOURNAL=str(journal),CON01_API_PORT=str(api_port),CON01_BACKEND_PORT=str(backend_port),CON01_STUDIO_PORT=str(studio_port))
 with (journal/'browser-stack.log').open('w') as output:
  proc=subprocess.Popen(['node',str(pathlib.Path(__file__).with_name('g3-browser-stack.mjs'))],cwd=root,env=env,stdout=output,stderr=subprocess.STDOUT)
  (journal/'browser-stack-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
  proc.wait(timeout=600)
  receipt['exit']=proc.returncode
finally:
 if proc is not None and proc.poll() is None:
  proc.terminate()
  try:proc.wait(timeout=15)
  except subprocess.TimeoutExpired:proc.kill();proc.wait(timeout=5)
 if started:subprocess.run([str(pg_bin/'pg_ctl'),'-D',str(cluster/'data'),'-m','fast','-w','-t','10','stop'],check=True,capture_output=True,timeout=20)
 receipt['postgresStopped']=subprocess.run([str(pg_bin/'pg_ctl'),'-D',str(cluster/'data'),'status'],capture_output=True).returncode==3
 if receipt['postgresStopped']:shutil.rmtree(cluster)
 receipt['clusterRemoved']=not cluster.exists()
 (journal/'browser-stack-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps(receipt))
