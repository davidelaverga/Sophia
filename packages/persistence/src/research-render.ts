// A research task's PDF (SMC-M03 S5b, db/migrations/0031, amendment A11). research_render_pdf reaches
// runtimeResearchRender, which runs inside one withService transaction: the service's step 1 gives the current draft
// and what it may cite; the pdf-report-v1 template (@sophia/report) prints it here and checks its manifest; step 2
// queues that HTML as the render's package. A report that fails its checks is answered with them and nothing is
// queued. The model's request never carries markup, and the HTML is the API's, never the runtime's.
import type pg from 'pg'
import type { ResearchRender, ResearchRenderRequest, ResearchRenderResultRequest } from '@sophia/contracts'
import {
  MAX_REPORT_PARTS,
  renderReport,
  type ReportDocument,
  type ReportLayout,
  type ReportSource,
} from '@sophia/report'
import { onlyRow } from './rows.ts'
import type { RuntimeCaller } from './runtime.ts'

type RenderInput =
  | { existing: ResearchRender }
  | {
      draftSha256: string
      repair: 'none' | 'semantic' | 'format'
      layout: ReportLayout
      text: string
      question: string | null
      sources: ReportSource[]
    }

const args = (who: RuntimeCaller) => [who.tokenSha256, who.runtimeUnitId, who.bridgeInstanceId]

/** A title for a report that does not open with one: the question's first line. */
const titleOf = (question: string | null) => (question ?? '').split('\n')[0]?.trim().slice(0, 200) || 'Research report'

/** A printed report that failed its checks, as the reply says it: within the contract's bounds even when its size check refused it. */
function rejected(
  doc: ReportDocument,
  extra: Pick<ResearchRender, 'repair' | 'layout' | 'draftSha256'>,
): ResearchRender {
  return {
    state: 'rejected',
    ...extra,
    report: {
      ...doc.manifest,
      sections: doc.manifest.sections.slice(0, MAX_REPORT_PARTS),
      visuals: doc.manifest.visuals.slice(0, MAX_REPORT_PARTS),
    },
    reportChecks: doc.checks,
  }
}

/** research_render_pdf: print the current draft, check it, and queue it (see the header). Call inside withService. */
export async function runtimeResearchRender(
  c: pg.PoolClient,
  who: RuntimeCaller,
  request: ResearchRenderRequest,
): Promise<ResearchRender> {
  const step1 = await c.query<{ input: RenderInput }>(
    `SELECT sophia.runtime_research_render_input($1, $2, $3, $4) AS input`,
    [...args(who), JSON.stringify(request)],
  )
  const input = onlyRow(step1.rows, 'runtime_research_render_input').input
  if ('existing' in input) return input.existing
  const doc = renderReport({
    markdown: input.text,
    language: request.language ?? 'en',
    title: titleOf(input.question),
    sources: input.sources,
    layout: input.layout,
  })
  if (!doc.accepted)
    return rejected(doc, { repair: input.repair, layout: input.layout, draftSha256: input.draftSha256 })
  const printed = { ...doc.manifest, sourceIds: input.sources.map((s) => s.id) }
  const step2 = await c.query<{ reply: ResearchRender }>(
    `SELECT sophia.runtime_research_render($1, $2, $3, $4, $5, $6) AS reply`,
    [...args(who), JSON.stringify(request), doc.html, JSON.stringify(printed)],
  )
  return onlyRow(step2.rows, 'runtime_research_render').reply
}

/** research_inspect_output: a render of the task (the latest when none is named). Call inside withService. */
export async function runtimeResearchRenderResult(
  c: pg.PoolClient,
  who: RuntimeCaller,
  request: ResearchRenderResultRequest,
): Promise<ResearchRender> {
  const { rows } = await c.query<{ reply: ResearchRender }>(
    `SELECT sophia.runtime_research_render_result($1, $2, $3, $4) AS reply`,
    [...args(who), JSON.stringify(request)],
  )
  return onlyRow(rows, 'runtime_research_render_result').reply
}

/** Whether a PDF can be rendered now (0031): a render runner asked for work in the last ten minutes. */
export async function pdfRendererReady(c: pg.PoolClient): Promise<boolean> {
  const { rows } = await c.query<{ ready: boolean }>(`SELECT sophia.pdf_renderer_ready() AS ready`)
  return onlyRow(rows, 'pdf_renderer_ready').ready
}

type RenditionInput =
  | { existing: ResearchRender }
  | { versionId: string; text: string; language: string; question: string | null; sources: ReportSource[] }

/**
 * "Try PDF again" (0032): print a published version that has no PDF with the same template and queue it as a
 * binding-less rendition, in one transaction (see 0032's header for the rules). An editor's call, inside
 * withActor(..., 'write'); the same idempotency key returns the same rendition. The version is read as Studio reads
 * it: a link cites only one of its own sources, and a link to any other id prints as its label (CX-0019).
 */
export async function requestResearchRendition(
  c: pg.PoolClient,
  projectId: string,
  taskId: string,
  key: string,
): Promise<ResearchRender> {
  const step1 = await c.query<{ input: RenditionInput }>(
    `SELECT sophia.research_rendition_input($1, $2, $3) AS input`,
    [projectId, taskId, key],
  )
  const input = onlyRow(step1.rows, 'research_rendition_input').input
  if ('existing' in input) return input.existing
  const doc = renderReport({
    markdown: input.text,
    language: input.language,
    title: titleOf(input.question),
    sources: input.sources,
    layout: 'standard',
    citable: input.sources.map((s) => s.id),
  })
  if (!doc.accepted) return rejected(doc, { repair: 'none', layout: 'standard' })
  const printed = { ...doc.manifest, sourceIds: input.sources.map((s) => s.id) }
  const step2 = await c.query<{ reply: ResearchRender }>(
    `SELECT sophia.request_research_rendition($1, $2, $3, $4, $5, $6) AS reply`,
    [projectId, taskId, key, input.language, doc.html, JSON.stringify(printed)],
  )
  return onlyRow(step2.rows, 'request_research_rendition').reply
}
