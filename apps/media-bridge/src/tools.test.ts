// The Live tool surface (SMC-M01 binding §2, case T22; SMC-M03 S6; SDD-01): per guide version, the declarations are
// exactly the operations its manifest names, in order: M01's six for v1.1, v1.2 adds the two research operations and
// steer, and v1.3 the page edit. Together they are the contract's MediaToolCall names; nothing retired or future is
// declared.
import { Behavior, FunctionResponseScheduling } from '@google/genai'
import { createHash } from 'node:crypto'
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

  it('names what the contract lets a tool call name: v1.1’s six, v1.2’s eight and v1.3’s nine', () => {
    const call = openapi.components.schemas.MediaToolCall as {
      properties: { name: { enum: string[] }; guide: { enum: string[] } }
    }
    assert.deepEqual(call.properties.name.enum, TOOL_SETS['v1.3'].names)
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
      'revise_html_page',
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
      'scope',
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

  it('v1.2 says where a steer reaches and how a finished report changes; v1.1’s six stay byte for byte (CX-0026)', () => {
    const control = String(TOOL_SETS['v1.2'].declarations.find((d) => d.name === 'control_work')?.description)
    assert.ok(
      control.endsWith(
        ' Steer reaches only research that project_status shows waiting or running; a finished report is changed with start_research and amendsTaskId. Do not say a control took effect before its result arrives; a refused control changed nothing.',
      ),
      control,
    )
    const amends = schema('start_research').properties.amendsTaskId as { description?: string }
    assert.equal(
      amends.description,
      'A finished research task this request revises. The report is edited in place: say in question exactly what to change and anything the speaker wants kept as it is, and fill scope’s change and keep.',
    )
    // M01's declarations as qualified, before CX-0026: a v1.1 guide is offered exactly these bytes.
    const v11 = createHash('sha256').update(JSON.stringify(TOOL_DECLARATIONS), 'utf8').digest('hex')
    assert.equal(v11, '9717b92ed6e587f3e8df8cef4ad8b9559e316ca3b222137ac69e9e53cedffea4')
  })

  it('v1.2 asks for the whole request, and for the scope the speaker stated (CX-0030)', () => {
    const research = schema('start_research')
    const question = research.properties.question as { maxLength: number; description: string }
    assert.deepEqual(
      [question.maxLength, question.description],
      [
        2000,
        'The whole request in the speaker’s own words and language: the topic and every instruction they gave about it (what to change and what to keep as it is, a length, the sections they want, limits on web searches or page reads). Never shortened to a topic.',
      ],
    )
    // Optional, and only the parts the API keeps, at the API's sizes and the allowance's caps (5 searches, 8 reads).
    assert.deepEqual(research.required, ['question'])
    assert.deepEqual(research.properties.scope, {
      type: 'object',
      description:
        'Fill only the parts the speaker stated; leave out the others and do not ask for them. The research worker reads it with the question.',
      properties: {
        change: {
          type: 'string',
          maxLength: 500,
          description: 'What the speaker wants changed, mostly for a revision.',
        },
        keep: { type: 'string', maxLength: 500, description: 'What they want kept as it is.' },
        length: { type: 'string', maxLength: 100, description: 'The length they asked for, e.g. "about 500 words".' },
        sections: {
          type: 'array',
          items: { type: 'string', maxLength: 100 },
          maxItems: 12,
          description: 'The sections they want, in their order.',
        },
        maxSearches: { type: 'integer', minimum: 0, maximum: 5, description: 'The most web searches they allow.' },
        maxReads: { type: 'integer', minimum: 0, maximum: 8, description: 'The most page reads they allow.' },
      },
      additionalProperties: false,
    })
  })

  it('names each version’s declarations by their SHA-256, which provider.setup logs (CX-0026)', () => {
    for (const version of ['v1.1', 'v1.2', 'v1.3'] as const) {
      const json = JSON.stringify(TOOL_SETS[version].declarations)
      assert.equal(TOOL_SETS[version].sha256, createHash('sha256').update(json, 'utf8').digest('hex'), version)
    }
    assert.equal(TOOL_SETS['v1.1'].sha256, '9717b92ed6e587f3e8df8cef4ad8b9559e316ca3b222137ac69e9e53cedffea4')
    // Deliberately: v1.2's control_work and amendsTaskId texts (CX-0026), then start_research's question and scope
    // (CX-0030).
    assert.equal(TOOL_SETS['v1.2'].sha256, '57cdfdadd238ceb5851045d1da1bd2c12a72547b406144a3f10f6f694598dcf6')
    // SDD-01: v1.3 is v1.2 with the designed page's words and revise_html_page; v1.2 above is unchanged by it.
    assert.equal(TOOL_SETS['v1.3'].sha256, 'ecbce82f02804c5539f27cb00e3116d97a905798ac85932ea20aee7d6ced8681')
  })

  it('v1.3 declares its manifest’s nine: v1.2’s eight with the designed page’s words, and revise_html_page', () => {
    const v13 = TOOL_SETS['v1.3']
    const manifest = JSON.parse(readFileSync(`${GUIDE_DIR}${GUIDE_MANIFESTS['v1.3']}`, 'utf8')) as {
      model_facing_operation_names: string[]
    }
    assert.deepEqual(v13.names, [...TOOL_SETS['v1.2'].names, 'revise_html_page'])
    assert.deepEqual(manifest.model_facing_operation_names, v13.names)
    for (const tool of v13.declarations) assert.equal(tool.behavior, Behavior.NON_BLOCKING, tool.name)
    assert.equal(isToolName('revise_html_page', TOOL_SETS['v1.2'].names), false, 'not v1.2’s')
    const declared = (name: string) => v13.declarations.find((d) => d.name === name)
    // M75's promise that every report downloads as an HTML page is gone: HTML is the designed page, asked for.
    const text = JSON.stringify(v13.declarations)
    assert.doesNotMatch(text, /every (published )?report (also|already) downloads as an HTML page|HTML needs no call/)
    const research = declared('start_research')?.parametersJsonSchema as
      { properties: { outputs: { description: string } } } | undefined
    const outputs = String(research?.properties.outputs.description)
    assert.match(outputs, /Sophia’s designer lays out a page from its exact content/)
    assert.match(outputs, /a report without html has no web page/)
    assert.match(String(declared('render_research')?.description), /makes no HTML/)
    // The other declarations are v1.2's, byte for byte.
    for (const name of SIX)
      assert.equal(
        JSON.stringify(declared(name)),
        JSON.stringify(TOOL_SETS['v1.2'].declarations.find((d) => d.name === name)),
        name,
      )
    const revise = declared('revise_html_page')?.parametersJsonSchema as {
      properties: Record<string, { maxItems?: number }>
      required: string[]
      additionalProperties: boolean
    }
    assert.deepEqual(Object.keys(revise.properties), ['taskId', 'sections', 'instruction', 'shell', 'styles'])
    assert.deepEqual(
      [revise.required, revise.additionalProperties, revise.properties.sections?.maxItems],
      [['taskId', 'sections', 'instruction'], false, 16],
    )
  })

  it('an unattributed call is answered with a question', () => {
    const r = refusedResponse({ id: 'c2', name: 'record_mission_note' }, 'Who asked?')
    assert.deepEqual(r.response, { output: { status: 'clarify', ask: 'Who asked?' } })
  })
})
