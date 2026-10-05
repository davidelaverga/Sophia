/**
 * The native HTML designer's and the separate visual reviewer's tools (SDD-01, binding map §3 and §4). The control
 * bridge registers them in a design or review agent's own scope, and only those its role names: a reviewer is never
 * offered a design_* tool, so it cannot write source, render, submit or publish.
 *
 * Every tool works for the attempt that owns the calling agent, through the Sophia service's runtime design and review
 * operations: the service authenticates the runtime and the binding, fences the call (Hold and Stop apply), checks
 * every source with a parser before it is stored, compiles and captures it in the confined renderer, applies the hard
 * gate and records what the reviewer actually inspected.
 *
 * The inspect tools hand the model the actual pixels: each capture comes from the service with its bytes checked
 * against the hash the renderer recorded, is stored through dsh's attachment service and reaches the model as an image
 * block, on a route that declares image input. A reference image of a skill reaches it the same way.
 * @module @sophia/dsh-bundle/design-tools
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { DesignReference, LoadedAssets } from './design-assets.js'
import { callKeyOf } from './research-tools.js'
import { TransportError } from './transport.js'
import type { ServiceTransport } from './transport.js'
import type { DesignCaptureImage, DesignRender } from './runtime-wire-types.generated.js'

/** The attempt and native session a design or review tool works for. */
export interface DesignSession {
  readonly attemptId: string
  readonly nativeSessionId: string
}

/** The service operations the tools use (the bridge's transport). */
export type DesignClient = Pick<
  ServiceTransport,
  | 'designContext'
  | 'designRecord'
  | 'designSource'
  | 'designPatch'
  | 'designRender'
  | 'designRenderResult'
  | 'designCapture'
  | 'designSubmit'
  | 'reviewContext'
  | 'reviewSubmit'
>

/** The reference to one stored image, as dsh's attachment service returns it and an image block carries it. */
export interface StoredImage {
  readonly attachmentId: string
  readonly mediaType: string
  readonly bytes: number
  readonly width: number
  readonly height: number
  readonly name?: string
  readonly originalDimensions?: { readonly width: number; readonly height: number }
}

/** The part of dsh's attachment service the tools use. */
export interface ImageStore {
  saveImage(input: { data: Uint8Array; mediaType: 'image/png' | 'image/jpeg'; name?: string }): Promise<StoredImage>
}

export interface DesignToolDeps {
  readonly client: DesignClient
  /** The design or review attempt that owns the calling agent, or null outside one. */
  readonly sessionOf: (exec: ToolRunContext) => DesignSession | null
  /** The calling role's verified bundle assets (its references), or null when it has none. */
  readonly assetsOf: (exec: ToolRunContext) => LoadedAssets | null
  /** dsh's attachment service, when mounted; without it no image can reach the model. */
  readonly images: () => ImageStore | undefined
  /** Why the calling agent's route cannot take an image, or null when it can. */
  readonly imageRoute: (exec: ToolRunContext) => Promise<string | null>
  readonly log: (line: string) => void
  /** How long design_render waits for its capture and how often it looks (defaults: CAPTURE_WAIT). */
  readonly renderWait?: { readonly maxMs: number; readonly pollMs: number }
}

/** design_render waits up to this long for its capture, looking this often (a look is a service call, not a model call). */
export const CAPTURE_WAIT = { maxMs: 240_000, pollMs: 2_000 } as const
/** A text reference is read in pages of this many characters. */
const REFERENCE_PAGE = 12_000

