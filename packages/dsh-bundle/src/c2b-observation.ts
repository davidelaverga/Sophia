/**
 * INC04-R07-C2B-PRODUCER-001: the consumer side of a model call's private observation (C2B), between the patched
 * adapter's frames and A58's closed `evidence.observed`, in one pure, bounded module.
 *
 * What it guarantees:
 * - **Decoding without echo.** Every chunk is read through its own DATA descriptors only: no getter, `toJSON`, spread,
 *   JSON clone or `cause` ever touches it. A reserved observation frame never passes on, whatever its payload's
 *   descriptor, enumerability or version; a known chunk that carries the reserved key is rebuilt from its own closed
 *   fields without it; an ordinary chunk passes as the same object. Anything else is one fixed error with no value.
 * - **Delivered facts only.** At most three frames per call (transport, created, terminal), in that order; a duplicate,
 *   late, excess or malformed frame is dropped. A fact that never crossed stays unknown; nothing is defaulted, derived
 *   from another count or invented after an early return.
 * - **First-known and sticky.** A contradiction keeps the first value and adds one bounded witness for its dimension
 *   (sha256 of `c2b-conflict-v1|<dimension>|<competing canonical>`, the service's own form); it is never turned into
 *   unknown. Raw counts merge only under the same provider terminal.
 *
 * What it does not do: price anything, touch A57's facts, or judge the call's consumer ending.
 * @module @sophia/dsh-bundle/c2b-observation
 */

import { createHash } from 'node:crypto'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ResearchSettleRequest } from './runtime-wire-types.generated.js'

/** The reserved chunk type of an observation frame, and its one reserved payload key (the patched adapter's). */
export const OBSERVATION_FRAME_TYPE = 'x-sophia-c2b-observation'
export const OBSERVATION_KEY = 'sophiaC2bObservation'
/** The capability the bridge provides, and the exact version the patched adapter emits for. */
export const OBSERVATION_SERVICE = 'sophiaC2bObservation'
export const OBSERVATION_VERSION = 'sophia-c2b-observation-v1'

/** A58's closed observation. */
export type Observed = NonNullable<NonNullable<ResearchSettleRequest['evidence']>['observed']>
type IdEvidence = NonNullable<Observed['n1']>['id']
type N1Source = NonNullable<Observed['n1']>['sources'][number]
type N2Source = NonNullable<Observed['n2']>['sources'][number]
type Terminal = NonNullable<Observed['providerTerminal']>
type Dimension = NonNullable<Observed['conflicts']>[number]['dimension']
type CountKey = 'inputTotal' | 'cacheRead' | 'output'

/** One frame's validated payload. */
export interface FramePayload {
  readonly frame: 'transport' | 'created' | 'terminal'
  readonly sent?: 'observable_transport_response'
  readonly httpStatus?: number
  readonly n1?: readonly { readonly id: IdEvidence; readonly source: N1Source }[]
  readonly n2?: readonly { readonly id: IdEvidence; readonly source: N2Source }[]
  readonly providerTerminal?: Terminal
  readonly rawCounts?: Readonly<Partial<Record<CountKey, number>>>
}

/** A chunk that cannot be read safely. Fixed text, no cause, no value. */
export class ObservationChunkRejected extends Error {
  constructor() {
    super('c2b_chunk_rejected')
  }
}

export const N1_SOURCES: readonly N1Source[] = ['created', 'completed', 'incomplete', 'failed']
export const N2_SOURCES: readonly N2Source[] = ['response_header', 'typed_error']
const TERMINALS: readonly Terminal[] = ['completed', 'incomplete', 'failed', 'error_event']
const UNSUPPORTED = ['empty', 'not_string', 'nul', 'unpaired_surrogate', 'over_bound'] as const
export const DIMENSIONS: readonly Dimension[] = ['n1', 'n2', 'http_status', 'provider_terminal', 'input_total', 'cache_read', 'output', 'cross_c1p']
const COUNT_DIMENSION: Readonly<Record<CountKey, Dimension>> = { inputTotal: 'input_total', cacheRead: 'cache_read', output: 'output' }
const ID_MAX_BYTES = 8192
const MAX_SAFE = Number.MAX_SAFE_INTEGER
const FRAME_RANK = { transport: 0, created: 1, terminal: 2 } as const

