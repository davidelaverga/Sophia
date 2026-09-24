#!/usr/bin/env python3
"""Validate the documentation pack only. No network, model calls or deployments."""
from __future__ import annotations
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []
WARNINGS: list[str] = []


def load(relative: str):
    try:
        return json.loads((ROOT / relative).read_text(encoding='utf-8'))
    except Exception as exc:
        ERRORS.append(f'{relative}: {exc}')
        return {}


def require(condition: bool, message: str) -> None:
    if not condition:
        ERRORS.append(message)


required = [
    '00_START_HERE.md', 'AGENTS.md', '01_SOPHIA_END_TO_END.md', '02_DECISIONS.md',
    '03_REPOSITORY_MAP.md', 'sources/DONOR_ATLAS.md', 'sources/source-register.json',
    'delivery/ROADMAP.md', 'delivery/GOAL_INDEX.md', 'delivery/planning.json',
    'contracts/README.md', 'contracts/record.schema.json', 'contracts/examples.json',
    'contracts/interfaces.ts', 'config/models.json', 'config/runtime-unit.json',
    'extensions/EXTENSIONS.md', 'CONTINUATION.md', 'references/UI_REFERENCE.md',
]
for name in required:
    require((ROOT / name).is_file(), f'Missing required file: {name}')

source_doc = load('sources/source-register.json')
sources = source_doc.get('sources', [])
source_ids = [s.get('id') for s in sources]
require(len(source_ids) == len(set(source_ids)), 'Duplicate source IDs')
for s in sources:
    require(bool(s.get('use')), f"Source has no use: {s.get('id')}")
    if s.get('kind') == 'repository':
        require(bool(re.fullmatch(r'[0-9a-f]{40}', s.get('commit', ''))), f"Invalid commit: {s.get('id')}")
        require(s['commit'] in s.get('url', ''), f"URL not tied to commit: {s.get('id')}")
    if s.get('kind') == 'provided_document':
        p = ROOT / s['path']
        require(p.exists(), f"Missing reference: {s['path']}")
        if p.exists():
            require(hashlib.sha256(p.read_bytes()).hexdigest() == s.get('sha256'), f"Reference hash differs: {s['path']}")

# Check active docs, not inherited historical reference links outside this pack.
links_checked = 0
source_refs_checked = 0
for p in sorted(ROOT.rglob('*.md')):
    if 'references' in p.relative_to(ROOT).parts:
        continue
    text = p.read_text(encoding='utf-8')
    text_without_fences = re.sub(r'```.*?```', '', text, flags=re.S)
    for target in re.findall(r'\]\(([^)]+)\)', text_without_fences):
        target = target.strip().split(' "')[0]
        if re.match(r'^[a-zA-Z][\w+.-]*:', target) or target.startswith('#'):
            continue
        local = unquote(target.split('#')[0])
        if not local:
            continue
        links_checked += 1
        q = (p.parent / local).resolve()
        require(q.is_relative_to(ROOT), f'Link escapes pack: {p.relative_to(ROOT)} -> {target}')
        require(q.exists(), f'Broken link: {p.relative_to(ROOT)} -> {target}')
    # Explicit ID mentions; ranges retain their explicit end-point mentions.
    for sid in re.findall(r'\b(?:DSH|OM|BZ|QM|LK|GG|OLD|G|OA|DS|IM|TEST|P)-\d{2}\b', text):
        source_refs_checked += 1
        require(sid in source_ids, f'Unregistered source {sid}: {p.relative_to(ROOT)}')
    require(text.count('```') % 2 == 0, f'Unbalanced code fences: {p.relative_to(ROOT)}')

