// The child projection must preserve governed text exactly and keep native-only content inside its home.
import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Duplex } from 'node:stream'
import { ReplyRelay } from '../../packages/dsh-bundle/dist/reply-child.js'
import { projectReplyEvent, ReplyJournal, ReplyControlReader, ReplyAccounting, ReplyEmitter, checkReplyCall, createReplyAgent, observeReplyEvents, ReplyCallMeter, ReplyChildRuntime } from '../../packages/dsh-bundle/src/reply-plugin.ts'
const require = createRequire(new URL('../../packages/dsh-bundle/package.json', import.meta.url))
const { AssistantStreamAccumulator, projectToolUpdates } = require('@deepseek-ai/dsh-llm')
const identity = { runtimeUnitId: 'synthetic-unit', attemptId: 'attempt-1', nativeSessionId: 'sophia-attempt-1' }
const controlScope = { attemptId: 'attempt-1', nonce: 'ab'.repeat(32), route: { provider: 'synthetic', model: 'fixture', reasoningEffort: null }, maxTokens: 100 }
const startFrame = () => ({ t: 'start', attemptId: controlScope.attemptId, sessionId: identity.nativeSessionId, epoch: 1, nonce: controlScope.nonce, route: { ...controlScope.route }, maxTokens: 100, prompt: 'synthetic😀' })
const encoded = value => Buffer.from(JSON.stringify(value) + '\n')
const accounting = (waitMs = 1000) => {
  const events = []
  const calls = new ReplyAccounting({ journal: line => events.push(['journal', structuredClone(line)]), send: async line => {
    assert.deepEqual(events.at(-1), ['journal', line], 'durability precedes emission')
    events.push(['send', structuredClone(line)])
  } }, waitMs)
  return { calls, events }
}
const event = (type, data, seq = 7) => ({ type, data, seq, time: 0 })
const assistant = (parts, extra = {}) => {
  const stream = new AssistantStreamAccumulator()
  parts.forEach((text, i) => stream.push({ time: i, chunk: { type: 'text-delta', index: 0, text } }))
  return event('assistant/message', { stream: stream.snapshot(), message: { source: { provider: 'synthetic', model: 'synthetic-model' } }, usage: { inputTokens: 2, outputTokens: 3 }, ...extra })
}

test('reply projection removes user prompt, compaction content and all unlisted native events', () => {
  const user = projectReplyEvent(identity, event('user/message', { id: 'm1', content: [{ type: 'text', text: 'private😀' }], secret: 'canary' }), null)
  assert.deepEqual(user, { ...identity, nativeSeq: 7, type: 'user/message', durable: true, data: { id: 'm1', length: 8 } })
  const summary = projectReplyEvent(identity, event('compaction/summary', { compactionId: 'sum', provider: 'synthetic', model: 'model', text: 'private compaction canary', usage: { inputTokens: 1, outputTokens: 2 } }), 2)
  assert.deepEqual(summary.data, { compactionId: 'sum', provider: 'synthetic', model: 'model', inputTokens: 1, outputTokens: 2, ordinal: 2 })
  assert.equal(JSON.stringify([user, summary]).includes('private'), false)
  for (const type of ['assistant/attempt', 'step/start', 'step/end', 'tool/call', 'system/message', 'other']) {
    assert.equal(projectReplyEvent(identity, event(type, { text: 'canary' }), 1), null)
  }
  assert.deepEqual(projectReplyEvent(identity, event('turn/start', { prompt: 'canary' }), null).data, {})
  assert.deepEqual(projectReplyEvent(identity, event('turn/end', { reason: { kind: 'completed', content: 'canary' }, extra: 'canary' }), null).data, { reason: { kind: 'completed' } })
  assert.deepEqual(projectReplyEvent(identity, event('turn/end', { reason: { kind: 'invented' } }), null).data, { reason: { kind: 'error' } })
})

test('reply answers use PostgreSQL code-point length and never truncate or replace invalid content', () => {
  for (const text of ['', 'ordinary answer', '😀'.repeat(16000), '\u0001'.repeat(16000)]) {
    const item = projectReplyEvent(identity, assistant([text]), 1)
    assert.equal(item.data.text, text)
    assert.equal(item.data.length, [...text].length)
    assert.equal(item.data.oversize, false)
    assert.equal(item.data.invalidText, false)
    assert.ok(Buffer.byteLength(JSON.stringify({ t: 'obs', observation: item })) < 1024 * 1024)
  }
  for (const text of ['a'.repeat(16001), '😀'.repeat(16001)]) {
    const item = projectReplyEvent(identity, assistant([text]), 1)
    assert.equal(item.data.text, null)
    assert.equal(item.data.oversize, true)
    assert.equal(item.data.invalidText, false)
    assert.equal(item.data.length, 16001)
  }
  for (const text of ['x\u0000y', '\ud800', '\udfff', 'x'.repeat(16001) + '\u0000']) {
    const item = projectReplyEvent(identity, assistant([text]), 1)
    assert.equal(item.data.text, null)
    assert.equal(item.data.invalidText, true)
  }
  assert.equal(projectReplyEvent(identity, assistant(['\ud83d', '\ude00']), 1).data.text, '😀')
})

test('reply usage remains correlated and untrusted counts or labels cannot leak content', () => {
  const item = projectReplyEvent(identity, assistant(['answer'], { message: { source: { provider: 'x'.repeat(201), model: '\u0000' } }, usage: { inputTokens: -1, outputTokens: Number.MAX_SAFE_INTEGER + 1, cacheReadTokens: 0, cacheWriteTokens: 4 }, interrupted: true }), 2)
  assert.deepEqual(item.data, { text: 'answer', oversize: false, invalidText: false, length: 6, provider: null, model: null, inputTokens: null, outputTokens: null, cacheReadTokens: 0, cacheWriteTokens: 4, interrupted: true, ordinal: 2 })
  for (const ordinal of [null, 0, 3, 1.5]) {
    assert.throws(() => projectReplyEvent(identity, assistant(['answer']), ordinal), /ordinal/)
    assert.throws(() => projectReplyEvent(identity, event('compaction/summary', {}), ordinal), /ordinal/)
  }
  assert.throws(() => projectReplyEvent(identity, event('user/message', { id: '../unsafe', content: [] }), null), /identity/)
  assert.throws(() => projectReplyEvent({ ...identity, attemptId: '../escape' }, event('turn/start', {}), null), /identity/)
  assert.throws(() => projectReplyEvent(identity, event('turn/start', {}, -1), null), /sequence/)
})

test('reply projection refuses corrupt native text deltas without content-bearing errors', () => {
  for (const text of [42, null, { canary: 'private-native-content' }, undefined]) {
    const corrupt = event('assistant/message', { stream: [{ type: 'chunk', time: 0, chunk: { type: 'text-delta', index: 0, text } }] })
    assert.throws(() => projectReplyEvent(identity, corrupt, 1), { message: 'reply_stream_invalid' })
  }
})

test('reply projection refuses malformed interruption markers', () => {
  for (const interrupted of ['true', 1, {}, null, undefined]) {
    assert.throws(() => projectReplyEvent(identity, assistant(['prefix'], { interrupted }), 1), { message: 'reply_interrupted_invalid' })
  }
  assert.equal(projectReplyEvent(identity, assistant(['complete'], { interrupted: false }), 1).data.interrupted, false)
  assert.equal(projectReplyEvent(identity, assistant(['partial'], { interrupted: true }), 1).data.interrupted, true)
})


test('reply user identity must be an actual string, never a coercion', () => {
  for (const id of [undefined, 42, null, {}, '']) {
    assert.throws(() => projectReplyEvent(identity, event('user/message', { id, content: [] }), null), { message: 'reply_identity_invalid' })
  }
})

test('reply envelope identity never coerces malformed configuration into a wire value', () => {
  for (const runtimeUnitId of [42, null, undefined, {}, '']) {
    assert.throws(() => projectReplyEvent({ ...identity, runtimeUnitId }, event('turn/start', {}), null), { message: 'reply_identity_invalid' })
  }
})

