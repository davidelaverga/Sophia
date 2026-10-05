// Native HTML design and its independent review (SDD-01, db/migrations/0038–0040, amendment A12). The runtime
// operations run inside withService with no member actor: the sophia.runtime_design_* and runtime_review_* functions
// authenticate the capability, the lease and the binding themselves, and fence every operation but settle and the
// replays. A source is checked here, between the service's two steps, with @sophia/design: nothing the static
// profile refuses is stored. A render is compiled here the same way. The model's request never carries the page that
// is rendered or published: that is always the API's compile of a stored revision.
import type pg from 'pg'
import {
  checkSource,
  compile,
  contentPackage,
  packageDiff,
  reviseSource,
  type ContentPackage,
  type Edit,
  type EditScope,
  type Finding,
  type SourceCheck,
  type SourceFile,
} from '@sophia/design'
import type {
  DesignCaptureRequest,
  DesignContextReply,
  DesignContextRequest,
  DesignFinding,
  DesignPatchRequest,
  DesignRecord,
  DesignRecordRequest,
  DesignRender,
  DesignRenderRequest,
  DesignRenderResultRequest,
  DesignSourceReply,
  DesignSubmission,
  DesignSubmitRequest,
  DesignWriteRequest,
  ResearchReservation,
  ResearchReserveRequest,
  ResearchSettleRequest,
  ResearchSettlement,
  ReviewContextReply,
  ReviewSubmission,
  ReviewSubmitRequest,
} from '@sophia/contracts'
import { onlyRow } from './rows.ts'
import type { RuntimeCaller } from './runtime.ts'

const args = (who: RuntimeCaller) => [who.tokenSha256, who.runtimeUnitId, who.bridgeInstanceId]

async function operation<T>(c: pg.PoolClient, fn: string, who: RuntimeCaller, request: unknown, ...extra: unknown[]) {
  const placeholders = extra.map((_, i) => `, $${i + 5}`).join('')
  const { rows } = await c.query<{ reply: T }>(`SELECT sophia.${fn}($1, $2, $3, $4${placeholders}) AS reply`, [
    ...args(who),
    JSON.stringify(request),
    ...extra,
  ])
  return onlyRow(rows, fn).reply
}

// --- admission -----------------------------------------------------------------------------------------------------

export interface DesignRoles {
  readonly designer: { readonly role: string; readonly route: string }
  readonly reviewer: { readonly role: string; readonly route: string } | null
}

/**
 * Record the HTML a research task was asked for (0040), in start_research's transaction; refused when no designer or
 * capture renderer is ready ('HTML design is unavailable', html_unavailable). Inside withActor(..., 'write').
 */
export async function requestResearchDesign(c: pg.PoolClient, projectId: string, taskId: string, roles: DesignRoles) {
  const { rows } = await c.query<{ reply: { state: string } }>(
    `SELECT sophia.request_research_design($1, $2, $3) AS reply`,
    [projectId, taskId, JSON.stringify({ designer: roles.designer, reviewer: roles.reviewer })],
  )
  return onlyRow(rows, 'request_research_design').reply
}

/** Whether HTML can be asked for now: a ready runtime advertises the designer, and a capture renderer is asking for work. */
export async function htmlDesignReady(c: pg.PoolClient, projectId: string, designer: DesignRoles['designer']) {
  const { rows } = await c.query<{ ready: boolean }>(`SELECT sophia.html_design_ready($1, $2, $3) AS ready`, [
    projectId,
    designer.role,
    designer.route,
  ])
  return onlyRow(rows, 'html_design_ready').ready
}

// --- the frozen content package ----------------------------------------------------------------------------------------

interface PackageInput {
  readonly versionId: string
  readonly markdownSha256: string
  readonly markdown: string
  readonly limitations: readonly string[]
  readonly sources: ReadonlyArray<{ id: string; title: string | null; url: string | null }>
}

/**
 * Freeze the content package of a design just admitted with a research publication (0040 design_handoff), in the same
 * transaction: the version's Markdown read with the report's parser (@sophia/design contentPackage), each block with
 * its citations and links, and the sources it cites. Built in a savepoint: a package that cannot be built ends the
 * design with that said, never the publication. A replayed publication finds it frozen and changes nothing.
 */
