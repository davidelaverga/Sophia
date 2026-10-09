// Independent L0 cache-shape probe only. This does not fabricate or qualify a native/provider answer.
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {writeFileSync} from 'node:fs'
const {withWithdrawn,remainsAfter,listWithdrawn}=await import(pathToFileURL(resolve(process.cwd(),'apps/studio/src/features/conversations/conversation-list.ts')))
const at='2026-10-09T22:45:00.000Z'
// A message read before a newly published dependent answer. The list refreshed, but message-page rereads failed.
const asking={id:'m1',seq:1,author:'member',actorId:'editor',name:'Editor',text:'synthetic',at,withdrawn:null,ask:null,replyTo:null}
const before={pages:[{messages:[asking],before:null}],pageParams:[null]}
const gone={...asking,text:null,name:null,withdrawn:{at}}
const after=withWithdrawn(before,gone), remains=remainsAfter(before,after,gone)
const list={conversations:[{id:'c1',contributors:[{actorId:'editor',name:'Editor'}],sophia:true,lastMessage:null,summary:null,summaryCoverage:{state:'not_assessed'}}]}
const result={candidate:'7660c7344e65986cee642323ca59164e82021c94',level:'L0 pure cache shapes, no provider/native/app-answer claim',scenario:'dependent Sophia answer exists in refreshed list but was never loaded after its message-page read failed; withdrawal succeeds, subsequent list read fails',remains,sophiaAfter:listWithdrawn(list,'c1',remains).conversations[0].sophia,expected:'conservatively suppress unknown/unloaded Sophia attribution after withdrawal'}
writeFileSync(resolve(process.env.CON01_JOURNAL,'cache-unloaded-answer-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
