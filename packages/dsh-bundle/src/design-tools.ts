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
 *
 * A look counts as seen only once the model has its images (SDD-01-CX-0033, CX-0035, CX-0036). Each inspection's
 * result carries, with the images, a receipt no one can guess; a candidate or a review's result names the receipts of
 * the looks it rests on, and only then does the tool acknowledge those deliveries and name them in the submission. The
 * service counts a delivery only for the submission that names it, so an acknowledgement whose submit never went out
 * (the bridge stopped in between) counts for nothing. A submit made before the images arrived (in the same batch of tool calls, or after an inspection that was
 * cancelled or lost before its result reached the model) cannot name their receipt, so they do not count. The roles are
 * offered no tool that calls another, so a receipt reaches the model only in its inspection's own result. The bridge
 * keeps receipts in memory: after a restart it does not know the old ones, and the model inspects again. Each
 * acknowledgement, and each submit, is sent unchanged until its outcome is known, within a deadline; an acknowledgement
 * still unknown submits nothing. A submit's call key is derived from what it ends the task with, not remembered, so a
 * submit whose answer was lost is the same call when it is sent again, after a restart too (#117): the service records
 * it at most once and answers what it recorded.
 * @module @sophia/dsh-bundle/design-tools
 */

import { createHash, randomBytes } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { DesignReference, LoadedAssets } from './design-assets.js'
import { callKeyOf } from './research-tools.js'
import { TransportError } from './transport.js'
import type { ServiceTransport } from './transport.js'
import { wire } from './runtime-wire.generated.js'
import type { WireValidator } from './runtime-wire.generated.js'
import type { DesignCaptureImage, DesignDeliveryAck, DesignRender } from './runtime-wire-types.generated.js'

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
  | 'designDelivered'
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
  /** How an acknowledgement and a submit are sent until their outcome is known (defaults: ACK_PATIENCE, SUBMIT_PATIENCE). */
  readonly patience?: { readonly ack: Patience; readonly submit: Patience }
}

/** How often, and for how long, the same request is sent before its outcome counts as unknown. */
export interface Patience {
  /** Requests at most. */
  readonly tries: number
  /** The pause before the second request; each next pause is twice the last. */
  readonly pauseMs: number
  /** No request or pause runs past this, from the first request. */
  readonly maxMs: number
}

/** design_render waits up to this long for its capture, looking this often (a look is a service call, not a model call). */
export const CAPTURE_WAIT = { maxMs: 240_000, pollMs: 2_000 } as const
/** An acknowledgement is sent up to four times, 0.5, 1 and 2 s apart, within 15 s. */
export const ACK_PATIENCE: Patience = { tries: 4, pauseMs: 500, maxMs: 15_000 }
/** A submit is sent up to four times within 60 s: a candidate's gate and publication take longer than an acknowledgement. */
export const SUBMIT_PATIENCE: Patience = { tries: 4, pauseMs: 1_000, maxMs: 60_000 }
/** The bridge remembers at most this many looks; the oldest is forgotten first, and its receipt is then refused. */
const MAX_LOOKS = 4_096
/** A submit names at most this many receipts. */
const MAX_SEEN = 64
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
  return {
    code: 'service_unavailable',
    message: 'The Sophia service could not be reached, or its answer could not be read: the call may or may not have taken effect. Read your context before you repeat it.',
  }
}

/** What a submit answers when an acknowledgement it rests on stays unknown: it sent nothing. */
const UNCONFIRMED = {
  code: 'service_unavailable',
  message: 'The Sophia service has not confirmed that the captures you were shown count as seen, so nothing was submitted. Submit again, naming the same receipts, after a pause.',
} as const

/** What a submit answers when its own outcome stays unknown. */
const SUBMIT_UNKNOWN = {
  code: 'service_unavailable',
  message: 'The Sophia service\'s answer to this submit was lost: it may have been recorded. Submit again after a pause, even after the ' +
    'runtime restarts: the same revision and render, or the same kind of submit (a verdict, a blocker), is the same call, recorded at most once and answered with what was recorded.',
} as const

/** What a submit answers when it names a receipt this task's model was not handed, and nothing had been recorded. */
function unknownReceipts(receipts: readonly string[]): Json {
  return {
    code: 'unknown_receipt',
    message: `Not the receipt of an inspection you were shown in this task: ${receipts.slice(0, 4).join(', ')}. Each inspection ` +
      'returns its receipt with its images, and the runtime forgets receipts when it restarts: inspect again and name the receipts it returns. Nothing was recorded.',
  }
}

