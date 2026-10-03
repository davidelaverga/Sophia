// The Live tool surface (SMC-M01 binding §2, case T22; SMC-M03 S6): per guide version, the declarations are exactly
// the operations its manifest names, in order: M01's six for v1.1, and v1.2 adds the two research operations and
// steer. Together they are the contract's MediaToolCall names; nothing retired or future is declared.
import { Behavior, FunctionResponseScheduling } from '@google/genai'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openapi } from '@sophia/contracts'
import { GUIDE_DIR, GUIDE_MANIFEST, GUIDE_MANIFESTS } from './guide.ts'
import {
  DECLARED_NAMES,
  isToolName,
  refusedResponse,
  TOOL_DECLARATIONS,
  TOOL_SETS,
  toolResponse,
  WRITE_TOOLS,
} from './tools.ts'

const SIX = [
  'project_status',
  'read_selected_source',
  'record_mission_note',
  'propose_mission_change',
  'decide_mission_change',
  'control_work',
]

/** One v1.2 declaration's parameter schema. */
const schema = (name: string) =>
  TOOL_SETS['v1.2'].declarations.find((d) => d.name === name)?.parametersJsonSchema as {
    properties: Record<string, { enum?: string[] }>
    required: string[]
    additionalProperties: boolean
  }

describe('the Live tool surface', () => {
  it('declares exactly the six guide operations, in the manifest’s order, each NON_BLOCKING', () => {
    assert.deepEqual(DECLARED_NAMES, SIX)
    const manifest = JSON.parse(readFileSync(`${GUIDE_DIR}${GUIDE_MANIFEST}`, 'utf8')) as {
      model_facing_operation_names: string[]
    }
    assert.deepEqual(manifest.model_facing_operation_names, SIX)
    for (const tool of TOOL_DECLARATIONS) assert.equal(tool.behavior, Behavior.NON_BLOCKING, tool.name)
  })

  it('names what the contract lets a tool call name: v1.1’s six, and v1.2’s eight', () => {
    const call = openapi.components.schemas.MediaToolCall as {
      properties: { name: { enum: string[] }; guide: { enum: string[] } }
    }
    assert.deepEqual(call.properties.name.enum, TOOL_SETS['v1.2'].names)
    assert.deepEqual(call.properties.guide.enum, Object.keys(TOOL_SETS))
  })

  it('v1.1 declares no retired or future operation: no brief, research, document, lead, builder or scheduler', () => {
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
      'render_research',
      'start_research',
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

  it('v1.2 declares its manifest’s eight, each NON_BLOCKING, and still no retired or other future operation', () => {
    const v12 = TOOL_SETS['v1.2']
    const manifest = JSON.parse(readFileSync(`${GUIDE_DIR}${GUIDE_MANIFESTS['v1.2']}`, 'utf8')) as {
      model_facing_operation_names: string[]
    }
    assert.deepEqual(v12.names, [...SIX, 'start_research', 'render_research'])
    assert.deepEqual(manifest.model_facing_operation_names, v12.names)
    for (const tool of v12.declarations) assert.equal(tool.behavior, Behavior.NON_BLOCKING, tool.name)
    for (const name of ['start_research', 'render_research']) {
      assert.equal(isToolName(name, v12.names), true, name)
      assert.equal(isToolName(name), false, `${name} is not v1.1’s`)
    }
    for (const absent of ['start_brief', 'export_pdf', 'assign_technical_lead', 'schedule_follow_up', 'monitor_work'])
      assert.equal(isToolName(absent, v12.names), false, absent)
  })

  it('v1.2’s schemas: steer carries a brief, research needs a question, a PDF names its task', () => {
    const control = schema('control_work')
    assert.deepEqual(control.properties.action?.enum, ['hold', 'resume', 'stop', 'steer'])
    assert.ok('brief' in control.properties)
    assert.deepEqual(control.required, ['taskId', 'action'])
    const research = schema('start_research')
    assert.deepEqual(research.required, ['question'])
    assert.deepEqual(Object.keys(research.properties), [
      'question',
      'outputs',
      'inputSourceIds',
      'urls',
      'assumptions',
      'preferences',
      'amendsTaskId',
      'newRequest',
    ])
    // HTML is a page every report downloads from its card: asked for, it adds nothing to admit, and needs no render.
    const outputs = research.properties.outputs as { items: { enum: string[] }; maxItems: number; description: string }
    assert.deepEqual([outputs.items.enum, outputs.maxItems], [['markdown', 'html', 'pdf'], 3])
    assert.match(outputs.description, /HTML page/)
    const render = TOOL_SETS['v1.2'].declarations.find((d) => d.name === 'render_research')
    assert.match(String(render?.description), /HTML needs no call/)
    assert.deepEqual(schema('render_research').required, ['taskId'])
    for (const name of TOOL_SETS['v1.2'].names) assert.equal(schema(name).additionalProperties, false, name)
    // v1.1's control_work is M01's, unchanged.
    const older = TOOL_DECLARATIONS.find((d) => d.name === 'control_work')?.parametersJsonSchema as {
      properties: Record<string, { enum?: string[] }>
    }
    assert.deepEqual(older.properties.action?.enum, ['hold', 'resume', 'stop'])
    assert.equal('brief' in older.properties, false)
  })

  it('an unattributed call is answered with a question', () => {
    const r = refusedResponse({ id: 'c2', name: 'record_mission_note' }, 'Who asked?')
    assert.deepEqual(r.response, { output: { status: 'clarify', ask: 'Who asked?' } })
  })
})