const MESSAGES: Readonly<Record<string, string>> = {
  invalid_state: 'This design is not active (it was held or stopped, or it ended); stop and wait for an explicit Resume.',
  research_limit_reached: 'This design has reached a limit (its allowance, renders, revisions or repairs); report a blocker or submit what passed.',
  not_found: 'That revision, render, capture or source is not one this task may use.',
  stale_revision: 'The source changed since you last read it; read the context again for its current sha256.',
  forbidden: 'This role may not do that.',
  invalid_request: 'The service refused the request as given: check each field.',
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
const asJson = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json
const text = (value: string): ContentBlock[] => [{ type: 'text', text: value }]
const json = (value: unknown): ContentBlock[] => text(JSON.stringify(value, null, 1))
const plain = (_args: unknown, value: unknown) => (typeof value === 'string' ? text(value) : json(value))

function serviceProblem(error: unknown): { code: string; message: string } {
  if (error instanceof TransportError && error.code) {
    return { code: error.code, message: MESSAGES[error.code] ?? `The Sophia service refused the operation (${error.code}).` }
  }
  return { code: 'service_unavailable', message: 'The Sophia service could not be reached; nothing was changed.' }
}

/** Run a service call; a refusal becomes the model-facing problem, anything else is the tool's own failure. */
async function guarded(run: () => Promise<Json>): Promise<Json> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof TransportError) return serviceProblem(error)
    throw error
  }
}

/** What a capture's state asks of the designer next. */
function renderNote(render: DesignRender): string {
  if (render.state === 'queued' || render.state === 'rendering') {
    return 'The capture has not finished. Check it with design_render again (same revision, a new call) only after a pause; do not submit while it runs.'
  }
  if (render.state === 'cancelled') return 'The capture was cancelled by a Hold or Stop. Stop and wait for an explicit Resume.'
  if (render.state === 'failed') return 'The capture failed (reason and errorCode say why). Fix the source if it caused it, then render again.'
  if (render.gate?.passed) {
    return 'Captured, and it passed every check. Inspect the captures that matter with design_inspect_render (overview first, then sections) before you judge it; submit it with design_submit_candidate only from what you saw.'
  }
  return 'Captured, but the hard gate refuses it (gate.failures and the measures say why): fix the source, render again and inspect.'
}

/** The image blocks of stored captures or references, with one line naming each. */
function imageBlocks(images: ReadonlyArray<{ label: string; image: StoredImage }>): ContentBlock[] {
  return images.flatMap(({ label, image }) => [
    { type: 'text', text: `${label}: ${image.mediaType}, ${image.width}x${image.height} px` },
    { type: 'image', attachment: image } as unknown as ContentBlock,
  ])
}

interface InspectValue {
  readonly renderJobId: string
  readonly captures: ReadonlyArray<Omit<DesignCaptureImage, 'data'> & { image: StoredImage }>
}

/** Render an inspection: the captures as image blocks, after their place on the page. */
function inspectBlocks(value: unknown): ContentBlock[] {
  const v = value as InspectValue | { code: string }
  if (!('captures' in v)) return json(v)
  const header = `Captures of render ${v.renderJobId}. Each is a real screenshot of the compiled page in the confined renderer; ` +
    'judge only what you can see in it, and name the capture each finding rests on.'
  const blocks = imageBlocks(v.captures.map((c) => ({
    label: `${c.name} (${c.target}, ${c.kind}${c.section ? ` ${c.section}` : ''}, tile ${c.tile}/${c.tiles}, scale ${c.scale})`,
    image: c.image,
  })))
  return [...text(header), ...blocks]
}

function referenceBlocks(value: unknown): ContentBlock[] {
  const v = value as { id: string; sha256: string; image?: StoredImage } | Json
  if (typeof v === 'object' && v !== null && !Array.isArray(v) && 'image' in v && v.image) {
    const ref = v as { id: string; sha256: string; image: StoredImage }
    return [...text(`Reference ${ref.id} (sha256 ${ref.sha256}): a specimen image, not a template to copy.`), ...imageBlocks([{ label: ref.id, image: ref.image }])]
  }
  return plain(undefined, v)
}

