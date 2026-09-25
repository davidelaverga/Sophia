/**
 * S1-03 role presets against the real dsh loop: what each role may see, and
 * that a forbidden host tool stays forbidden inside a `workflow` (PTC) program.
 * In the pinned composition's native presentation mode, `workflow` is the
 * PTC program runtime. Its scripts reach tools only through child agents,
 * so the adverse case is a child agent calling `bash`.
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { sleep, suite } from '../support/harness.mjs'

const { world, cleanup } = suite('sophia-roles')
after(cleanup)

const toolNames = (request) => (request.tools ?? []).map((tool) => tool.function?.name ?? tool.name)
const toolResults = (w) => JSON.stringify(w.llm.requests.flatMap((r) => r.messages.filter((m) => m.role === 'tool')))

test('visibility: each role is offered only its native tools; no role sees host execution or web tools', async (t) => {
  const w = await world(t)
  await w.start()
  const expected = {
    'sophia-guide-v1': ['skill', 'todo_write'],
    'sophia-review-v1': ['glob', 'grep', 'read', 'read_image'],
    'sophia-research-v1': ['create_goal', 'get_goal', 'glob', 'grep', 'read', 'read_image', 'skill', 'todo_write', 'update_goal', 'workflow'],
  }
  for (const [role, names] of Object.entries(expected)) {
    const attemptId = `${w.attemptId}-${role.split('-')[1]}`
    const before = w.llm.requests.length
    const create = w.send(w.cmd('create', { attemptId, role, text: 'List your tools.' }))
    await w.service.waitForReceipt(create.commandId, 'incorporation_observed')
    const request = await w.service.waitFor(() => w.llm.requests[before], 20000, `${role} model request`)
    const offered = toolNames(request).sort()
    assert.deepEqual(offered, names, `${role} offered ${offered.join(', ')}`)
    for (const forbidden of ['bash', 'write', 'edit', 'job_kill', 'web_fetch', 'web_search', 'subagent', 'send_message']) {
      assert.equal(offered.includes(forbidden), false, `${role} must not see ${forbidden}`)
    }
    await w.service.waitFor(() => w.service.observations.some((o) => o.attemptId === attemptId && o.type === 'turn/end'), 20000, 'turn end')
  }
})

test('adverse: a forbidden host tool named directly by the model is denied and never runs', async (t) => {
  const w = await world(t)
  const marker = join(w.layout.root, 'workspace', 'DIRECT-PWNED')
  w.llm.script({ toolCall: { name: 'bash', arguments: { command: `touch ${marker}`, description: 'Create a marker' } } }, { text: 'understood' })
  await w.start()
  const create = w.send(w.cmd('create', { role: 'sophia-guide-v1', text: 'Try the shell.' }))
  await w.service.waitForReceipt(create.commandId, 'incorporation_observed')
  await w.service.waitFor(() => w.llm.requests.length >= 2, 20000, 'the model seeing the tool result')
  await sleep(500)
  assert.equal(existsSync(marker), false, 'bash never executed')
  assert.match(toolResults(w), /not permitted for role sophia-guide-v1|unknown tool|UNKNOWN_TOOL|not available/i)
})

test('adverse: a forbidden host tool stays forbidden inside a workflow (PTC) program, through its child agent', async (t) => {
  const w = await world(t)
  const marker = join(w.layout.root, 'workspace', 'PTC-PWNED')
  w.llm.script(
    // 1. the research agent starts a workflow program that spawns a child agent
    { toolCall: { name: 'workflow', arguments: { meta: { name: 'probe', description: 'Probe the shell through a child.' }, script: "return await agent('Run the probe command.')" } } },
    // 2. the child agent tries host execution
    { toolCall: { name: 'bash', arguments: { command: `touch ${marker}`, description: 'Create a marker' } } },
    // 3. the child finishes after its denial; 4. the parent finishes after the workflow result
    { text: 'child done' },
    { text: 'parent done' },
  )
  await w.start()
  const create = w.send(w.cmd('create', { role: 'sophia-research-v1', text: 'Use a workflow.' }))
  await w.service.waitForReceipt(create.commandId, 'incorporation_observed')
  await w.service.waitFor(() => w.llm.requests.length >= 4, 30000, 'the full workflow round trip')
  await sleep(500)
  assert.equal(existsSync(marker), false, 'bash never executed inside the program')
  assert.match(toolResults(w), /Tool \\"bash\\" is not permitted for role sophia-research-v1/)
})

test('adverse: a session whose recorded role this unit no longer defines refuses to resume', async (t) => {
  const w = await world(t)
  await w.start()
  const create = w.send(w.cmd('create', { role: 'sophia-lead-v1', text: 'Short.' }))
  await w.service.waitForReceipt(create.commandId, 'incorporation_observed')
  await w.service.waitFor(() => w.turnEnds().length >= 1, 20000, 'turn end')
  await w.stop()
  const file = join(w.layout.dshHome, 'sophia-bridge', `sophia-${w.attemptId}.jsonl`)
  writeFileSync(file, readFileSync(file, 'utf8').replace('"role":"sophia-lead-v1"', '"role":"sophia-lead-v0"'))
  w.service.setBindings([{ attemptId: w.attemptId, nativeSessionId: `sophia-${w.attemptId}`, authorityEpoch: 1, state: 'active' }])
  await w.start()
  assert.match(w.stderr(), /recorded role "sophia-lead-v0" is not defined in this runtime unit; refusing to resume/)
  const input = w.send(w.cmd('input', { text: 'Continue.' }))
  assert.equal((await w.service.waitForReceipt(input.commandId)).stage, 'rejected')
})
