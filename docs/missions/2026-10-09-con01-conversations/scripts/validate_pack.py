#!/usr/bin/env python3
"""Validate this mission package, not the Sophia application. Uses only stdlib."""
from pathlib import Path
from urllib.parse import urlparse, unquote
import hashlib, json, re, sys
root = Path(__file__).resolve().parents[1]
errors=[]; checked_links=0; checksum_count=0
for p in root.rglob('*.md'):
    for target in re.findall(r'\]\(([^\s)]+)(?:\s+"[^"]*")?\)', p.read_text()):
        if urlparse(target).scheme or target.startswith('#'):
            continue
        filepart=unquote(target.split('#',1)[0])
        if not filepart: continue
        dest=(p.parent/filepart).resolve()
        if not dest.is_relative_to(root): errors.append(f'Escaping local link: {p.relative_to(root)} -> {target}')
        elif not dest.exists(): errors.append(f'Missing local link: {p.relative_to(root)} -> {target}')
        checked_links+=1
manifest=json.loads((root/'SOURCE_MANIFEST.json').read_text())
for entry in manifest['preserved_references']:
    p=root/entry['pack_path']
    if hashlib.sha256(p.read_bytes()).hexdigest()!=entry['sha256']:
        errors.append('Original reference hash mismatch: '+entry['pack_path'])
a=json.loads((root/'evidence/acceptance.json').read_text())
ids=[c['id'] for c in a['cases']]
if len(set(ids))!=len(ids): errors.append('Duplicate acceptance IDs')
if not all(c['status']=='not_run' and c['evidence_refs']==[] for c in a['cases']):
    errors.append('Mission template contains execution claims')
if not set(f'CON-01-T{i:02d}' for i in range(1,6)).issubset(ids): errors.append('Missing inherited CON-01 cases')
e=json.loads((root/'evidence/episode.example.json').read_text())
if not e.get('synthetic') or not e.get('not_an_api_response') or e.get('execution_results'):
    errors.append('Synthetic example boundary invalid')
checksums=root/'SHA256SUMS.txt'
if checksums.exists():
    for line in checksums.read_text().splitlines():
        expected, rel=line.split('  ',1)
        p=root/rel
        if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=expected:
            errors.append('Checksum mismatch: '+rel)
        checksum_count+=1
else:
    print('NOTE: checksum file not present (pre-package check)')
result={'scope':'documentation and archive only; no product tests', 'local_links_checked':checked_links,
        'acceptance_cases':len(ids), 'preserved_references':len(manifest['preserved_references']),
        'checksums_checked':checksum_count,'errors':errors}
print(json.dumps(result,indent=2))
sys.exit(bool(errors))