test('reply journal makes its file and directory durable before a line can be emitted', () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'con-reply-journal-'))
  const file = join(dir, 'reply.jsonl')
  const realFsync = fs.fsyncSync
  const syncs = []
  let journal
  mock.method(fs, 'fsyncSync', fd => { syncs.push(fs.fstatSync(fd).isDirectory() ? 'directory' : 'file'); realFsync(fd) })
  syncBuiltinESMExports()
  try {
    journal = new ReplyJournal(file)
    assert.deepEqual(syncs, ['file', 'directory'])
    const frame = { t: 'obs', observation: projectReplyEvent(identity, assistant(['synthetic😀']), 1) }
    const position = journal.append(frame, 1024 * 1024)
    assert.deepEqual(syncs, ['file', 'directory', 'file'], 'append is fsynced before returning to any writer')
    const emitted = journal.read(position)
    assert.equal(emitted.toString(), JSON.stringify(frame) + '\n')
    assert.equal(fs.readFileSync(file, 'utf8'), emitted.toString())
    assert.equal(fs.statSync(file).mode & 0o777, 0o600)
    const next = journal.append({ t: 'settle', n: 1, outcome: 'uncertain', used: null, usage: null }, 4096)
    assert.equal(next.offset, position.length)
    assert.deepEqual(syncs, ['file', 'directory', 'file', 'file'])
    assert.throws(() => new ReplyJournal(file), /EEXIST|reply_journal_create_failed/)
    assert.throws(() => journal.read({ offset: -1, length: 1 }), /position_invalid/)
    assert.throws(() => journal.read({ offset: next.offset, length: next.length + 1 }), /position_invalid/)
    const before = fs.readFileSync(file)
    assert.throws(() => journal.append({ text: 'x'.repeat(4096) }, 4096), /invalid/)
    assert.deepEqual(fs.readFileSync(file), before)
  } finally {
    journal?.close(); mock.restoreAll(); syncBuiltinESMExports()
    fs.rmSync(dir, { recursive: true })
  }
})

test('failed reply journal durability cannot emit or overwrite the uncertain entry', () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'con-reply-journal-failure-'))
  const file = join(dir, 'reply.jsonl')
  const journal = new ReplyJournal(file)
  const first = journal.append({ t: 'status', s: 'ready' }, 4096)
  mock.method(fs, 'fsyncSync', () => { throw new Error('synthetic-private-native-content') })
  syncBuiltinESMExports()
  try {
    assert.throws(() => journal.append({ t: 'go' }, 4096), { message: 'reply_journal_write_failed' })
    assert.throws(() => journal.read(first), /position_invalid/)
    const uncertain = fs.readFileSync(file)
    assert.throws(() => journal.append({ t: 'stop' }, 4096), /unavailable/)
    assert.deepEqual(fs.readFileSync(file), uncertain)
  } finally {
    journal.close(); mock.restoreAll(); syncBuiltinESMExports()
    fs.rmSync(dir, { recursive: true })
  }
})

test('reply journal creation never exposes the existing file path', () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'con-journal-private-canary-'))
  const file = join(dir, 'content-canary.jsonl')
  fs.writeFileSync(file, 'existing governed bytes', { mode: 0o600 })
  try {
    assert.throws(() => new ReplyJournal(file), { message: 'reply_journal_create_failed' })
    assert.equal(fs.readFileSync(file, 'utf8'), 'existing governed bytes')
  } finally { fs.rmSync(dir, { recursive: true }) }
})

test('reply journal cleanup errors cannot replace a fixed creation failure', () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'con-journal-create-error-'))
  const realClose = fs.closeSync
  mock.method(fs, 'fsyncSync', () => { throw new Error('private-fsync-canary') })
  mock.method(fs, 'closeSync', fd => { realClose(fd); throw new Error('private-close-canary') })
  syncBuiltinESMExports()
  try {
    assert.throws(() => new ReplyJournal(join(dir, 'reply.jsonl')), { message: 'reply_journal_create_failed' })
  } finally {
    mock.restoreAll(); syncBuiltinESMExports()
    fs.rmSync(dir, { recursive: true })
  }
})

test('reply journal cleanup errors preserve fixed write failure and prevent reuse', () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'con-journal-write-error-'))
  const file = join(dir, 'reply.jsonl')
  const journal = new ReplyJournal(file)
  const realClose = fs.closeSync
  mock.method(fs, 'fsyncSync', () => { throw new Error('private-fsync-canary') })
  mock.method(fs, 'closeSync', fd => { realClose(fd); throw new Error('private-close-canary') })
  syncBuiltinESMExports()
  try {
    assert.throws(() => journal.append({ t: 'stop' }, 4096), { message: 'reply_journal_write_failed' })
    mock.restoreAll(); syncBuiltinESMExports()
    const uncertain = fs.readFileSync(file)
    assert.throws(() => journal.append({ t: 'go' }, 4096), { message: 'reply_journal_unavailable' })
    assert.deepEqual(fs.readFileSync(file), uncertain)
  } finally {
    mock.restoreAll(); syncBuiltinESMExports(); journal.close()
    fs.rmSync(dir, { recursive: true })
  }
})

test('reply journal direct close failure has a fixed token and disables reuse', () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'con-journal-close-error-'))
  const journal = new ReplyJournal(join(dir, 'reply.jsonl'))
  const realClose = fs.closeSync
  mock.method(fs, 'closeSync', fd => { realClose(fd); throw new Error('private-close-canary') })
  syncBuiltinESMExports()
  try {
    assert.throws(() => journal.close(), { message: 'reply_journal_close_failed' })
    assert.throws(() => journal.append({ t: 'go' }, 4096), { message: 'reply_journal_unavailable' })
  } finally {
    mock.restoreAll(); syncBuiltinESMExports(); journal.close()
    fs.rmSync(dir, { recursive: true })
  }
})

test('child control requires native ready before exactly one go and preserves split UTF8', () => {
  const got = []
  const reader = new ReplyControlReader(controlScope, value => got.push(value))
  const start = startFrame()
  for (const byte of encoded(start)) reader.feed(Buffer.from([byte]))
  assert.equal(reader.state, 'started')
  assert.deepEqual(got, [start])
  reader.ready()
  reader.feed(encoded({ t: 'go' }))
  assert.equal(reader.state, 'running')
  for (const value of [{ t: 'reserved', n: 1 }, { t: 'settled', n: 1 }, { t: 'refused', n: 3, code: 'invalid_ordinal' }, { t: 'settle_unknown', n: 2 }]) reader.feed(encoded(value))
  assert.equal(got.length, 6)
  reader.feed(Buffer.concat([encoded({ t: 'stop' }), encoded({ t: 'go' })]))
  assert.equal(reader.state, 'stopped')
  assert.equal(got.length, 7, 'a stop never processes its buffered tail')
  reader.end()
})

test('child start binds identity and exact configured route/ceiling with no extra fields', () => {
  for (const change of [{ attemptId: 'another' }, { sessionId: 'sophia-another' }, { nonce: 'ff' }, { epoch: 0 }, { epoch: 1.1 }, { maxTokens: 101 }, { prompt: '' }, { prompt: 'x\u0000' }, { prompt: '\ud800' }, { prompt: 'x'.repeat(200001) }, { extra: true }, { route: { ...controlScope.route, extra: true } }, { route: { ...controlScope.route, provider: 'other' } }, { route: { ...controlScope.route, reasoningEffort: 'high' } }]) {
    let count = 0
    const reader = new ReplyControlReader(controlScope, () => count++)
    assert.throws(() => reader.feed(encoded({ ...startFrame(), ...change })), { message: 'reply_control_invalid' })
    assert.equal(count, 0)
    assert.equal(reader.state, 'failed')
  }
})

test('child control refuses premature, repeated and malformed commands without executing later bytes', () => {
  for (const frames of [[{ t: 'go' }], [startFrame(), { t: 'go' }], [startFrame(), startFrame()], [startFrame(), { t: 'reserved', n: 1 }], [startFrame(), { t: 'stop', extra: true }]]) {
    const got = []
    const reader = new ReplyControlReader(controlScope, value => got.push(value))
    assert.throws(() => reader.feed(Buffer.concat(frames.map(encoded))), { message: 'reply_control_invalid' })
    assert.equal(got.some(value => value.t === 'go'), false)
    reader.feed(encoded({ t: 'go' }))
    assert.equal(reader.state, 'failed')
  }
  for (const control of [{ t: 'go' }, { t: 'reserved', n: 0 }, { t: 'reserved', n: 1, extra: true }, { t: 'refused', n: 1, code: 'private content!' }, { t: 'settled', n: '1' }]) {
    const reader = new ReplyControlReader(controlScope, () => {})
    reader.feed(encoded(startFrame())); reader.ready(); reader.feed(encoded({ t: 'go' }))
    assert.throws(() => reader.feed(encoded(control)), { message: 'reply_control_invalid' })
  }
})