type Role = 'design' | 'review'

/**
 * The call key of a submit: the role, the attempt and session, and what the submit ends the task with (a candidate's
 * revision and render, a review's result, or a blocker), hashed. It is derived, not remembered, so a submit sent again,
 * by the next call or after the bridge restarts, is the same call (#117): the service answers what it recorded under it
 * (a candidate, whatever it is then said to rest on; a verdict, whichever it then carries). A refused submit records
 * nothing, so its key stays free for the next.
 */
function submitKeyOf(role: Role, session: DesignSession, what: readonly string[]): string {
  const hash = createHash('sha256').update(JSON.stringify([role, session.attemptId, session.nativeSessionId, ...what]))
  return `sub-${hash.digest('hex').slice(0, 40)}`
}

/**
 * Whether a submit naming no look was answered with what an earlier call recorded under its key: the service's gate
 * refuses a candidate, a pass or a request for revision that rests on no inspected capture, so only a replay records.
 */
function replayed(role: Role, value: unknown): boolean {
  const outcome = (value as { outcome?: unknown } | null)?.outcome
  return role === 'design' ? outcome !== undefined && outcome !== 'refused' : outcome === 'recorded'
}

/** A look handed to the model: whose it is, and the one acknowledgement that counts it, sent unchanged. */
interface Look {
  readonly owner: string
  readonly role: Role
  readonly renderJobId: string
  readonly ack: DesignDeliveryAck
  counted: boolean
}

/** Whether a failed request is the service's answer that it recorded nothing (a refusal); anything else is unknown. */
function refusedOutright(error: unknown): error is TransportError {
  const status = error instanceof TransportError ? error.status : undefined
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429
}

/** Wait `ms`, or less if `stop` fires. */
const pause = (ms: number, stop: AbortSignal): Promise<void> => new Promise((resolve) => {
  const timer = setTimeout(resolve, ms)
  stop.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
})

/**
 * Send one request until its outcome is known: an answer `accept` takes, or the service's refusal. Anything else (no
 * answer, one that is unreadable or off the contract, a 5xx, 408 or 429, an answer `accept` rejects) is unknown, and
 * the same request is sent again, at most `tries` times within `maxMs`; none starts once `stop` fires. Each request is
 * given the time left; `stop` cancels one in flight only when `cancel` says so (a submit runs to its answer).
 * Null when the outcome stays unknown.
 */
async function untilKnown<T>(send: (signal: AbortSignal) => Promise<T>, accept: (value: T) => boolean, patience: Patience, stop: AbortSignal, cancel: boolean): Promise<{ value: T } | { refusal: TransportError } | null> {
  const deadline = Date.now() + patience.maxMs
  let wait = patience.pauseMs
  for (let tried = 1; !stop.aborted; tried += 1) {
    const timeout = AbortSignal.timeout(Math.max(1, deadline - Date.now()))
    try {
      const value = await send(cancel ? AbortSignal.any([stop, timeout]) : timeout)
      if (accept(value)) return { value }
    } catch (error) {
      if (refusedOutright(error)) return { refusal: error }
    }
    if (tried >= patience.tries || Date.now() + wait >= deadline) return null
    await pause(wait, stop)
    wait *= 2
  }
  return null
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
  readonly receipt: string
  readonly captures: ReadonlyArray<Omit<DesignCaptureImage, 'data'> & { image: StoredImage }>
}

