import { Behavior, FunctionResponseScheduling } from '@google/genai'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isToolName, refusedResponse, TOOL_DECLARATIONS, toolResponse } from './tools.ts'

describe('the Live tool surface', () => {
  it('declares exactly the implemented tools, each NON_BLOCKING', () => {
    assert.deepEqual(
      TOOL_DECLARATIONS.map((t) => t.name),
      ['project_status', 'read_selected_source', 'start_brief', 'control_work'],
    )
    for (const tool of TOOL_DECLARATIONS) assert.equal(tool.behavior, Behavior.NON_BLOCKING, tool.name)
    for (const absent of ['start_image_job', 'start_prototype', 'assign_technical_lead'])
      assert.equal(isToolName(absent), false)
  })

  it('finishes a call with scheduling and willContinue at the top level of the FunctionResponse', () => {
    const r = toolResponse({ id: 'c1', name: 'start_brief' }, { status: 'admitted', output: { workId: 'w1' } })
    assert.equal(r.scheduling, FunctionResponseScheduling.WHEN_IDLE)
    assert.equal(r.willContinue, false)
    assert.deepEqual(r.response, { output: { status: 'admitted', workId: 'w1' } })
    assert.equal('scheduling' in (r.response ?? {}), false)
  })

  it('an unattributed call is answered with a question', () => {
    const r = refusedResponse({ id: 'c2', name: 'start_brief' }, 'Who asked?')
    assert.deepEqual(r.response, { output: { status: 'clarify', ask: 'Who asked?' } })
  })
})
