#!/usr/bin/env python3
"""Validate this planning pack. No network, provider, database, or product execution.

Requires Python 3.11+, markdown-it-py and jsonschema. Run from any directory.
The unittest invocation exercises only the bundled in-memory design model.
"""
from __future__ import annotations
import collections
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit

try:
    from markdown_it import MarkdownIt
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError as exc:
    raise SystemExit("Install validation dependencies: python -m pip install -r scripts/requirements.txt") from exc

ROOT = Path(__file__).resolve().parents[1]
MD = MarkdownIt("commonmark", {"html": False}).enable("table")
ERRORS: list[str] = []
METRICS: dict[str, object] = {}

def load(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))

def slug(text: str) -> str:
    text = re.sub(r"[`*_]", "", text).lower()
    text = re.sub(r"[^\w\-\s]", "", text, flags=re.UNICODE)
    return re.sub(r"\s", "-", text)

def heading_ids(text: str) -> set[str]:
    ids: set[str] = set(); used: dict[str, int] = {}
    tokens = MD.parse(text)
    for i,t in enumerate(tokens):
        if t.type == "heading_open":
            base=slug(tokens[i+1].content); n=used.get(base,0); used[base]=n+1
            ids.add(base if n==0 else f"{base}-{n}")
    return ids

def check_unique(items: list[dict], label: str) -> dict:
    counts=collections.Counter(x['id'] for x in items)
    for k,n in counts.items():
        if n!=1: ERRORS.append(f"duplicate {label}: {k} ({n})")
    return {x['id']: x for x in items}

def cycle_check(graph: dict[str,list[str]], label: str):
    visited=set(); active=[]
    def walk(n):
        if n in active:
            ERRORS.append(label+" dependency cycle: "+" -> ".join(active+[n]));return
        if n in visited:return
        active.append(n)
        for d in graph.get(n,[]):
            if d not in graph: ERRORS.append(f"{label} missing dependency {n} -> {d}")
            else: walk(d)
        active.pop();visited.add(n)
    for n in graph:walk(n)

# All JSON must parse. JSON shape is not behavior/authorization evidence.
json_paths=sorted(ROOT.rglob('*.json'))
parsed={}
for f in json_paths:
    try: parsed[str(f.relative_to(ROOT))]=json.loads(f.read_text(encoding='utf-8'))
    except (ValueError,UnicodeError) as e:ERRORS.append(f"JSON parse {f.relative_to(ROOT)}: {e}")
METRICS['json_files_parsed']=len(parsed)

md_files=sorted(ROOT.rglob('*.md'))
headings={f.resolve():heading_ids(f.read_text(encoding='utf-8')) for f in md_files}
local_links=0; external_links=0
for f in md_files:
    text=f.read_text(encoding='utf-8')
    if 'sandbox:/mnt/data/' in text:ERRORS.append(f"non-portable sandbox link: {f.relative_to(ROOT)}")
    for token in MD.parse(text):
        for child in token.children or []:
            if child.type not in ('link_open','image'):continue
            href=child.attrGet('href') if child.type=='link_open' else child.attrGet('src')
            if not href:continue
            u=urlsplit(href)
            if u.scheme or u.netloc:
                external_links+=1;continue
            target=(f.parent / unquote(u.path)).resolve() if u.path else f.resolve()
            local_links+=1
            if not target.is_relative_to(ROOT):
                ERRORS.append(f"link escapes pack: {f.relative_to(ROOT)} -> {href}");continue
            if not target.exists():
                ERRORS.append(f"missing link: {f.relative_to(ROOT)} -> {href}");continue
            if u.fragment and target.suffix=='.md' and unquote(u.fragment) not in headings.get(target,set()):
                ERRORS.append(f"missing heading: {f.relative_to(ROOT)} -> {href}")
METRICS.update(markdown_files=len(md_files),local_links_checked=local_links,external_links_recorded_not_network_tested=external_links)

goals=load('planning/goals.json')['goals']; gm=check_unique(goals,'goal')
front=load('planning/frontend-track.json')['items']; fm=check_unique(front,'frontend')
cases=load('tests/acceptance-catalog.json')['cases']; cm=check_unique(cases,'case')
coverage=load('sources/coverage.json')
original={f'S1-{i:02}' for i in range(1,15)}|{f'S2-{i:02}' for i in range(1,7)}|{f'S3-{i:02}' for i in range(1,5)}
scm={f'SCM-{i:02}' for i in range(9)}
old_fe={f'LFE-{i:02}' for i in range(14)}
for label,wanted,actual in [
 ('original goals',original,{x['id'] for x in coverage['original_goals']}),
 ('SCM missions',scm,{x['id'] for x in coverage['coordination_missions']}),
 ('original frontend',old_fe,set(fm)&old_fe),
 ('new PA goals',{f'PA-{i:02}' for i in range(5)},set(gm)&{f'PA-{i:02}' for i in range(5)})]:
    if wanted!=actual:ERRORS.append(f"coverage {label}: missing={wanted-actual},extra={actual-wanted}")
for g in goals:
    for cap in g.get('capability_dependencies',[]):
        if cap.get('provider_goal') not in gm:ERRORS.append(f"goal {g['id']} missing capability provider {cap}")
    for path in [g['path']]+g.get('required_docs',[]):
        if not (ROOT/path).is_file():ERRORS.append(f"goal {g['id']} missing file {path}")
    for a in g.get('acceptance_ids',[]):
        if a not in cm:ERRORS.append(f"goal {g['id']} missing case {a}")
    if g['kind']=='alias':
        for t in g.get('targets',[]):
            if t not in gm:ERRORS.append(f"alias {g['id']} missing target {t}")
    else:
        for suffix in ('IMPLEMENT','CODEX'):
            if not (ROOT/f"launch/{g['id']}_{suffix}.md").is_file():ERRORS.append(f"missing launch {g['id']}_{suffix}")
