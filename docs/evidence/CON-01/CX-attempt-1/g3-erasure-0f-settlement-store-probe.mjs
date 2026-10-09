import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {writeFileSync} from 'node:fs';import {execFileSync} from 'node:child_process'
const {changeKept,keptAt,withoutConversation,forgetKept}=await import(pathToFileURL(resolve(process.cwd(),'apps/studio/src/features/conversations/talk-store.ts')))
const place='synthetic-project synthetic-actor';changeKept(place,k=>({...k,erasures:{target:{key:'synthetic-key',ask:'target',sending:true}},drafts:{target:'synthetic old draft',other:'synthetic other draft'}}))
const after=withoutConversation(keptAt(place),'target')
const result={candidate:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),level:'L0 pure store only; no runtime/provider claim',scenario:'feed settlement calls withoutConversation while held erasure is still sending',heldErasureAfter:after.erasures.target,oldDraftRemoved:!('target' in after.drafts),otherDraftPreserved:after.drafts.other==='synthetic other draft'}
writeFileSync(resolve(process.env.CON01_JOURNAL,'settlement-store-probe.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));forgetKept()