test('child line bounds apply incrementally before parse and EOF cannot hide torn UTF8 or JSON', () => {
  const first = new ReplyControlReader(controlScope, () => assert.fail('oversize first line emitted'))
  assert.throws(() => first.feed(Buffer.alloc(2 * 1024 * 1024, 32)), { message: 'reply_control_invalid' })
  const later = new ReplyControlReader(controlScope, () => {})
  later.feed(encoded(startFrame()))
  assert.throws(() => later.feed(Buffer.alloc(4096, 32)), { message: 'reply_control_invalid' })
  for (const bytes of [Buffer.from([0xff, 10]), Buffer.from('{"t":\n'), Buffer.from('null\n')]) {
    const reader = new ReplyControlReader(controlScope, () => assert.fail('invalid line emitted'))
    assert.throws(() => reader.feed(bytes), { message: 'reply_control_invalid' })
  }
  const torn = new ReplyControlReader(controlScope, () => {})
  torn.feed(Buffer.from('{'))
  assert.throws(() => torn.end(), { message: 'reply_control_invalid' })
  const clean = new ReplyControlReader(controlScope, () => {})
  clean.feed(encoded(startFrame())); clean.end()
  assert.equal(clean.state, 'stopped')
  assert.throws(() => clean.ready(), { message: 'reply_control_invalid' })
})

test('reply call gate checks assembled session, route, output ceiling and tool absence before dispatch', () => {
  const options = { sessionId: identity.nativeSessionId, provider: 'synthetic', model: 'fixture', messages: [], tools: [], maxTokens: 100 }
  assert.doesNotThrow(() => checkReplyCall(options, controlScope, true))
  assert.doesNotThrow(() => checkReplyCall({ ...options, maxTokens: 1, purpose: 'compaction' }, controlScope, true))
  assert.throws(() => checkReplyCall(options, controlScope, false), { message: 'reply_call_refused' })
  const stopped = new AbortController(); stopped.abort()
  for (const change of [{ sessionId: undefined }, { sessionId: 'sophia-other' }, { provider: 'fallback' }, { model: 'other' }, { reasoningEffort: 'high' }, { maxTokens: undefined }, { maxTokens: 101 }, { maxTokens: 0 }, { maxTokens: 1.5 }, { tools: [{}] }, { tools: null }, { tools: {} }, { purpose: 'session-title' }, { purpose: 'other' }, { signal: stopped.signal }]) {
    let adapterCalls = 0
    const dispatch = () => { checkReplyCall({ ...options, ...change }, controlScope, true); adapterCalls++ }
    assert.throws(dispatch, { message: 'reply_call_refused' })
    assert.equal(adapterCalls, 0)
  }
  const scoped = { ...controlScope, route: { ...controlScope.route, reasoningEffort: 'low' } }
  assert.throws(() => checkReplyCall(options, scoped, true), { message: 'reply_call_refused' })
  assert.doesNotThrow(() => checkReplyCall({ ...options, reasoningEffort: 'low' }, scoped, true))
})

test('reply no-tool gate rejects declarations restored by the pinned history projector', () => {
  const tool = { name: 'synthetic_write', description: 'synthetic only', parameters: { type: 'object', properties: {} } }
  const options = { sessionId: identity.nativeSessionId, provider: 'synthetic', model: 'fixture', messages: [], tools: [], maxTokens: 100 }
  const history = { tools: [tool], updates: [] }
  assert.equal(projectToolUpdates([], [], 'in-history', history).tools.length, 1, 'the pinned projector restores a historical declaration')
  assert.throws(() => checkReplyCall({ ...options, toolHistory: history }, controlScope, true), { message: 'reply_call_refused' })
  const messages = [{ id: 'update-1', role: 'developer', content: [{ type: 'tool-addition', toolName: tool.name }] }]
  const added = { tools: [], updates: [{ messageId: 'update-1', additions: [tool] }] }
  assert.equal(projectToolUpdates(messages, [], 'in-history', added).tools.length, 1)
  assert.throws(() => checkReplyCall({ ...options, messages, toolHistory: added }, controlScope, true), { message: 'reply_call_refused' })
  for (const toolHistory of [null, {}, { tools: [], updates: null }, { tools: {}, updates: [] }, { tools: [], updates: [], extra: true }]) {
    assert.throws(() => checkReplyCall({ ...options, toolHistory }, controlScope, true), { message: 'reply_call_refused' })
  }
  assert.doesNotThrow(() => checkReplyCall({ ...options, toolHistory: { tools: [], updates: [] } }, controlScope, true))
})

const settledNow = async promise => {
  const result = await Promise.race([
    promise.then(value => ({ settled: true, value })),
    new Promise(resolve => setImmediate(() => resolve({ settled: false }))),
  ])
  assert.equal(result.settled, true, 'the operation must settle before the event-loop sentinel')
  return result.value
}

test('reply accounting gates a call on the matching durable answer, never reuses ordinals', async () => {
  const { calls, events } = accounting()
  await assert.rejects(calls.reserve(10, 0), { message: 'reply_call_refused' })
  assert.equal(events.length, 0)
  calls.go()
  for (const n of [1, 2]) {
    let released = false
    const pending = calls.reserve(10, 0).then(value => { released = true; return value })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(released, false)
    await assert.rejects(calls.reserve(10, 0), { message: 'reply_call_refused' }, 'concurrent calls cannot consume a new ordinal')
    calls.answer({ t: 'reserved', n })
    assert.equal(await settledNow(pending), n)
    assert.deepEqual(events.at(-1), ['journal', { t: 'reserved', n }])
    const settled = calls.settle(n, { inputTokens: 2, outputTokens: 3, cacheReadTokens: 4 }, 0)
    assert.deepEqual(events.at(-1)[1], { t: 'settle', n, outcome: 'settled', used: { calls: 1, tokens: 9, priceMicros: 0 }, usage: { inputTokens: 2, outputTokens: 3, cacheReadTokens: 4 } })
    calls.answer({ t: 'settled', n })
    assert.equal(await settledNow(settled), 'settled')
    await assert.rejects(calls.settle(n, null, null), { message: 'reply_settlement_invalid' })
  }
  await assert.rejects(calls.reserve(10, 0), { message: 'reply_call_refused' })
  assert.equal(events.filter(([kind, line]) => kind === 'send' && line.t === 'reserve').length, 2)
  calls.fence()
})

test('reply accounting rejects wrong ordinal/kind, refused reserve and a fence racing its answer', async () => {
  for (const answer of [{ t: 'reserved', n: 2 }, { t: 'settled', n: 1 }]) {
    const { calls } = accounting(); calls.go()
    const pending = calls.reserve(1, 0)
    const refused = assert.rejects(pending, { message: 'reply_accounting_unconfirmed' })
    assert.throws(() => calls.answer(answer), { message: 'reply_accounting_correlation_invalid' })
    await settledNow(refused)
    assert.equal(calls.state, 'fenced')
  }
  const denied = accounting(); denied.calls.go()
  const no = denied.calls.reserve(1, 0)
  denied.calls.answer({ t: 'refused', n: 1, code: 'budget_exhausted' })
  await assert.rejects(no, { message: 'reply_call_refused' })
  await assert.rejects(denied.calls.reserve(1, 0), { message: 'reply_call_refused' })
  const raced = accounting(); raced.calls.go()
  const answerThenStop = raced.calls.reserve(1, 0)
  raced.calls.answer({ t: 'reserved', n: 1 }); raced.calls.fence()
  await assert.rejects(answerThenStop, { message: 'reply_call_refused' })
})

test('reply accounting timeout is finite and cannot retry or reset the original reservation', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const { calls, events } = accounting(20); calls.go()
    const pending = calls.reserve(1, 0)
    const failed = assert.rejects(pending, { message: 'reply_accounting_unconfirmed' })
    mock.timers.tick(20); await settledNow(failed)
    await assert.rejects(calls.reserve(1, 0), { message: 'reply_call_refused' })
    assert.equal(events.filter(([kind]) => kind === 'send').length, 1)
    assert.throws(() => calls.answer({ t: 'reserved', n: 1 }), { message: 'reply_accounting_correlation_invalid' })
  } finally { mock.timers.reset() }
})

test('reply accounting retains unknown usage and never calls an emitted settlement acknowledged', async () => {
  const { calls, events } = accounting(); calls.go()
  const reserve = calls.reserve(1, 0); calls.answer({ t: 'reserved', n: 1 }); await settledNow(reserve)
  calls.fence()
  assert.equal(await calls.settle(1, null, null), 'settle_unknown')
  assert.deepEqual(events.at(-1)[1], { t: 'settle', n: 1, outcome: 'uncertain', used: null, usage: null })
  await assert.rejects(calls.settle(1, null, null), { message: 'reply_settlement_invalid' })
  const other = accounting(); other.calls.go()
  const reserved = other.calls.reserve(1, 0); other.calls.answer({ t: 'reserved', n: 1 }); await settledNow(reserved)
  const uncertain = other.calls.settle(1, null, null)
  other.calls.answer({ t: 'settled', n: 1 })
  assert.equal(await settledNow(uncertain), 'settle_unknown', 'an answer cannot invent usage absent from the body')
  assert.equal(other.calls.state, 'fenced')
})

