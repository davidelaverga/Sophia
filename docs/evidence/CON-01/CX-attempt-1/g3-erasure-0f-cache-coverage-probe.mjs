import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
const {withWithdrawn,remainsAfter,listWithdrawn,contributorsLine}=await import(pathToFileURL(resolve(process.cwd(),'apps/studio/src/features/conversations/conversation-list.ts')))
const at='2026-10-09T22:45:00.000Z'
const asking={id:'m1',seq:1,author:'member',actorId:'editor',name:'Editor',text:'synthetic',at,withdrawn:null,ask:null,replyTo:null}
const before={pages:[{messages:[asking],before:null}],pageParams:[null]}
const gone={...asking,text:null,name:null,withdrawn:{at}}
const after=withWithdrawn(before,gone)
const remains=remainsAfter.length===3?remainsAfter(before,after,gone):remainsAfter(after,gone)
const contributors=Array.from({length:200},(_,i)=>({actorId:i===0?'editor':`synthetic-writer-${i}`,name:`Writer ${i}`}))
const row={id:'c1',contributors,sophia:true,lastMessage:null,summary:null,summaryCoverage:{state:'not_assessed'}}
const changed=listWithdrawn({conversations:[row]},'c1',remains).conversations[0]
const result={candidate:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),level:'L0 pure cache shape only; no fabricated native/app answer',scenario:'201+ actual writer possibility; list is capped200, retained editor withdraws while list reread fails and omitted writer still contributes; dependent Sophia answer not loaded',contributorsAfter:changed.contributors.length,othersBefore:contributorsLine(row,'editor').includes('and others'),othersAfter:contributorsLine(changed,'editor').includes('and others'),sophiaAfter:changed.sophia,remains,expected:{othersAfter:true,sophiaAfter:false}}
writeFileSync(resolve(process.env.CON01_JOURNAL,'cache-coverage-probe-'+result.candidate.slice(0,8)+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
