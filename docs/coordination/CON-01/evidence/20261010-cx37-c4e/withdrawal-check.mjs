import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.CON01_CANDIDATE_ROOT;
const h=await import(pathToFileURL(resolve(root,'apps/studio/src/features/conversations/conversation-list.ts')));
const at='2026-10-10T11:00:00Z', later='2026-10-10T11:01:00Z';
const coverage={state:'stale',complete:true,fromSeq:1,throughSeq:5,newer:1,generatedAt:at,replyId:'r5',eligibilityRevision:1,ledgerRevision:1};
const row={id:'c',title:'Synthetic',revision:1,summary:'Synthetic eligible summary',summaryCoverage:coverage,lastAt:at,messageSeq:6,contributors:[{actorId:'A',name:'Synthetic Withdrawn Name'},{actorId:'B',name:'Synthetic B'}],sophia:false,openQuestions:2,questionsCoverage:coverage,output:null,lastMessage:null};
const msg=(seq,name,actorId='A')=>({id:'m'+seq,seq,author:'member',actorId,name,text:'Synthetic '+seq,at,withdrawn:null,ask:null,replyTo:null});
const gone={...msg(6,'Synthetic Withdrawn Name'),name:null,text:null,withdrawn:{at:later}};
const page=messages=>({pages:[{messages,before:null}],pageParams:[null]});
const after=h.withWithdrawn(page([msg(1,'Synthetic Surviving Name'),msg(6,'Synthetic Withdrawn Name')]),gone);
const remains=h.remainsAfter(after,gone);
const changed=h.listWithdrawn({projectId:'p',conversations:[row]},'c',remains).conversations[0];
const passed=[],failed=[];
const check=(name,fn)=>{try{fn();passed.push(name)}catch(e){failed.push({name,error:e.message})}};
const safeName=r=>{assert.notEqual(r.contributors.find(p=>p.actorId==='A')?.name,'Synthetic Withdrawn Name');};
check('Direct withdrawal cannot retain name sourced solely from withdrawn latest message',()=>safeName(changed));
check('Header row correction cannot retain withdrawn latest name',()=>safeName(h.rowWithdrawn(row,remains)));
check('Same-actor older null name uses surviving fallback, not withdrawn latest name',()=>{
 const held=h.withWithdrawn(page([msg(1,null),msg(6,'Synthetic Withdrawn Name')]),gone);
 safeName(h.rowWithdrawn(row,h.remainsAfter(held,gone)));
});
check('Valid summary through5 survives withdrawal6',()=>{assert.equal(changed.summary,row.summary);assert.equal(changed.summaryCoverage.throughSeq,5)});
check('Valid question assessment through5 survives withdrawal6',()=>{assert.equal(changed.openQuestions,2);assert.equal(changed.questionsCoverage.throughSeq,5)});
check('Late prewithdrawal row cannot revive withdrawn contributor name even if no other fields change',()=>{
 const noAssessment={...row,summary:null,summaryCoverage:{...coverage,state:'not_assessed',fromSeq:null,throughSeq:null},openQuestions:0,questionsCoverage:{...coverage,state:'not_assessed',fromSeq:null,throughSeq:null}};
 safeName(h.rowsKnown([noAssessment],()=>after,()=>true)[0]);
});
check('Sole writer removed; unrelated writer preserved',()=>{
 const held=h.withWithdrawn(page([msg(6,'Synthetic Withdrawn Name')]),gone);
 const r=h.rowWithdrawn(row,h.remainsAfter(held,gone));
 assert.deepEqual(r.contributors,[{actorId:'B',name:'Synthetic B'}]);
});
check('Summary overlapping withdrawn6 cleared',()=>{
 const r=h.rowWithdrawn({...row,summaryCoverage:{...coverage,throughSeq:6}},remains);
 assert.equal(r.summary,null);assert.equal(r.summaryCoverage.state,'not_assessed');
});
check('Question projection overlapping withdrawn6 cleared',()=>{
 const r=h.rowWithdrawn({...row,questionsCoverage:{...coverage,throughSeq:6}},remains);
 assert.equal(r.openQuestions,0);assert.equal(r.questionsCoverage.state,'not_assessed');
});
check('Unrelated conversation unchanged',()=>{
 const other={...row,id:'other'};
 assert.equal(h.listWithdrawn({conversations:[other]},'c',remains).conversations[0],other);
});
console.log(JSON.stringify({candidate:process.env.CON01_CANDIDATE_SHA,level:'L0 actual production helpers; synthetic eligible thread and assessed projections; no app/native/provider claim',passed:passed.length,failed:failed.length,passedCases:passed,failedCases:failed},null,2));
process.exitCode=failed.length?1:0;