/** Render an inspection: the captures as image blocks, after their place on the page. */
function inspectBlocks(value: unknown): ContentBlock[] {
  const v = value as InspectValue | { code: string }
  if (!('captures' in v)) return json(v)
  const header = `Captures of render ${v.renderJobId}. Each is a real screenshot of the compiled page in the confined renderer; ` +
    'judge only what you can see in it, and name the capture each finding rests on. ' +
    `Receipt of this inspection: ${v.receipt}. Name it in seen when you submit: these captures count as seen only then.`
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
  const patience = deps.patience ?? { ack: ACK_PATIENCE, submit: SUBMIT_PATIENCE }
  const ownerOf = (role: Role, s: DesignSession) => `${role} ${s.attemptId} ${s.nativeSessionId}`

  /** The looks handed to the models, by receipt, oldest first. */
  const looks = new Map<string, Look>()

  /** Remember a look the model is being handed, under a new receipt that only its result will carry. */
  function handOver(look: Look): string {
    const receipt = `seen-${randomBytes(16).toString('base64url')}`
    looks.set(receipt, look)
    if (looks.size > MAX_LOOKS) looks.delete(looks.keys().next().value!)
    return receipt
  }

  /**
   * Acknowledge the looks a submit names by their receipts, each until its outcome is known, and return the deliveries
   * the submission names (`seen`). The strangers, and nothing acknowledged, when a receipt is not one of this session's
   * model's looks (another's, a guess, or one the bridge forgot when it restarted); a problem when an acknowledgement
   * stays unknown (it is sent again by the next submit naming it). A refused look is left out: it does not count, and
   * the service's gate names what is missing.
   */
  async function confirmSeen(role: Role, session: DesignSession, seen: readonly string[], stop: AbortSignal): Promise<{ problem: Json } | { strangers: string[] } | { deliveries: string[] }> {
    if (seen.length > MAX_SEEN) return { problem: { code: 'invalid_request', message: `A submit names at most ${MAX_SEEN} receipts.` } }
    const owner = ownerOf(role, session)
    const named = [...new Set(seen)].map((receipt) => [receipt, looks.get(receipt)] as const)
    const strangers = named.filter(([, look]) => look?.owner !== owner).map(([receipt]) => receipt)
    if (strangers.length > 0) return { strangers }
    const deliveries: string[] = []
    for (const [, look] of named) {
      if (!look) continue
      if (!look.counted) {
        const outcome = await untilKnown((signal) => deps.client.designDelivered(role, look.ack, signal),
          (receipt) => receipt.deliveryId === look.ack.deliveryId && receipt.renderJobId === look.renderJobId, patience.ack, stop, true)
        if (outcome === null) return { problem: { ...UNCONFIRMED } }
        if ('refusal' in outcome) {
          deps.log(`${role} ${session.attemptId}: delivery ${look.ack.deliveryId} was refused (${outcome.refusal.code ?? outcome.refusal.status}); it does not count as seen`)
          continue
        }
        look.counted = true
      }
      deliveries.push(look.ack.deliveryId)
    }
    return { deliveries }
  }

  /**
   * Send a submit until its outcome is known, under the call key derived from what it ends the task with (`what`), so
   * the service records it at most once however often it is sent. A request off the contract is refused here: it is
   * never sent, so its outcome is known. A submit that named receipts this model was not handed (`strangers`) is sent
   * naming no look: it can only be answered with what an earlier call recorded under its key (a submit whose answer was
   * lost before the bridge restarted); anything else is the unknown receipts, and nothing recorded.
   */
  async function submitOnce<B>(role: Role, session: DesignSession, exec: ToolRunContext, what: readonly string[], content: object,
    valid: WireValidator<B>, post: (body: B, signal: AbortSignal) => Promise<unknown>, strangers: readonly string[] | null = null): Promise<Json> {
    const body = { ...ids(session), callId: submitKeyOf(role, session, what), ...content }
    if (!valid(body)) return { code: 'invalid_request', message: MESSAGES.invalid_request! }
    const outcome = await untilKnown((signal) => post(body, signal), () => true, patience.submit, exec.signal, false)
    if (outcome === null) return { ...SUBMIT_UNKNOWN }
    if (strangers && !('value' in outcome && replayed(role, outcome.value))) return unknownReceipts(strangers)
    return 'value' in outcome ? asJson(outcome.value) : serviceProblem(outcome.refusal)
  }

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
      return { code: 'not_found', message: `No reference ${id} in this role's scope. Its references: ${known}.` }
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
      'Read one reference your role may read, by id: one of your skills\' whole text (its id), a reference section, or ' +
      'a specimen image (returned as the image itself). Text is paged (12000 characters; pass offset). Ids outside your ' +
      'role\'s reference scope are refused. A specimen shows a risk or a precedent; it is never a template to copy.',
    parameters: {
      id: { type: 'string', required: true, description: 'The reference id, e.g. critique/gallery-index or web/precedents/page-04.' },
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
      'as the images themselves with their place on the page, and a receipt. Look at the overview first, then the sections. ' +
      'A capture counts as seen only once a submit names its inspection\'s receipt (seen). ' +
      (role === 'review'
        ? 'Only your candidate\'s captures are available. A pass needs every overview tile at every target and each section at one target at least.'
        : 'Omit renderJobId for your latest render. Before you submit a candidate, look at every overview tile at every target ' +
          'and each section at one target at least of the very render you submit; a submit names what you have not seen.'),
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
        // Seen only as the bytes handed over: the store keeps an image it did not alter under sha256 of those bytes.
        const attachments = reply.captures.map((c, i) => {
          const id = images[i]?.attachmentId
          if (id !== `sha256:${c.sha256}`) throw new Error(`The image store altered ${c.name}: it was not shown, and does not count as seen.`)
          return { name: c.name, attachmentId: id }
        })
        // Not acknowledged here: only a submit naming this result's receipt shows the model had these images.
        if (exec.signal.aborted) throw new Error('The inspection was cancelled: its captures were not shown and do not count as seen.')
        const receipt = handOver({ owner: ownerOf(role, session), role, renderJobId: reply.renderJobId, ack: { ...ids(session), deliveryId: reply.deliveryId, attachments }, counted: false })
        return asJson({
          renderJobId: reply.renderJobId,
          receipt,
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
      'labelled as checked by software only when no reviewer is available. You cannot publish or review it yourself. A ' +
      'revision and render are one candidate: submitting them again is answered with what was recorded for them.',
    parameters: {
      revisionId: { type: 'string', required: true },
      renderJobId: { type: 'string', required: true },
      seen: { type: 'array', required: true, items: { type: 'string' }, description: 'The receipts of the inspections this candidate rests on, each as its result gave it: only these captures count as seen.' },
      summary: { type: 'string', description: 'What the page does for its reader, at most 2000 characters (for the record; the reviewer does not see it).' },
    },
    output: { schema: { type: 'json' }, render: plain },
    async execute(args, exec): Promise<Json> {
      const session = sessionOf(exec)
      const confirmed = await confirmSeen('design', session, args.seen ?? [], exec.signal)
      if ('problem' in confirmed) return confirmed.problem
      const seen = 'deliveries' in confirmed ? confirmed.deliveries : []
      const candidate = { revisionId: args.revisionId, renderJobId: args.renderJobId, ...(args.summary ? { summary: args.summary } : {}), seen }
      return submitOnce('design', session, exec, ['candidate', String(args.revisionId), String(args.renderJobId)], { candidate }, wire.DesignSubmitRequest,
        (body, signal) => deps.client.designSubmit(body, signal), 'strangers' in confirmed ? confirmed.strangers : null)
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
      return submitOnce('design', session, exec, ['blocker'], { blocker }, wire.DesignSubmitRequest, (body, signal) => deps.client.designSubmit(body, signal))
    },
  })

  const reviewReadContext = defineTool({
    name: 'review_read_context',
    description:
      'Read your review task: the original request, the frozen content package, your criteria and the candidate with its ' +
      'render (captures, measures, checks) and the captures counted as inspected so far (a look counts once a submit names its receipt). With a sourceId, read one page of a text you ' +
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
      'reason). Name in seen the receipts of the inspections a pass or needs_revision rests on: only those captures count ' +
      'as inspected. A pass before you inspected each target\'s overview and every section is answered with what is missing; ' +
      'a needs_revision names at least one inspection, and each blocking or major finding names its capture among them.',
    parameters: {
      verdict: { type: 'string', enum: ['pass', 'needs_revision', 'blocked'], required: true },
      seen: { type: 'array', items: { type: 'string' }, description: 'pass, needs_revision: the receipts of the inspections it rests on, each as its result gave it.' },
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
      if (args.verdict === 'blocked') {
        const blocker = { reason: args.reason ?? args.summary ?? 'The candidate could not be judged.' }
        return submitOnce('review', session, exec, ['blocker'], { blocker }, wire.ReviewSubmitRequest, (body, signal) => deps.client.reviewSubmit(body, signal))
      }
      const confirmed = await confirmSeen('review', session, args.seen ?? [], exec.signal)
      if ('problem' in confirmed) return confirmed.problem
      type Finding = { severity: 'blocking' | 'major' | 'minor'; issue: string; fix?: string; target?: 'w390-light' | 'w1280-light'; section?: string; capture?: string }
      const findings = (args.findings ?? []).map((f: Finding) => ({ ...f }))
      const seen = 'deliveries' in confirmed ? confirmed.deliveries : []
      const result = { verdict: args.verdict, findings, ...(args.summary ? { summary: args.summary } : {}), seen }
      return submitOnce('review', session, exec, ['result'], { result }, wire.ReviewSubmitRequest, (body, signal) => deps.client.reviewSubmit(body, signal),
        'strangers' in confirmed ? confirmed.strangers : null)
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