test('reply accounting journal failure cannot release a call and stopped emission remains bounded', async () => {
  const broken = new ReplyAccounting({ journal: () => { throw new Error('private-canary') }, send: async () => assert.fail('not durable') }, 20)
  broken.go()
  await assert.rejects(broken.reserve(1, 0), { message: 'reply_accounting_unconfirmed' })
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const calls = new ReplyAccounting({ journal: () => {}, send: line => line.t === 'reserve' ? Promise.resolve() : new Promise(() => {}) }, 20)
    calls.go()
    const reserve = calls.reserve(1, 0); calls.answer({ t: 'reserved', n: 1 }); await settledNow(reserve)
    calls.fence()
    const pending = calls.settle(1, { inputTokens: 1, outputTokens: 0 }, 0)
    const failed = assert.rejects(pending, { message: 'reply_accounting_unconfirmed' })
    mock.timers.tick(20); await settledNow(failed)
  } finally { mock.timers.reset() }
})

test('actual child accounting and parent relay keep reserve behind a held observation and correlate settlement', async () => {
  const journal = []
  const effects = []
  let releaseObservation
  const held = new Promise(resolve => { releaseObservation = resolve })
  let child
  const stream = new Duplex({ read() {}, write(bytes, _encoding, callback) {
    try { child.feed(bytes); callback() } catch (error) { callback(error) }
  } })
  const calls = new ReplyAccounting({ journal: line => journal.push(structuredClone(line)), send: async line => {
    assert.deepEqual(journal.at(-1), line)
    stream.push(encoded(line))
  } }, 1000)
  child = new ReplyControlReader(controlScope, frame => {
    if (frame.t === 'go') calls.go()
    else if (frame.t === 'stop') calls.fence()
    else if (frame.t !== 'start') calls.answer(frame)
  })
  const relay = new ReplyRelay(stream, identity, {
    observe: async observation => { effects.push(['observation', observation.nativeSeq]); await held },
    reserve: async line => { effects.push(['reserve', line.n]); return { allowed: true } },
    settle: async line => { effects.push(['settle', line.n]); return 'settled' },
    status: state => effects.push(['status', state]),
    fenced: code => effects.push(['fenced', code]),
  })
  const within = async promise => {
    let timer
    try {
      const answer = await Promise.race([promise.then(value => ({ complete: true, value })), new Promise(resolve => { timer = setTimeout(() => resolve({ complete: false }), 1000) })])
      assert.equal(answer.complete, true, 'paired protocol must settle within its independent test bound')
      return answer.value
    } finally { clearTimeout(timer) }
  }
  try {
    child.feed(encoded(startFrame())); child.ready()
    stream.push(encoded({ t: 'status', s: 'ready' }))
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(effects, [['status', 'ready']])
    await within(relay.go())
    stream.push(encoded({ t: 'obs', observation: projectReplyEvent(identity, event('turn/start', {}, 0), null) }))
    let released = false
    const reserve = calls.reserve(10, 0).then(n => { released = true; return n })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(released, false)
    assert.equal(effects.some(([kind]) => kind === 'reserve'), false)
    releaseObservation()
    assert.equal(await within(reserve), 1)
    assert.equal(await within(calls.settle(1, { inputTokens: 2, outputTokens: 3 }, 0)), 'settled')
    assert.deepEqual(effects.slice(1), [['observation', 0], ['reserve', 1], ['settle', 1]])
    assert.deepEqual(journal.map(line => [line.t, line.n]), [['reserve', 1], ['reserved', 1], ['settle', 1], ['settled', 1]])
  } finally { releaseObservation(); calls.fence(); stream.destroy() }
})

const emissionFixture = (waitMs = 1000) => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'con-emitter-'))
  const journal = new ReplyJournal(join(dir, 'reply.jsonl'))
  const writes = []
  const stream = new Duplex({ highWaterMark: 1, read() {}, write(bytes, _encoding, callback) {
    let completed = false
    writes.push({ bytes, copy: Buffer.from(bytes), callback: () => {
      assert.equal(completed, false, 'test must complete each native write once')
      completed = true
      callback()
    }, pending: () => !completed })
  } })
  const emitter = new ReplyEmitter(stream, journal, waitMs)
  return { dir, journal, writes, stream, emitter, close() {
    emitter.dispose()
    for (const write of writes) if (write.pending()) write.callback()
    journal.close(); fs.rmSync(dir, { recursive: true })
  } }
}

test('reply emission serializes journal positions, waits for drain and does not retain completed content', async () => {
  const f = emissionFixture()
  try {
    const a = f.journal.append({ t: 'status', s: 'ready' }, 4096)
    const b = f.journal.append({ t: 'reserve', n: 1, tokens: 10, priceMicros: 0 }, 4096)
    const first = f.emitter.send(a)
    const second = f.emitter.send(b)
    const both = Promise.all([first, second])
    a.offset = b.offset
    assert.equal(f.writes.length, 1)
    assert.deepEqual(JSON.parse(f.writes[0].copy), { t: 'status', s: 'ready' })
    let idle = false
    const complete = f.emitter.idle().then(() => { idle = true })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(idle, false)
    f.writes[0].callback()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(f.writes.length, 2)
    assert.equal(f.writes[0].bytes.every(byte => byte === 0), true)
    assert.deepEqual(JSON.parse(f.writes[1].copy), { t: 'reserve', n: 1, tokens: 10, priceMicros: 0 })
    f.writes[1].callback()
    await settledNow(both); await settledNow(complete)
    assert.equal(idle, true)
    assert.equal(f.stream.listenerCount('drain'), 0)
  } finally { f.close() }
})

test('reply emission caps queued positions and bytes, preserves journal and rejects all unresolved writes', async () => {
  for (const [count, text] of [[65, 'small'], [6, 'x'.repeat(800000)]]) {
    const f = emissionFixture()
    try {
      const positions = Array.from({ length: count }, () => f.journal.append({ text }, 1024 * 1024))
      const original = fs.readFileSync(join(f.dir, 'reply.jsonl'))
      const pending = positions.map(position => f.emitter.send(position))
      const results = await settledNow(Promise.allSettled(pending))
      assert.equal(results.every(result => result.status === 'rejected' && result.reason.message === 'reply_emission_failed'), true)
      assert.deepEqual(fs.readFileSync(join(f.dir, 'reply.jsonl')), original)
      assert.equal(f.writes.length, 1)
      await assert.rejects(f.emitter.idle(), { message: 'reply_emission_failed' })
      assert.equal(f.stream.listenerCount('drain'), 0)
    } finally { f.close() }
  }
})

test('reply emission timeout and unreadable journal positions never report delivery', async () => {
  const bad = emissionFixture()
  try {
    await assert.rejects(bad.emitter.send({ offset: 0, length: 1 }), { message: 'reply_emission_failed' })
    assert.equal(bad.writes.length, 0)
  } finally { bad.close() }
  mock.timers.enable({ apis: ['setTimeout'] })
  const f = emissionFixture(20)
  try {
    const position = f.journal.append({ t: 'status', s: 'ready' }, 4096)
    const failed = assert.rejects(f.emitter.send(position), { message: 'reply_emission_failed' })
    mock.timers.tick(20)
    await settledNow(failed)
    assert.equal(f.stream.destroyed, true)
    assert.equal(f.stream.listenerCount('drain'), 0)
  } finally { f.close(); mock.timers.reset() }
})

test('reply native factory setup uses a fresh exact session and scopes tool denial before publication', async () => {
  const controller = new AbortController()
  const seen = []
  let guard
  const handle = { agent: { synthetic: true }, dispose: async () => {} }
  const ctx = { agents: { create: async options => {
    seen.push(options)
    const setup = options.setup({ tools: {
      restrict: filter => seen.push(filter),
      guard: value => { guard = value },
      schemas: () => [],
    } })
    setup.commit()
    return handle
  } } }
  assert.equal(await createReplyAgent(ctx, startFrame(), '/synthetic/attempt-1/work', controller.signal), handle)
  assert.equal(seen.length, 2)
  assert.deepEqual(seen[1], { allow: [] })
  assert.equal(guard({}), 'reply_read_only')
  const { setup: _setup, ...options } = seen[0]
  assert.deepEqual(options, { sessionId: identity.nativeSessionId, meta: { cwd: '/synthetic/attempt-1/work' }, signal: controller.signal, agentOptions: { provider: 'synthetic', model: 'fixture', maxTokens: 100 } })
  assert.equal(Object.hasOwn(options, 'seed'), false)
  assert.equal(Object.hasOwn(options, 'parentAgent'), false)
  assert.equal(JSON.stringify(options).includes('synthetic😀'), false, 'the prompt is not submitted during creation')
})