export async function freezeDesignPackage(c: pg.PoolClient, designTaskId: string) {
  await c.query('SAVEPOINT design_package')
  try {
    const { rows } = await c.query<{ input: PackageInput | null }>(`SELECT sophia.design_package_input($1) AS input`, [
      designTaskId,
    ])
    const input = onlyRow(rows, 'design_package_input').input
    if (input === null) {
      await c.query('RELEASE SAVEPOINT design_package')
      return
    }
    const pkg = contentPackage(
      input.markdown,
      input.limitations,
      input.sources.map((s) => s.id),
    )
    const cited = new Set(pkg.citations)
    const body = {
      schema: 'sophia.design-content.v1',
      versionId: input.versionId,
      markdownSha256: input.markdownSha256,
      blocks: pkg.blocks,
      citations: pkg.citations,
      sources: input.sources.filter((s) => cited.has(s.id)),
      limitations: input.limitations,
    }
    await c.query(`SELECT sophia.design_freeze_package($1, $2)`, [designTaskId, JSON.stringify(body)])
    await c.query('RELEASE SAVEPOINT design_package')
  } catch (err: unknown) {
    await c.query('ROLLBACK TO SAVEPOINT design_package')
    const reason = err instanceof Error ? err.message.slice(0, 200) : 'unknown'
    await c.query(`SELECT sophia.design_package_failed($1, $2)`, [designTaskId, reason])
  }
}

// --- the designer's sources -------------------------------------------------------------------------------------------------

interface SourceInput {
  readonly kind: 'write' | 'patch'
  readonly language: string
  readonly scope: unknown
  readonly package: unknown
  readonly base: { revisionId: string; sha256: string; files: SourceFile[] } | null
}

type Step1 = { existing: Extract<DesignSourceReply, { revisionId: string }> } | SourceInput

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The frozen package as @sophia/design reads it (its blocks and citations); the service wrote it from the same code. */
function asPackage(value: unknown): ContentPackage {
  if (!isRecord(value) || !Array.isArray(value.blocks) || !Array.isArray(value.citations)) {
    throw new Error('the design has no frozen content package')
  }
  // The package was built by contentPackage (freezeDesignPackage) and stored as it was built.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the service's own record of this code's output
  return value as unknown as ContentPackage
}

function asScope(value: unknown): EditScope {
  const sections =
    isRecord(value) && Array.isArray(value.sections) ? value.sections.filter((s) => typeof s === 'string') : []
  return {
    sections,
    shell: isRecord(value) && value.shell === true,
    styles: isRecord(value) && value.styles === true,
  }
}

const toFinding = (f: Finding): DesignFinding => ({
  code: f.code,
  severity: f.severity,
  path: f.path,
  message: f.message.slice(0, 400),
  ...(f.line === undefined ? {} : { line: f.line }),
  ...(f.block === undefined ? {} : { block: f.block }),
})

const refused = (findings: readonly Finding[], count = findings.length): DesignSourceReply => ({
  outcome: 'refused',
  findings: findings.slice(0, 200).map(toFinding),
  findingCount: Math.max(count, 1),
})

type Checked =
  { ok: true; files: SourceFile[]; check: SourceCheck; diff: string } | { ok: false; reply: DesignSourceReply }

/** A whole package written: refused when it breaks the static profile, else checked against the package. */
function checkWrite(input: SourceInput, files: readonly SourceFile[], pkg: ContentPackage): Checked {
  const check = checkSource(files, pkg)
  if (check.unsafe) return { ok: false, reply: refused(check.findings, check.findingCount) }
  return { ok: true, files: [...files], check, diff: packageDiff(input.base?.files ?? [], files) }
}

function checkPatch(input: SourceInput, edits: readonly Edit[], pkg: ContentPackage): Checked {
  const revision = reviseSource(input.base?.files ?? [], edits, asScope(input.scope), pkg)
  if (!revision.ok) return { ok: false, reply: refused(revision.findings) }
  return { ok: true, files: revision.files, check: revision.check, diff: revision.diff }
}

async function storeSource(
  c: pg.PoolClient,
  who: RuntimeCaller,
  request: Record<string, unknown>,
  checked: Extract<Checked, { ok: true }>,
): Promise<DesignSourceReply> {
  const { check } = checked
  const result = {
    files: checked.files.map((f) => ({ path: f.path, text: f.text })),
    sha256: check.sha256,
    sections: check.sections.map((s) => ({ id: s.id, line: s.line, sha256: s.sha256 })),
    complete: check.complete,
    findings: check.findings.map(toFinding),
    findingCount: check.findingCount,
    diff: checked.diff,
  }
  const reply = await operation<Extract<DesignSourceReply, { revisionId: string }>>(
    c,
    'runtime_design_source',
    who,
    request,
    JSON.stringify(result),
  )
  return { ...reply, outcome: 'stored', diff: checked.diff.slice(0, 70_000) }
}