// --- own-data reading -------------------------------------------------------------------------------------------------

type Own = { readonly ok: true; readonly value: unknown } | { readonly ok: false }
const ABSENT: Own = { ok: false }

/** One own DATA property, never a getter; an accessor is a reason to reject, an absent key is `ABSENT`. */
function own(target: object, key: string): Own | 'accessor' {
  const descriptor = Reflect.getOwnPropertyDescriptor(target, key)
  if (descriptor === undefined) return ABSENT
  return 'value' in descriptor ? { ok: true, value: descriptor.value } : 'accessor'
}

const isPlainObject = (value: unknown): value is object => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto: unknown = Reflect.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** The own data keys of a plain object, or null when any key is a symbol, an accessor or outside `allowed`. */
function closedKeys(value: unknown, allowed: readonly string[]): Map<string, unknown> | null {
  if (!isPlainObject(value)) return null
  const out = new Map<string, unknown>()
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)) return null
    const read = own(value, key)
    if (read === 'accessor' || !read.ok) return null
    out.set(key, read.value)
  }
  return out
}

/** The elements of a plain array read as own data, or null. */
function closedArray(value: unknown, max: number): unknown[] | null {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) return null
  const length = own(value, 'length')
  if (length === 'accessor' || !length.ok || typeof length.value !== 'number' || length.value < 1 || length.value > max) return null
  const out: unknown[] = []
  for (let i = 0; i < length.value; i += 1) {
    const item = own(value, String(i))
    if (item === 'accessor' || !item.ok) return null
    out.push(item.value)
  }
  return Reflect.ownKeys(value).length === length.value + 1 ? out : null
}

// --- payload validation ---------------------------------------------------------------------------------------------

/** A closed id: supported (1..8192 UTF-8 bytes, no NUL, well-formed) or unsupported with a fixed reason. */
function idOf(value: unknown): IdEvidence | null {
  const supported = closedKeys(value, ['status', 'value'])
  if (supported?.get('status') === 'supported' && supported.size === 2) {
    const raw = supported.get('value')
    if (typeof raw !== 'string' || raw.length === 0 || raw.includes('\u0000') || !raw.isWellFormed()) return null
    return Buffer.byteLength(raw, 'utf8') <= ID_MAX_BYTES ? { status: 'supported', value: raw } : null
  }
  const unsupported = closedKeys(value, ['status', 'reason'])
  const reason = unsupported?.get('reason')
  if (unsupported?.get('status') !== 'identity_unsupported' || unsupported.size !== 2) return null
  const known = UNSUPPORTED.find((r) => r === reason)
  return known === undefined ? null : { status: 'identity_unsupported', reason: known }
}

/** Id entries `{id, source}` with distinct sources from `sources`, or null. */
function entriesOf<S extends string>(value: unknown, sources: readonly S[]): { id: IdEvidence; source: S }[] | null {
  const items = closedArray(value, sources.length)
  if (items === null) return null
  const out: { id: IdEvidence; source: S }[] = []
  for (const item of items) {
    const keys = closedKeys(item, ['id', 'source'])
    const source = sources.find((s) => s === keys?.get('source'))
    const id = keys?.size === 2 ? idOf(keys.get('id')) : null
    if (source === undefined || id === null || out.some((e) => e.source === source)) return null
    out.push({ id, source })
  }
  return out
}

const safeCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_SAFE
const httpStatusOf = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 100 && value <= 599

function countsOf(value: unknown): Partial<Record<CountKey, number>> | null {
  const keys = closedKeys(value, ['inputTotal', 'cacheRead', 'output'])
  if (keys === null || keys.size === 0) return null
  const out: Partial<Record<CountKey, number>> = {}
  for (const key of ['inputTotal', 'cacheRead', 'output'] as const) {
    if (!keys.has(key)) continue
    const count = keys.get(key)
    if (!safeCount(count)) return null
    out[key] = count
  }
  return out
}

