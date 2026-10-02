#!/usr/bin/env python3
"""Build the portable, self-contained planning reader. No external requests."""
from __future__ import annotations
import hashlib
import html
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit
from markdown_it import MarkdownIt
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'READER.html'
MD=MarkdownIt('commonmark',{'html':False,'breaks':False}).enable('table')
GROUPS=[('', 'Start and decisions'),('architecture','Architecture'),('goals','Goals and aliases'),('frontend','Luis implementation'),('assistants','Personal assistants'),('coordination','Paperclip coordination'),('bindings','Detailed bindings'),('assets','Bot template and skills'),('prompts','Runtime role proposals'),('skills','Coordination skills'),('launch','Launch prompts'),('operations','Operations and handoff'),('contracts','Proposed contracts'),('planning','Machine-readable plan'),('deferred','Deferred directions'),('sources','Evidence and crosswalks'),('design','Executable design model'),('tests','Validation and fixtures'),('fixtures','Synthetic examples'),('scripts','Pack tooling')]
group_names=dict(GROUPS)
def docid(path:str)->str:return 'doc-'+hashlib.sha1(path.encode()).hexdigest()[:12]
def slug(text:str)->str:
 text=re.sub(r'[`*_]','',text).lower()
 text=re.sub(r'[^\w\-\s]','',text,flags=re.UNICODE)
 return re.sub(r'\s','-',text)

def group(path:Path)->str:
 parts=path.relative_to(ROOT).parts
 return parts[0] if len(parts)>1 else ''

allowed={'.md','.json','.py','.ts','.txt','.yml','.yaml'}
files=[p for p in ROOT.rglob('*') if p.is_file() and p.suffix in allowed and '__pycache__' not in p.parts and p.name not in {'SHA256SUMS.txt'}]
gorder={name:i for i,(name,_) in enumerate(GROUPS)}
def sort_key(p):
 rel=p.relative_to(ROOT).as_posix();priority=0 if p.name=='INDEX.md' else 1
 return (gorder.get(group(p),99),priority,rel)
files.sort(key=sort_key)
# Default first page always start here, regardless of alphabetical aliases.
start=ROOT/'00_START_HERE.md';files.remove(start);files.insert(0,start)
paths={p.resolve():p.relative_to(ROOT).as_posix() for p in files}
docs=[];link_errors=[];internal_count=0;external_count=0
for p in files:
 rel=p.relative_to(ROOT).as_posix();did=docid(rel);text=p.read_text(encoding='utf-8')
 if p.suffix=='.md':
  metadata=''
  body_text=text
  if text.startswith('---\n') and '\n---\n' in text[4:]:
   end=text.find('\n---\n',4); metadata=text[4:end]; body_text=text[end+5:]
  tokens=MD.parse(body_text);used={};title=None
  for i,t in enumerate(tokens):
   if t.type=='heading_open':
    raw=tokens[i+1].content
    if title is None:title=re.sub(r'[`*_]','',raw)
    base=slug(raw);n=used.get(base,0);used[base]=n+1
    t.attrSet('id',did+'--'+(base if n==0 else f'{base}-{n}'))
  title=title or p.stem
  rendered=MD.renderer.render(tokens,MD.options,{})
  if metadata: rendered+='<details><summary>Record metadata</summary><pre><code>'+html.escape(metadata)+'</code></pre></details>'
 else:
  title=p.name
  rendered=f'<h1 id="{did}--data">{html.escape(title)}</h1><pre><code>{html.escape(text)}</code></pre>'
 soup=BeautifulSoup(rendered,'html.parser')
 for a in soup.find_all('a',href=True):
  href=a['href'];u=urlsplit(href)
  if u.scheme or u.netloc:
   if u.scheme in {'https','http','mailto'}:
    a['rel']='noopener noreferrer';a['target']='_blank';external_count+=1
   else:
    a.replace_with(a.get_text()+' [unsupported link]')
   continue
  target=(p.parent/unquote(u.path)).resolve() if u.path else p.resolve()
  if target in paths:
   t_id=docid(paths[target]);a['href']='#'+t_id+('--'+unquote(u.fragment) if u.fragment else '');internal_count+=1
  else:
   link_errors.append({'source':rel,'href':href,'reason':'not embedded'})
   a.replace_with(a.get_text()+' [file not embedded]')
 # No image fetches; any deliberate pack images can be embedded separately if later added.
 for img in soup.find_all('img'):
  img.replace_with('[Image reference: '+img.get('alt','')+']')
 for table in list(soup.find_all('table')):
  wrapper=soup.new_tag('div',attrs={'class':'table-scroll','tabindex':'0','role':'region','aria-label':'Scrollable table'})
  table.wrap(wrapper)
 plain=soup.get_text(' ',strip=True)
 docs.append({'id':did,'path':rel,'title':title,'group':group(p),'body':str(soup),'search':(title+' '+rel+' '+plain).casefold()})

