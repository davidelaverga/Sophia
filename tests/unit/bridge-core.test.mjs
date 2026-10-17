import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseCommand, ProtocolError } from '../../packages/dsh-bundle/dist/protocol.js'
import { foldLog, Journal, strongestFence } from '../../packages/dsh-bundle/dist/session-events.js'

const valid = {
  schema: 'sophia.runtime-command.v1',
  commandId: 'cmd-1',
  binding: { projectId: 'p', goalId: 'g', goalRevision: 1, attemptId: 'a1', resourceId: 'r', authorityEpoch: 2, runtimeUnitId: 'u' },
  kind: 'steer',
  expectedNativeSessionId: null,
  contextPacketId: null,
  payload: { text: 'hi' },
}

test('commands are validated field by field; anything else is a ProtocolError', () => {
  assert.equal(parseCommand(valid).binding.authorityEpoch, 2)
  const bad = [
    { ...valid, schema: 'v0' },
    { ...valid, kind: 'delete' },
    { ...valid, commandId: '' },
    { ...valid, binding: { ...valid.binding, authorityEpoch: -1 } },
    { ...valid, binding: { ...valid.binding, attemptId: 7 } },
    { ...valid, payload: null },
    { ...valid, expectedNativeSessionId: '' },
    null,
  ]
  for (const value of bad) assert.throws(() => parseCommand(value), ProtocolError)
})