const PAYLOAD_KEYS = ['v', 'frame', 'sent', 'httpStatus', 'n1', 'n2', 'providerTerminal', 'rawCounts']

/** Which members each frame kind may carry (transport facts, the created id, or the full terminal set). */
const FRAME_MEMBERS: Readonly<Record<FramePayload['frame'], readonly string[]>> = {
  transport: ['v', 'frame', 'sent', 'httpStatus', 'n2'],
  created: ['v', 'frame', 'n1'],
  terminal: PAYLOAD_KEYS,
}

/** A frame payload's closed shape, or null: version 1, members of its kind only, every value valid. */
export function payloadOf(value: unknown): FramePayload | null {
  const keys = closedKeys(value, PAYLOAD_KEYS)
  const frame = keys?.get('frame')
  if (keys === null || keys.get('v') !== 1 || (frame !== 'transport' && frame !== 'created' && frame !== 'terminal')) return null
  if ([...keys.keys()].some((k) => !FRAME_MEMBERS[frame].includes(k))) return null
  return membersOf(keys, frame)
}

function membersOf(keys: Map<string, unknown>, frame: FramePayload['frame']): FramePayload | null {
  const sentValue = keys.get('sent')
  if (keys.has('sent') && sentValue !== 'observable_transport_response') return null
  const sent = sentValue === 'observable_transport_response' ? sentValue : undefined
  const httpStatus = keys.get('httpStatus')
  if (keys.has('httpStatus') && !httpStatusOf(httpStatus)) return null
  const n1 = keys.has('n1') ? entriesOf(keys.get('n1'), N1_SOURCES) : undefined
  const n2 = keys.has('n2') ? entriesOf(keys.get('n2'), N2_SOURCES) : undefined
  const terminal = TERMINALS.find((t) => t === keys.get('providerTerminal'))
  const counts = keys.has('rawCounts') ? countsOf(keys.get('rawCounts')) : undefined
  if (n1 === null || n2 === null || counts === null || (keys.has('providerTerminal') && terminal === undefined)) return null
  if (counts !== undefined && terminal === undefined) return null
  if (frame === 'created' && (n1?.length !== 1 || n1[0]?.source !== 'created' || n1[0].id.status !== 'supported')) return null
  if (frame === 'transport' && (sent === undefined || n2?.some((e) => e.source !== 'response_header'))) return null
  return {
    frame,
    ...(sent === undefined ? {} : { sent }),
    ...(httpStatusOf(httpStatus) ? { httpStatus } : {}),
    ...(n1 === undefined ? {} : { n1 }),
    ...(n2 === undefined ? {} : { n2 }),
    ...(terminal === undefined ? {} : { providerTerminal: terminal }),
    ...(counts === undefined ? {} : { rawCounts: counts }),
  }
}

// --- chunk decoding -------------------------------------------------------------------------------------------------

/** The closed own fields of each known chunk kind (dsh-llm StreamChunk), the optional ones marked. */
const CHUNK_FIELDS: Readonly<Record<StreamChunk['type'], readonly (readonly [string, boolean])[]>> = {
  'block-start': [['index', true], ['blockType', true]],
  'text-delta': [['index', true], ['text', true]],
  'reasoning-delta': [['index', true], ['text', true]],
  'tool-call-delta': [['index', true], ['id', true], ['name', false], ['argumentsDelta', true]],
  'block-end': [['index', true], ['block', true]],
  usage: [['usage', true]],
  finish: [['reason', true], ['replayState', false]],
}
const isChunkKind = (value: unknown): value is StreamChunk['type'] => typeof value === 'string' && Object.hasOwn(CHUNK_FIELDS, value)

export type Decoded = { readonly kind: 'pass'; readonly chunk: StreamChunk } | { readonly kind: 'frame'; readonly payload: FramePayload | null }

