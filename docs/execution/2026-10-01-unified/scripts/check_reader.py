#!/usr/bin/env python3
"""Check only the generated documentation reader using local Chromium.
No request is permitted to leave the browser. This is not Sophia UI acceptance.
"""
from __future__ import annotations
import json
import os
import uuid
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
reader=ROOT/'READER.html'
if not reader.is_file():raise SystemExit('Run scripts/build_reader.py first.')
html=reader.read_text(encoding='utf-8')
results=[];errors=[];requests=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    version=browser.version
    for name,width,height in [('desktop',1440,1000),('mobile',390,844)]:
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
        page.on('pageerror',lambda e:errors.append(str(e)))
        def intercept(route):
            requests.append(route.request.url);route.abort()
        page.route('**/*',intercept)
        # Exact local bytes; file:// availability is not required in a sandbox.
        page.set_content(html,wait_until='load')
        page.wait_for_selector('article.document:not([hidden]) h1')
        start_path=page.locator('article.document:not([hidden])').get_attribute('data-path')
        assert start_path=='00_START_HERE.md',start_path
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),name+' initial overflow'
        page.screenshot(path=str(ROOT/f'tests/reader-{name}.png'),full_page=False)
        if name=='mobile':
            page.click('#menu')
            assert page.get_attribute('#menu','aria-expanded')=='true'
        page.fill('#search','PA-01')
        target_id=page.evaluate("JSON.parse(document.querySelector('#doc-index').textContent).find(x=>x.path==='goals/PA-01.md').id")
        page.locator(f'a.nav-link[data-doc="{target_id}"]').click()
        page.wait_for_function("document.querySelector('article.document:not([hidden])').dataset.path==='goals/PA-01.md'")
        assert page.locator('#empty').is_hidden()
        if name=='mobile':assert page.get_attribute('#menu','aria-expanded')=='false'
        # Follow a document link from the body, not only from the sidebar.
        link=page.locator('article.document:not([hidden]) a[href^="#doc-"]').first
        dest=link.get_attribute('href');link.click()
        page.wait_for_function('(h)=>location.hash===h',arg=dest)
        assert page.locator('#empty').is_hidden()
        assert page.locator('article.document:not([hidden])').count()==1
        # Search empty state and restoration.
        if name=='mobile':page.click('#menu')
        page.fill('#search',uuid.uuid4().hex)
        assert page.locator('#no-results').is_visible()
        page.fill('#search','')
        assert page.locator('#no-results').is_hidden()
        # Audit width of every embedded document without making network calls.
        overflow=page.evaluate('''() => {
          const docs=[...document.querySelectorAll('article.document')];
          const active=docs.find(x=>!x.hidden); const bad=[];
          docs.forEach(d=>d.hidden=true);
          for(const d of docs){d.hidden=false;if(document.documentElement.scrollWidth>innerWidth+1)bad.push({path:d.dataset.path,width:document.documentElement.scrollWidth});d.hidden=true;}
          if(active)active.hidden=false;return bad;
        }''')
        if overflow:errors.extend([name+' overflow '+str(x) for x in overflow])
        results.append({'viewport':name,'width':width,'height':height,'start_page':True,'full_text_search':True,'search_empty_state':True,'sidebar_navigation':True,'body_cross_document_navigation':True,'single_document_visible':True,'mobile_menu':True if name=='mobile' else 'not_applicable','all_document_page_overflow_errors':overflow,'screenshot':f'tests/reader-{name}.png'})
        page.close()
    browser.close()
report={'schema':'sophia.reader-browser.v2','status':'passed' if not errors and not requests else 'failed','scope':'Exact local HTML bytes in system Chromium only. Not Sophia Studio, mobile Safari, accessibility certification, or provider integration. Browser sandbox flag belongs only to this documentation test, not the Sophia PDF renderer.','chromium_version':version,'results':results,'page_errors':errors,'external_requests':requests,'external_request_count':len(requests)}
(ROOT/'tests/reader-browser-check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2))
if errors or requests:raise SystemExit(1)
