#!/usr/bin/env python3
"""Check this documentation packet. Requires beautifulsoup4, jsonschema, markdown-it-py.
No network or application/provider execution. Reports under checks/.
"""
from pathlib import Path
from bs4 import BeautifulSoup
from jsonschema import Draft202012Validator, FormatChecker
from markdown_it import MarkdownIt
import json,re,copy,hashlib
P=Path(__file__).resolve().parents[1]
board=json.loads((P/'contracts/work-board.schema.json').read_text()); receipt=json.loads((P/'contracts/work-receipt.schema.json').read_text())
Draft202012Validator.check_schema(board); Draft202012Validator.check_schema(receipt)
vb=Draft202012Validator(board,format_checker=FormatChecker()); vr=Draft202012Validator(receipt,format_checker=FormatChecker())
b=json.loads((P/'examples/board-review-ready.json').read_text()); r=json.loads((P/'examples/stop-recorded.json').read_text()); rs=json.loads((P/'examples/stop-confirmed.json').read_text())
for v,d in [(vb,b),(vr,r),(vr,rs)]:v.validate(d)
negative=[]
x=copy.deepcopy(b); x['goals'][0]['items'][0]['lifecycle']='complete';negative.append(('complete_without_policy',vb,x))
x=copy.deepcopy(b); x['goals'][0]['current_plan']['decision_ref']=None;negative.append(('accepted_without_decision',vb,x))
x=copy.deepcopy(b); x['goals'][0]['current_plan']['items'][0]['activation']={'kind':'candidate_ready','producer_work_id':None};negative.append(('candidate_trigger_without_producer',vb,x))
x=copy.deepcopy(rs);x['evidence_refs']=[];negative.append(('stopped_without_evidence',vr,x))
x=copy.deepcopy(rs);x['kind']='guidance';negative.append(('guidance_claims_stop',vr,x))
x=copy.deepcopy(r);x['admission']='rejected';negative.append(('rejected_but_queued',vr,x))
for name,v,d in negative: assert list(v.iter_errors(d)),name
# Positive variant proves that review can complete despite an adverse verdict.
x=copy.deepcopy(b); i=x['goals'][0]['items'][0];i['lifecycle']='complete';i['completion']['status']='satisfied';i['completion']['evidence_refs']=['fixture-structural-submit'];i['review']['state']='changes_required';i['review']['evidence_refs']=['fixture-review-findings'];vb.validate(x)
# All local file links in all Markdown, ignoring code blocks; pure packet checks.
md=MarkdownIt('commonmark').enable('table'); links=[]; errors=[]
for f in P.rglob('*.md'):
    tokens=md.parse(f.read_text())
    for t in tokens:
        for c in t.children or []:
            if c.type=='link_open':
                href=c.attrGet('href')
                if not href or '://' in href or href.startswith('#') or href.startswith('mailto:'):continue
                path=href.split('#')[0]
                links.append((str(f.relative_to(P)),href))
                if not (f.parent/path).resolve().exists():errors.append((str(f.relative_to(P)),href))
assert not errors,errors
h=BeautifulSoup((P/'LUIS_CHANGE_GUIDE.html').read_text(),'html.parser')
ids=[e['id'] for e in h.find_all(id=True)];assert len(ids)==len(set(ids)),'duplicate HTML ids'
anchors=[a['href'][1:] for a in h.find_all('a',href=True) if a['href'].startswith('#')]
assert all(a in ids for a in anchors)
assert not h.find_all('script',src=True)
assert not any(e.get('href','').startswith('http') for e in h.find_all('link'))
assert all(e.get('src','').startswith('data:') for e in h.find_all('img'))
# Collect mission application cases, intentionally not executed.
cases=[]
for m in P.glob('missions/*.md'):
    for cid in re.findall(r'^\| ((?:UI|INT)-\d+) \|',m.read_text(),re.M):
        cases.append({'id':cid,'mission':m.stem,'status':'not_run','evidence':[]})
assert len(cases)==41,len(cases)
(P/'checks/application-cases.json').write_text(json.dumps(cases,indent=2)+'\n')
report={'kind':'documentation_and_synthetic_schema_validation','application_tests_run':False,
'local_markdown_links_checked':len(links),'html_internal_anchors_checked':len(anchors),
'json_schemas_valid':2,'valid_examples_checked':4,'invalid_examples_correctly_rejected':len(negative),
'not_run_application_acceptance_cases':len(cases),'broken_links':errors,'html_external_assets':0}
(P/'checks/packet-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