# Static content allows printing and avoids dynamic markdown execution.
nav=[]
for key,label in GROUPS:
 items=[d for d in docs if d['group']==key]
 if not items:continue
 links=''.join(f'<a class="nav-link" href="#{d["id"]}" data-doc="{d["id"]}" title="{html.escape(d["path"],quote=True)}">{html.escape(d["title"])}</a>' for d in items)
 nav.append(f'<details class="nav-group" data-group="{key}"'+(' open' if key in ('','assistants') else '')+f'><summary>{label}<span>{len(items)}</span></summary><div>{links}</div></details>')
articles=[]
for d in docs:
 badge='Current planning' if d['group'] not in ('tests','fixtures','design','sources','contracts','prompts','assets') else {'tests':'Documentation / design evidence','fixtures':'Synthetic fixture','design':'In-memory model, not application code','sources':'Evidence and provenance','contracts':'Proposed contract, not deployed','prompts':'Proposed role asset','assets':'Unpublished template / skill'}[d['group']]
 articles.append(f'<article class="document" id="{d["id"]}" data-path="{d["path"]}" hidden><div class="eyebrow">{badge}</div><div class="crumb">{html.escape(d["path"])}</div>{d["body"]}<footer><a href="#{docid("00_START_HERE.md")}">Back to start</a><span>Sophia · Unified continuation · 1 October 2026</span></footer></article>')
