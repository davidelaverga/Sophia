// start_research (SMC-M03 S4, plan §2.4): the guide's one research operation. The model supplies the question, the
// formats, what the person said about sources and depth, and the scope they stated, kept as lines of the question
// (research-scope.ts, CX-0030); everything else is the server's: who asked (the bound speaker), the specialist and its
// route (the registry), the allowance (the project's grant) and eligibility. A receipt says admitted, never started; a
// refusal is typed `not_started:<code>`, and a call whose outcome is unknown is `unconfirmed:<code>`. Neither is
// retried here. A follow-up of a report too long for one to revise (0037's limit) is refused before admission.
// render_research (S6) is "Try PDF again" by voice: the published version of a report that has no PDF, printed again
// as a binding-less rendition (0032), for the bound speaker.
import { createHash } from 'node:crypto'
import type pg from 'pg'
import type { MediaToolResult } from '@sophia/contracts'
import { SPECIALISTS } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  admitResearchTask,
  canCommand,
  pdfRendererReady,
  readTaskStandings,
  requestResearchRendition,
  researchGateOpen,
  withActor,
  type ResearchAdmissionRequest,
} from '@sophia/persistence'
import type { ToolContext } from './mission-tools.ts'
import { TOO_LONG_TO_REVISE, tooLongToRevise } from './report-facts.ts'
import { admittedQuestion, isRecord, QUESTION_MAX } from './research-scope.ts'

/** No PDF renderer is running (0031): nothing was started, and no other format is promised in its place. */
const PDF_UNAVAILABLE = 'PDF reports are not available, so nothing was started.'
/**
 * Said with every admission: the receipt is never updated, so a later question is answered from project_status, never
 * from this receipt (CX-0026: a finished report was still believed admitted, and a steer promised for later).
 */
const RECEIPT_STAYS =
  'This receipt is not updated later; project_status says whether it is waiting, running or finished.'
/**
 * Said with existingTaskId: admission returns the research under way and stores nothing of this call, so what the call
 * adds to that research (its question, its scope) reaches no worker (CX-0030). Steer is how it does.
 */
const NOT_PASSED_ON =
  'What this call adds to it (a length, sections, limits, what to change or keep) was not passed on: to add it, steer that research with control_work.'
/** Said when the speaker asked for HTML: every report downloads as an HTML page Studio prints from its Markdown. */
const HTML_NOTE = ' When it is ready, its card also downloads it as an HTML page.'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max

/** The registry's research specialists: a source reviewer (WBC-02) also writes Markdown, and never does research. */
export const RESEARCH_SPECIALISTS = SPECIALISTS.filter((s) => s.taskKind === 'research')

/** The registry's research specialist for these formats: the one whose outputs are exactly them. */
export function specialistFor(outputs: readonly string[]): { role: string; route: string } | null {
  const wanted = [...new Set(outputs)].toSorted().join(',')
  const match = RESEARCH_SPECIALISTS.find((s) => [...s.outputs].toSorted().join(',') === wanted)
  return match ? { role: match.id, route: match.route } : null
}

const clarify = (question: string): MediaToolResult => ({ status: 'clarify', output: { ask: question } })

