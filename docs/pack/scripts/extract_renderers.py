#!/usr/bin/env python3
"""Read exact Git blobs into NEW staging. No network, package install, renderer execution or fonts."""
from __future__ import annotations
import argparse,hashlib,json,subprocess
from pathlib import Path,PurePosixPath
ROOT=Path(__file__).resolve().parents[1]
def safe(p:str)->Path:
 q=PurePosixPath(p)
 if q.is_absolute() or '..' in q.parts or '\\' in p or not p:raise ValueError('Unsafe manifest path')
 if q.suffix.lower() in {'.ttf','.otf','.woff','.woff2','.ttc'}:raise ValueError('Font extraction is excluded')
 return Path(*q.parts)
def git(repo:Path,*args:str)->bytes:
 return subprocess.run(['git','-C',str(repo),*args],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30).stdout
parser=argparse.ArgumentParser();parser.add_argument('--repo',type=Path,required=True);parser.add_argument('--out',type=Path,required=True);args=parser.parse_args()
manifest=json.loads((ROOT/'renderers/extraction-manifest.json').read_text());commit=manifest['commit'];repo=args.repo.resolve();out=args.out.resolve()
if out.exists():raise SystemExit('Output must not exist; do not overwrite source or prior staging')
if out==repo or repo in out.parents:raise SystemExit('Stage outside the source repository')
if git(repo,'rev-parse','--verify',commit+'^{commit}').decode().strip()!=commit:raise SystemExit('Selected commit cannot be resolved')
verified=[]
for f in manifest['files']:
 path=safe(f['path']).as_posix();dest=safe(f['destination'])
 blob=git(repo,'rev-parse',f'{commit}:{path}').decode().strip()
 if blob!=f['git_blob_sha1']:raise SystemExit(f'Unexpected blob for {path}')
 content=git(repo,'cat-file','blob',blob)
 actual=hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()
 if actual!=blob:raise SystemExit(f'Blob bytes do not match {path}')
 verified.append((dest,content,blob))
out.mkdir(parents=True)
for dest,content,blob in verified:
 target=out/dest;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(content)
(out/'EXTRACTION_RECEIPT.json').write_text(json.dumps({'commit':commit,'state':'staged_unmodified_not_qualified','files':[{'path':str(d),'git_blob_sha1':b,'sha256':hashlib.sha256(c).hexdigest()} for d,c,b in verified]},indent=2)+'\n')
print(f'Staged {len(verified)} exact source files. Mandatory adaptations and runtime tests are still required.')
