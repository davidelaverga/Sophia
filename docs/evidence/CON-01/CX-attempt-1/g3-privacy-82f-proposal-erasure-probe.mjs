import {resolve} from 'node:path';import{pathToFileURL}from'node:url';import{writeFileSync}from'node:fs';import{execFileSync}from'node:child_process'
const s=await import(pathToFileURL(resolve('apps/studio/src/features/conversations/talk-store.ts')))
const place='synthetic-project synthetic-actor',id='synthetic-conversation',message='synthetic-message'
s.changeKept(place,k=>({...k,drafts:{[id]:'synthetic private draft'},proposals:{[message]:{key:'synthetic-proposal-key',ask:'SYNTHETIC-WITHDRAWN-PROPOSAL-TEXT',sending:false}},proposalRefusals:{[message]:'synthetic refusal'},proposed:{[message]:{id:'synthetic-decision',statement:'SYNTHETIC-WITHDRAWN-PROPOSED-TEXT'}}}))
const after=s.withoutConversation(s.keptAt(place),id)
const result={candidate:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),level:'L0 actual pure store helper only; not actual browser memory',conversationDraftRemoved:!(id in after.drafts),retainedProposal:after.proposals[message],retainedRefusal:after.proposalRefusals[message],retainedProposedMark:after.proposed[message]}
writeFileSync(resolve(process.env.CON01_JOURNAL,'proposal-erasure-probe.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));s.forgetKept()