test('reply native setup rechecks late scoped tools and cancellation at publication', async () => {
  for (const mode of ['tools_at_setup', 'tools_at_commit', 'abort_at_commit']) {
    const controller = new AbortController()
    let schemas = mode === 'tools_at_setup' ? [{}] : []
    let published = false
    const ctx = { agents: { create: async options => {
      const composition = options.setup({ tools: { restrict() {}, guard() {}, schemas: () => schemas } })
      if (mode === 'tools_at_commit') schemas = [{}]
      if (mode === 'abort_at_commit') controller.abort()
      composition.commit()
      published = true
      return {}
    } } }
    await assert.rejects(createReplyAgent(ctx, startFrame(), '/synthetic/attempt-1/work', controller.signal), { message: 'reply_agent_setup_failed' })
    assert.equal(published, false)
  }
})

test('reply native setup refuses wrong workspace or pre-cancellation and sanitizes factory failures', async () => {
  const controller = new AbortController()
  let calls = 0
  const ctx = { agents: { create: async () => { calls++; throw new Error('private-factory-canary') } } }
  for (const workspace of ['/synthetic/other/work', '/synthetic/attempt-1/home', '/synthetic/attempt-1/../attempt-1/work', 'attempt-1/work']) {
    await assert.rejects(createReplyAgent(ctx, startFrame(), workspace, controller.signal), { message: 'reply_agent_setup_failed' })
  }
  assert.equal(calls, 0)
  await assert.rejects(createReplyAgent(ctx, startFrame(), '/synthetic/attempt-1/work', controller.signal), { message: 'reply_agent_setup_failed' })
  assert.equal(calls, 1)
  controller.abort()
  await assert.rejects(createReplyAgent(ctx, startFrame(), '/synthetic/attempt-1/work', controller.signal), { message: 'reply_agent_setup_failed' })
  assert.equal(calls, 1)
})

test('reply native creation settles a handle cancelled during factory resolution and reports cleanup failure', async () => {
  for (const cleanupFails of [false, true]) {
    const controller = new AbortController()
    let disposed = 0
    let release
    const held = new Promise(resolve => { release = resolve })
    const handle = { agent: {}, dispose: async () => {
      disposed++
      await held
      if (cleanupFails) throw new Error('private-disposal-canary')
    } }
    const ctx = { agents: { create: async options => {
      options.setup({ tools: { restrict() {}, guard() {}, schemas: () => [] } }).commit()
      queueMicrotask(() => controller.abort())
      return handle
    } } }
    let completed = false
    const result = createReplyAgent(ctx, startFrame(), '/synthetic/attempt-1/work', controller.signal)
      .then(value => ({ value }), error => ({ error: error.message })).finally(() => { completed = true })
    try {
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(controller.signal.aborted, true)
      assert.equal(disposed, 1)
      assert.equal(completed, false, 'owned disposal must settle before creation rejection')
      release()
      assert.deepEqual(await settledNow(result), { error: cleanupFails ? 'reply_agent_cleanup_failed' : 'reply_agent_setup_failed' })
    } finally { release(); await settledNow(result) }
  }
})


const observed = (fixture, overrides = {}) => {
  let listener
  let removed = 0
  const effects = []
  const hooks = { running: () => true, ordinal: () => 1,
    failed: code => effects.push(code), ended: () => effects.push('ended'), ...overrides }
  const off = observeReplyEvents({ on: (name, callback) => {
    assert.equal(name, 'session/event'); listener = callback
    return () => { removed++ }
  } }, identity, fixture.journal, fixture.emitter, hooks)
  return { effects, off, removed: () => removed,
    emit: (value, id = identity.nativeSessionId) => listener({ id }, value) }
}

test('reply observer journals synchronously and waits for the final line before turn completion', async () => {
  const f = emissionFixture()
  const o = observed(f)
  try {
    o.emit(event('turn/start', {}, 0))
    assert.equal(fs.readFileSync(join(f.dir, 'reply.jsonl'), 'utf8').includes('turn/start'), true)
    o.emit(event('user/message', { id: 'u1', content: [{ type: 'text', text: 'private-user-canary' }] }, 1))
    o.emit(event('tool/call', { text: 'private-tool-canary' }, 2))
    o.emit(event('turn/end', { reason: { kind: 'completed' } }, 3))
    assert.deepEqual(o.effects, [])
    assert.equal(f.writes.length, 1)
    for (let i = 0; i < 3; i++) {
      f.writes[i].callback()
      await new Promise(resolve => setImmediate(resolve))
    }
    assert.deepEqual(o.effects, ['ended'])
    const text = fs.readFileSync(join(f.dir, 'reply.jsonl'), 'utf8')
    assert.equal(text.includes('canary'), false)
    assert.deepEqual(text.trim().split('\n').map(line => JSON.parse(line).observation.nativeSeq), [0, 1, 3])
  } finally { o.off(); f.close() }
})

test('reply observer ignores foreign sessions and captures the usage ordinal synchronously', async () => {
  const f = emissionFixture()
  let ordinal = 1
  const o = observed(f, { ordinal: () => ordinal })
  try {
    o.emit(assistant(['foreign-canary']), 'another-session')
    assert.equal(f.writes.length, 0)
    o.emit(assistant(['own-answer']))
    ordinal = 2
    const observation = JSON.parse(fs.readFileSync(join(f.dir, 'reply.jsonl'), 'utf8')).observation
    assert.equal(observation.data.ordinal, 1)
    assert.equal(observation.data.text, 'own-answer')
    f.writes[0].callback()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(o.effects, [])
  } finally { o.off(); f.close() }
})

test('reply observer fences once on pre-go, repeated sequence, malformed usage or post-turn events', async () => {
  for (const mode of ['pre-go', 'sequence', 'usage', 'post-turn', 'journal']) {
    const f = emissionFixture()
    const o = observed(f, { running: () => mode !== 'pre-go', ordinal: () => mode === 'usage' ? null : 1 })
    try {
      if (mode === 'journal') f.journal.close()
      if (mode === 'usage') o.emit(assistant(['answer']))
      else if (mode === 'post-turn') o.emit(event('turn/end', { reason: { kind: 'completed' } }, 0))
      else o.emit(event('turn/start', {}, 0))
      o.emit(event('turn/start', {}, 0)); o.emit(event('turn/start', {}, 4))
      assert.deepEqual(o.effects, ['reply_observation_failed'])
      for (const write of f.writes) if (write.pending()) write.callback()
      await new Promise(resolve => setImmediate(resolve))
      assert.deepEqual(o.effects, ['reply_observation_failed'])
    } finally { o.off(); f.close() }
  }
})

test('reply observer fences synchronous overflow and async emission failure, disposal suppresses late completion', async () => {
  for (const mode of ['overflow', 'close', 'dispose']) {
    const f = emissionFixture()
    const o = observed(f)
    try {
      if (mode === 'overflow') {
        for (let i = 0; i < 1000; i++) o.emit(event('turn/start', {}, i))
        assert.deepEqual(o.effects, ['reply_observation_failed'])
        assert.equal(fs.readFileSync(join(f.dir, 'reply.jsonl'), 'utf8').trim().split('\n').length, 65)
      } else {
        o.emit(event('turn/end', { reason: { kind: 'completed' } }, 0))
        if (mode === 'dispose') { o.off(); assert.equal(o.removed(), 1); f.writes[0].callback() }
        else f.stream.destroy(new Error('private-stream-canary'))
      }
      await new Promise(resolve => setImmediate(resolve))
      assert.deepEqual(o.effects, mode === 'dispose' ? [] : ['reply_observation_failed'])
    } finally { o.off(); f.close() }
  }
})


const metered = (overrides = {}) => {
  const events = []
  let calls
  const io = { journal: line => events.push(structuredClone(line)), send: async line => {
    if (line.t === 'reserve') calls.answer({ t: 'reserved', n: line.n })
    else calls.answer({ t: line.outcome === 'settled' ? 'settled' : 'settle_unknown', n: line.n })
  }, ...overrides }
  calls = new ReplyAccounting(io, 1000)
  const measure = { request: () => ({ tokens: 100, priceMicros: 0 }), usage: () => 0 }
  const meter = new ReplyCallMeter(controlScope, calls, measure)
  const options = { sessionId: identity.nativeSessionId, provider: 'synthetic', model: 'fixture', maxTokens: 100, messages: [] }
  return { events, calls, meter, measure, options }
}
const consumed = async stream => { const chunks = []; for await (const chunk of stream) chunks.push(chunk); return chunks }
const usageChunk = (inputTokens = 2, outputTokens = 3) => ({ type: 'usage', usage: { inputTokens, outputTokens } })