searchdata=json.dumps([{k:d[k] for k in ('id','path','title','search')} for d in docs],ensure_ascii=False).replace('<','\\u003c').replace('&','\\u0026')
css=r'''
:root{--ink:#1c2938;--muted:#617084;--nav:#f1f4f8;--line:#dbe2eb;--blue:#244e76;--accent:#23746e;--max:1010px}
*{box-sizing:border-box}html{scroll-behavior:auto}body{margin:0;color:var(--ink);background:#f5f7fa;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:16px;line-height:1.68}a{color:var(--blue);text-underline-offset:3px;overflow-wrap:anywhere}a:hover{color:#16605a}button,input{font:inherit}button{cursor:pointer}.skip{position:absolute;left:12px;top:-80px;background:#fff;padding:10px;z-index:60}.skip:focus{top:10px}:focus-visible{outline:3px solid #419d91;outline-offset:3px}header{height:76px;position:sticky;top:0;z-index:30;background:#182b3b;color:#fff;display:flex;align-items:center;gap:16px;padding:12px 25px;box-shadow:0 1px 8px #152c3820}.mark{width:32px;height:32px;border:1px solid #93b8bd;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#c4e5df;font-size:18px}.brand{font-size:16px;font-weight:720;letter-spacing:.08em}.brand small{font-size:12px;font-weight:400;letter-spacing:.015em;color:#becdd9;display:block}.edition{margin-left:auto;text-align:right;font-size:12px;color:#d0dce5}.header-button{color:#fff;background:transparent;border:1px solid #8295a4;border-radius:6px;padding:5px 10px;font-size:13px}#menu{display:none}.layout{display:grid;grid-template-columns:305px minmax(0,1fr);max-width:1610px;margin:auto}aside{position:sticky;top:76px;height:calc(100vh - 76px);overflow-y:auto;background:var(--nav);border-right:1px solid var(--line);padding:23px 16px 45px;overscroll-behavior:contain}.search-box{position:sticky;top:-23px;background:var(--nav);z-index:3;padding:0 0 15px}.search-box label{font-size:11px;text-transform:uppercase;letter-spacing:.09em;font-weight:700;color:var(--muted)}input{width:100%;margin-top:7px;padding:10px 11px;border:1px solid #b5c3d1;border-radius:7px;background:#fff;font-size:14px}#search-count{font-size:11px;color:var(--muted);padding-top:7px;min-height:24px}summary{font-size:12px;text-transform:uppercase;letter-spacing:.03em;font-weight:700;color:#54657a;cursor:pointer;padding:15px 2px 7px}summary span{float:right;font-weight:400;color:#7c8795;margin-right:4px}.nav-link{display:block;margin:2px 0;padding:7px 10px;border-radius:5px;font-size:12.5px;line-height:1.43;color:#43536a;text-decoration:none}.nav-link:hover{background:#e3eaf1}.nav-link.active{background:#dceae9;color:#155d57;font-weight:650;box-shadow:inset 3px 0 #29796d}.no-results{font-size:14px;color:var(--muted)}main{background:#fff;min-width:0;padding:42px 58px 80px;min-height:calc(100vh - 76px)}article{max-width:var(--max);margin:0 auto}[hidden]{display:none!important}.eyebrow{font-size:11px;font-weight:750;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-bottom:8px}.crumb{font:11px ui-monospace,SFMono-Regular,Consolas,monospace;color:#7b8795;border-bottom:1px solid var(--line);padding-bottom:17px;overflow-wrap:anywhere}h1{font-size:35px;line-height:1.2;letter-spacing:-.7px;color:#17354d;margin:25px 0 22px}h2{font-size:23px;line-height:1.34;color:#223c53;letter-spacing:-.25px;margin:38px 0 15px}h3{font-size:18px;line-height:1.4;color:#344e61;margin:28px 0 11px}h4{font-size:16px;margin-top:24px}p,li{overflow-wrap:anywhere}p{margin:15px 0}li{margin:7px 0}ul,ol{padding-left:24px}hr{border:0;border-top:1px solid var(--line);margin:30px 0}strong{font-weight:670}.table-scroll{width:100%;max-width:100%;overflow-x:auto;margin:23px 0;border:1px solid var(--line);border-radius:6px}table{border-collapse:collapse;width:100%;font-size:13.5px;line-height:1.6}th,td{text-align:left;vertical-align:top;padding:12px 13px;border-bottom:1px solid #e4e9ef;min-width:120px;overflow-wrap:anywhere}th{background:#edf3f6;color:#244055;font-weight:680}tr:last-child td{border-bottom:0}tbody tr:nth-child(even){background:#fafcfd}blockquote{margin:24px 0;padding:10px 20px;border-left:3px solid #4b9388;background:#eff7f5;color:#24483f}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.86em;background:#edf2f6;padding:.12em .28em;border-radius:3px;overflow-wrap:anywhere}pre{max-width:100%;overflow-x:auto;background:#1b2b3b;color:#e9f0f7;padding:20px;border-radius:7px;font-size:12px;line-height:1.7;tab-size:2}pre code{background:none;color:inherit;white-space:pre;word-break:normal;padding:0;font-size:inherit}footer{display:flex;gap:20px;justify-content:space-between;border-top:1px solid var(--line);margin-top:48px;padding-top:17px;font-size:11px;color:var(--muted)}#empty{max-width:var(--max);margin:auto;padding:24px;background:#fff6df}h1,h2,h3,h4{scroll-margin-top:95px;overflow-wrap:anywhere}#backdrop{display:none}.mobile-notice{display:none}
@media(min-width:1400px){main{padding-left:68px;padding-right:68px}}
@media(max-width:1000px){.layout{grid-template-columns:270px minmax(0,1fr)}main{padding:32px 28px 64px}}
@media(max-width:760px){header{height:68px;padding:10px 13px;gap:10px}.brand{font-size:13px}.brand small{font-size:10px}.mark{display:none}.edition{font-size:9px;flex:0 0 126px}.edition br{display:block}#menu{display:block}#print{display:none}.layout{display:block}aside{display:none;position:fixed;top:68px;left:0;width:min(89vw,335px);height:calc(100dvh - 68px);z-index:40;border-right:1px solid var(--line);box-shadow:4px 0 25px #17273625}aside.open{display:block}#backdrop.open{display:block;position:fixed;inset:68px 0 0;background:#15253545;z-index:35}main{padding:28px 20px 60px;min-height:calc(100dvh - 68px)}h1{font-size:28px;letter-spacing:-.4px}h2{font-size:22px;margin-top:31px}h3{font-size:18px}.crumb{font-size:10px}body{font-size:15px;line-height:1.68}th,td{padding:10px;min-width:140px}pre{padding:16px;font-size:11px}footer{display:block}footer span{display:block;margin-top:10px}h1,h2,h3,h4{scroll-margin-top:85px}}
@media print{header,aside,#backdrop,.skip{display:none!important}.layout{display:block}main{padding:0}article{max-width:none}body{background:#fff;font-size:10pt}.table-scroll{overflow:visible;border:0}table{font-size:8pt}th,td{min-width:0;padding:5px}pre{white-space:pre-wrap;background:#f1f3f5;color:#111}pre code{white-space:pre-wrap}h1{font-size:23pt}h2{font-size:16pt}footer{display:none}a{color:inherit}h1,h2,h3{break-after:avoid}}
'''
script=r'''
const index=JSON.parse(document.getElementById('doc-index').textContent);
const byId=new Map(index.map(d=>[d.id,d]));
const nav=document.getElementById('nav');const menu=document.getElementById('menu');const backdrop=document.getElementById('backdrop');
let active=null;const scrolls=new Map();
function closeMenu(){nav.classList.remove('open');backdrop.classList.remove('open');menu.setAttribute('aria-expanded','false');}
function openMenu(){nav.classList.add('open');backdrop.classList.add('open');menu.setAttribute('aria-expanded','true');}
menu.addEventListener('click',()=>nav.classList.contains('open')?closeMenu():openMenu());
backdrop.addEventListener('click',closeMenu);
function go(){
 const hash=decodeURIComponent(location.hash.slice(1));const target=hash||index[0].id;const id=target.split('--')[0];
 if(!byId.has(id)){document.getElementById('empty').hidden=false;return;}
 document.getElementById('empty').hidden=true;
 const changing=active!==id;
 if(changing&&active){scrolls.set(active,window.scrollY);document.getElementById(active).hidden=true;}
 document.getElementById(id).hidden=false;active=id;
 document.querySelectorAll('.nav-link').forEach(a=>{const on=a.dataset.doc===id;a.classList.toggle('active',on);if(on){a.setAttribute('aria-current','page');a.closest('details').open=true;}else a.removeAttribute('aria-current');});
 document.title=byId.get(id).title+' · Sophia v2.0';closeMenu();
 requestAnimationFrame(()=>{if(target!==id){const el=document.getElementById(target);if(el)el.scrollIntoView({block:'start'});}else if(changing){window.scrollTo(0,scrolls.get(id)||0);}});
}
window.addEventListener('hashchange',go);go();
const search=document.getElementById('search');
function searchDocs(){
 const q=search.value.toLocaleLowerCase().trim();const words=q.split(/\s+/).filter(Boolean);let count=0;
 for(const d of index){const match=words.every(w=>d.search.includes(w));const a=document.querySelector('.nav-link[data-doc="'+d.id+'"]');a.hidden=!match;if(match)count++;}
 document.querySelectorAll('.nav-group').forEach(g=>{const match=!!g.querySelector('.nav-link:not([hidden])');g.hidden=!match;if(q&&match)g.open=true;});
 document.getElementById('search-count').textContent=q?count+' matching documents':index.length+' documents · works offline';
 document.getElementById('no-results').hidden=count!==0;
}
search.addEventListener('input',searchDocs);searchDocs();
search.addEventListener('keydown',e=>{if(e.key==='Enter'){const first=document.querySelector('.nav-link:not([hidden])');if(first){location.hash=first.hash;closeMenu();}}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();menu.focus();}if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();if(innerWidth<=760)openMenu();search.focus();search.select();}});
document.getElementById('print').addEventListener('click',()=>window.print());
'''
page=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Sophia · Unified continuation v2.0</title><style>{css}</style></head><body><a class="skip" href="#main">Skip to document</a><header><button id="menu" class="header-button" aria-controls="nav" aria-expanded="false">Contents</button><div class="mark" aria-hidden="true">S</div><div class="brand">SOPHIA<small>Unified continuation pack</small></div><div class="edition">v2.0 · 1 October 2026<br>Planning, not a release</div><button id="print" class="header-button">Print document</button></header><div id="backdrop"></div><div class="layout"><aside id="nav" aria-label="Pack contents"><div class="search-box"><label for="search">Find in the pack</label><input id="search" type="search" placeholder="Privacy, PA-01, Paperclip…" autocomplete="off"><div id="search-count" role="status" aria-live="polite"></div></div><p id="no-results" class="no-results" hidden>No matching documents. Try fewer words.</p>{''.join(nav)}</aside><main id="main" tabindex="-1"><div id="empty" hidden>That document could not be found. <a href="#{docid('00_START_HERE.md')}">Return to the start.</a></div>{''.join(articles)}</main></div><script type="application/json" id="doc-index">{searchdata}</script><script>{script}</script></body></html>'''
# Validate all internal href anchors, including cross-document Markdown headings.
soup=BeautifulSoup(page,'html.parser');ids=[x['id'] for x in soup.find_all(id=True)];idset=set(ids)
for a in soup.find_all('a',href=True):
 if a['href'].startswith('#') and unquote(a['href'][1:]) not in idset:link_errors.append({'href':a['href'],'reason':'missing HTML anchor'})
if len(ids)!=len(idset):link_errors.append({'reason':'duplicate HTML id'})
OUT.write_text(page,encoding='utf-8')
report={'schema':'sophia.reader-links.v2','status':'passed' if not link_errors else 'failed','documents':len(docs),'html_ids':len(ids),'internal_content_links':internal_count,'external_source_links':external_count,'embedded_images':0,'external_asset_dependencies':0,'errors':link_errors}
(ROOT/'tests/reader-link-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,indent=2));print(f'Reader bytes: {OUT.stat().st_size:,}')
if link_errors:raise SystemExit(1)
