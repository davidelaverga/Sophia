import{resolve}from'node:path';import{pathToFileURL}from'node:url';import{writeFileSync}from'node:fs';import{execFileSync}from'node:child_process';
const s=await import(pathToFileURL(resolve('apps/studio/src/features/conversations/talk-store.ts')));
const place='synthetic-project synthetic-actor',id='synthetic-erased-conversation',m='synthetic-message';
s.changeKept(place,k=>s.withHome({...k,drafts:{[id]:'SYNTHETIC-DRAFT'},proposals:{[m]:{key:'proposal-key',ask:'SYNTHETIC-PROPOSAL',sending:true}}},m,id));
s.changeKept(place,k=>s.withoutConversation(k,id));
const gone=s.keptAt(place);
s.changeKept(place,k=>({...k,proposals:s.withEntry(k.proposals,m,{key:'proposal-key',ask:'SYNTHETIC-PROPOSAL',sending:false})}));
const proposalGuarded=!s.keptAt(place).proposals[m];
// Exact shape of useTalk.of(id).onHeld, called by useHeldWrite after an uncertain response.
s.changeKept(place,k=>({...k,holds:s.withEntry(k.holds,id,{key:'synthetic-send-key',ask:{text:'SYNTHETIC-ERASED-SEND-WORDS',askSophia:false},sending:false})}));
const result={candidate:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),level:'L0 actual store function and exact production onHeld updater; no browser-memory claim',erased:gone.erased[id],draftRemoved:!gone.drafts[id],proposalGuarded,lateSendHeld:s.keptAt(place).holds[id]};
writeFileSync(resolve(process.env.CON01_JOURNAL,'late-send-erasure-probe.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));s.forgetKept();