test('reply meter installs the global prepended hook and reserves before adapter, settling before usage observation', async () => {
  const f = metered()
  let hook
  const dispose = () => true
  assert.equal(f.meter.install({ on: (name, listener, flags) => {
    assert.equal(name, 'llm/stream'); assert.deepEqual(flags, { global: true, prepend: true }); hook = listener; return dispose
  } }), dispose)
  f.calls.go()
  let reached = 0
  const chunks = await consumed(hook(f.options, async function* () {
    reached++
    assert.deepEqual(f.events.map(line => line.t), ['reserve', 'reserved'])
    assert.equal(f.meter.ordinal, 1)
    yield { type: 'text-delta', index: 0, text: 'synthetic-answer' }
    yield { type: 'usage', usage: { inputTokens: 2, outputTokens: 3, cacheReadTokens: 4, cacheWriteTokens: 5, totalTokens: 14, reasoningTokens: 1 } }
  }))
  assert.equal(reached, 1); assert.equal(chunks.length, 2)
  assert.deepEqual(f.events[2], { t: 'settle', n: 1, outcome: 'settled', used: { calls: 1, tokens: 14, priceMicros: 0 }, usage: { inputTokens: 2, outputTokens: 3, cacheReadTokens: 4, cacheWriteTokens: 5 } })
  assert.equal(projectReplyEvent(identity, assistant(['answer']), f.meter.ordinal).data.ordinal, 1)
  await consumed(f.meter.stream({ ...f.options, purpose: 'compaction' }, async function* () { yield usageChunk() }))
  assert.equal(f.meter.ordinal, 2)
  await assert.rejects(consumed(f.meter.stream(f.options, async function* () { reached++ })), { message: 'reply_call_refused' })
  assert.equal(reached, 1)
  f.calls.fence()
})

test('reply meter never invokes adapter for pre-go, wrong route/session/tools, denied reserve or invalid measurement', async () => {
  for (const mode of ['pre-go', 'route', 'session', 'tools', 'denied', 'measurement']) {
    const f = metered()
    if (mode !== 'pre-go') f.calls.go()
    if (mode === 'route') f.options.model = 'other'
    if (mode === 'session') f.options.sessionId = 'another-session'
    if (mode === 'tools') f.options.tools = [{}]
    if (mode === 'measurement') f.measure.request = () => ({ tokens: -1, priceMicros: 0 })
    if (mode === 'denied') f.calls.answer = () => { throw new Error('synthetic-denial') }
    let reached = 0
    try {
      await assert.rejects(consumed(f.meter.stream(f.options, async function* () { reached++ })), { message: 'reply_call_refused' })
      assert.equal(reached, 0)
      assert.equal(f.events.some(line => line.t === 'settle'), false)
    } finally { f.calls.fence() }
  }
})

test('reply meter rechecks cancellation after reserve and records uncertainty without adapter execution', async () => {
  const controller = new AbortController()
  let f
  f = metered({ send: async line => {
    if (line.t === 'reserve') { f.calls.answer({ t: 'reserved', n: line.n }); controller.abort() }
    else f.calls.answer({ t: 'settle_unknown', n: line.n })
  } })
  f.calls.go()
  let reached = 0
  await assert.rejects(consumed(f.meter.stream({ ...f.options, signal: controller.signal }, async function* () { reached++ })), { message: 'reply_accounting_unconfirmed' })
  assert.equal(reached, 0)
  assert.deepEqual(f.events[2], { t: 'settle', n: 1, outcome: 'uncertain', used: null, usage: null })
  assert.equal(f.calls.state, 'fenced')
})

test('reply meter finally accounts for early return, adapter throw, missing/invalid/contradictory usage and unknown cost', async () => {
  for (const mode of ['return', 'throw', 'missing', 'invalid', 'conflicting', 'cost', 'price']) {
    const f = metered(); f.calls.go()
    if (mode === 'cost') f.measure.usage = () => { throw new Error('private-price-canary') }
    if (mode === 'price') f.measure.usage = () => -1
    const stream = f.meter.stream(f.options, async function* () {
      if (mode === 'throw') throw new Error('private-provider-canary')
      if (mode === 'return') { yield { type: 'text-delta', index: 0, text: 'partial' }; return }
      if (mode === 'missing') return
      yield usageChunk(mode === 'invalid' ? NaN : 2)
      if (mode === 'conflicting') yield usageChunk(3)
    })
    if (mode === 'return') {
      assert.equal((await stream.next()).done, false)
      await assert.rejects(stream.return(), { message: 'reply_accounting_unconfirmed' })
    } else await assert.rejects(consumed(stream), { message: 'reply_accounting_unconfirmed' })
    assert.deepEqual(f.events[2], { t: 'settle', n: 1, outcome: 'uncertain', used: null, usage: null })
    assert.equal(f.calls.state, 'fenced')
  }
})

test('reply meter settles known usage even when adapter throws or the consumer stops, and keeps one ordinal', async () => {
  for (const mode of ['throw', 'return']) {
    const f = metered(); f.calls.go()
    const stream = f.meter.stream(f.options, async function* () {
      yield usageChunk()
      throw new Error('private-provider-canary')
    })
    if (mode === 'return') { await stream.next(); await stream.return() }
    else await assert.rejects(consumed(stream), { message: 'reply_call_failed' })
    assert.equal(f.events[2].outcome, 'settled')
    assert.equal(f.events[2].n, 1)
    assert.equal(f.meter.ordinal, 1)
    f.calls.fence()
  }
})


const withinReply = async promise => {
  let timer
  try {
    const value = await Promise.race([promise.then(value => ({ done: true, value })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ done: false }), 1000) })])
    assert.equal(value.done, true, 'child must settle within the independent test bound')
    return value.value
  } finally { clearTimeout(timer) }
}
const runtimeFixture = (custom = {}) => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'con-child-runtime-'))
  const journal = new ReplyJournal(join(dir, 'reply.jsonl'))
  const hooks = new Map()
  const actions = [], lines = []
  const ready = Promise.withResolvers()
  const stream = new Duplex({ read() {}, write(bytes, _encoding, callback) {
    const line = JSON.parse(bytes); lines.push(line); callback()
    if (line.t === 'status') ready.resolve()
    if (line.t === 'reserve') queueMicrotask(() => stream.push(encoded({ t: 'reserved', n: line.n })))
    if (line.t === 'settle') queueMicrotask(() => stream.push(encoded({ t: line.outcome === 'settled' ? 'settled' : 'settle_unknown', n: line.n })))
  } })
  const emit = value => hooks.get('session/event')?.({ id: identity.nativeSessionId }, value)
  const handle = { agent: {
    followup: message => actions.push(['followup', message]),
    cancel: () => { actions.push(['cancel']); custom.cancel?.() },
  }, dispose: async () => { actions.push(['dispose']); await custom.dispose?.(emit) } }
  const ctx = { on: (name, hook) => { hooks.set(name, hook); return () => hooks.delete(name) },
    agents: { create: async options => {
      actions.push(['create'])
      options.setup({ tools: { restrict() {}, guard() {}, schemas: () => [] } }).commit()
      if (custom.create) return custom.create(options, handle)
      return handle
    } } }
  const runtime = new ReplyChildRuntime(ctx, { identity, scope: controlScope, workspace: '/synthetic/attempt-1/work',
    stream, journal, measurement: { request: () => ({ tokens: 100, priceMicros: 0 }), usage: () => 0 }, waitMs: 1000 })
  return { runtime, journal, stream, hooks, actions, lines, emit, ready: ready.promise,
    send: frame => stream.push(encoded(frame)),
    async close() {
      runtime.stop(); await withinReply(runtime.done)
      // An unresolved synthetic disposer has no process behind it. The fixture owner removes retained resources.
      hooks.clear(); stream.destroy(); journal.close(); fs.rmSync(dir, { recursive: true })
    }, text: () => fs.readFileSync(join(dir, 'reply.jsonl'), 'utf8') }
}
const beginRuntime = async f => {
  f.send(startFrame()); await withinReply(f.ready)
  f.send({ t: 'go' }); await new Promise(resolve => setImmediate(resolve))
}
const runtimeOptions = () => ({ sessionId: identity.nativeSessionId, provider: 'synthetic', model: 'fixture', maxTokens: 100, messages: [] })

test('reply runtime composes ready/go, one native input, metering and durable observations before settled shutdown', async () => {
  const f = runtimeFixture()
  try {
    f.send(startFrame()); await withinReply(f.ready)
    assert.deepEqual(f.actions.map(([kind]) => kind), ['create'])
    assert.equal(JSON.parse(f.text().split('\n')[0]).prompt, startFrame().prompt)
    f.send({ t: 'go' }); await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(f.actions.map(([kind]) => kind), ['create', 'followup'])
    assert.deepEqual(f.actions[1][1].content, [{ type: 'text', text: startFrame().prompt }])
    f.emit(event('turn/start', {}, 0))
    await consumed(f.hooks.get('llm/stream')(runtimeOptions(), async function* () { yield usageChunk() }))
    f.emit({ ...assistant(['answer']), seq: 1 })
    f.emit(event('turn/end', { reason: { kind: 'completed' } }, 2))
    assert.equal(await withinReply(f.runtime.done), 'completed')
    assert.equal(f.actions.filter(([kind]) => kind === 'dispose').length, 1)
    assert.equal(f.hooks.size, 0)
    assert.equal(f.stream.destroyed, true)
    assert.deepEqual(f.lines.map(line => line.t), ['status', 'obs', 'reserve', 'settle', 'obs', 'obs'])
    assert.equal(f.lines[4].observation.data.ordinal, 1)
    assert.equal(f.lines.some(line => JSON.stringify(line).includes(startFrame().prompt)), false)
  } finally { await f.close() }
})