/**
 * One chunk, decoded without invoking anything it carries: a reserved frame (its payload, or null when malformed, an
 * accessor or enumerable), a known chunk rebuilt without the reserved key, or the same ordinary chunk. Throws the fixed
 * `ObservationChunkRejected` for a chunk whose type cannot be read as data, or a reserved key on an unknown kind.
 */
export function decodeChunk(chunk: StreamChunk): Decoded {
  if (typeof chunk !== 'object' || chunk === null) throw new ObservationChunkRejected()
  const type = own(chunk, 'type')
  if (type === 'accessor' || !type.ok) throw new ObservationChunkRejected()
  const reserved = Reflect.getOwnPropertyDescriptor(chunk, OBSERVATION_KEY)
  if (type.value === OBSERVATION_FRAME_TYPE) {
    const payload = reserved !== undefined && 'value' in reserved && reserved.enumerable !== true ? payloadOf(reserved.value) : null
    return { kind: 'frame', payload }
  }
  if (reserved === undefined) return { kind: 'pass', chunk }
  if (!isChunkKind(type.value)) throw new ObservationChunkRejected()
  return { kind: 'pass', chunk: rebuild(chunk, type.value) }
}

/** A known chunk rebuilt from its own closed data fields, without the reserved key (or the fixed rejection). */
function rebuild(chunk: object, kind: StreamChunk['type']): StreamChunk {
  const out: Record<string, unknown> = { type: kind }
  for (const [field, required] of CHUNK_FIELDS[kind]) {
    const read = own(chunk, field)
    if (read === 'accessor' || (required && !read.ok)) throw new ObservationChunkRejected()
    if (read.ok) out[field] = read.value
  }
  // Trusted local shape: every field of this kind was read as data from a chunk of this kind.
  return out as unknown as StreamChunk
}

/**
 * The stream with every observation frame removed (none ever reaches a consumer), each frame's payload handed to
 * `sink` when given. Reads one chunk at a time; a consumer that stops reading stops it (no drain).
 */
export async function* withoutObservations(source: AsyncIterable<StreamChunk>, sink?: CallObservation): AsyncGenerator<StreamChunk> {
  for await (const chunk of source) {
    const decoded = decodeChunk(chunk)
    if (decoded.kind === 'frame') {
      sink?.accept(decoded.payload)
      continue
    }
    yield decoded.chunk
  }
}

// --- the per-call merge -------------------------------------------------------------------------------------------------

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')
/** The service's witness of a contradiction (0110 research_call_observed_witness). */
export const witnessOf = (dimension: Dimension, competing: string): string => sha256(`c2b-conflict-v1|${dimension}|${competing}`)
/** An id's canonical form: s:<sha256 of its UTF-8> or u:<reason>. Never the id. */
export const idCanonical = (id: IdEvidence): string => (id.status === 'supported' ? `s:${sha256(id.value)}` : `u:${id.reason}`)

interface IdFact<S extends string> {
  id: IdEvidence
  sources: Set<S>
}

/**
 * What one model call's delivered frames showed, merged first-known with sticky witnesses. One instance per call
 * (per stream invocation), never shared: an agent retry is another call with its own.
 */
export class CallObservation {
  private rank = -1
  private frames = 0
  private terminalCrossed = false
  private sent = false
  private httpStatus: number | undefined
  private n1: IdFact<N1Source> | undefined
  private n2: IdFact<N2Source> | undefined
  private terminal: Terminal | undefined
  private readonly counts: Partial<Record<CountKey, number>> = {}
  private readonly witnesses = new Map<Dimension, string>()

  /** One delivered frame: kept only in order and at most once per kind; a malformed one (null) is dropped. */
  accept(payload: FramePayload | null): void {
    if (payload === null || this.terminalCrossed) return
    const rank = FRAME_RANK[payload.frame]
    if (rank <= this.rank) return
    this.rank = rank
    this.frames += 1
    if (payload.frame === 'terminal') this.terminalCrossed = true
    this.merge(payload)
  }