planning = load('delivery/planning.json')
goals = planning.get('goals', [])
goal_map = {g['id']: g for g in goals}
require(len(goal_map) == len(goals), 'Duplicate goal IDs')
for g in goals:
    for key in ['id', 'title', 'owner', 'dependencies', 'source_ids', 'result', 'design_status', 'implementation_status', 'sessions']:
        require(key in g, f"Missing goal field {key}: {g.get('id')}")
    require(g.get('implementation_status') == 'not_started', f"Unsupported implementation status: {g['id']}")
    require(g.get('sessions') == [], f"Unexpected claimed native session: {g['id']}")
    for dep in g.get('dependencies', []):
        require(dep in goal_map, f"Unknown dependency {dep}: {g['id']}")
    for sid in g.get('source_ids', []):
        require(sid in source_ids, f"Unknown source {sid}: {g['id']}")
    if g.get('sprint') == 1:
        p = ROOT / 'delivery' / 'goals' / f"{g['id']}.md"
        require(p.exists(), f'Missing detailed goal: {g["id"]}')
        require(bool(g.get('acceptance')) and bool(g.get('adverse_checks')), f"Missing acceptance: {g['id']}")
        if p.exists():
            text = p.read_text()
            for check in g.get('acceptance', []) + g.get('adverse_checks', []):
                require(check in text, f"Goal brief differs from planning data: {g['id']}")

visiting: set[str] = set()
visited: set[str] = set()
def visit(gid: str) -> None:
    if gid in visiting:
        ERRORS.append(f'Goal dependency cycle at {gid}')
        return
    if gid in visited or gid not in goal_map:
        return
    visiting.add(gid)
    for dep in goal_map[gid].get('dependencies', []):
        visit(dep)
    visiting.remove(gid)
    visited.add(gid)
for gid in goal_map:
    visit(gid)

model_doc = load('config/models.json')
route_map = {r['id']: r for r in model_doc.get('routes', [])}
expected = {
    'voice-primary': 'gemini-3.8-live',
    'vision-analysis': 'gemini-3.8-flash',
    'native-work': 'deepseek-flash',
    'image-google': 'gemini-3.1-flash-image',
    'image-openai': 'gpt-image-2.5-sunburst-2026-09-08',
    'image-google-pro': 'gemini-3-pro-image',
    'image-openai-flare': 'gpt-image-2.5-flare-2026-09-08',
}
for rid, mid in expected.items():
    require(route_map.get(rid, {}).get('model') == mid, f'Model configuration drift: {rid}')
for role in load('config/roles.json').get('roles', []):
    route = route_map.get(role.get('model_route'), {})
    require(bool(route), f"Unknown model route: {role.get('id')}")
    require(role.get('effort') in route.get('efforts', []), f"Unsupported effort: {role.get('id')}")
    require(not role.get('raw_host_shell') and not role.get('consumer_oauth'), f"Unexpected role authority: {role.get('id')}")
for p in ROOT.rglob('*.json'):
    if p.relative_to(ROOT).parts[0] == 'evidence':
        continue
    try:
        json.loads(p.read_text())
    except Exception as exc:
        ERRORS.append(f'JSON parse error {p.relative_to(ROOT)}: {exc}')

schema_validation = 'not_run'
try:
    from jsonschema import Draft202012Validator
    validator = Draft202012Validator(load('contracts/record.schema.json'))
    for i, example in enumerate(load('contracts/examples.json')):
        for error in validator.iter_errors(example):
            ERRORS.append(f'Contract example {i}: {error.message}')
    schema_validation = 'passed' if not ERRORS else 'completed_with_other_errors'
except ImportError:
    WARNINGS.append('jsonschema is absent; specimen-schema validation not run')

report = {
    'status': 'passed' if not ERRORS else 'failed',
    'scope': 'documentation_integrity_only',
    'checked_at_utc': datetime.now(timezone.utc).isoformat(),
    'counts': {'files': len([p for p in ROOT.rglob('*') if p.is_file()]),
               'sources': len(sources), 'goals': len(goals),
               'detailed_sprint1_goals': sum(g.get('sprint') == 1 for g in goals),
               'local_links_checked': links_checked, 'source_mentions_checked': source_refs_checked},
    'contract_specimen_schema_validation': schema_validation,
    'not_tested': ['external link availability', 'installed provider capability', 'TypeScript compilation',
                   'dsh boot', 'live audio or images', 'native engineering sessions', 'SQL migrations',
                   'application deployment', 'runtime configuration-schema acceptance'],
    'errors': ERRORS, 'warnings': WARNINGS,
}
(ROOT / 'evidence').mkdir(exist_ok=True)
(ROOT / 'evidence' / 'pack-validation.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
sys.exit(1 if ERRORS else 0)