/** design_write_source / design_patch_source: check the new source with @sophia/design, then store it (see the header). */
export async function runtimeDesignSource(
  c: pg.PoolClient,
  who: RuntimeCaller,
  request: ({ kind: 'write' } & DesignWriteRequest) | ({ kind: 'patch' } & DesignPatchRequest),
): Promise<DesignSourceReply> {
  const input = await operation<Step1>(c, 'runtime_design_source_input', who, request)
  if ('existing' in input) return { ...input.existing, outcome: 'stored' }
  const pkg = asPackage(input.package)
  const checked =
    request.kind === 'write' ? checkWrite(input, request.files, pkg) : checkPatch(input, request.edits, pkg)
  if (!checked.ok) return checked.reply
  return storeSource(c, who, request, checked)
}

// --- renders -----------------------------------------------------------------------------------------------------------------

type RenderInput = { existing: DesignRender } | { revisionId: string; language: string; files: SourceFile[] }

/** design_render: compile the named revision into one self-contained page and queue its capture. */
export async function runtimeDesignRender(c: pg.PoolClient, who: RuntimeCaller, request: DesignRenderRequest) {
  const input = await operation<RenderInput>(c, 'runtime_design_render_input', who, request)
  if ('existing' in input) return input.existing
  const html = compile(input.files, input.language)
  return operation<DesignRender>(c, 'runtime_design_render', who, request, html)
}

export const runtimeDesignRenderResult = (c: pg.PoolClient, who: RuntimeCaller, request: DesignRenderResultRequest) =>
  operation<DesignRender>(c, 'runtime_design_render_result', who, request)

/** One capture an inspection hands over: where its bytes are, with its hash and place on the page. */
export interface DesignCaptureLocation {
  readonly name: string
  readonly sourceId: string
  readonly storageKey: string
  readonly sha256: string
  readonly bytes: number
  readonly mime: string
  readonly target: string
  readonly kind: 'overview' | 'section' | 'margin'
  readonly section: string | null
  readonly tile: number
  readonly tiles: number
  readonly width: number
  readonly height: number
  readonly scale: number
}

export interface DesignCaptureRefs {
  readonly renderJobId: string
  readonly captures: readonly DesignCaptureLocation[]
}

/** design_inspect_render / review_inspect_render: the captures' locations (the API reads and checks the bytes). */
export const designCaptureRefs = (
  c: pg.PoolClient,
  who: RuntimeCaller,
  role: 'design' | 'review',
  request: DesignCaptureRequest,
) =>
  operation<DesignCaptureRefs>(c, role === 'design' ? 'runtime_design_capture' : 'runtime_review_capture', who, request)

// --- the rest of the runtime operations ------------------------------------------------------------------------------------

export const runtimeDesignContext = (c: pg.PoolClient, who: RuntimeCaller, request: DesignContextRequest) =>
  operation<DesignContextReply>(c, 'runtime_design_context', who, request)

export const runtimeDesignRecord = (c: pg.PoolClient, who: RuntimeCaller, request: DesignRecordRequest) =>
  operation<DesignRecord>(c, 'runtime_design_record', who, request)

export const runtimeDesignReserve = (c: pg.PoolClient, who: RuntimeCaller, request: ResearchReserveRequest) =>
  operation<ResearchReservation>(c, 'runtime_design_reserve', who, request)

export const runtimeDesignSettle = (c: pg.PoolClient, who: RuntimeCaller, request: ResearchSettleRequest) =>
  operation<ResearchSettlement>(c, 'runtime_design_settle', who, request)

export const runtimeDesignSubmit = (c: pg.PoolClient, who: RuntimeCaller, request: DesignSubmitRequest) =>
  operation<DesignSubmission>(c, 'runtime_design_submit', who, request)

export const runtimeReviewContext = (c: pg.PoolClient, who: RuntimeCaller, request: DesignContextRequest) =>
  operation<ReviewContextReply>(c, 'runtime_review_context', who, request)

export const runtimeReviewSubmit = (c: pg.PoolClient, who: RuntimeCaller, request: ReviewSubmitRequest) =>
  operation<ReviewSubmission>(c, 'runtime_review_submit', who, request)
