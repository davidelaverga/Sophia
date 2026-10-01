// start_research (SMC-M03 S4, plan §2.4): the guide's one research operation. The model supplies the question, the
// formats and what the person said about sources and depth; everything else is the server's: who asked (the bound
// speaker), the specialist and its route (the registry), the allowance (the project's grant) and eligibility. A receipt
// says admitted, never started; a refusal is typed `not_started:<code>`, and a call whose outcome is unknown is
// `unconfirmed:<code>`. Neither is retried here.
import type { MediaToolResult } from '@sophia/contracts'
import { SPECIALISTS } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { admitResearchTask, withActor, type ResearchAdmissionRequest } from '@sophia/persistence'
import type { ToolContext } from './mission-tools.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max

/** PDF reports arrive with the renderer host (S5); until then a research report is Markdown only. */
export const PDF_REPORTS_AVAILABLE: boolean = false

/** The registry's specialist for these formats: the one whose outputs are exactly them. */
export function specialistFor(outputs: readonly string[]): { role: string; route: string } | null {
  const wanted = [...new Set(outputs)].toSorted().join(',')
  const match = SPECIALISTS.find((s) => [...s.outputs].toSorted().join(',') === wanted)
  return match ? { role: match.id, route: match.route } : null
}

const clarify = (question: string): MediaToolResult => ({ status: 'clarify', output: { ask: question } })

const REFUSALS: Partial<Record<string, string>> = {
  forbidden: 'Only editors and admins can start research. Viewers can talk with Sophia.',
  research_gate_closed: 'Research is not switched on for this project.',
  native_capability_unavailable: 'No research runtime is ready right now, so nothing was started.',
  research_limit_reached: 'This research has used its allowance, so nothing more was started.',
  source_ineligible: 'One of the chosen sources is not released for project work.',
  invalid_state: 'That research is still under way; it can be steered, not amended.',
  stale_revision: 'A later task already continues that research.',
  not_found: 'I can’t find that research task in this project.',
}

function refusal(err: unknown): MediaToolResult {
  if (!(err instanceof DomainError)) {
    return {
      status: 'unknown',
      output: { code: 'unconfirmed:error', reason: 'I could not confirm whether the research was admitted.' },
    }
  }
  if (err.code === 'outcome_unknown' || err.code === 'unavailable') {
    return {
      status: 'unknown',
      output: { code: `unconfirmed:${err.code}`, reason: 'I could not confirm whether the research was admitted.' },
    }
  }
  return {
    status: 'refused',
    output: { code: `not_started:${err.code}`, reason: REFUSALS[err.code] ?? 'The research was not started.' },
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Up to eight items that each pass `ok`; absent is none, anything else is null (ask again). */
const listOf = (v: unknown, ok: (x: unknown) => boolean): string[] | null =>
  v === undefined ? [] : Array.isArray(v) && v.length <= 8 && v.every(ok) ? v.map(String) : null

const isWebAddress = (u: unknown) => typeof u === 'string' && u.length <= 2048 && /^https?:\/\/\S+$/i.test(u)

/** The formats asked for: Markdown always (it is the authored format), and a PDF when asked. */
function formatsOf(outputs: unknown): Array<'markdown' | 'pdf'> | null {
  const asked = outputs === undefined ? ['markdown'] : outputs
  if (!Array.isArray(asked) || asked.length === 0 || !asked.every((o) => o === 'markdown' || o === 'pdf')) return null
  return asked.includes('pdf') ? ['markdown', 'pdf'] : ['markdown']
}

function preferencesOf(value: unknown): NonNullable<ResearchAdmissionRequest['preferences']> {
  const prefs = isRecord(value) ? value : {}
  const depth =
    prefs.depth === 'brief' || prefs.depth === 'standard' || prefs.depth === 'deep' ? prefs.depth : undefined
  const sourceConstraints = isText(prefs.sourceConstraints, 500) ? prefs.sourceConstraints : undefined
  return { ...(depth ? { depth } : {}), ...(sourceConstraints ? { sourceConstraints } : {}) }
}

/** The model's arguments as an admission request, or the one question that would make them one. */
function requestOf(args: Record<string, unknown>): ResearchAdmissionRequest | MediaToolResult {
  if (!isText(args.question, 2000)) return clarify('What should I research?')
  const outputs = formatsOf(args.outputs)
  if (!outputs) return clarify('Should the report be Markdown, or Markdown and a PDF?')
  const inputSourceIds = listOf(args.inputSourceIds, isUuid)
  if (!inputSourceIds) return clarify('Which of the project’s sources should the research use?')
  const urls = listOf(args.urls, isWebAddress)
  if (!urls) return clarify('Which web pages should I read? Up to eight, each a full http or https address.')
  const assumptions = listOf(args.assumptions, (x) => isText(x, 200))
  if (!assumptions) return clarify('What should I assume where the request is open?')
  if (args.amendsTaskId !== undefined && !isUuid(args.amendsTaskId)) return clarify('Which research should I amend?')
  return {
    question: args.question.trim(),
    outputs,
    inputSourceIds,
    urls,
    assumptions,
    preferences: preferencesOf(args.preferences),
    ...(isUuid(args.amendsTaskId) ? { amendsTaskId: args.amendsTaskId } : {}),
    ...(args.newRequest === true ? { newRequest: true } : {}),
  }
}

export async function startResearch(ctx: ToolContext): Promise<MediaToolResult> {
  const request = requestOf(ctx.args)
  if ('status' in request) return request
  if (request.outputs.includes('pdf') && !PDF_REPORTS_AVAILABLE) {
    return {
      status: 'refused',
      output: {
        code: 'not_started:pdf_unavailable',
        reason: 'PDF reports are not available yet. I can write the report in Markdown instead.',
      },
    }
  }
  const specialist = specialistFor(request.outputs)
  if (!specialist)
    return { status: 'refused', output: { code: 'not_started:no_specialist', reason: 'The research was not started.' } }
  try {
    const result = await withActor(ctx.pool, ctx.actorId, 'write', (c) =>
      admitResearchTask(c, ctx.projectId, { key: ctx.key, exchangeId: ctx.call.exchangeId, request, specialist }),
    )
    if ('existingTaskId' in result) {
      return {
        status: 'ok',
        output: {
          existingTaskId: result.existingTaskId,
          note: 'Research you asked for in this conversation is already under way. Say if this is a separate question.',
        },
      }
    }
    return {
      status: 'admitted',
      output: {
        taskId: result.admitted.taskId,
        stage: 'admitted',
        note: 'Admitted, not started yet: the report arrives later, and the work card shows when it runs.',
      },
    }
  } catch (err: unknown) {
    return refusal(err)
  }
}
