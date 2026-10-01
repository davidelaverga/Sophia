// The Live tool surface (SMC-M01 binding §2, case T22): the declarations are exactly the six operations the M01 v1.1
// guide names, in the manifest's order, and the contract's MediaToolCall names; nothing retired or future is declared.
import { Behavior, FunctionResponseScheduling } from '@google/genai'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openapi } from '@sophia/contracts'
import { GUIDE_DIR, GUIDE_MANIFEST } from './guide.ts'
import { DECLARED_NAMES, isToolName, refusedResponse, TOOL_DECLARATIONS, toolResponse, WRITE_TOOLS } from './tools.ts'

const SIX = [
  'project_status',
  'read_selected_source',
  'record_mission_note',
  'propose_mission_change',
  'decide_mission_change',
  'control_work',
]

describe('the Live tool surface', () => {
  it('declares exactly the six guide operations, in the manifest’s order, each NON_BLOCKING', () => {
    assert.deepEqual(DECLARED_NAMES, SIX)
    const manifest = JSON.parse(readFileSync(`${GUIDE_DIR}${GUIDE_MANIFEST}`, 'utf8')) as {
      model_facing_operation_names: string[]
    }
    assert.deepEqual(manifest.model_facing_operation_names, SIX)
    for (const tool of TOOL_DECLARATIONS) assert.equal(tool.behavior, Behavior.NON_BLOCKING, tool.name)
  })

  it('names what the contract lets a tool call name, except what only a later guide declares', () => {
    const call = openapi.components.schemas.MediaToolCall as { properties: { name: { enum: string[] } } }
    // start_research is guide v1.2's (SMC-M03, A11); this bridge runs v1.1 and declares the six.
    assert.deepEqual(call.properties.name.enum, [...SIX, 'start_research'])
  })

  it('declares no retired or future operation: no brief, research, document, lead, builder, scheduler or monitor', () => {
    for (const absent of [
      'start_brief',
      'start_research',
      'export_pdf',
      'start_image_job',
      'start_prototype',
      'assign_technical_lead',
      'schedule_follow_up',
      'monitor_work',
    ])
      assert.equal(isToolName(absent), false, absent)
    assert.equal(JSON.stringify(TOOL_DECLARATIONS).includes('brief('), false)
  })

  it('treats every operation that changes a record as a write', () => {
    assert.deepEqual([...WRITE_TOOLS].toSorted(), [
      'control_work',
      'decide_mission_change',
      'propose_mission_change',
      'record_mission_note',
    ])
  })

  it('finishes a call with scheduling and willContinue at the top level of the FunctionResponse', () => {
    const r = toolResponse(
      { id: 'c1', name: 'record_mission_note' },
      { status: 'committed', output: { entryId: 'e1' } },
    )
    assert.equal(r.scheduling, FunctionResponseScheduling.WHEN_IDLE)
    assert.equal(r.willContinue, false)
    assert.deepEqual(r.response, { output: { status: 'committed', entryId: 'e1' } })
    assert.equal('scheduling' in (r.response ?? {}), false)
  })

  it('an unattributed call is answered with a question', () => {
    const r = refusedResponse({ id: 'c2', name: 'record_mission_note' }, 'Who asked?')
    assert.deepEqual(r.response, { output: { status: 'clarify', ask: 'Who asked?' } })
  })
})