const REFUSALS: Partial<Record<string, string>> = {
  forbidden: 'Only editors and admins can start research. Viewers can talk with Sophia.',
  research_gate_closed: 'Research is not switched on for this project.',
  native_capability_unavailable: 'No research runtime is ready right now, so nothing was started.',
  research_limit_reached: 'This research has used its allowance, so nothing more was started.',
  source_ineligible:
    'A source it would build on is not released for project work (it may have been forgotten), so nothing was started.',
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

/** Up to eight items that each pass `ok`; absent is none, anything else is null (ask again). */
const listOf = (v: unknown, ok: (x: unknown) => boolean): string[] | null =>
  v === undefined ? [] : Array.isArray(v) && v.length <= 8 && v.every(ok) ? v.map(String) : null

const isWebAddress = (u: unknown) => typeof u === 'string' && u.length <= 2048 && /^https?:\/\/\S+$/i.test(u)

const ASKABLE: ReadonlySet<unknown> = new Set(['markdown', 'html', 'pdf'])

/**
 * The formats asked for: Markdown always (it is the authored format), and a PDF when asked. HTML is accepted and adds
 * nothing: it never reaches the registry (specialistFor), 0025's outputs check or the manifest the runtime validates.
 */
function formatsOf(outputs: unknown): Array<'markdown' | 'pdf'> | null {
  const asked = outputs === undefined ? ['markdown'] : outputs
  if (!Array.isArray(asked) || asked.length === 0 || !asked.every((o) => ASKABLE.has(o))) return null
  return asked.includes('pdf') ? ['markdown', 'pdf'] : ['markdown']
}

const htmlNote = (outputs: unknown) => (Array.isArray(outputs) && outputs.includes('html') ? HTML_NOTE : '')

function preferencesOf(value: unknown): NonNullable<ResearchAdmissionRequest['preferences']> {
  const prefs = isRecord(value) ? value : {}
  const depth =
    prefs.depth === 'brief' || prefs.depth === 'standard' || prefs.depth === 'deep' ? prefs.depth : undefined
  const sourceConstraints = isText(prefs.sourceConstraints, 500) ? prefs.sourceConstraints : undefined
  return { ...(depth ? { depth } : {}), ...(sourceConstraints ? { sourceConstraints } : {}) }
}

/** The model's arguments as an admission request, or the one question that would make them one. */
function requestOf(args: Record<string, unknown>): ResearchAdmissionRequest | MediaToolResult {
  if (!isText(args.question, QUESTION_MAX)) return clarify('What should I research?')
  const asked = admittedQuestion(args.question.trim(), args.scope)
  if ('ask' in asked) return clarify(asked.ask)
  const outputs = formatsOf(args.outputs)
  if (!outputs) return clarify('Which format should the report be in?')
  const inputSourceIds = listOf(args.inputSourceIds, isUuid)
  if (!inputSourceIds) return clarify('Which of the project’s sources should the research use?')
  const urls = listOf(args.urls, isWebAddress)
  if (!urls) return clarify('Which web pages should I read? Up to eight, each a full http or https address.')
  const assumptions = listOf(args.assumptions, (x) => isText(x, 200))
  if (!assumptions) return clarify('What should I assume where the request is open?')
  if (args.amendsTaskId !== undefined && !isUuid(args.amendsTaskId)) return clarify('Which research should I amend?')
  return {
    question: asked.question,
    outputs,
    inputSourceIds,
    urls,
    assumptions,
    preferences: preferencesOf(args.preferences),
    ...(isUuid(args.amendsTaskId) ? { amendsTaskId: args.amendsTaskId } : {}),
    ...(args.newRequest === true ? { newRequest: true } : {}),
  }
}

/**
 * Whether the request is a follow-up of a report longer than a follow-up can revise (tooLongToRevise): admitted, it
 * would spend a worker turn that 0037 tells to end without a new version. Asked only where admission would get that
 * far, in its order (0025): a speaker who may not start research hears the role first, and a closed gate is said as
 * one. A retry comes seconds after its call, before anything the call started could publish, so it gets its answer.
 */
async function amendsTooLong(c: pg.PoolClient, projectId: string, request: ResearchAdmissionRequest): Promise<boolean> {
  if (request.amendsTaskId === undefined) return false
  if (!(await canCommand(c, projectId)) || !(await researchGateOpen(c, projectId))) return false
  const [amended] = await readTaskStandings(c, projectId, [request.amendsTaskId])
  return tooLongToRevise(amended?.current ?? null)
}

export async function startResearch(ctx: ToolContext): Promise<MediaToolResult> {
  const request = requestOf(ctx.args)
  if ('status' in request) return request
  // A PDF needs a renderer that is running now (S5b, 0031). The refusal offers nothing: whether a Markdown report would
  // be admitted (role, gate, runtime, allowance) is that request's own answer.
  if (request.outputs.includes('pdf') && !(await withActor(ctx.pool, ctx.actorId, 'read', pdfRendererReady))) {
    return { status: 'refused', output: { code: 'not_started:pdf_unavailable', reason: PDF_UNAVAILABLE } }
  }
  const specialist = specialistFor(request.outputs)
  if (!specialist)
    return { status: 'refused', output: { code: 'not_started:no_specialist', reason: 'The research was not started.' } }
  const more = htmlNote(ctx.args.outputs)
  try {
    const result = await withActor(ctx.pool, ctx.actorId, 'write', async (c) =>
      (await amendsTooLong(c, ctx.projectId, request))
        ? null
        : admitResearchTask(c, ctx.projectId, { key: ctx.key, exchangeId: ctx.call.exchangeId, request, specialist }),
    )
    if (result === null) {
      const reason = `${TOO_LONG_TO_REVISE} Nothing was started.`
      return { status: 'refused', output: { code: 'not_started:too_long_to_revise', reason } }
    }
    if ('existingTaskId' in result) {
      return {
        status: 'ok',
        output: {
          existingTaskId: result.existingTaskId,
          note: `Research you asked for in this conversation is already under way. Say if this is a separate question. ${NOT_PASSED_ON}${more}`,
        },
      }
    }
    return {
      status: 'admitted',
      output: {
        taskId: result.admitted.taskId,
        stage: 'admitted',
        note: `Admitted, not started yet: the report arrives later, and the work card shows when it runs. ${RECEIPT_STAYS}${more}`,
      },
    }
  } catch (err: unknown) {
    return refusal(err)
  }
}

/** Why render_research printed nothing, in the speaker's words; the database's own message where it is specific. */
const RENDITION_REFUSALS: Partial<Record<string, string>> = {
  forbidden: 'Only editors and admins can ask for the PDF.',
  native_capability_unavailable: PDF_UNAVAILABLE,
  research_limit_reached: 'The PDF was already tried three times for this version of the report.',
  source_ineligible: 'This report draws on a source that was withdrawn, so it is not printed again.',
  stale_revision: 'A newer version of this report exists.',
  not_found: 'I can’t find that research task in this project.',
}

/** The rendition's idempotency key: the call's own, hashed to the rendition's key shape (at most 64 characters). */
const renditionKey = (key: string) => `voice-${createHash('sha256').update(key).digest('hex').slice(0, 40)}`

function renditionRefusal(err: unknown): MediaToolResult {
  if (!(err instanceof DomainError) || err.code === 'outcome_unknown' || err.code === 'unavailable') {
    return {
      status: 'unknown',
      output: { code: 'unconfirmed:error', reason: 'I could not confirm whether the PDF was asked for.' },
    }
  }
  return {
    status: 'refused',
    output: { code: `not_started:${err.code}`, reason: RENDITION_REFUSALS[err.code] ?? err.message },
  }
}

/**
 * A Markdown-only report asked for its PDF while no renderer runs: no report can have one, so that is the answer, never a
 * reason that suggests another task would. Decided after the database (whose replay and specific refusals answer first);
 * when the renderer can't be checked, the database's own answer stands.
 */
async function noRenderer(ctx: ToolContext, err: unknown): Promise<MediaToolResult | undefined> {
  const markdownOnly =
    err instanceof DomainError &&
    err.code === 'invalid_request' &&
    err.message.startsWith('This research task does not produce a PDF')
  if (!markdownOnly) return undefined
  const ready = await withActor(ctx.pool, ctx.actorId, 'read', pdfRendererReady).catch(() => true)
  if (ready) return undefined
  return { status: 'refused', output: { code: 'not_started:native_capability_unavailable', reason: PDF_UNAVAILABLE } }
}

/**
 * render_research: print the published version of a report that has no PDF again, as its next version. Queued, never
 * "printed": the work card shows the PDF when it arrives. A version that fails the report checks is refused with them.
 */
export async function renderResearch(ctx: ToolContext): Promise<MediaToolResult> {
  const taskId = ctx.args.taskId
  if (!isUuid(taskId)) return clarify('Which research report should I print as a PDF?')
  try {
    const r = await withActor(ctx.pool, ctx.actorId, 'write', (c) =>
      requestResearchRendition(c, ctx.projectId, taskId, renditionKey(ctx.key)),
    )
    if (r.state === 'rejected') {
      const failed = (r.reportChecks ?? []).filter((x) => x.outcome === 'failed').map((x) => x.detail ?? x.name)
      return {
        status: 'refused',
        output: {
          code: 'not_started:report_checks',
          reason: `The report can’t be printed as a PDF: ${failed.join('; ') || 'it failed its checks'}.`,
        },
      }
    }
    return {
      status: 'admitted',
      output: {
        taskId,
        renderJobId: r.renderJobId,
        stage: r.state === 'queued' ? 'queued' : r.state,
        note: 'Queued, not printed yet: the PDF arrives as the report’s next version, and the work card shows it.',
      },
    }
  } catch (err: unknown) {
    return (await noRenderer(ctx, err)) ?? renditionRefusal(err)
  }
}