  private merge(payload: FramePayload): void {
    if (payload.sent !== undefined) this.sent = true
    if (payload.httpStatus !== undefined) {
      if (this.httpStatus === undefined) this.httpStatus = payload.httpStatus
      else if (this.httpStatus !== payload.httpStatus) this.witness('http_status', String(payload.httpStatus))
    }
    for (const entry of [...(payload.n1 ?? [])].sort((a, b) => N1_SOURCES.indexOf(a.source) - N1_SOURCES.indexOf(b.source))) {
      this.n1 = this.mergeId('n1', this.n1, entry.id, entry.source)
    }
    for (const entry of [...(payload.n2 ?? [])].sort((a, b) => N2_SOURCES.indexOf(a.source) - N2_SOURCES.indexOf(b.source))) {
      this.n2 = this.mergeId('n2', this.n2, entry.id, entry.source)
    }
    if (payload.providerTerminal !== undefined) this.mergeTerminal(payload.providerTerminal, payload.rawCounts ?? {})
  }

  /** One id into the known one (0110 research_call_observed_id_merge): first-known, sources unioned for the same id. */
  private mergeId<S extends string>(dimension: 'n1' | 'n2', known: IdFact<S> | undefined, id: IdEvidence, source: S): IdFact<S> {
    if (known === undefined) return { id, sources: new Set([source]) }
    if (idCanonical(known.id) === idCanonical(id)) return { id: known.id, sources: new Set([...known.sources, source]) }
    if (known.id.status === 'identity_unsupported' && id.status === 'supported') return { id, sources: new Set([source]) }
    if (known.id.status === 'supported' && id.status === 'identity_unsupported') return known
    this.witness(dimension, idCanonical(id))
    return known
  }

  /** A terminal brings its own counts; the same terminal may add counts; another terminal is a contradiction. */
  private mergeTerminal(terminal: Terminal, counts: Partial<Record<CountKey, number>>): void {
    if (this.terminal === undefined) this.terminal = terminal
    else if (this.terminal !== terminal) {
      this.witness('provider_terminal', terminal)
      return
    }
    for (const key of ['inputTotal', 'cacheRead', 'output'] as const) {
      const value = counts[key]
      if (value === undefined) continue
      const was = this.counts[key]
      if (was === undefined) this.counts[key] = value
      else if (was !== value) this.witness(COUNT_DIMENSION[key], String(value))
    }
  }

  /** The first witness of a dimension stays; later contradictions of it change nothing. */
  private witness(dimension: Dimension, competing: string): void {
    if (!this.witnesses.has(dimension)) this.witnesses.set(dimension, witnessOf(dimension, competing))
  }

  /** How many frames were accepted (0..3). */
  get delivered(): number {
    return this.frames
  }

  /** A58's closed `evidence.observed` for what actually crossed; absent members are unknown. */
  observed(): Observed {
    const counts = Object.keys(this.counts).length > 0 && this.terminal !== undefined ? { rawCounts: { ...this.counts } } : {}
    const conflicts = DIMENSIONS.filter((d) => this.witnesses.has(d)).map((d) => ({ dimension: d, witness: this.witnesses.get(d) ?? '' }))
    return {
      ...(this.sent ? { sent: 'observable_transport_response' } : {}),
      ...(this.httpStatus === undefined ? {} : { httpStatus: this.httpStatus }),
      ...(this.n1 === undefined ? {} : { n1: { id: this.n1.id, sources: N1_SOURCES.filter((s) => this.n1?.sources.has(s)) } }),
      ...(this.n2 === undefined ? {} : { n2: { id: this.n2.id, sources: N2_SOURCES.filter((s) => this.n2?.sources.has(s)) } }),
      ...(this.terminal === undefined ? {} : { providerTerminal: this.terminal }),
      ...counts,
      ...(conflicts.length > 0 ? { conflicts } : {}),
      deliveryUnknownReason: this.terminalCrossed ? 'none' : this.frames > 0 ? 'closed_before_terminal_frame' : 'no_frame_delivered',
    }
  }
}