test('reply runtime stop before start or go never submits native input and removes owned hooks', async () => {
  for (const started of [false, true]) {
    const f = runtimeFixture()
    try {
      if (started) { f.send(startFrame()); await withinReply(f.ready); f.send({ t: 'stop' }) }
      else f.runtime.stop()
      assert.equal(await withinReply(f.runtime.done), 'stopped')
      assert.equal(f.actions.some(([kind]) => kind === 'followup'), false)
      assert.equal(f.hooks.size, 0)
    } finally { await f.close() }
  }
})

test('reply runtime stop during creation waits for a late owned handle and reports failed disposal unresolved', async () => {
  for (const fails of [false, true]) {
    let release
    const held = new Promise(resolve => { release = resolve })
    const entered = Promise.withResolvers()
    const f = runtimeFixture({ create: async (_options, handle) => { entered.resolve(); await held; return handle },
      dispose: async () => { if (fails) throw new Error('private-disposal-canary') } })
    try {
      f.send(startFrame()); await withinReply(entered.promise)
      f.runtime.stop()
      let finished = false
      void f.runtime.done.then(() => { finished = true })
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(finished, false)
      release()
      assert.equal(await withinReply(f.runtime.done), fails ? 'unresolved' : 'stopped')
      assert.equal(f.actions.filter(([kind]) => kind === 'dispose').length, 1)
      assert.equal(f.actions.some(([kind]) => kind === 'followup'), false)
      assert.equal(f.lines.some(line => line.t === 'status'), false)
    } finally { release(); await f.close() }
  }
})

test('reply runtime keeps observer through cancellation disposal so late native usage reaches the journal', async () => {
  let release
  const held = new Promise(resolve => { release = resolve })
  const reached = Promise.withResolvers()
  let consuming
  const f = runtimeFixture({ cancel: () => release(), dispose: async emit => {
    await consuming
    emit({ ...assistant(['late answer']), seq: 1 })
    emit(event('turn/end', { reason: { kind: 'cancelled' } }, 2))
  } })
  try {
    await beginRuntime(f)
    f.emit(event('turn/start', {}, 0))
    consuming = consumed(f.hooks.get('llm/stream')(runtimeOptions(), async function* () {
      yield usageChunk(); reached.resolve(); await held
    })).then(() => 'unexpected-success', error => error.message)
    await withinReply(reached.promise)
    f.send({ t: 'stop' })
    assert.equal(await withinReply(f.runtime.done), 'stopped')
    assert.equal(await consuming, 'reply_accounting_unconfirmed')
    const late = f.lines.find(line => line.t === 'obs' && line.observation.type === 'assistant/message')
    assert.equal(late.observation.data.ordinal, 1)
    assert.equal(late.observation.data.inputTokens, 2)
    assert.equal(f.text().includes('late answer'), true, 'contained journal retains evidence for fenced parent projection')
    assert.equal(f.hooks.size, 0)
  } finally { release(); await f.close() }
})

test('reply runtime malformed or duplicate go fails without a second native input; EOF before go stops', async () => {
  for (const mode of ['malformed', 'duplicate', 'eof']) {
    const f = runtimeFixture()
    try {
      if (mode === 'malformed') f.stream.push(Buffer.from('bad-json\n'))
      else {
        f.send(startFrame()); await withinReply(f.ready)
        if (mode === 'eof') f.stream.push(null)
        else { f.send({ t: 'go' }); f.send({ t: 'go' }) }
      }
      assert.equal(await withinReply(f.runtime.done), mode === 'eof' ? 'stopped' : 'failed')
      assert.equal(f.actions.filter(([kind]) => kind === 'followup').length, mode === 'duplicate' ? 1 : 0)
      assert.equal(f.hooks.size, 0)
    } finally { await f.close() }
  }
})

test('reply runtime does not remove late-usage observer or report settled cleanup when agent disposal fails', async () => {
  const f = runtimeFixture({ dispose: async () => { throw new Error('private-disposal-canary') } })
  try {
    await beginRuntime(f)
    f.runtime.stop()
    assert.equal(await withinReply(f.runtime.done), 'unresolved')
    assert.equal(f.hooks.has('session/event'), true)
    assert.equal(f.stream.destroyed, false)
    f.emit(event('turn/start', {}, 0))
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(f.text().includes('turn/start'), true)
  } finally { await f.close() }
})

// The real Cordis entry must return before appReady and own only its attempt's resources.
const bootstrapConfig = () => ({ route: { ...controlScope.route }, maxTokens: 100, waitMs: 1000,
  measurement: { request: () => ({ tokens: 100, priceMicros: 0 }), usage: () => 0 } })
const bootstrapEnv = () => ({ HOME: '/synthetic/attempt-1/home', TMPDIR: '/synthetic/attempt-1/home/tmp',
  DSH_HOME: '/synthetic/attempt-1/dsh-home', SOPHIA_WORKSPACE: '/synthetic/attempt-1/work',
  SOPHIA_RUNTIME_UNIT: identity.runtimeUnitId, SOPHIA_REPLY_FD: '3', SOPHIA_REPLY_NONCE: controlScope.nonce,
  DSH_TELEMETRY_DISABLED: '1' })
const bootstrapFixture = async (custom = {}) => {
  const module = await import('../../packages/dsh-bundle/src/reply-plugin.ts')
  const dir = fs.mkdtempSync(join(tmpdir(), 'con-reply-bootstrap-'))
  const hooks = new Map(), exits = [], lines = [], actions = []
  let start, dispose, journal, stream, opened = 0
  const ctx = {
    get: name => name === 'appExit' ? code => exits.push(code) : { onReady: callback => {
      start = callback; return () => { start = null }
    } },
    effect: effect => { dispose = effect() },
    on: (name, hook) => { hooks.set(name, hook); return () => hooks.delete(name) },
    agents: { create: async options => {
      actions.push('create')
      options.setup({ tools: { restrict() {}, guard() {}, schemas: () => [] } }).commit()
      return { agent: { followup() { actions.push('followup') }, cancel() { actions.push('cancel') } },
        dispose: async () => { actions.push('dispose'); await custom.agentDispose?.() } }
    } },
  }
  const open = settings => {
    opened++; custom.open?.(settings)
    journal = new ReplyJournal(join(dir, 'reply.jsonl'))
    stream = new Duplex({ read() {}, write(bytes, _encoding, callback) { lines.push(JSON.parse(bytes)); callback() } })
    return { journal, stream }
  }
  return { module, ctx, open, hooks, exits, lines, actions, get opened() { return opened },
    get stream() { return stream }, get journal() { return journal },
    ready: () => start?.(), dispose: () => dispose?.(),
    async close() {
      await withinReply(Promise.resolve(dispose?.())); hooks.clear(); stream?.destroy(); journal?.close()
      fs.rmSync(dir, { recursive: true })
    } }
}

test('reply bootstrap refuses missing measurement and invalid launcher paths before any effects', async () => {
  const f = await bootstrapFixture()
  try {
    for (const config of [{ ...bootstrapConfig(), measurement: undefined }, { ...bootstrapConfig(), extra: true }]) {
      assert.throws(() => f.module.bindReplyPlugin(f.ctx, config, bootstrapEnv(), f.open), /reply_bootstrap_invalid/)
    }
    for (const change of [{ HOME: '/personal' }, { TMPDIR: '/tmp' }, { SOPHIA_REPLY_FD: '4' },
      { SOPHIA_REPLY_NONCE: 'secret\n' }, { DSH_TELEMETRY_DISABLED: '0' }]) {
      assert.throws(() => f.module.bindReplyPlugin(f.ctx, bootstrapConfig(), { ...bootstrapEnv(), ...change }, f.open), /reply_bootstrap_invalid/)
    }
    assert.equal(f.opened, 0); assert.deepEqual(f.exits, [])
  } finally { await f.close() }
})

test('reply bootstrap returns before appReady and disposal before ready opens nothing', async () => {
  const f = await bootstrapFixture()
  try {
    assert.equal(f.module.bindReplyPlugin(f.ctx, bootstrapConfig(), bootstrapEnv(), f.open), undefined)
    assert.equal(f.opened, 0)
    await f.dispose(); f.ready()
    assert.equal(f.opened, 0); assert.deepEqual(f.exits, []); assert.equal(f.hooks.size, 0)
  } finally { await f.close() }
})

