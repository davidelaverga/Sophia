import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=process.env.CON01_CANDIDATE_ROOT;
const req=createRequire(resolve(root,'apps/studio/package.json'));
const {QueryClient}=req('@tanstack/react-query');
const list=await import(pathToFileURL(resolve(root,'apps/studio/src/features/conversations/conversation-list.ts')));
const store=await import(pathToFileURL(resolve(root,'apps/studio/src/features/conversations/talk-store.ts')));
const at='2026-10-10T09:00:00Z';
const coverage={state:'current',complete:true,fromSeq:1,throughSeq:2,newer:0,generatedAt:at,replyId:'reply',eligibilityRevision:1,ledgerRevision:1};
const row={id:'conversation',title:'Synthetic',revision:1,summary:'Synthetic assessed summary',summaryCoverage:coverage,lastAt:at,messageSeq:2,contributors:[{actorId:'other',name:'Synthetic Other'}],sophia:true,openQuestions:0,questionsCoverage:coverage,output:null,lastMessage:null};
const receipt={id:'message',author:'member',actorId:'sender',name:'Synthetic Sender',text:'Synthetic new question?',at:'2026-10-10T09:01:00Z',seq:3};
const c=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
const findings=[];
try {
 const key=list.listKey('project','sender'); c.setQueryData(key,{projectId:'project',conversations:[row]});
 const error=new Error('Synthetic list read outage'); await c.fetchQuery({queryKey:key,queryFn:()=>Promise.reject(error)}).catch(()=>{});
 const q=c.getQueryCache().find({queryKey:key,exact:true}); assert.equal(q.state.status,'error'); const before={...q.state};
 c.setQueriesData({queryKey:list.LISTS},read=>read&&({...read,conversations:list.withLastMessage(read.conversations,'conversation',receipt)}));
 assert.equal(q.state.status,'success');assert.equal(q.state.error,null);findings.push({id:4237298620,observed:'Actual QueryClient call used by composer replaces error with success and null error after successful Send. Before status error; after success.',level:'L0 actual QueryClient operation, no mounted UI'});
 // Positive control: no claim that the fresh-list path itself is erroneous.
 assert.equal(c.getQueryData(key).conversations[0].lastMessage.seq,3);
 const updated=list.withLastMessage([row],'conversation',receipt)[0];
 assert.equal(updated.messageSeq,3);assert.equal(updated.summaryCoverage.state,'current');assert.equal(updated.summaryCoverage.newer,0);assert.equal(updated.questionsCoverage.state,'current');assert.equal(updated.questionsCoverage.newer,0);
 findings.push({id:4237298622,observed:'Trusted receipt seq3 updates messageSeq to3 while summary/questions still current through2 with newer0.',level:'L0 production helper, synthetic assessed projections; API before G2 does not emit assessments'});
 assert.deepEqual(updated.contributors,row.contributors);assert.equal(list.narrowed([updated],{typed:'',open:false,mine:true},'sender').length,0);assert.equal(list.contributorsLine(updated,'sender'),'Synthetic Other · Sophia');
 findings.push({id:4237298623,observed:'First confirmed sender remains absent from contributors and Mine; unrelated writer remains. Current helper.',level:'L0 production helper, no mounted first-writer browser arm'});
 store.forgetKept();const place='project sender';store.changeKept(place,k=>({...k,proposals:{message:{key:'same-key',ask:'Synthetic held text',sending:true}}}));store.changeKept(place,k=>store.withoutConversation(k,'conversation'));
 assert.equal(store.keptAt(place).proposals.message.ask,'Synthetic held text');store.changeKept(place,k=>({...k,proposed:{message:{id:'decision',statement:'Synthetic late success'}}}));assert.equal(store.keptAt(place).proposed.message.statement,'Synthetic late success');
 findings.push({id:4237298613,observed:'Unassociated store state survives withoutConversation and accepts late success. This proves only the store gap; ordinary UI opens a proposal form first and may flush useHome before submission, so mounted timing/reachability is unproven.',level:'L0 manually sequenced production store; no mounted race claim'});
 // Association-before-erasure control, matching the intended normal path.
 store.forgetKept();store.changeKept(place,k=>store.withHome({...k,proposals:{message:{key:'same-key',ask:'Synthetic held text',sending:true}}},'message','conversation'));store.changeKept(place,k=>store.withoutConversation(k,'conversation'));store.changeKept(place,k=>({...k,proposed:{message:{id:'decision',statement:'Synthetic late success'}}}));assert.equal(store.keptAt(place).proposals.message,undefined);assert.equal(store.keptAt(place).proposed.message,undefined);
 // Status-preserving cache control; reviewer does not implement the feature.
 q.setState(before);q.setState({data:{projectId:'project',conversations:[updated]}});assert.equal(q.state.status,'error');assert.equal(q.state.error,error);assert.equal(q.state.dataUpdatedAt,before.dataUpdatedAt);
 console.log(JSON.stringify({candidate:'c52455de2fdd03d9d8f81581b80a4f9ab8cc3dc0',findings,positiveControls:3,featureEdits:0,limits:'L0 only. No browser/provider/native/hosted effect.'},null,2));
} finally {c.clear();store.forgetKept()}
