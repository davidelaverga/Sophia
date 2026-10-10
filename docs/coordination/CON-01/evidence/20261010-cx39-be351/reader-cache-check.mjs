import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.CON01_CANDIDATE_ROOT;
const h=await import(pathToFileURL(resolve(root,'apps/studio/src/features/conversations/conversation-list.ts')));
const p=await import(pathToFileURL(resolve(root,'apps/studio/src/features/conversations/withdrawn-purge.ts')));
const req=createRequire(resolve(root,'apps/studio/package.json')),{QueryClient}=req('@tanstack/react-query');
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const at='2026-10-10T11:00:00Z';
const coverage={state:'not_assessed',complete:false,fromSeq:null,throughSeq:null,newer:0,generatedAt:null,replyId:null,eligibilityRevision:null,ledgerRevision:null};
const row=contributors=>({id:'c',title:'Synthetic',revision:1,summary:null,summaryCoverage:coverage,lastAt:at,messageSeq:1,contributors,sophia:false,openQuestions:0,questionsCoverage:coverage,output:null,lastMessage:null});
const msg=(seq,actorId,name)=>({id:'m'+seq,seq,author:'member',actorId,name,text:'Synthetic '+seq,at,withdrawn:null,ask:null,replyTo:null});
const gone={...msg(3,A,'Synthetic Withdrawn'),name:null,text:null,withdrawn:{at:'2026-10-10T11:01:00Z'}};
const thread={pages:[{messages:[msg(1,B,'Synthetic B'),msg(2,A,'Synthetic Surviving'),gone],before:null}],pageParams:[null]};
const full=()=>Array.from({length:200},(_,i)=>({actorId:i===199?B:'X'+i,name:'Synthetic '+i}));
const passed=[],failed=[];
const check=(name,f)=>{try{f();passed.push(name)}catch(e){failed.push({name,error:e.message})}};
const run=(reader,contributors)=>{
 const qc=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
 p.keepWithdrawnPurged(qc.getQueryCache());const key=h.listKey('project',reader),old=row(contributors);
 qc.setQueryData(key,{projectId:'project',conversations:[old],readFrom:p.listReadSetsOut()});
 qc.setQueryData(h.messagesKey('c',reader),thread);
 const current=qc.getQueryData(key).conversations[0];
 return {qc,key,old,current};
};
const own=run(A,full()),other=run(B,full()),upper=run(A.toUpperCase(),full());
try{
 check('Actual QueryCache purge includes absent reader A at cap200 and Mine stays true',()=>{assert.equal(own.current.contributors.length,200);assert.ok(own.current.contributors.some(p=>p.actorId===A));assert.equal(h.narrowed([own.current],{typed:'',open:false,mine:true},A).length,1)});
 check('Reader insertion uses surviving trusted name and never withdrawn name',()=>{assert.equal(own.current.contributors.find(p=>p.actorId===A)?.name,'Synthetic Surviving');assert.ok(own.current.contributors.every(p=>p.name!=='Synthetic Withdrawn'))});
 check('Other reader B retained at cap when withdrawal writer is A',()=>{assert.equal(other.current.contributors.length,200);assert.ok(other.current.contributors.some(p=>p.actorId===B));assert.equal(h.narrowed([other.current],{typed:'',open:false,mine:true},B).length,1)});
 check('Opaque account scope retained while actor comparison accepts API lowercased UUID',()=>{assert.ok(upper.current.contributors.some(p=>p.actorId===A));assert.ok(upper.qc.getQueryData(h.listKey('project',A.toUpperCase())));assert.equal(upper.qc.getQueryData(h.listKey('project',A)),undefined)});
 check('Repeated real cache purge stays bounded, ordered and duplicate-free',()=>{p.purgeWithdrawn(own.qc.getQueryCache(),A);const r=own.qc.getQueryData(own.key).conversations[0];assert.deepEqual(r.contributors,own.current.contributors);assert.equal(new Set(r.contributors.map(p=>p.actorId)).size,r.contributors.length)});
 const isolated=new QueryClient({defaultOptions:{queries:{gcTime:Infinity}}});
 try{
  p.keepWithdrawnPurged(isolated.getQueryCache());
  const keyB=h.listKey('project',B),before=row(full());
  isolated.setQueryData(keyB,{projectId:'project',conversations:[before],readFrom:p.listReadSetsOut()});
  isolated.setQueryData(h.messagesKey('c',A),thread);
  check('Another account thread cannot supply reader identity or correction to B list',()=>assert.equal(isolated.getQueryData(keyB).conversations[0],before));
 }finally{isolated.clear()}
}finally{own.qc.clear();other.qc.clear();upper.qc.clear()}
console.log(JSON.stringify({candidate:process.env.CON01_CANDIDATE_SHA,level:'L0 actual QueryClient/cache subscription/purge and synthetic UUID reader scopes, no mounted app/authentication claim',passed:passed.length,failed:failed.length,passedCases:passed,failedCases:failed},null,2));process.exitCode=failed.length?1:0;