export function designTools(deps: DesignToolDeps): ToolDefinition[] {
  const sessionOf = (exec: ToolRunContext): DesignSession => {
    const session = deps.sessionOf(exec)
    if (!session) throw new Error('This tool runs only inside a Sophia design or review task.')
    return session
  }
  const ids = (s: DesignSession) => ({ attemptId: s.attemptId, nativeSessionId: s.nativeSessionId })
  const wait = deps.renderWait ?? CAPTURE_WAIT

  /** Store images through the attachment service, after checking the route can take them. */
  async function stored(exec: ToolRunContext, items: ReadonlyArray<{ data: Uint8Array; mediaType: 'image/png' | 'image/jpeg'; name: string }>) {
    const store = deps.images()
    if (!store) throw new Error('No attachment service is mounted: images cannot reach the model in this runtime.')
    const why = await deps.imageRoute(exec)
    if (why) throw new Error(why)
    const out: StoredImage[] = []
    for (const item of items) out.push(await store.saveImage(item))
    return out
  }

  /** A text page of a reference, or its image stored for the model. */
  async function readReference(exec: ToolRunContext, id: string, offset: number): Promise<Json | { id: string; sha256: string; image: StoredImage }> {
    const assets = deps.assetsOf(exec)
    const ref: DesignReference | undefined = assets?.references.get(id)
    if (!ref) {
      const known = assets ? [...assets.references.keys()].join(', ') : 'none'
      return { code: 'not_found', message: `No reference ${id} for this role. Its references: ${known}.` }
    }
    if (ref.kind === 'image') {
      const [image] = await stored(exec, [{ data: ref.data, mediaType: ref.mediaType === 'image/png' ? 'image/png' : 'image/jpeg', name: id }])
      return { id, sha256: ref.sha256, image: image! }
    }
    const page = ref.text.slice(offset, offset + REFERENCE_PAGE)
    const next = offset + REFERENCE_PAGE < ref.text.length ? offset + REFERENCE_PAGE : null
    return { id, sha256: ref.sha256, offset, nextOffset: next, totalChars: ref.text.length, text: page }
  }

  const designReadContext = defineTool({
    name: 'design_read_context',
    description:
      'Read your design task: the request, the frozen content package (every block, citation, source and limitation the ' +
      'page must carry, unchanged), your current source revision, your candidates with any review findings, the work ' +
      'record and the allowance. With a sourceId, read one page (6000 characters) of a text you may read: the package, ' +
      'the report\'s Markdown, a revision file or diff; pass offset to continue.',
    parameters: {
      sourceId: { type: 'string', description: 'A text to page through; omit to read the task.' },
      offset: { type: 'integer', description: 'Where the page starts, from the previous page\'s nextOffset.' },
    },
    output: { schema: { type: 'json' }, render: plain },
    async execute(args, exec): Promise<Json> {
      const session = sessionOf(exec)
      return guarded(async () => asJson(await deps.client.designContext(
        args.sourceId === undefined ? ids(session) : { ...ids(session), sourceId: args.sourceId, offset: args.offset ?? 0 }, exec.signal)))
    },
  })

  const readReferenceTool = (name: 'design_read_reference' | 'review_read_reference', record: boolean) => defineTool({
    name,
    description:
      'Read one reference of your native skills by id: a skill\'s whole text (its id), a reference section, or a ' +
      'specimen image (returned as the image itself). Text is paged (12000 characters; pass offset). Ids outside your ' +
      'skills are refused. A specimen shows a risk or a precedent; it is never a template to copy.',
    parameters: {
      id: { type: 'string', required: true, description: 'The reference id, e.g. critique/gallery-index or sophia-web-finish-v1.' },
      offset: { type: 'integer', description: 'Where a text page starts.' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => referenceBlocks(value) },
    async execute(args, exec): Promise<Json> {
      const session = sessionOf(exec)
      const value = await readReference(exec, args.id, Math.max(0, args.offset ?? 0))
      if (record && typeof value === 'object' && value !== null && !Array.isArray(value) && 'sha256' in value) {
        // The designer's reference reads go to its work record (binding map §4), without its own count.
        await deps.client.designRecord({ ...ids(session), callId: callKeyOf(`ref-${exec.callId}`), entries: [{ kind: 'reference', body: { id: args.id, sha256: String(value.sha256) } }] })
          .catch((error: Error) => deps.log(`design ${session.attemptId}: recording reference ${args.id} failed: ${error.message}`))
      }
      return asJson(value)
    },
  })

  const recordWork = defineTool({
    name: 'design_record_work',
    description:
      'Append entries to your work record: the contract (reader, medium, outcomes, non-goals, checks), stages, risks you ' +
      'found, surfaces you checked and notes. Pass expectedEntries, the entry count design_read_context showed. It grants nothing.',
    parameters: {
      expectedEntries: { type: 'integer', required: true, description: 'The work record\'s entry count you read.' },
      entries: {
        type: 'array',
        required: true,
        description: '1 to 10 entries.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['contract', 'stage', 'reference', 'risk', 'surface', 'note'], required: true },
            body: { type: 'string', required: true, description: 'What to record, at most 16000 characters.' },
          },
        },
      },
    },
    output: { schema: { type: 'json' }, render: plain },
    async execute(args, exec): Promise<Json> {
      const session = sessionOf(exec)
      const entries = args.entries.map((e: { kind: 'contract' | 'stage' | 'reference' | 'risk' | 'surface' | 'note'; body: string }) => ({ kind: e.kind, body: e.body }))
      return guarded(async () => asJson(await deps.client.designRecord({ ...ids(session), callId: callKeyOf(exec.callId), expectedEntries: args.expectedEntries, entries }, exec.signal)))
    },
  })

  const writeSource = defineTool({
    name: 'design_write_source',
    description:
      'Write the whole source: index.html (and optionally styles.css). It is checked before it is stored: a page that ' +
      'runs, loads or submits anything (script, handler, form, frame, media, remote URL, @import, url()) is refused and ' +
      'nothing is stored. Mark each top-level section with data-section, each block of the package with data-block="bN" ' +
      'carrying its text and its citations (data-cite="<sourceId>"), and list each cited source once (data-source). Pass ' +
      'expectedSha256: the current revision\'s sha256, or null for the first.',
    parameters: {
      expectedSha256: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true, description: 'The current revision\'s sha256; null only for the first write.' },
      html: { type: 'string', required: true, description: 'The whole index.html, at most 512 KiB.' },
      css: { type: 'string', description: 'styles.css, at most 128 KiB; omit to keep all style in index.html.' },
    },
    output: { schema: { type: 'json' }, render: plain },
    async execute(args, exec): Promise<Json> {
      const session = sessionOf(exec)
      const files = [{ path: 'index.html' as const, text: args.html }, ...(args.css === undefined ? [] : [{ path: 'styles.css' as const, text: args.css }])]
      return guarded(async () => asJson(await deps.client.designSource({ ...ids(session), callId: callKeyOf(exec.callId), expectedSha256: args.expectedSha256 ?? null, files }, exec.signal)))
    },
  })

  const patchSource = defineTool({
    name: 'design_patch_source',
    description:
      'Change the current source with exact edits: each replaces one exact, unique piece of text (an absent or repeated ' +
      '`find` is refused, never guessed); an empty find with no styles.css yet creates it. The result is checked like a ' +
      'write and must stay inside your edit scope; it returns the whole diff. Pass expectedSha256, the current revision\'s.',
    parameters: {
      expectedSha256: { type: 'string', required: true, description: 'The current revision\'s sha256.' },
      edits: {
        type: 'array',
        required: true,
        description: '1 to 40 edits, applied in order.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', enum: ['index.html', 'styles.css'], required: true },
            find: { type: 'string', required: true },
            replace: { type: 'string', required: true },
          },
        },
      },
    },
    output: { schema: { type: 'json' }, render: plain },
    async execute(args, exec): Promise<Json> {
      const session = sessionOf(exec)
      const edits = args.edits.map((e: { path: 'index.html' | 'styles.css'; find: string; replace: string }) => ({ path: e.path, find: e.find, replace: e.replace }))
      return guarded(async () => asJson(await deps.client.designPatch({ ...ids(session), callId: callKeyOf(exec.callId), expectedSha256: args.expectedSha256, edits }, exec.signal)))
    },
  })

  const render = defineTool({
    name: 'design_render',
    description:
      'Capture one revision in the confined renderer at your targets (390 and 1280 px, light): it is compiled into one ' +
      'self-contained page, measured (overflow, each block\'s visibility, clipping, cover and contrast) and captured as ' +
      'overview and readable section tiles. Waits for the capture and returns its captures, measures, checks and the hard ' +
      'gate\'s verdict. Name sections to capture only those (an edit); a candidate needs a whole-page render.',
    parameters: {
      revisionId: { type: 'string', required: true, description: 'The revision to capture.' },
      sections: { type: 'array', items: { type: 'string' }, description: 'Section ids to capture; omit for the whole page.' },
    },
    output: { schema: { type: 'json' }, render: plain },
    async execute(args, exec): Promise<Json> {
      const session = sessionOf(exec)
      return guarded(async () => {
        let reply = await deps.client.designRender({ ...ids(session), callId: callKeyOf(exec.callId), revisionId: args.revisionId, ...(args.sections ? { sections: args.sections } : {}) }, exec.signal)
        const deadline = Date.now() + wait.maxMs
        while ((reply.state === 'queued' || reply.state === 'rendering') && Date.now() < deadline && !exec.signal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, wait.pollMs))
          reply = await deps.client.designRenderResult({ ...ids(session), renderJobId: reply.renderJobId }, exec.signal)
        }
        return asJson({ ...reply, note: renderNote(reply) })
      })
    },
  })

  const inspectTool = (name: 'design_inspect_render' | 'review_inspect_render', role: 'design' | 'review') => defineTool({
    name,
    description:
      'Look at the actual captures of a render: up to four per call, by name (from the render\'s captures list), returned ' +
      'as the images themselves with their place on the page. Look at the overview first, then the sections. ' +
      (role === 'review' ? 'Only your candidate\'s captures are available; each one you look at is recorded.' : 'Omit renderJobId for your latest render.'),
    parameters: {
      ...(role === 'design' ? { renderJobId: { type: 'string', description: 'The render; omit for the latest.' } } : {}),
      names: { type: 'array', required: true, items: { type: 'string' }, description: '1 to 4 capture names.' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => inspectBlocks(value) },
    async execute(args, exec): Promise<Json> {
      const session = sessionOf(exec)
      return guarded(async () => {
        const renderJobId = (args as { renderJobId?: string }).renderJobId
        const reply = await deps.client.designCapture(role, { ...ids(session), ...(renderJobId ? { renderJobId } : {}), names: args.names }, exec.signal)
        const images = await stored(exec, reply.captures.map((c) => ({ data: Buffer.from(c.data, 'base64'), mediaType: 'image/png' as const, name: c.name })))
        return asJson({
          renderJobId: reply.renderJobId,
          captures: reply.captures.map(({ data: _data, ...c }, i) => ({ ...c, image: images[i] })),
        })
      })
    },
  })

  const submitCandidate = defineTool({
    name: 'design_submit_candidate',
    description:
      'Submit a candidate: your latest revision and a whole-page render of exactly it that passed the hard gate. Refused ' +
      'with the gate\'s reasons (nothing recorded) otherwise. It then goes to a separate visual reviewer, or is published ' +
      'labelled as checked by software only when no reviewer is available. You cannot publish or review it yourself.',
    parameters: {
      revisionId: { type: 'string', required: true },
      renderJobId: { type: 'string', required: true },
      summary: { type: 'string', description: 'What the page does for its reader, at most 2000 characters (for the record; the reviewer does not see it).' },
    },
    output: { schema: { type: 'json' }, render: plain },
    async execute(args, exec): Promise<Json> {
      const session = sessionOf(exec)
      const candidate = { revisionId: args.revisionId, renderJobId: args.renderJobId, ...(args.summary ? { summary: args.summary } : {}) }
      return guarded(async () => asJson(await deps.client.designSubmit({ ...ids(session), callId: callKeyOf(exec.callId), candidate })))
    },
  })

  const reportBlocker = defineTool({
    name: 'design_report_blocker',
    description: 'End the design without a candidate: the reason, and the remaining work. Your source revisions are kept.',
    parameters: {
      reason: { type: 'string', required: true, description: '1 to 500 characters.' },
      remainingWork: { type: 'string', description: 'At most 2000 characters.' },
    },
    output: { schema: { type: 'json' }, render: plain },
    async execute(args, exec): Promise<Json> {
      const session = sessionOf(exec)
      const blocker = { reason: args.reason, ...(args.remainingWork ? { remainingWork: args.remainingWork } : {}) }
      return guarded(async () => asJson(await deps.client.designSubmit({ ...ids(session), callId: callKeyOf(exec.callId), blocker })))
    },
  })

  const reviewReadContext = defineTool({
    name: 'review_read_context',
    description:
      'Read your review task: the original request, the frozen content package, your criteria and the candidate with its ' +
      'render (captures, measures, checks) and what you have inspected so far. With a sourceId, read one page of a text you ' +
      'may read (the package, the candidate\'s files or compiled page).',
    parameters: {
      sourceId: { type: 'string', description: 'A text to page through; omit to read the task.' },
      offset: { type: 'integer', description: 'Where the page starts.' },
    },
    output: { schema: { type: 'json' }, render: plain },
    async execute(args, exec): Promise<Json> {
      const session = sessionOf(exec)
      return guarded(async () => asJson(await deps.client.reviewContext(
        args.sourceId === undefined ? ids(session) : { ...ids(session), sourceId: args.sourceId, offset: args.offset ?? 0 }, exec.signal)))
    },
  })

  const reviewSubmit = defineTool({
    name: 'review_submit_result',
    description:
      'Submit your verdict: pass (nothing blocking or major remains), needs_revision (with the findings that must change: ' +
      'severity blocking or major, each with its fix and the capture it rests on), or blocked (you cannot judge; give the ' +
      'reason). A pass before you inspected each target\'s overview and every section is answered with what is missing.',
    parameters: {
      verdict: { type: 'string', enum: ['pass', 'needs_revision', 'blocked'], required: true },
      findings: {
        type: 'array',
        description: 'At most 40.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            severity: { type: 'string', enum: ['blocking', 'major', 'minor'], required: true },
            issue: { type: 'string', required: true },
            fix: { type: 'string' },
            target: { type: 'string', enum: ['w390-light', 'w1280-light'] },
            section: { type: 'string' },
            capture: { type: 'string' },
          },
        },
      },
      summary: { type: 'string', description: 'At most 2000 characters.' },
      reason: { type: 'string', description: 'blocked: why you cannot judge, 1 to 500 characters.' },
    },
    output: { schema: { type: 'json' }, render: plain },
    async execute(args, exec): Promise<Json> {
      const session = sessionOf(exec)
      const call = { ...ids(session), callId: callKeyOf(exec.callId) }
      if (args.verdict === 'blocked') {
        return guarded(async () => asJson(await deps.client.reviewSubmit({ ...call, blocker: { reason: args.reason ?? args.summary ?? 'The candidate could not be judged.' } })))
      }
      type Finding = { severity: 'blocking' | 'major' | 'minor'; issue: string; fix?: string; target?: 'w390-light' | 'w1280-light'; section?: string; capture?: string }
      const findings = (args.findings ?? []).map((f: Finding) => ({ ...f }))
      const result = { verdict: args.verdict, findings, ...(args.summary ? { summary: args.summary } : {}) }
      return guarded(async () => asJson(await deps.client.reviewSubmit({ ...call, result })))
    },
  })

  return [
    designReadContext,
    readReferenceTool('design_read_reference', true),
    recordWork,
    writeSource,
    patchSource,
    render,
    inspectTool('design_inspect_render', 'design'),
    submitCandidate,
    reportBlocker,
    reviewReadContext,
    readReferenceTool('review_read_reference', false),
    inspectTool('review_inspect_render', 'review'),
    reviewSubmit,
  ] as ToolDefinition[]
}
