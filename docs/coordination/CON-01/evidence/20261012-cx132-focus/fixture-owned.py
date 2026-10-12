import subprocess,time,os,signal,socket,json,hashlib
from pathlib import Path
j=Path(__file__).parent
root=Path('/Users/davidelaverga/Documents/Codex/2026-10-09/sophia-con01-source-harness-review')
port=54463
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()=='78ced7f340654542374683121cdf3103c05c7671'
assert not subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True).strip()
with socket.socket() as s:s.bind(('127.0.0.1',port))
env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','TMPDIR')}
with (j/'fixture-owned.log').open('x') as log:
 proc=subprocess.Popen(['pnpm','--dir','apps/studio','exec','vite','--config','vite.fixtures.config.ts','--host','127.0.0.1','--port',str(port),'--strictPort'],cwd=root,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,env=env)
 (j/'fixture-start.json').write_text(json.dumps({'pid':proc.pid,'port':port,'maximumSeconds':480,'source':'78ced7f340654542374683121cdf3103c05c7671','wrapperSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'scope':'Owned loopback Vite fixture, no hosted/API/native/provider execution','environment':'PATH HOME TMPDIR only'},indent=2)+'\n')
 print(json.dumps({'pid':proc.pid,'port':port}),flush=True)
 start=time.monotonic()
 try:
  while proc.poll() is None and time.monotonic()-start<480 and not (j/'fixture-stop').exists():time.sleep(.25)
 finally:
  if proc.poll() is None:
   os.killpg(proc.pid,signal.SIGTERM)
   try:proc.wait(timeout=5)
   except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait(timeout=5)
  pidabsent=subprocess.run(['ps','-p',str(proc.pid),'-o','pid='],capture_output=True,timeout=5).returncode==1
  with socket.socket() as s:closed=s.connect_ex(('127.0.0.1',port))!=0
  r={'pid':proc.pid,'exit':proc.returncode,'elapsedSeconds':round(time.monotonic()-start,3),'pidAbsent':pidabsent,'portClosed':closed,'checkoutClean':not subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True).strip()}
  (j/'fixture-cleanup.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r),flush=True)