test('reply bootstrap snapshots identity and config and requests bounded exit only after settlement', async () => {
  const f = await bootstrapFixture()
  try {
    const config = bootstrapConfig(), env = bootstrapEnv()
    f.module.bindReplyPlugin(f.ctx, config, env, f.open)
    config.route.model = 'changed'; config.measurement.request = () => { throw new Error('changed') }
    env.SOPHIA_RUNTIME_UNIT = 'changed'; f.ready(); f.ready()
    assert.equal(f.opened, 1)
    f.stream.push(encoded(startFrame()))
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(f.lines, [{ t: 'status', s: 'ready' }])
    assert.deepEqual(f.exits, []); assert.deepEqual(f.actions, ['create'])
    f.stream.push(encoded({ t: 'stop' }))
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(f.actions, ['create', 'cancel', 'dispose'])
    assert.deepEqual(f.exits, [0]); assert.equal(f.hooks.size, 0); assert.equal(f.stream.destroyed, true)
    assert.throws(() => f.journal.append({}, 4096), /unavailable/)
  } finally { await f.close() }
})

test('reply bootstrap failure is content-free and cannot retry acquisition', async () => {
  const f = await bootstrapFixture({ open() { throw new Error('private-path-secret') } })
  try {
    f.module.bindReplyPlugin(f.ctx, bootstrapConfig(), bootstrapEnv(), f.open)
    f.ready(); f.ready(); await new Promise(resolve => setImmediate(resolve))
    assert.equal(f.opened, 1); assert.deepEqual(f.exits, [1]); assert.equal(f.hooks.size, 0)
  } finally { await f.close() }
})

test('reply bootstrap unresolved native disposal retains late accounting resources', async () => {
  const f = await bootstrapFixture({ agentDispose() { throw new Error('private-disposal-secret') } })
  try {
    f.module.bindReplyPlugin(f.ctx, bootstrapConfig(), bootstrapEnv(), f.open)
    f.ready(); f.stream.push(encoded(startFrame())); await new Promise(resolve => setImmediate(resolve))
    f.stream.push(encoded({ t: 'stop' })); await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(f.exits, []); assert.equal(f.stream.destroyed, false)
    assert.equal(f.hooks.has('session/event'), true)
    assert.ok(f.journal.append({ t: 'late-synthetic' }, 4096))
    await f.dispose(); assert.equal(f.stream.destroyed, false)
  } finally { await f.close() }
})

test('reply bootstrap refuses missing public host services before registering its effect', async () => {
  const f = await bootstrapFixture()
  try {
    for (const get of [() => undefined, name => name === 'appExit' ? () => {} : {},
      name => name === 'appReady' ? { onReady() {} } : 0]) {
      assert.throws(() => f.module.bindReplyPlugin({ ...f.ctx, get }, bootstrapConfig(), bootstrapEnv(), f.open), /reply_bootstrap_invalid/)
    }
    assert.equal(f.opened, 0)
  } finally { await f.close() }
})

test('reply bootstrap disposer awaits the native producer barrier and suppresses a stale exit callback', async () => {
  const released = Promise.withResolvers()
  const f = await bootstrapFixture({ agentDispose: () => released.promise })
  try {
    f.module.bindReplyPlugin(f.ctx, bootstrapConfig(), bootstrapEnv(), f.open)
    f.ready(); f.stream.push(encoded(startFrame())); await new Promise(resolve => setImmediate(resolve))
    let settled = false
    const disposing = f.dispose().then(() => { settled = true })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(settled, false); assert.equal(f.stream.destroyed, false)
    released.resolve(); await withinReply(disposing)
    assert.equal(f.stream.destroyed, true); assert.deepEqual(f.exits, [])
  } finally { released.resolve(); await f.close() }
})

function bootstrapChildProgram() {
  const moduleUrl = new URL('../../packages/dsh-bundle/dist/reply-plugin.js', import.meta.url).href
  return `
    import { apply } from ${JSON.stringify(moduleUrl)};
    let dispose;
    const hooks = new Map();
    const ctx = {
      get: name => name === 'appExit' ? async code => { await dispose(); process.exitCode = code }
        : { onReady: callback => { queueMicrotask(callback); return () => {} } },
      effect: effect => { dispose = effect() },
      on: (name, hook) => { hooks.set(name, hook); return () => hooks.delete(name) },
      agents: { create: async options => {
        options.setup({ tools: { restrict() {}, guard() {}, schemas: () => [] } }).commit();
        return { agent: { followup() { throw new Error('fixture forbids go') }, cancel() {} }, dispose: async () => {} }
      } }
    };
    apply(ctx, { route: { provider: 'synthetic', model: 'fixture', reasoningEffort: null }, maxTokens: 100,
      waitMs: 500, measurement: { request() { throw new Error('fixture forbids calls') }, usage() { return null } } });
  `
}

test('reply bootstrap really owns fd3 and an exclusive journal in a synthetic child process', async () => {
  const { spawn } = await import('node:child_process')
  const root = fs.mkdtempSync(join(tmpdir(), 'con-reply-fd-'))
  const attempt = join(root, 'attempt-1')
  for (const path of ['home/tmp', 'dsh-home', 'work']) fs.mkdirSync(join(attempt, path), { recursive: true })
  const env = { ...bootstrapEnv(), HOME: join(attempt, 'home'), TMPDIR: join(attempt, 'home/tmp'),
    DSH_HOME: join(attempt, 'dsh-home'), SOPHIA_WORKSPACE: join(attempt, 'work') }
  const run = async (mode, expected) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', bootstrapChildProgram()],
      { env, stdio: ['ignore', 'pipe', 'pipe', mode === 'not-socket' ? 'ignore' : 'pipe'] })
    const ended = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
    let diagnostic = '', received = ''
    child.stdout.on('data', bytes => { diagnostic += bytes }); child.stderr.on('data', bytes => { diagnostic += bytes })
    const channel = child.stdio[3]
    channel?.on('error', () => {}) // A rejected exclusive journal closes the owned channel; exit is the verdict.
    if (mode === 'success') {
      channel.on('data', bytes => {
        received += bytes
        if (received.includes('\n')) channel.write(encoded({ t: 'stop' }))
      })
      channel.write(encoded(startFrame()))
    }
    try {
      assert.deepEqual(await withinReply(ended), { code: expected, signal: null })
      assert.equal(diagnostic, '')
      return received
    } finally {
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await ended }
      channel?.destroy()
    }
  }
  try {
    await run('not-socket', 1)
    const journal = join(attempt, 'dsh-home/sophia-reply.jsonl')
    assert.equal(fs.existsSync(journal), false)
    assert.deepEqual(JSON.parse(await run('success', 0)), { t: 'status', s: 'ready' })
    const original = fs.readFileSync(journal, 'utf8')
    assert.equal(fs.statSync(journal).mode & 0o777, 0o600)
    assert.ok(original.includes('synthetic😀'))
    await run('exists', 1)
    assert.equal(fs.readFileSync(journal, 'utf8'), original, 'restart cannot truncate or reuse the journal')
  } finally { fs.rmSync(root, { recursive: true }) }
})

test('reply bootstrap keeps actual Cordis subscriptions after unresolved native disposal', async () => {
  const { Context } = require('@deepseek-ai/cordis')
  const ctx = new Context(), exits = []
  const f = await bootstrapFixture({ agentDispose() { throw new Error('synthetic-disposal-failure') } })
  let hostDisposal
  ctx.provide('agents', f.ctx.agents)
  ctx.provide('appReady', f.ctx.get('appReady'))
  ctx.provide('appExit', code => { exits.push(code); hostDisposal = ctx.fiber.dispose() })
  try {
    f.module.bindReplyPlugin(ctx, bootstrapConfig(), bootstrapEnv(), f.open)
    f.ready(); f.stream.push(encoded(startFrame())); await new Promise(resolve => setImmediate(resolve))
    f.stream.push(encoded({ t: 'go' })); await new Promise(resolve => setImmediate(resolve))
    f.stream.push(encoded({ t: 'stop' })); await new Promise(resolve => setImmediate(resolve))
    if (hostDisposal) await withinReply(hostDisposal)
    let recorded = false
    const append = f.journal.append.bind(f.journal)
    f.journal.append = (line, bound) => {
      if (line.t === 'obs' && line.observation.type === 'user/message') recorded = true
      return append(line, bound)
    }
    ctx.emit('session/event', { id: identity.nativeSessionId }, event('user/message', { id: 'late', content: [] }, 2))
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(recorded, true, 'unsettled producer must retain its real Cordis event subscription')
    assert.deepEqual(exits, [], 'ordinary root disposal would destroy the required observer')
    assert.equal(f.stream.destroyed, false)
  } finally {
    await ctx.fiber.dispose(); await f.close()
  }
})