test('the journal folds commands, fences, stash and settlement; a stop is terminal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'journal-'))
  try {
    const journal = new Journal(dir)
    const sid = 'sophia-a1'
    journal.append(sid, 'sophia/command', { commandId: 'c1', kind: 'input', attemptId: 'a1', authorityEpoch: 1, messageId: 'm1', target: 'next-turn', content: [{ type: 'text', text: 'x' }], nativeSeq: null })
    journal.append(sid, 'sophia/settled', { commandId: 'c1', nativeSeq: 12 })
    journal.append(sid, 'sophia/fence', { attemptId: 'a1', authorityEpoch: 2, state: 'held', commandId: 'c2' })
    journal.append(sid, 'sophia/stash', { attemptId: 'a1', messages: [{ messageId: 'm2', target: 'next-step', content: [] }, { messageId: 'm3', target: 'next-turn', content: [] }] })
    journal.append(sid, 'sophia/unstash', { attemptId: 'a1', commandId: 'c3', messageIds: ['m2'] })
    let state = foldLog(new Journal(dir).read(sid), [{ type: 'user/message', seq: 13, time: 0, data: { id: 'm1' } }])
    assert.equal(state.fence, 'held')
    assert.equal(state.authorityEpoch, 2)
    assert.deepEqual(state.commands.get('c1'), { seq: 0, kind: 'input', messageId: 'm1', target: 'next-turn', content: [{ type: 'text', text: 'x' }], nativeSeq: 12, stage: null, reason: null, settled: true })
    assert.deepEqual(state.stash.map((m) => m.messageId), ['m3'])
    assert.ok(state.incorporated.has('m1'))
    journal.append(sid, 'sophia/fence', { attemptId: 'a1', authorityEpoch: 3, state: 'stopped', commandId: 'c4' })
    journal.append(sid, 'sophia/fence', { attemptId: 'a1', authorityEpoch: 3, state: 'active', commandId: 'c5' })
    state = foldLog(new Journal(dir).read(sid))
    assert.equal(state.fence, 'stopped', 'nothing reopens a stopped attempt')
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('a torn final journal line (crash mid-write) is cut before the next append; earlier corruption is not tolerated', () => {
  const dir = mkdtempSync(join(tmpdir(), 'journal-'))
  const file = join(dir, 's1.jsonl')
  const fence = { attemptId: 'a', authorityEpoch: 1, state: 'held', commandId: 'c' }
  try {
    new Journal(dir).append('s1', 'sophia/fence', fence)
    appendFileSync(file, '{"seq":1,"ty')
    const journal = new Journal(dir)
    assert.equal(journal.read('s1').length, 1)
    assert.ok(readFileSync(file, 'utf8').endsWith('}\n'), 'the torn tail is gone from disk')
    journal.append('s1', 'sophia/fence', fence)
    journal.append('s1', 'sophia/fence', fence)
    assert.deepEqual(new Journal(dir).read('s1').map((r) => r.seq), [0, 1, 2], 'appends after a torn tail stay readable')

    // A complete record whose newline was cut is kept and terminated.
    writeFileSync(file, readFileSync(file, 'utf8').trimEnd())
    const again = new Journal(dir)
    assert.equal(again.read('s1').length, 3)
    again.append('s1', 'sophia/fence', fence)
    assert.equal(new Journal(dir).read('s1').length, 4)

    appendFileSync(file, '{"seq":4,"ty\n{"seq":5,"time":0,"type":"sophia/fence","data":{}}\n')
    assert.throws(() => new Journal(dir).read('s1'), /corrupt/)
    assert.throws(() => journal.read('../escape'), /unsafe journal name/)
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('the journal separates settled from unsettled commands, tracks redelivered held input, and keeps the observation cursor', () => {
  const dir = mkdtempSync(join(tmpdir(), 'journal-'))
  try {
    const journal = new Journal(dir)
    const sid = 'sophia-a2'
    const text = (t) => [{ type: 'text', text: t }]
    const cmd = (commandId, messageId, extra = {}) => ({ commandId, kind: 'input', attemptId: 'a2', authorityEpoch: 1, messageId, target: 'next-turn', content: text(commandId), nativeSeq: null, role: null, ...extra })
    journal.append(sid, 'sophia/command', cmd('c1', 'm1'))
    journal.append(sid, 'sophia/settled', { commandId: 'c1', nativeSeq: 4 })
    journal.append(sid, 'sophia/command', cmd('c2', 'm2'))
    // c2 re-executed after a restart with a new message: the re-execution replaces it.
    journal.append(sid, 'sophia/command', cmd('c2', 'm2b', { authorityEpoch: 3 }))
    // A duplicate record never replaces a settled command.
    journal.append(sid, 'sophia/command', cmd('c1', 'm1-dup'))
    journal.append(sid, 'sophia/stash', { attemptId: 'a2', messages: [{ messageId: 'h1', target: 'next-step', content: text('held') }] })
    journal.append(sid, 'sophia/unstash', { attemptId: 'a2', commandId: 'r1', messageIds: ['h1'], messages: [{ messageId: 'h1b', target: 'next-step', content: text('held') }] })
    journal.append(sid, 'sophia/observed', { nativeSeq: 7 })
    journal.append(sid, 'sophia/observed', { nativeSeq: 5 })
    journal.append(sid, 'sophia/command', { ...cmd('h1', null), kind: 'hold', target: null, content: null })
    journal.append(sid, 'sophia/settled', { commandId: 'h1', nativeSeq: 9, stage: 'checked', reason: 'held; the native driver is idle' })
    journal.append(sid, 'sophia/receipted', { commandId: 'c1', stage: 'incorporation_observed' })
    journal.append(sid, 'sophia/epoch', { attemptId: 'a2', authorityEpoch: 5 })
    let state = foldLog(journal.read(sid))
    assert.equal(state.commands.get('c1').settled, true)
    assert.equal(state.commands.get('c1').messageId, 'm1')
    assert.equal(state.commands.get('c2').settled, false)
    assert.equal(state.commands.get('c2').messageId, 'm2b')
    assert.equal(state.authorityEpoch, 5, 'an inspect-only epoch raise counts')
    assert.equal(state.commands.get('h1').stage, 'checked', 'a settled Hold keeps the stage it earned')
    assert.deepEqual([...state.incorporationReceipted], ['c1'])
    assert.deepEqual(state.stash, [])
    assert.deepEqual(state.unstashed.map((m) => m.messageId), ['h1b'])
    assert.equal(state.observedSeq, 7)
    // Claimed again while held: back in the stash, no longer awaiting dsh.
    journal.append(sid, 'sophia/stash', { attemptId: 'a2', messages: [{ messageId: 'h1b', target: 'next-step', content: text('held') }] })
    state = foldLog(journal.read(sid))
    assert.deepEqual(state.stash.map((m) => m.messageId), ['h1b'])
    assert.deepEqual(state.unstashed, [])
    assert.equal(strongestFence('held', 'active'), 'held')
    assert.equal(strongestFence('active', 'stopped'), 'stopped')
    assert.equal(strongestFence('held', 'stopped'), 'stopped')
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('the first recorded execution identity is the attempt\'s; a later record never replaces it (SMC-M02 G3)', () => {
  const identity = (model, source) => ({ attemptId: 'a1', runtimeUnitId: 'u', preset: { id: 'sophia-review-v1', digest: 'sha256:1' }, route: { provider: 'p', model, reasoningEffort: null }, source, evidence: null })
  assert.equal(foldLog([]).identity, null)
  const journal = [
    { seq: 0, time: 0, type: 'sophia/identity', data: identity('m1', 'create') },
    { seq: 1, time: 0, type: 'sophia/command', data: { commandId: 'c1', kind: 'create', attemptId: 'a1', authorityEpoch: 1, messageId: null, target: null, content: null, nativeSeq: null, role: 'sophia-review-v1' } },
    { seq: 2, time: 0, type: 'sophia/identity', data: identity('m2', 'migrated') },
  ]
  const logged = foldLog(journal)
  assert.equal(logged.identity.route.model, 'm1')
  assert.equal(logged.identity.source, 'create')
  assert.equal(logged.role, 'sophia-review-v1')
})

import { createServer } from 'node:http'
import { mkdtemp as mkdtempReplyPoll, rm as rmReplyPoll } from 'node:fs/promises'
import { ControlBridge } from '../../packages/dsh-bundle/dist/control-bridge.js'
const replyPollSettings={routeId:'synthetic',route:{provider:'synthetic',model:'synthetic',reasoningEffort:null},maxTokens:10,
  admissionWaitMs:100,bounds:{deadlineMs:1000,graceMs:2,killMs:5,exitWaitMs:10,settleWaitMs:10},
  retry:{requestWaitMs:10,retryWaitMs:2,maxAttempts:1},receiptWaitMs:100,verification:null,launch:()=>assert.fail('no launch')}
async function replyPollCrossing(mode){
 const scratch=await mkdtempReplyPoll(join(tmpdir(),'independent-poll-refresh-'));let bridge,polls=0,reads=0,timer;const logs=[]
 const server=createServer((req,res)=>{
  res.setHeader('content-type','application/json')
  if(req.url==='/v1/runtime/hello'){res.end(JSON.stringify({projectId:'p',leaseId:'synthetic',authorityEpoch:1,bindings:[],cursor:0}));return}
  if(req.url==='/v1/runtime/ready'){res.statusCode=204;res.end();return}
  polls++;if(polls===2)bridge.stopping.abort();res.statusCode=409;res.end(JSON.stringify({code:'invalid_state',message:'synthetic supersession'}))
 })
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const settings={protocolVersion:1,bundle:'synthetic',dshVersion:'synthetic',runtimeUnitId:'unit',
   service:{baseUrl:`http://127.0.0.1:${server.address().port}`,token:'synthetic-only'},workspace:scratch,journalDir:scratch,pollWaitMs:1,settleTimeoutMs:1,routes:{},roleRoutes:{},research:null,log:x=>logs.push(x)}
  Object.defineProperty(settings,'replies',{get(){reads++;if(mode==='toggle-disabled')return reads===1?null:replyPollSettings;if(mode==='toggle-enabled')return reads===1?replyPollSettings:null;return mode==='enabled'?replyPollSettings:mode==='invalid'?{...replyPollSettings,routeId:3}:null}})
  bridge=new ControlBridge({},settings);bridge.advertisedRoles=async()=>[]
  const goal={handle:{dispose:()=>assert.fail('must not dispose goal')}};bridge.attempts.set('synthetic-goal',goal)
  let timeout=false
  await Promise.race([bridge.connect(),new Promise(r=>{timer=setTimeout(()=>{timeout=true;bridge.stopping.abort();r()},4000)})])
  assert.equal(timeout,false)
  assert.equal(bridge.attempts.get('synthetic-goal'),goal)
  return {mode,polls,reads,controllerEnabled:bridge.replies?.settings!==null,hook:bridge.replySuperseded!==null,readiness:bridge.readiness,logs}
 }finally{clearTimeout(timer);bridge?.stopping.abort();bridge?.replies?.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));await rmReplyPoll(scratch,{recursive:true,force:true})}
}
for(const mode of ['enabled','disabled','invalid','toggle-disabled','toggle-enabled'])test('refreshed actual connect '+mode,async()=>{
 const r=await replyPollCrossing(mode);process.stdout.write(JSON.stringify(r)+'\n')
 const expected=mode==='enabled'||mode==='toggle-enabled'
 assert.equal(r.hook,expected,'hook must match the exact configuration passed to the captured controller')
 assert.equal(r.polls,expected?1:2,'supersession must fence only the exact enabled controller')
})

// #393 review: a retained receipt whose delivery the service accepts but never answers is retried within its bound,
// so it neither blocks the receipts behind it nor waits forever. The bridge's own queue and transport, over real HTTP.
test('a retained receipt delivery that stalls is bounded and sent again', async () => {
  const scratch = await mkdtempReplyPoll(join(tmpdir(), 'retained-receipt-'))
  const delivered = []
  let attempts = 0
  const open = new Set()
  const server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    if (req.url !== '/v1/runtime/receipts') return res.writeHead(404).end()
    attempts += 1
    if (attempts === 1) {
      open.add(res)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.write('{')
      return
    }
    delivered.push(...JSON.parse(raw).receipts)
    res.writeHead(204).end()
  })
  let bridge
  try {
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    bridge = new ControlBridge({}, {
      protocolVersion: 1, bundle: 'synthetic', dshVersion: 'synthetic', runtimeUnitId: 'unit',
      service: { baseUrl: `http://127.0.0.1:${server.address().port}`, token: 'synthetic-only' },
      workspace: scratch, journalDir: scratch, pollWaitMs: 1, settleTimeoutMs: 1, receiptWaitMs: 150,
      routes: {}, roleRoutes: {}, research: null, log: () => {},
    })
    const receipt = {
      commandId: 'cmd-retained', attemptId: 'att-retained', stage: 'checked', nativeSessionId: null, nativeSequence: null,
      evidenceRefs: [], observedAt: new Date().toISOString(), reason: null,
    }
    bridge.send(receipt)
    const deadline = Date.now() + 4000
    while (delivered.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25))
    assert.equal(attempts, 2, 'the stalled attempt was abandoned and the batch sent again')
    assert.deepEqual(delivered.map((r) => [r.commandId, r.stage]), [['cmd-retained', 'checked']])
  } finally {
    bridge?.stopping.abort()
    for (const res of open) res.destroy()
    server.closeAllConnections()
    await new Promise((r) => server.close(r))
    await rmReplyPoll(scratch, { recursive: true, force: true })
  }
})