cycle_check({g['id']:g.get('depends_on',[]) for g in goals},'goals')
cycle_check({g['id']:g.get('targets',[]) if g['kind']=='alias' else [] for g in goals},'aliases')
capability_text=(ROOT/'05_CODE_AND_INTEGRATION_MAP.md').read_text()+'\n'+(ROOT/'sources/COVERAGE.md').read_text()
known_backend={'B-ARTIFACTS','B-CONNECTORS','B-CONTEXT','B-IMAGES','B-MUTATIONS','B-PARTICIPATION','B-PERSONAL','B-PREVIEW','B-PROTOTYPE','B-PUSH'}
for f in front:
    for cap in f.get('capability_dependencies',[]):
        if cap.get('provider_package') not in fm:ERRORS.append(f"frontend {f['id']} missing capability provider {cap}")
    for path in (f['path'],f"launch/{f['id']}_LUIS.md"):
        if not (ROOT/path).is_file():ERRORS.append(f"frontend {f['id']} missing {path}")
    for b in f.get('backend',[]):
        if b not in gm and b not in known_backend:ERRORS.append(f"frontend {f['id']} unknown backend {b}")
cycle_check({f['id']:list(set(f.get('prepare_after',[])+f.get('activate_after',[]))) for f in front},'frontend')
for c in cases:
    if c['status']!='not_run':ERRORS.append(f"unexecuted product case promoted: {c['id']}")
    if c['goal'] not in gm and c['goal'] not in fm:ERRORS.append(f"orphan case {c['id']} goal {c['goal']}")
    if c.get('evidence_ref') or c.get('source_commit'):ERRORS.append(f"new catalog invents evidence: {c['id']}")
METRICS.update(goal_records=len(goals),canonical_goals=sum(x['kind']!='alias' for x in goals),routing_aliases=sum(x['kind']=='alias' for x in goals),original_goals_mapped=len(original),scm_missions_mapped=len(scm),frontend_packages=len(front),product_acceptance_cases_not_run=len(cases))

# Schema cases: no URL fetch and no schema data is treated as authorization.
checks=[]
def schema_case(file: str, schema: str, valid: bool, example=None):
    s=load(schema)
    if '$ref' in json.dumps(s) and 'http' in json.dumps(s.get('$ref','')):
        ERRORS.append(f"external schema reference {schema}")
    Draft202012Validator.check_schema(s)
    data=load(file) if example is None else example
    errors=list(Draft202012Validator(s,format_checker=FormatChecker()).iter_errors(data))
    observed=not errors
    checks.append({'file':file,'schema':schema,'expected_valid':valid,'observed_valid':observed,'passed':observed==valid})
    if valid!=observed:ERRORS.append(f"schema fixture {file}: expected valid={valid}, errors={[e.message for e in errors][:3]}")
cat=load('fixtures/personal-assistant/catalog.json')
for kind in ('valid','invalid'):
    for entry in cat[kind]:schema_case(entry['file'],entry['schema'],kind=='valid')
for f in sorted((ROOT/'fixtures/coordination').glob('*.valid.json')):
    schema_case(str(f.relative_to(ROOT)),f"contracts/coordination/{f.name.replace('.valid.json','.schema.json')}",True)
for f in sorted((ROOT/'fixtures/coordination/invalid').glob('*.json')):
    x=json.loads(f.read_text());schema_case(str(f.relative_to(ROOT)),f"contracts/coordination/{x['schema']}.schema.json",False,x['example'])
METRICS['schema_examples_checked']=len(checks)
METRICS['schema_examples_expected_invalid']=sum(not x['expected_valid'] for x in checks)

fonts=[str(f.relative_to(ROOT)) for f in ROOT.rglob('*') if f.suffix.lower() in {'.ttf','.otf','.woff','.woff2','.eot','.ttc'}]
if fonts:ERRORS.append('font files present: '+repr(fonts))
METRICS['font_files']=len(fonts)

# Only the local, in-memory specification rehearsal is executed.
env=dict(os.environ,PYTHONDONTWRITEBYTECODE='1')
proc=subprocess.run([sys.executable,'-B','-m','unittest','discover','-s',str(ROOT/'tests'),'-p','test_design_model.py','-v'],capture_output=True,text=True,env=env,timeout=40)
log=proc.stdout+proc.stderr
(ROOT/'tests/design-model-output.txt').write_text(log,encoding='utf-8')
match=re.search(r'Ran (\d+) tests?',log)
count=int(match.group(1)) if match else 0
if proc.returncode or count==0:ERRORS.append('design rehearsal failed or no tests found; see tests/design-model-output.txt')
METRICS['in_memory_design_tests']=count
METRICS['in_memory_design_test_exit_code']=proc.returncode
METRICS['application_provider_database_deployment_tests_run']=0
report={'schema':'sophia.pack-validation.v2','as_of':'2026-10-01','scope':'Documentation structure, proposed schema examples and an in-memory specification model only. No application, database, provider, OAuth, cloud computer, paid task or deployment acceptance. External URLs are recorded, not crawled.','status':'passed' if not ERRORS else 'failed','metrics':METRICS,'schema_cases':checks,'errors':ERRORS}
(ROOT/'tests/documentation-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':report['status'],'metrics':METRICS,'errors':ERRORS},ensure_ascii=False,indent=2))
sys.exit(1 if ERRORS else 0)
