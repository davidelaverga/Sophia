import subprocess,socket,os,time,signal,json,datetime
from pathlib import Path
j=Path(__file__).parent
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','TMPDIR')}
r={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Unchanged Personal fixture on private loopback,120s ceiling, no API/provider','port':port,'deadlineSeconds':120}
with (j/'server.log').open('x') as log:
 p=subprocess.Popen(['pnpm','exec','vite','--config','vite.fixtures.config.ts','--host','127.0.0.1','--port',str(port),'--strictPort'],cwd='/Users/davidelaverga/Documents/Codex/2026-10-09/sophia-con01-source-harness-review/apps/studio',env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 r['pid']=p.pid;(j/'server-binding.private.json').write_text(json.dumps(r));print(json.dumps(r),flush=True)
 try:r['exit']=p.wait(timeout=120)
 except (subprocess.TimeoutExpired,KeyboardInterrupt):r['stoppedByReviewerOrCeiling']=True
 finally:
  if p.poll() is None:
   os.killpg(p.pid,signal.SIGTERM)
   try:r['exit']=p.wait(timeout=10)
   except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);r['exit']=p.wait(timeout=10)
  r['pidAbsent']=subprocess.run(['ps','-p',str(p.pid),'-o','pid='],capture_output=True).returncode==1
  with socket.socket() as s:r['portClosed']=s.connect_ex(('127.0.0.1',port))!=0
  (j/'server-receipt.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r),flush=True)
