import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.CON01_CANDIDATE_ROOT;
const load=p=>import(pathToFileURL(resolve(root,p)));
const store=await load('apps/studio/src/features/conversations/talk-store.ts');
const {keepWithdrawnPurged}=await load('apps/studio/src/features/conversations/withdrawn-purge.ts');
const {messagesKey}=await load('apps/studio/src/features/conversations/conversation-list.ts');
const {QueryClient}=await load('apps/studio/node_modules/@tanstack/react-query/build/modern/index.js');
const reader='12a11111-1111-4111-8111-111111111111', foreign='23b22222-2222-4222-8222-222222222222';
const project='synthetic-project', conversation='synthetic-conversation', m='synthetic-withdrawn', other='synthetic-eligible';
const place=project+' '+reader, otherPlace='other-project '+reader, foreignPlace=project+' '+foreign;
const tombstone={id:m,seq:1,author:'member',actorId:reader,name:null,text:null,at:'2026-10-10T13:00:00Z',withdrawn:{at:'2026-10-10T13:01:00Z'},ask:null,replyTo:null};
const page={pages:[{conversationId:conversation,messages:[tombstone],before:null}],pageParams:[null]};
const fields=['proposals','proposalRefusals','proposed','withdrawals','homes'];
const seedOne=(where,home=conversation)=>store.changeKept(where,k=>({...k,
 drafts:{[conversation]:'SYNTHETIC unrelated unsent draft'},asks:{[conversation]:false},
 decision:{key:'synthetic-a08-decision',ask:{intent:'synthetic canonical decision intent'},sending:true},decisionRefusal:'synthetic separate decision receipt',
 proposals:{[m]:{key:'held-proposal',ask:'SYNTHETIC withdrawn derived words',sending:true},[other]:{key:'eligible-proposal',ask:'SYNTHETIC eligible words',sending:false}},
 proposalRefusals:{[m]:'SYNTHETIC refused derived words'},proposed:{[m]:{id:'synthetic-proposal',statement:'SYNTHETIC derived statement'}},
 withdrawals:{[m]:{key:'held-withdrawal',ask:m,sending:false}},homes:{[m]:home,[other]:'eligible-conversation'}}));
const setup=(register=true)=>{store.forgetKept();seedOne(place);seedOne(foreignPlace);store.changeKept(otherPlace,k=>({...k,drafts:{'other-conversation':'SYNTHETIC other project draft'},proposals:{'other-project-message':{key:'other-project-proposal',ask:'SYNTHETIC other project',sending:false}},homes:{'other-project-message':'other-conversation'}}));const c=new QueryClient();if(register)keepWithdrawnPurged(c.getQueryCache());return c};
const gone=()=>{const k=store.keptAt(place);assert.equal(k.gone[m],true);for(const f of fields)assert.equal(k[f][m],undefined)};
const passed=[],failed=[];const test=(name,f)=>{let c;try{c=f();passed.push(name)}catch(e){failed.push({name,error:e.message})}finally{c?.clear();store.forgetKept()}};
test('An unmounted thread tombstone retires held message words and keys through actual cache subscription',()=>{const c=setup();c.setQueryData(messagesKey(conversation,reader),page);gone();return c});
test('A late proposal completion cannot restore withdrawn derived text or held key',()=>{const c=setup(),born=store.currentGeneration();c.setQueryData(messagesKey(conversation,reader),page);store.changeIfCurrent(place,born,k=>({...k,proposed:{...k.proposed,[m]:{id:'late',statement:'SYNTHETIC late withdrawn text'}},proposals:{...k.proposals,[m]:{key:'late',ask:'SYNTHETIC late',sending:false}}}));gone();return c});
test('Another reader, another conversation in another project and eligible message/draft/decision stay',()=>{const c=setup(),before=store.keptAt(place);c.setQueryData(messagesKey(conversation,reader),page);const k=store.keptAt(place);assert.equal(store.keptAt(foreignPlace).proposals[m].key,'held-proposal');assert.equal(store.keptAt(otherPlace).proposals['other-project-message'].key,'other-project-proposal');assert.equal(k.proposals[other].key,'eligible-proposal');assert.deepEqual(k.drafts,before.drafts);assert.equal(k.decision,before.decision);assert.equal(k.decisionRefusal,before.decisionRefusal);return c});
test('Existing cached tombstone is processed when subscription first starts',()=>{const c=setup(false);c.setQueryData(messagesKey(conversation,reader),page);keepWithdrawnPurged(c.getQueryCache());gone();return c});
test('Repeated tombstone cannot restore state; unrelated eligible thread has no retirement',()=>{const c=setup();c.setQueryData(messagesKey(conversation,reader),page);c.setQueryData(messagesKey(conversation,reader),{...page});gone();c.setQueryData(messagesKey('eligible-conversation',reader),{pages:[{conversationId:'eligible-conversation',messages:[{...tombstone,id:other,text:'SYNTHETIC eligible',withdrawn:null}],before:null}],pageParams:[null]});assert.equal(store.keptAt(place).proposals[other].key,'eligible-proposal');return c});
test('Signout generation prevents an old asynchronous callback re-creating kept state',()=>{const c=setup(),born=store.currentGeneration();c.setQueryData(messagesKey(conversation,reader),page);store.forgetKept();store.changeIfCurrent(place,born,k=>({...k,proposed:{[m]:{id:'late',statement:'SYNTHETIC late'}}}));assert.equal(store.keptAt(place),undefined);return c});
console.log(JSON.stringify({candidate:process.env.CON01_CANDIDATE_SHA,scope:'L0 actual production QueryClient cache subscription plus actual talk-store; synthetic cache records; no mounted React, API/A08 persistence or privacy erasure receipt claim',passed:passed.length,failed:failed.length,passedCases:passed,failedCases:failed},null,2));process.exitCode=failed.length?1:0;
