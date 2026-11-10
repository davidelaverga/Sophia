/**
 * Intake observation policy (INC03-CC-001, current version in INTAKE_OBSERVATION_POLICY_VERSION; pack v2 INC03-R01..R16, C03-R02..R08): a pure, deterministic,
 * versioned proposal for one conversation input. It keeps audience, addressee, proposed action and target, target
 * basis, uncertainty and an admission outcome apart, and records them as an observation.
 *
 * It guarantees: the audience never changes; trusted structured mentions and a human reply author take precedence
 * over text; quoted, imported and generated text is evidence, never an instruction or an identity; several plausible
 * targets ask for clarification; a held or stopped mission gets no fresh inquiry; the same operation and payload
 * yield the same observation and a changed payload conflicts; a legacy `askSophia` must be an explicit boolean
 * (false gets no assessment; omitted is invalid); a quotation whose end is ambiguous makes the whole input abstain.
 * Meaning outside the small lexicon abstains.
 *
 * It does not admit anything: the outcome is never `admitted`. Supplied facts can make an input wait or be denied;
 * none grants authority. It calls no model, reads no clock, environment, file or network, and holds no transport,
 * database, notification, control or dispatch handle. It is not exported from the package and not installed in any
 * request path: the offline consumer is scripts/intake-observe.ts, and the later admitted intake consumer must reuse
 * it behind an additive durable contract (docs/plans/intake-observation.md).
 * @module @sophia/coordination/intake-observation
 */
import { createHash } from 'node:crypto'
import { canonicalJson } from './canonical.ts'

export const INTAKE_OBSERVATION_POLICY_VERSION = 'sophia.intake-observation.policy.v14'

export const INTAKE_LIMITS = { textChars: 4000, contextKeys: 64, stringChars: 200, listItems: 16 } as const

// ---------------------------------------------------------------------------------------------------------------
// Input schema: a closed table of typed facts. Anything else is an input error.

const ENUMS = {
  audience: ['personal', 'project', 'voice_call'],
  control: ['running', 'held', 'stopped'],
  origin: ['human', 'agent_result', 'receipt', 'generated', 'delayed_output', 'voice_interim', 'voice_final'],
  dispatch: ['not_sent', 'possibly_sent', 'outcome_unknown'],
  qualification: ['qualified', 'unqualified'],
} as const

type EnumKind = keyof typeof ENUMS
type FieldKind = EnumKind | 'id' | 'id_or_null' | 'qual_or_null' | 'text' | 'bool' | 'int' | 'ids' | 'id_pairs'

export const CONTEXT_FIELDS = {
  // Audience
  audience: 'audience',
  originalAudience: 'audience',
  participantsChanged: 'bool',
  // Addressing (structured, as a composer sends it)
  trustedMentions: 'ids',
  currentMembers: 'ids',
  directAddress: 'id',
  replyTo: 'id',
  replyAuthor: 'id',
  needsReply: 'bool',
  // Untrusted text: evidence only
  untrustedTextMentions: 'ids',
  quotedText: 'text',
  attachmentInstruction: 'text',
  // Exact context
  selectedArtifact: 'id_or_null',
  selectedComparison: 'ids',
  attachment: 'id',
  uniqueDecision: 'id',
  uniqueDate: 'id',
  retainedEvidence: 'id_or_null',
  latestArtifact: 'id',
  otherArtifact: 'id',
  acceptedVersion: 'id',
  accepted: 'bool',
  acceptedStandard: 'id',
  repo: 'id',
  base: 'id',
  issue: 'id',
  // Ambiguity
  possibleTargets: 'ids',
  possibleComparisons: 'id_pairs',
  candidates: 'ids',
  possibleRepos: 'ids',
  // Work
  activeMission: 'id_or_null',
  selectedMission: 'id',
  manager: 'id',
  // The manager's generation and the mission it belongs to, and the mission's binding: carried as supplied, never
  // guessed. Without manager and generation a follow-up or fresh inquiry waits.
  managerGeneration: 'int',
  managerMission: 'id',
  missionBinding: 'id',
  control: 'control',
  relatedToActive: 'bool',
  pendingOperation: 'id',
  // Resource and permission facts: supplied facts, never grants
  apiGrant: 'qual_or_null',
  apiResource: 'id',
  nativePair: 'qual_or_null',
  nativeSubscription: 'id',
  inquiryGrant: 'qual_or_null',
  stopQualified: 'bool',
  holdQualified: 'bool',
  resumeQualified: 'bool',
  pin: 'id',
  pinUnavailable: 'bool',
  alternateAvailable: 'bool',
  requester: 'id',
  resourceOwner: 'id',
  nativeDelegationQualified: 'bool',
  projectExcludedByGrant: 'bool',
  currentSourceEligible: 'bool',
  sourceEligible: 'bool',
  sourcePermission: 'bool',
  unrelatedNativeHistory: 'bool',
  membershipRemovedBeforePublication: 'bool',
  grantRevokedBeforeSend: 'bool',
  designState: 'id',
  implementationAuthorized: 'bool',
  currentActorAuthorized: 'bool',
  currentGrant: 'id',
  // Origin and operation identity
  origin: 'origin',
  causedBy: 'id',
  voiceUtterance: 'id',
  isFinal: 'bool',
  operationId: 'id',
  redeliveryOf: 'id',
  samePayload: 'bool',
  originalAdmission: 'id',
  originalOperation: 'id',
  dispatchState: 'dispatch',
  expectedRevision: 'int',
  currentRevision: 'int',
  newTarget: 'id',
  correctedSourceManifest: 'ids',
  originalBinding: 'id',
  currentBindingRevision: 'int',
  missionAllowanceLineage: 'id',
  originalEffectState: 'id',
  nativeSession: 'id',
  // The actor explicitly adopts quoted words as their own request (read by the quotation rule)
  actorExplicitlyAdopts: 'bool',
  // Informational: accepted and recorded, read by no rule
  textContainsBuildWord: 'bool',
} as const satisfies Record<string, FieldKind>

export type ContextField = keyof typeof CONTEXT_FIELDS

/** Comparison labels and corpus bookkeeping. A context carrying one of these is refused, never read. */
export const LABEL_KEYS = [
  'caseId',
  'family',
  'split',
  'expected',
  'status',
  'labelAuthority',
  'fixtureAuthority',
] as const

type FactValue = string | boolean | number | null | readonly string[] | readonly (readonly string[])[]

export type Interaction =
  { readonly contract: 'automatic_v1' } | { readonly contract: 'legacy_explicit_ask'; readonly askSophia: boolean }

export type InputErrorCode =
  | 'invalid_input'
  | 'invalid_interaction'
  | 'legacy_ask_missing'
  | 'invalid_text'
  | 'text_too_long'
  | 'invalid_context'
  | 'too_many_fields'
  | 'unknown_context_field'
  | 'label_in_context'
  | 'invalid_field'
  | 'contradictory_origin'
  | 'unsupported_comparison'

export interface InputError {
  readonly code: InputErrorCode
  readonly path: string
}

/** A validated input. Built only by validateIntakeInput. */
export interface IntakeInput {
  readonly interaction: Interaction
  readonly text: string
  readonly facts: Facts
}

/** Typed read access to the validated context. Absent, null and a wrong kind are distinct from a value. */
export class Facts {
  readonly #values: ReadonlyMap<ContextField, FactValue>
  constructor(values: ReadonlyMap<ContextField, FactValue>) {
    this.#values = values
  }
  has(field: ContextField): boolean {
    return this.#values.has(field)
  }
  isNull(field: ContextField): boolean {
    return this.#values.has(field) && this.#values.get(field) === null
  }
  str(field: ContextField): string | undefined {
    const v = this.#values.get(field)
    return typeof v === 'string' ? v : undefined
  }
  bool(field: ContextField): boolean | undefined {
    const v = this.#values.get(field)
    return typeof v === 'boolean' ? v : undefined
  }
  int(field: ContextField): number | undefined {
    const v = this.#values.get(field)
    return typeof v === 'number' ? v : undefined
  }
  list(field: ContextField): readonly string[] {
    const v = this.#values.get(field)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  }
  count(field: ContextField): number {
    const v = this.#values.get(field)
    return Array.isArray(v) ? v.length : 0
  }
  toJSON(): Record<string, FactValue> {
    return Object.fromEntries(this.#values)
  }
}

export type Validation =
  { readonly ok: true; readonly input: IntakeInput } | { readonly ok: false; readonly errors: readonly InputError[] }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isContextField = (k: string): k is ContextField => Object.hasOwn(CONTEXT_FIELDS, k)
const isLabelKey = (k: string): boolean => LABEL_KEYS.some((label) => label === k)
const inEnum = (kind: EnumKind, v: unknown): v is string => ENUMS[kind].some((member) => member === v)
const boundedString = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= INTAKE_LIMITS.stringChars
const boundedIds = (v: unknown): v is readonly string[] =>
  Array.isArray(v) && v.length <= INTAKE_LIMITS.listItems && v.every(boundedString)

const PARSERS: Record<FieldKind, (v: unknown) => FactValue | undefined> = {
  id: (v) => (boundedString(v) ? v : undefined),
  text: (v) => (boundedString(v) ? v : undefined),
  id_or_null: (v) => (v === null || boundedString(v) ? v : undefined),
  qual_or_null: (v) => (v === null || inEnum('qualification', v) ? v : undefined),
  bool: (v) => (typeof v === 'boolean' ? v : undefined),
  int: (v) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : undefined),
  ids: (v) => (boundedIds(v) ? [...v] : undefined),
  id_pairs: (v) =>
    Array.isArray(v) && v.length <= INTAKE_LIMITS.listItems && v.every(boundedIds) ? v.map((p) => [...p]) : undefined,
  audience: (v) => (inEnum('audience', v) ? v : undefined),
  control: (v) => (inEnum('control', v) ? v : undefined),
  origin: (v) => (inEnum('origin', v) ? v : undefined),
  dispatch: (v) => (inEnum('dispatch', v) ? v : undefined),
  qualification: (v) => (inEnum('qualification', v) ? v : undefined),
}

function parseInteraction(raw: unknown): Interaction | InputError {
  if (!isRecord(raw)) return { code: 'invalid_interaction', path: 'interaction' }
  const keys = Object.keys(raw)
  if (raw.contract === 'automatic_v1') {
    // A new-contract input carries no legacy Ask flag: mixing the two would let one opt into the other.
    return keys.length === 1 ? { contract: 'automatic_v1' } : { code: 'invalid_interaction', path: 'interaction' }
  }
  if (raw.contract !== 'legacy_explicit_ask') return { code: 'invalid_interaction', path: 'interaction.contract' }
  if (!Object.hasOwn(raw, 'askSophia')) return { code: 'legacy_ask_missing', path: 'interaction.askSophia' }
  if (typeof raw.askSophia !== 'boolean' || keys.length !== 2)
    return { code: 'invalid_interaction', path: 'interaction.askSophia' }
  return { contract: 'legacy_explicit_ask', askSophia: raw.askSophia }
}

function parseContext(raw: unknown, errors: InputError[]): Map<ContextField, FactValue> {
  const values = new Map<ContextField, FactValue>()
  if (!isRecord(raw)) {
    errors.push({ code: 'invalid_context', path: 'context' })
    return values
  }
  const entries = Object.entries(raw)
  if (entries.length > INTAKE_LIMITS.contextKeys) errors.push({ code: 'too_many_fields', path: 'context' })
  for (const [key, value] of entries) {
    const path = `context.${key}`
    if (isLabelKey(key)) errors.push({ code: 'label_in_context', path })
    else if (!isContextField(key)) errors.push({ code: 'unknown_context_field', path })
    else {
      const parsed = PARSERS[CONTEXT_FIELDS[key]](value)
      if (parsed === undefined) errors.push({ code: 'invalid_field', path })
      else values.set(key, parsed)
    }
  }
  // A context without its audience is invalid: the policy never guesses who can read the input.
  if (!values.has('audience') && !Object.hasOwn(raw, 'audience'))
    errors.push({ code: 'invalid_field', path: 'context.audience' })
  return values
}

function parseText(raw: unknown, errors: InputError[]): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) errors.push({ code: 'invalid_text', path: 'text' })
  else if (raw.length > INTAKE_LIMITS.textChars) errors.push({ code: 'text_too_long', path: 'text' })
  return typeof raw === 'string' ? raw : ''
}

const VOICE_ORIGINS = new Set(['voice_interim', 'voice_final'])

/** Finality belongs to speech only, and must agree with the origin it qualifies (F01). */
function originErrors(values: ReadonlyMap<ContextField, FactValue>): InputError[] {
  const final = values.get('isFinal')
  if (final === undefined) return []
  const origin = values.get('origin')
  const contradictory =
    typeof origin !== 'string' ||
    !VOICE_ORIGINS.has(origin) ||
    (origin === 'voice_interim' && final === true) ||
    (origin === 'voice_final' && final === false)
  return contradictory ? [{ code: 'contradictory_origin', path: 'context.isFinal' }] : []
}

/**
 * A comparison ref is `name@version[:region]` (r13): exactly one non-empty name and version and at most one non-empty
 * region, each made of letters, digits, `.`, `_` and `-` only. `@` and `:` are the component delimiters; `..` is the
 * comparison delimiter and may not appear inside one; whitespace, `/`, a backslash and any other character are outside this
 * bounded grammar and refused (never truncated).
 */
const COMPARISON_REF = /^[\p{L}\p{N}_.-]+@[\p{L}\p{N}_.-]+(?::[\p{L}\p{N}_.-]+)?$/u
const isComparisonPair = (v: unknown): boolean =>
  Array.isArray(v) &&
  v.length === 2 &&
  v.every((ref) => typeof ref === 'string' && COMPARISON_REF.test(ref) && !ref.includes('..'))

/** Exactly two refs per comparison (F06): a third ref is refused, never silently dropped from a target. */
function comparisonErrors(values: ReadonlyMap<ContextField, FactValue>): InputError[] {
  const errors: InputError[] = []
  const selected = values.get('selectedComparison')
  if (selected !== undefined && !isComparisonPair(selected))
    errors.push({ code: 'unsupported_comparison', path: 'context.selectedComparison' })
  const possible = values.get('possibleComparisons')
  if (Array.isArray(possible) && !possible.every(isComparisonPair))
    errors.push({ code: 'unsupported_comparison', path: 'context.possibleComparisons' })
  return errors
}

function crossFieldErrors(values: ReadonlyMap<ContextField, FactValue>): InputError[] {
  return [...originErrors(values), ...comparisonErrors(values)]
}

/** Validates an untrusted value into an IntakeInput. Errors are reported, never repaired into a default. */
export function validateIntakeInput(raw: unknown): Validation {
  if (!isRecord(raw)) return { ok: false, errors: [{ code: 'invalid_input', path: '' }] }
  const errors: InputError[] = []
  const unexpected = Object.keys(raw).filter((k) => k !== 'interaction' && k !== 'text' && k !== 'context')
  for (const key of unexpected) errors.push({ code: isLabelKey(key) ? 'label_in_context' : 'invalid_input', path: key })
  const interaction = parseInteraction(raw.interaction)
  if ('code' in interaction) errors.push(interaction)
  const text = parseText(raw.text, errors)
  const values = parseContext(raw.context, errors)
  errors.push(...crossFieldErrors(values))
  if (errors.length > 0 || 'code' in interaction) return { ok: false, errors }
  return { ok: true, input: { interaction, text, facts: new Facts(values) } }
}

// ---------------------------------------------------------------------------------------------------------------
// Observation vocabulary

export type ProposalKind =
  | 'answer'
  | 'explore'
  | 'work_read'
  | 'manager_inquiry'
  | 'manager_followup'
  | 'build_start'
  | 'control_hold'
  | 'control_stop'
  | 'control_resume'
  | 'publish_existing'
  | 'clarify'
  | 'no_action'
  | 'human_message'
  | 'recorded_only'
  | 'replay_original'
  | 'conflict'
  | 'correct_proposal'
  | 'correlated_followup'
  | 'reconcile_original'
  | 'record_provisional'
  | 'withhold_from_current_call'
  | 'abstain'

export type Target =
  | { readonly kind: 'thread'; readonly scope: string }
  | { readonly kind: 'artifact'; readonly ref: string }
  | { readonly kind: 'comparison'; readonly refs: readonly string[] }
  | {
      readonly kind: 'mission'
      readonly id: string
      readonly manager: string | null
      readonly generation: number | null
      readonly binding: string | null
    }
  | { readonly kind: 'message'; readonly id: string }
  | { readonly kind: 'reference'; readonly id: string }
  | { readonly kind: 'operation'; readonly id: string; readonly newTarget: string | null }
  | { readonly kind: 'utterance'; readonly id: string }
  | { readonly kind: 'repository_work'; readonly repo: string; readonly item: string | null }
  | { readonly kind: 'native_history' }
  | { readonly kind: 'text_objective' }
  | { readonly kind: 'unresolved' }

export type TargetBasis =
  | 'explicit_selection'
  | 'reply_target'
  | 'mission_reference'
  | 'operation_identity'
  | 'accepted_standard'
  | 'current_thread'
  | 'text_objective'
  | 'unresolved'

export type AddresseeBasis =
  | 'structured_mention'
  | 'reply_target'
  | 'direct_address'
  | 'personal_default'
  | 'clear_request'
  | 'selected_context'
  | 'mission_reference'
  | 'operation_reference'
  | 'generated_output'
  | 'legacy_contract'
  | 'unresolved'

export type AdmissionOutcome =
  | 'recorded_only'
  | 'clarification_required'
  | 'waiting'
  | 'denied'
  | 'conflict'
  | 'replay_original'
  | 'reconciliation_required'

export type Route = 'api' | 'native' | 'none'

/** What this program can do to the world: nothing. The type admits only zero. */
export interface ZeroEffects {
  readonly providerInferences: 0
  readonly nativeInputs: 0
  readonly codingMissions: 0
  readonly humanNotifications: 0
  readonly nativeControls: 0
  readonly GitHubWrites: 0
  readonly deployments: 0
  readonly networkRequests: 0
}

export const ZERO_EFFECTS: ZeroEffects = {
  providerInferences: 0,
  nativeInputs: 0,
  codingMissions: 0,
  humanNotifications: 0,
  nativeControls: 0,
  GitHubWrites: 0,
  deployments: 0,
  networkRequests: 0,
}

export interface IntakeObservation {
  readonly policy: typeof INTAKE_OBSERVATION_POLICY_VERSION
  readonly observationId: string
  readonly inputSha256: string
  readonly contract: Interaction['contract']
  readonly audience: {
    readonly scope: string
    readonly change: 'unchanged'
    readonly attention: 'none' | 'audience_members'
    /** The input names a coarse scope only: no owner, member, revision or thread identity (F05). */
    readonly exactness: 'scope_only'
  }
  /** Where the input came from, and whether it can be a new human instruction at all (F01). */
  readonly provenance: {
    readonly origin: string
    readonly humanInstruction: boolean
    readonly correlation: string | null
  }
  readonly addressee: { readonly ids: readonly string[]; readonly basis: AddresseeBasis }
  readonly proposal: {
    readonly kind: ProposalKind
    readonly target: Target
    readonly targetBasis: TargetBasis
    readonly route: Route
    readonly rule: string
  }
  readonly uncertainty: readonly string[]
  readonly fenced: { readonly quotedSpans: number; readonly generatedOrigin: boolean }
  readonly assessment: 'not_permitted' | 'not_needed' | 'absent_abstained'
  readonly admission: { readonly outcome: AdmissionOutcome; readonly reason: string; readonly authority: 'none' }
  readonly effects: ZeroEffects
}

export type ObservationResult =
  | { readonly ok: true; readonly observation: IntakeObservation }
  | { readonly ok: false; readonly errors: readonly InputError[] }

// ---------------------------------------------------------------------------------------------------------------
// Text: authored clauses only. The lexicon is data, recorded in the policy descriptor; outside it, abstain.

export const LEXICON = {
  ack: ['thanks', 'thank you', 'thx', 'got it', 'ok', 'okay', 'great', 'perfect'],
  fillers: ['please', 'kindly', 'can you', 'could you', 'would you', 'will you', 'hey', 'now', 'just', 'sophia'],
  followupMarkers: ['also'],
  control_stop: ['stop', 'halt'],
  control_hold: ['hold', 'pause'],
  control_resume: ['resume', 'unpause'],
  explore: ['research', 'explore', 'investigate'],
  build: ['implement', 'build', 'fix', 'ship'],
  followup: ['apply', 'add', 'handle', 'include', 'adjust'],
  publish: ['send', 'publish', 'share', 'post'],
  answer: ['explain', 'summarize', 'summarise', 'describe', 'compare', 'remind', 'tell'],
  start: ['start', 'begin', 'run', 'launch', 'continue', 'kick off'],
  create: ['create', 'make', 'draft', 'prepare', 'produce'],
  exploreNouns: ['research', 'exploration', 'investigation', 'prototype', 'mockup'],
  buildNouns: ['build', 'implementation', 'change', 'fix', 'feature'],
  // Auxiliaries (is, do, can …) open a question only with a question mark: "Do the deploy." is a request.
  questionWords: ['what', 'why', 'how', 'when', 'where', 'who', 'which', 'whose'],
} as const

type Family =
  | 'ack'
  | 'control_stop'
  | 'control_hold'
  | 'control_resume'
  | 'explore'
  | 'build'
  | 'followup'
  | 'publish'
  | 'answer'
  | 'none'

interface Clause {
  readonly words: string
  readonly question: boolean
  readonly also: boolean
  /** The clause opened with an acknowledgement, peeled off its words (r9 F01). */
  readonly ack: boolean
}

interface TextIntent {
  readonly family: Family | 'mixed'
  readonly question: boolean
  readonly also: boolean
  /** A protective control was chosen out of several requests; the others are not processed. */
  readonly extraRequests: boolean
  readonly fencedSpans: number
  readonly malformedQuote: boolean
}

/**
 * Balanced quoted, fenced and quoted-line spans whose marks are never apostrophes; every form may span lines. Single
 * quotes share their glyphs with apostrophes and are bounded separately (SINGLE_QUOTE_FAMILIES).
 */
const FENCES = [/```[\s\S]*?```/g, /`[^`]*`/g, /^[ \t]*>.*$/gm, /"[^"]*"/g, /“[^“”]*”/g, /«[^«»]*»/g, /„[^„“”]*[“”]/g]
/**
 * Quote marks left after balanced spans are removed: the quotation cannot be bounded. Also the unsupported double-quote
 * forms ‟ 〝 〞 ＂ anywhere. Single-quote-like marks are classified separately (classifySingleMarks).
 */
const UNBALANCED = /["“”‘«»„`‟〝〞＂]/
/**
 * Source escaping or encoding of a quote is not parsed (r5 F01): a quote mark directly after a backslash, or a quote
 * written as an escape or entity (\\u0027, \\x27, &#39;, &apos;, &quot; and the typographic code points). Matched on
 * lower-cased text.
 */
const ESCAPED_QUOTE =
  /\\['"‘’“”‚‛‹›＇′‵ʼʹ«»„‟]|\\u\{?0*(?:27|22|2018|2019|201a|201b|201c|201d|201e|201f|2039|203a|ff07|ff02|2032|2035|2bc|2b9|ab|bb)\}?(?![0-9a-f])|\\x(?:27|22)|&#0*(?:39|34);|&#x0*(?:27|22);|&(?:apos|quot|lsquo|rsquo|ldquo|rdquo|sbquo|bdquo|laquo|raquo|lsaquo|rsaquo);/

/** Every single-quote-like glyph. Only some of them can also be an apostrophe inside a word. */
const SINGLE_MARK = /['‘’‚‛‹›＇′‵ʼʹ]/g
const APOSTROPHE_GLYPHS: ReadonlySet<string> = new Set(["'", '’', 'ʼ', '＇'])
const WORD_CHAR = /^[\p{L}\p{N}]$/u
const isWordChar = (c: string | undefined): boolean => c !== undefined && WORD_CHAR.test(c)

/** The only fenced single-quote pairs: straight with straight, ‘ with ’. */
const SINGLE_PAIRS: readonly (readonly [string, string])[] = [
  ["'", "'"],
  ['‘', '’'],
]

interface BoundaryMark {
  readonly index: number
  readonly mark: string
}

/** A contraction or possessive suffix after the mark, ending the token: it's, don't, we're, I'll, Maria's, 90's. */
const CONTRACTION_SUFFIX = /^(?:s|t|re|ve|ll|d|m)(?![\p{L}\p{N}])/u
/** A one-letter name prefix before the mark: O'Brien, d'Arcy, l'Oréal, o'clock (text is lower-cased). */
const NAME_PREFIXES: ReadonlySet<string> = new Set(['o', 'd', 'l'])

/**
 * A mark is an apostrophe only in a provable token shape (r6 F01): letters or digits on both sides AND either a
 * contraction/possessive suffix after it or a one-letter o/d/l name prefix before it. A mark between letters in any
 * other shape (said'first, job'next) may bound a quotation that crosses words or clauses, so it stays a boundary.
 */
function isProvableApostrophe(text: string, index: number, mark: string): boolean {
  if (!APOSTROPHE_GLYPHS.has(mark) || !isWordChar(text[index - 1]) || !isWordChar(text[index + 1])) return false
  if (CONTRACTION_SUFFIX.test(text.slice(index + 1, index + 4))) return true
  return NAME_PREFIXES.has(text[index - 1] ?? '') && !isWordChar(text[index - 2])
}

/**
 * Every single-quote-like mark that is not a provable apostrophe. What precedes or follows it — a space, the start,
 * an em dash, a backslash, a symbol, a letter — does not make it an apostrophe: it is a boundary (r5/r6 F01).
 */
function boundaryMarks(text: string): BoundaryMark[] {
  return [...text.matchAll(SINGLE_MARK)]
    .filter((m) => !isProvableApostrophe(text, m.index, m[0]))
    .map((m) => ({ index: m.index, mark: m[0] }))
}

interface SingleQuoteResult {
  readonly text: string
  readonly spans: number
  readonly ambiguous: boolean
}

const isSupportedPair = (text: string, open: BoundaryMark, close: BoundaryMark): boolean =>
  SINGLE_PAIRS.some(([o, c]) => open.mark === o && close.mark === c) &&
  !isWordChar(text[open.index - 1]) &&
  /\S/.test(text[open.index + 1] ?? '') &&
  /\S/.test(text[close.index - 1] ?? '') &&
  !isWordChar(text[close.index + 1])

const TOKEN_INTERIOR = /^[\p{L}\p{N}]*$/u

/**
 * Whole-input pair check (r7 F01): any two single-quote-like marks still in the text — provable apostrophes included —
 * that are separated by anything but letters and digits could bound a quotation that encloses words, whatever each
 * looks like on its own. Consecutive marks suffice: if any two marks enclose a separator, some consecutive two do.
 */
function marksMayEncloseWords(text: string): boolean {
  const indices = [...text.matchAll(SINGLE_MARK)].map((m) => m.index)
  return indices.some((at, i) => {
    const next = indices[i + 1]
    return next !== undefined && !TOKEN_INTERIOR.test(text.slice(at + 1, next))
  })
}

/**
 * Conservative lexical fallback, not a quotation parser: no boundary marks leaves the text alone; exactly two that
 * form one supported pair fence the span between them as evidence; anything else leaves the bounds unknown. Then the
 * marks that remain are judged together, and any two that could enclose words leave the bounds unknown too. Unknown
 * bounds fail the whole input closed. No end is guessed and no later imperative is salvaged.
 */
function fenceSingleQuotes(text: string): SingleQuoteResult {
  const marks = boundaryMarks(text)
  const [open, close] = marks
  const paired = marks.length === 2 && open !== undefined && close !== undefined && isSupportedPair(text, open, close)
  if (marks.length !== 0 && !paired) return { text, spans: 0, ambiguous: true }
  const fenced = paired ? `${text.slice(0, open.index)} ${text.slice(close.index + 1)}` : text
  return { text: fenced, spans: paired ? 1 : 0, ambiguous: marksMayEncloseWords(fenced) }
}

const MENTION_TEXT = /@[\p{L}\p{N}_.-]+/gu
const SENTENCE = /[^.;!?:]+[.;!?:]*/g
const SUBCLAUSE = /,|\band\b|\bthen\b/

const startsWithTerm = (words: string, term: string): boolean => words === term || words.startsWith(`${term} `)
const leading = (words: string, terms: readonly string[]): string | undefined =>
  terms.find((t) => startsWithTerm(words, t))
const mentionsAny = (words: string, terms: readonly string[]): boolean =>
  terms.some((t) => new RegExp(`\\b${t}\\b`).test(words))

/** Removes quoted, fenced and imported spans and text-only @mentions; counts what it fenced; flags what it cannot. */
export function authoredText(
  text: string,
  facts: Facts,
): { readonly text: string; readonly fencedSpans: number; readonly malformed: boolean } {
  let t = text.toLowerCase()
  let fencedSpans = 0
  // Declared imports are data, removed before any quotation analysis, so their own unmatched, escaped or paired
  // marks cannot make the authored text around them malformed (r8 F02).
  for (const literal of [facts.str('quotedText'), facts.str('attachmentInstruction')]) {
    if (literal === undefined) continue
    const parts = t.split(literal.toLowerCase())
    fencedSpans += parts.length - 1
    t = parts.join(' ')
  }
  // Escaping is judged on the authored text as written, before any authored span is removed.
  const escaped = ESCAPED_QUOTE.test(t)
  for (const fence of FENCES) {
    fencedSpans += t.match(fence)?.length ?? 0
    t = t.replace(fence, ' ')
  }
  const single = fenceSingleQuotes(t)
  t = single.text
  fencedSpans += single.spans
  const ambiguous = escaped || single.ambiguous
  return { text: t.replace(MENTION_TEXT, ' '), fencedSpans, malformed: ambiguous || UNBALANCED.test(t) }
}

function stripFillers(words: string): { readonly words: string; readonly also: boolean } {
  const next = (w: string) => leading(w, LEXICON.fillers) ?? leading(w, LEXICON.followupMarkers)
  let rest = words.trim()
  let also = false
  let filler = next(rest)
  while (filler !== undefined) {
    const found = filler
    if (LEXICON.followupMarkers.some((m) => m === found)) also = true
    rest = rest.slice(found.length).replace(/^[\s,]+/, '')
    filler = next(rest)
  }
  return { words: rest, also }
}

/** What may stand between an acknowledgement and the words after it in one clause. */
const ACK_SEPARATOR = /^[\s\-\u2013\u2014]+/u

/**
 * The acknowledgement a clause opens with: a term followed by the end, whitespace or a documented dash (r13; `Thanks—stop`
 * reads as `Thanks — stop`). A longer word is no acknowledgement (`thanksgiving`, `okayish`).
 */
const leadingAck = (words: string): string | undefined =>
  LEXICON.ack.find((t) => words === t || (words.startsWith(t) && ACK_SEPARATOR.test(words.slice(t.length))))

/**
 * Leading acknowledgements, repeated or with fillers between them, are a prefix: the words after them are read as a
 * clause of their own, exactly as "Thanks, stop" already was (r9 F01). Only the existing lexicon is used.
 */
function peelAcknowledgements(words: string): {
  readonly words: string
  readonly ack: boolean
  readonly also: boolean
} {
  let rest = words
  let ack = false
  let also = false
  for (let term = leadingAck(rest); term !== undefined; term = leadingAck(rest)) {
    ack = true
    const after = stripFillers(rest.slice(term.length).replace(ACK_SEPARATOR, ''))
    rest = after.words
    also ||= after.also
  }
  return { words: rest, ack, also }
}

function clausesOf(text: string): Clause[] {
  const clauses: Clause[] = []
  for (const sentence of text.match(SENTENCE) ?? []) {
    const question = sentence.trim().endsWith('?')
    const parts = sentence.replace(/[.;!?:]+$/, '').split(SUBCLAUSE)
    parts.forEach((part, i) => {
      const filled = stripFillers(part.replace(/\s+/g, ' '))
      const { words, ack, also } = peelAcknowledgements(filled.words)
      if (words.length > 0 || ack || filled.also || also)
        clauses.push({ words, question: question && i === parts.length - 1, also: filled.also || also, ack })
    })
  }
  return clauses
}

const VERB_FAMILIES = [
  'control_stop',
  'control_hold',
  'control_resume',
  'explore',
  'build',
  'followup',
  'publish',
  'answer',
] as const satisfies readonly Family[]

function verbFamily(words: string): Family {
  return VERB_FAMILIES.find((family) => leading(words, LEXICON[family]) !== undefined) ?? 'none'
}

function nounFamily(words: string): Family {
  const verb = leading(words, LEXICON.start) ?? leading(words, LEXICON.create)
  if (verb === undefined) return 'none'
  const rest = words.slice(verb.length)
  if (mentionsAny(rest, LEXICON.exploreNouns)) return 'explore'
  const isStart = LEXICON.start.some((v) => v === verb)
  return isStart && mentionsAny(rest, LEXICON.buildNouns) ? 'build' : 'none'
}

/**
 * A clause's family from its words. An acknowledgement is the clause's family only when nothing follows it: words
 * after it that the lexicon cannot read stay unread (none), never an acknowledgement (r10, INC03-R9-F01).
 */
function clauseFamily(clause: Clause): Family {
  if (clause.words.length === 0) return clause.ack ? 'ack' : 'none'
  return wordsFamily(clause.words, clause.question)
}

function wordsFamily(words: string, question: boolean): Family {
  const byNoun = nounFamily(words)
  if (byNoun !== 'none') return byNoun
  const byVerb = verbFamily(words)
  if (byVerb !== 'none') return byVerb
  return question || leading(words, LEXICON.questionWords) !== undefined ? 'answer' : 'none'
}

/** Stop, then Hold: protective controls are never lost in a mixed message (F02). Resume is not protective. */
const PROTECTIVE = ['control_stop', 'control_hold'] as const satisfies readonly Family[]

function combine(families: readonly Family[], unread: boolean): Family | 'mixed' {
  const found = new Set(families.filter((f) => f !== 'none'))
  // Acknowledgements decide only a message they wholly make up: beside unread words they decide nothing (r10).
  if (unread && found.size === 1 && found.has('ack')) return 'none'
  if (found.size > 1) found.delete('ack')
  const protective = PROTECTIVE.find((f) => found.has(f))
  if (protective !== undefined) return protective
  if (found.size === 0) return 'none'
  if (found.size > 1) return 'mixed'
  const [only] = found
  return only ?? 'none'
}

/** The lexical reading of the authored text. Never an identity, a target or a grant. */
export function readIntent(text: string, facts: Facts): TextIntent {
  const authored = authoredText(text, facts)
  const clauses = clausesOf(authored.text)
  const families = clauses.map(clauseFamily)
  const unread = clauses.some((c, i) => c.words.length > 0 && families[i] === 'none')
  const family = combine(families, unread)
  return {
    family,
    question: clauses.some((c) => c.question),
    also: clauses.some((c) => c.also),
    extraRequests: new Set(families.filter((f) => f !== 'none' && f !== 'ack')).size > 1,
    fencedSpans: authored.fencedSpans,
    malformedQuote: authored.malformed,
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Proposal assembly

interface Addressee {
  readonly ids: readonly string[]
  readonly basis: AddresseeBasis
}

interface Proposal {
  readonly kind: ProposalKind
  readonly target: Target
  readonly targetBasis: TargetBasis
  readonly route: Route
  readonly rule: string
  readonly addressee?: Addressee
  readonly block?: Block
  readonly uncertainty?: readonly string[]
}

interface Block {
  readonly outcome: 'waiting' | 'denied' | 'conflict' | 'replay_original' | 'reconciliation_required'
  readonly reason: string
}

const UNRESOLVED: Target = { kind: 'unresolved' }
const NONE_ADDRESSEE = { ids: [], basis: 'generated_output' } as const

const thread = (facts: Facts): Target => ({ kind: 'thread', scope: facts.str('audience') ?? 'unknown' })
type MissionTarget = Extract<Target, { readonly kind: 'mission' }>
type MissionResolution =
  | { readonly ok: true; readonly target: MissionTarget }
  | { readonly ok: false; readonly reason: 'mission_identity_conflict' | 'manager_mission_mismatch' }

/**
 * The one mission an input can act on, with its manager, generation and binding exactly as supplied (null when not).
 * A selected mission that is not the active one, or a manager recorded for another mission, is a conflict (F05).
 */
function resolveMission(facts: Facts): MissionResolution | undefined {
  const selected = facts.str('selectedMission')
  const active = facts.str('activeMission')
  if (selected !== undefined && active !== undefined && selected !== active)
    return { ok: false, reason: 'mission_identity_conflict' }
  const id = selected ?? active
  if (id === undefined) return undefined
  const managerMission = facts.str('managerMission')
  if (managerMission !== undefined && managerMission !== id) return { ok: false, reason: 'manager_mission_mismatch' }
  const target: MissionTarget = {
    kind: 'mission',
    id,
    manager: facts.str('manager') ?? null,
    generation: facts.int('managerGeneration') ?? null,
    binding: facts.str('missionBinding') ?? null,
  }
  return { ok: true, target }
}

const missionOf = (facts: Facts): MissionTarget | undefined => {
  const resolved = resolveMission(facts)
  return resolved?.ok === true ? resolved.target : undefined
}

/** A mission conflict asks which mission is meant; nothing is sent to either. */
function missionConflict(facts: Facts): Proposal | undefined {
  const resolved = resolveMission(facts)
  if (resolved === undefined || resolved.ok) return undefined
  return proposal('clarify', UNRESOLVED, 'unresolved', 'mission.identity_conflict', { uncertainty: [resolved.reason] })
}

/** A queued follow-up or a fresh inquiry needs the exact current manager and generation; a mission id is not enough. */
const managerUnresolved = (mission: MissionTarget): boolean => mission.manager === null || mission.generation === null
const heldOrStopped = (facts: Facts): boolean => facts.str('control') === 'held' || facts.str('control') === 'stopped'

function proposal(
  kind: ProposalKind,
  target: Target,
  targetBasis: TargetBasis,
  rule: string,
  extra?: Partial<Proposal>,
): Proposal {
  return { kind, target, targetBasis, route: 'none', rule, ...extra }
}

/**
 * Generated output, interim speech and delayed answers are results, never new human instructions, whatever the
 * audience (C03-R17/R18, F01). Their correlation is kept as the target; a delayed answer is withheld from a changed
 * audience and otherwise left for delivery after a fresh recheck — not routed as a request.
 */
function originRule(facts: Facts): Proposal | undefined {
  const origin = facts.str('origin')
  if (origin === undefined || origin === 'human' || origin === 'voice_final') return undefined
  const cause = facts.str('causedBy') ?? facts.str('operationId')
  const causeTarget: Target = cause === undefined ? UNRESOLVED : { kind: 'operation', id: cause, newTarget: null }
  const fromOutput = { addressee: NONE_ADDRESSEE }
  if (origin === 'voice_interim') {
    const utterance = facts.str('voiceUtterance')
    const target: Target = utterance === undefined ? UNRESOLVED : { kind: 'utterance', id: utterance }
    return proposal('record_provisional', target, 'operation_identity', 'origin.voice_interim', fromOutput)
  }
  if (origin === 'delayed_output' && audienceChanged(facts))
    return proposal(
      'withhold_from_current_call',
      causeTarget,
      'operation_identity',
      'origin.delayed_withheld',
      fromOutput,
    )
  const rule = origin === 'delayed_output' ? 'origin.delayed_deliver_after_recheck' : 'origin.output_not_instruction'
  return proposal('no_action', causeTarget, 'operation_identity', rule, fromOutput)
}

function audienceChanged(facts: Facts): boolean {
  const original = facts.str('originalAudience')
  return facts.bool('participantsChanged') === true || (original !== undefined && original !== facts.str('audience'))
}

/** A redelivery the ingestion layer identified returns the original or conflicts (C03-R08). */
function redeliveryRule(facts: Facts): Proposal | undefined {
  const of = facts.str('redeliveryOf')
  if (of === undefined) return undefined
  const original = facts.str('originalAdmission') ?? of
  const target: Target = { kind: 'operation', id: original, newTarget: null }
  const same = facts.bool('samePayload')
  if (same === true)
    return proposal('replay_original', target, 'operation_identity', 'identity.redelivery_same_payload', {
      block: { outcome: 'replay_original', reason: 'operation_redelivered' },
    })
  if (same === false)
    return proposal('conflict', target, 'operation_identity', 'identity.redelivery_changed_payload', {
      block: { outcome: 'conflict', reason: 'operation_payload_changed' },
    })
  return proposal('clarify', target, 'operation_identity', 'identity.redelivery_payload_unknown', {
    uncertainty: ['redelivery_payload_unknown'],
  })
}

/** A correction or retry of an earlier operation (INC03-R13, C03-R10). Unknown outcomes reconcile first. */
function correctionRule(facts: Facts): Proposal | undefined {
  const original = facts.str('originalOperation')
  if (original === undefined) return undefined
  const newTarget = facts.str('newTarget') ?? null
  const target: Target = { kind: 'operation', id: original, newTarget }
  const state = facts.str('dispatchState')
  const uncertain = state === 'possibly_sent' || state === 'outcome_unknown'
  if (uncertain && newTarget === null)
    return proposal('reconcile_original', target, 'operation_identity', 'correction.retry_unknown_outcome', {
      block: { outcome: 'reconciliation_required', reason: 'original_effect_outcome_unknown' },
    })
  if (uncertain)
    return proposal('correlated_followup', target, 'operation_identity', 'correction.after_possible_send', {
      block: { outcome: 'waiting', reason: 'original_effect_outcome_unknown' },
    })
  if (state !== 'not_sent')
    return proposal('clarify', target, 'operation_identity', 'correction.dispatch_state_unknown')
  return beforeDispatchCorrection(facts, target, newTarget)
}

function beforeDispatchCorrection(facts: Facts, target: Target, newTarget: string | null): Proposal {
  const expected = facts.int('expectedRevision')
  const current = facts.int('currentRevision')
  if (expected !== undefined && current !== undefined && expected !== current)
    return proposal('conflict', target, 'operation_identity', 'correction.stale_revision', {
      block: { outcome: 'conflict', reason: 'stale_revision' },
    })
  if (newTarget === null)
    return proposal('replay_original', target, 'operation_identity', 'correction.retry_unsent', {
      block: { outcome: 'replay_original', reason: 'operation_not_yet_sent' },
    })
  const uncertainty = expected === undefined || current === undefined ? ['revision_unknown'] : []
  return proposal('correct_proposal', target, 'operation_identity', 'correction.before_dispatch', { uncertainty })
}

// Addressing ------------------------------------------------------------------------------------------------------

interface Addressing {
  readonly humans: readonly string[]
  readonly sophia: boolean
  readonly basis: AddresseeBasis
  readonly dropped: readonly string[]
  /** Structured mentions were supplied and none named a current recipient (r12): not the same as none supplied. */
  readonly failed: boolean
}

/**
 * Structured mentions validated against current members when known; text mentions are never read here. Mentions that
 * were supplied but name no current recipient are failed addressing (r12): they stop here, before any reply target,
 * direct address or personal default could stand in for the recipients the author actually chose.
 */
function resolveAddressing(facts: Facts): Addressing {
  const members = facts.has('currentMembers') ? new Set(facts.list('currentMembers')) : undefined
  const mentioned = facts.list('trustedMentions')
  const trusted = mentioned.filter((m) => m === 'sophia' || members === undefined || members.has(m))
  const dropped = mentioned.filter((m) => !trusted.includes(m))
  if (trusted.length > 0)
    return {
      humans: trusted.filter((m) => m !== 'sophia'),
      sophia: trusted.includes('sophia'),
      basis: 'structured_mention',
      dropped,
      failed: false,
    }
  if (mentioned.length > 0) return { humans: [], sophia: false, basis: 'unresolved', dropped, failed: true }
  return fallbackAddressing(facts)
}

/** Addressing when no structured mention was supplied: a reply target, a direct address, the personal default. */
function fallbackAddressing(facts: Facts): Addressing {
  const author = facts.str('replyAuthor')
  if (author !== undefined)
    return {
      humans: author === 'sophia' ? [] : [author],
      sophia: author === 'sophia',
      basis: 'reply_target',
      dropped: [],
      failed: false,
    }
  const direct = facts.str('directAddress')
  if (direct !== undefined)
    return {
      humans: direct === 'sophia' ? [] : [direct],
      sophia: direct === 'sophia',
      basis: 'direct_address',
      dropped: [],
      failed: false,
    }
  if (facts.str('audience') === 'personal')
    return { humans: [], sophia: true, basis: 'personal_default', dropped: [], failed: false }
  return { humans: [], sophia: false, basis: 'unresolved', dropped: [], failed: false }
}

/**
 * Failed structured addressing abstains (r12): the author chose recipients and none is current, so nothing below it —
 * correction, control, intent, a Sophia default — may reinterpret the message as addressed to someone else. Nobody is
 * notified and no recipient is claimed.
 */
function failedAddressingRule(addressing: Addressing): Proposal | undefined {
  if (!addressing.failed) return undefined
  return proposal('abstain', UNRESOLVED, 'unresolved', 'address.structured_unresolved', {
    addressee: { ids: [], basis: 'unresolved' },
    uncertainty: ['structured_addressing_failed'],
  })
}

/** Clear human-directed text gets no substantive AI response; a private mention notifies nobody (INC03-R01). */
function humanRule(facts: Facts, addressing: Addressing): Proposal | undefined {
  if (addressing.sophia || addressing.humans.length === 0) return undefined
  const addressee = { ids: addressing.humans, basis: addressing.basis }
  if (facts.str('audience') === 'personal')
    return proposal('recorded_only', thread(facts), 'current_thread', 'address.private_human_mention', { addressee })
  const reply = addressing.basis === 'reply_target' ? facts.str('replyTo') : undefined
  const target: Target = reply === undefined ? thread(facts) : { kind: 'message', id: reply }
  return proposal(
    'human_message',
    target,
    reply === undefined ? 'current_thread' : 'reply_target',
    'address.human_directed',
    {
      addressee,
    },
  )
}

// Ambiguity -------------------------------------------------------------------------------------------------------

function ambiguityRule(facts: Facts): Proposal | undefined {
  // Any exact selection resolves the generic target lists (r14): the same notion target resolution uses.
  const selected = exactSelection(facts) !== undefined
  const reasons = [
    !selected && (facts.count('possibleTargets') > 1 || facts.count('candidates') > 1)
      ? 'multiple_plausible_targets'
      : '',
    facts.count('possibleComparisons') > 1 && facts.count('selectedComparison') === 0
      ? 'multiple_plausible_comparisons'
      : '',
    facts.count('possibleRepos') > 1 && facts.str('repo') === undefined ? 'multiple_plausible_repositories' : '',
    !selected && facts.has('replyTo') && facts.bool('sourceEligible') === false ? 'reply_referent_ineligible' : '',
  ].filter((r) => r !== '')
  if (reasons.length === 0) return undefined
  return proposal('clarify', UNRESOLVED, 'unresolved', 'target.ambiguous', { uncertainty: reasons })
}

// Targets -----------------------------------------------------------------------------------------------------------

/**
 * The exact context the input was submitted with (INC03-R05), in this precedence when several are present: the
 * selected comparison, the selected artifact, an attachment, a unique decision, a unique date (r14). A date is an opaque
 * reference id: never parsed, never scheduled. Never `latest`. A null selection is none.
 */
function exactSelection(facts: Facts): Target | undefined {
  const comparison = facts.list('selectedComparison')
  if (comparison.length >= 2) return { kind: 'comparison', refs: comparison }
  const artifact = facts.str('selectedArtifact') ?? facts.str('attachment')
  if (artifact !== undefined) return { kind: 'artifact', ref: artifact }
  const reference = facts.str('uniqueDecision') ?? facts.str('uniqueDate')
  if (reference !== undefined) return { kind: 'reference', id: reference }
  return undefined
}

/** The target an input names: its exact selection, else unrelated native history (a target, not a resolution). */
function selectedTarget(facts: Facts): Target | undefined {
  const exact = exactSelection(facts)
  if (exact !== undefined) return exact
  if (facts.bool('unrelatedNativeHistory') === true) return { kind: 'native_history' }
  return undefined
}

function replyTarget(facts: Facts): Target | undefined {
  const reply = facts.str('replyTo')
  return reply === undefined || facts.bool('sourceEligible') === false ? undefined : { kind: 'message', id: reply }
}

// Families ----------------------------------------------------------------------------------------------------------

function answerOrWork(facts: Facts, intent: TextIntent): Proposal {
  const selected = selectedTarget(facts)
  if (selected !== undefined)
    return proposal('answer', selected, 'explicit_selection', 'family.answer', { route: 'api' })
  const conflict = missionConflict(facts)
  if (conflict !== undefined) return conflict
  const mission = missionOf(facts)
  if (mission !== undefined) return workQuestion(facts, mission)
  if (intent.question && facts.has('replyTo') && facts.str('audience') !== 'personal') {
    const reply = replyTarget(facts)
    if (reply !== undefined) return proposal('answer', reply, 'reply_target', 'family.answer_reply', { route: 'api' })
  }
  return proposal('answer', thread(facts), 'current_thread', 'family.answer', { route: 'api' })
}

/** A null qualification is known absence, as for apiGrant and nativePair; only an omitted one is unknown (r11). */
const inquiryNegative = (facts: Facts): boolean =>
  facts.isNull('inquiryGrant') || facts.str('inquiryGrant') === 'unqualified'

function inquiryBlock(facts: Facts, mission: MissionTarget): Block | undefined {
  if (heldOrStopped(facts)) return { outcome: 'waiting', reason: 'held_no_fresh_inquiry' }
  if (inquiryNegative(facts)) return { outcome: 'waiting', reason: 'inquiry_unqualified' }
  if (managerUnresolved(mission)) return { outcome: 'waiting', reason: 'manager_identity_unresolved' }
  return undefined
}

/** Retained evidence first; a fresh inquiry only on running work, never on held or stopped work (INC03-R11). */
function workQuestion(facts: Facts, mission: MissionTarget): Proposal {
  if (facts.str('retainedEvidence') !== undefined)
    return proposal('work_read', mission, 'mission_reference', 'family.work_read_retained')
  const block = inquiryBlock(facts, mission)
  const uncertainty = [
    facts.has('inquiryGrant') ? '' : 'inquiry_grant_unknown',
    managerUnresolved(mission) ? 'manager_identity_unknown' : '',
  ].filter((u) => u !== '')
  return proposal('manager_inquiry', mission, 'mission_reference', 'family.inquiry', {
    route: 'native',
    uncertainty,
    ...(block === undefined ? {} : { block }),
  })
}

function explore(facts: Facts): Proposal {
  const pending = facts.str('pendingOperation')
  if (pending !== undefined)
    return proposal(
      'explore',
      { kind: 'operation', id: pending, newTarget: null },
      'operation_identity',
      'family.explore',
      {
        route: 'api',
      },
    )
  const selected = selectedTarget(facts)
  if (selected !== undefined)
    return proposal('explore', selected, 'explicit_selection', 'family.explore', { route: 'api' })
  return proposal('explore', { kind: 'text_objective' }, 'text_objective', 'family.explore_text_objective', {
    route: 'api',
    uncertainty: ['objective_from_text_unverified'],
  })
}

/**
 * A follow-up goes to the one current mission's known manager and generation, queued: no fan-out, no new mission,
 * no reset (INC03-R10). Without that identity it waits; a mission id alone is not a qualified queue (F05).
 */
function followup(facts: Facts): Proposal {
  const conflict = missionConflict(facts)
  if (conflict !== undefined) return conflict
  const mission = missionOf(facts)
  if (mission === undefined)
    return proposal('clarify', UNRESOLVED, 'unresolved', 'family.followup_without_mission', {
      uncertainty: ['followup_target_missing'],
    })
  const block: Block | undefined = heldOrStopped(facts)
    ? { outcome: 'waiting', reason: 'mission_held' }
    : managerUnresolved(mission)
      ? { outcome: 'waiting', reason: 'manager_identity_unresolved' }
      : undefined
  return proposal('manager_followup', mission, 'mission_reference', 'family.followup', {
    route: 'native',
    uncertainty: managerUnresolved(mission) ? ['manager_identity_unknown'] : [],
    ...(block === undefined ? {} : { block }),
  })
}

function buildItem(facts: Facts): { readonly item: string | null; readonly basis: TargetBasis } {
  const artifact = facts.str('selectedArtifact')
  if (artifact !== undefined)
    return { item: artifact, basis: facts.has('acceptedStandard') ? 'accepted_standard' : 'explicit_selection' }
  const issue = facts.str('issue')
  if (issue !== undefined) return { item: `issue${issue}`, basis: 'explicit_selection' }
  return { item: null, basis: 'text_objective' }
}

/** A new coding mission needs a resolved repository; a project with active work holds its one slot (C03-R06). */
function build(facts: Facts): Proposal {
  const repo = facts.str('repo')
  if (repo === undefined)
    return proposal('clarify', UNRESOLVED, 'unresolved', 'family.build_without_repository', {
      uncertainty: ['repository_unresolved'],
    })
  const active = facts.str('activeMission')
  const related = facts.bool('relatedToActive')
  if (active !== undefined && related === true) return followup(facts)
  if (active !== undefined && related === undefined)
    return proposal('clarify', UNRESOLVED, 'unresolved', 'family.build_relation_unknown', {
      uncertainty: ['relation_to_active_mission_unknown'],
    })
  const { item, basis } = buildItem(facts)
  const block = buildBlock(facts, active !== undefined)
  return proposal('build_start', { kind: 'repository_work', repo, item }, basis, 'family.build_start', {
    route: 'native',
    uncertainty: buildUncertainty(facts, item),
    ...(block === undefined ? {} : { block }),
  })
}

/** Explicit negative facts that hold a new coding mission, in order. Absent facts are uncertainty, not grants. */
const BUILD_BLOCKS: readonly (readonly [(facts: Facts) => boolean, Block])[] = [
  [
    (f) => f.str('designState') === 'awaiting_design_approval',
    { outcome: 'waiting', reason: 'awaiting_design_approval' },
  ],
  [
    (f) => f.isNull('nativePair') || f.str('nativePair') === 'unqualified',
    { outcome: 'waiting', reason: 'native_route_unqualified' },
  ],
  [
    (f) => f.bool('implementationAuthorized') === false,
    { outcome: 'waiting', reason: 'implementation_not_authorized' },
  ],
  [(f) => f.bool('accepted') === false, { outcome: 'waiting', reason: 'selection_not_accepted' }],
  [versionNotAccepted, { outcome: 'waiting', reason: 'selected_version_not_accepted' }],
]

function versionNotAccepted(facts: Facts): boolean {
  const version = facts.str('selectedArtifact')?.split('@')[1]?.split(':')[0]
  const accepted = facts.str('acceptedVersion')
  return accepted !== undefined && version !== accepted
}

function buildBlock(facts: Facts, slotOccupied: boolean): Block | undefined {
  const [first] = BUILD_BLOCKS.filter(([applies]) => applies(facts)).map(([, block]) => block)
  if (first?.reason === 'awaiting_design_approval') return first
  if (slotOccupied) return { outcome: 'waiting', reason: 'project_coding_slot_occupied' }
  return first
}

function buildUncertainty(facts: Facts, item: string | null): string[] {
  const acceptance = facts.bool('accepted') === true || facts.has('acceptedVersion') || facts.has('acceptedStandard')
  return [
    item === null ? 'objective_from_text_unverified' : '',
    acceptance ? '' : 'acceptance_unknown',
    facts.has('nativePair') ? '' : 'native_route_unknown',
  ].filter((u) => u !== '')
}

const CONTROL_QUALIFIER = {
  control_stop: 'stopQualified',
  control_hold: 'holdQualified',
  control_resume: 'resumeQualified',
} as const satisfies Record<string, ContextField>

/** State a control needs, by kind: Stop needs work not already stopped; Hold running work; Resume held work. */
function controlStateBlock(facts: Facts, kind: keyof typeof CONTROL_QUALIFIER): Block | undefined {
  const state = facts.str('control')
  if (kind === 'control_stop')
    return state === 'stopped' ? { outcome: 'denied', reason: 'mission_already_stopped' } : undefined
  if (kind === 'control_hold')
    return state === 'held' || state === 'stopped' ? { outcome: 'denied', reason: 'mission_not_running' } : undefined
  if (state === 'stopped') return { outcome: 'denied', reason: 'stopped_generation_not_resumable' }
  return state === 'running' ? { outcome: 'denied', reason: 'resume_requires_held' } : undefined
}

/**
 * An identified Stop/Hold/Resume takes the control path directly, ahead of follow-ups and of ambiguity about other
 * targets (INC03-R06, F02). A conflicting mission still asks which one; state and qualification still apply.
 */
function control(facts: Facts, kind: keyof typeof CONTROL_QUALIFIER, extraRequests: boolean): Proposal {
  const conflict = missionConflict(facts)
  if (conflict !== undefined) return conflict
  const mission = missionOf(facts)
  if (mission === undefined)
    return proposal('clarify', UNRESOLVED, 'unresolved', 'family.control_without_mission', {
      uncertainty: ['control_target_missing'],
    })
  const qualified = facts.bool(CONTROL_QUALIFIER[kind])
  const unqualified: Block | undefined =
    qualified === false ? { outcome: 'waiting', reason: `${kind.slice('control_'.length)}_unqualified` } : undefined
  const block = controlStateBlock(facts, kind) ?? unqualified
  const uncertainty = [
    qualified === undefined ? 'control_qualification_unknown' : '',
    facts.has('control') ? '' : 'control_state_unknown',
    extraRequests ? 'additional_requests_not_processed' : '',
  ].filter((u) => u !== '')
  return proposal(kind, mission, 'mission_reference', `family.${kind}`, {
    route: 'native',
    uncertainty,
    ...(block === undefined ? {} : { block }),
  })
}

function publish(facts: Facts): Proposal {
  const pending = facts.str('pendingOperation')
  if (pending === undefined) return abstain(facts, 'publish_target_missing')
  return proposal(
    'publish_existing',
    { kind: 'operation', id: pending, newTarget: null },
    'operation_identity',
    'family.publish',
  )
}

function abstain(facts: Facts, reason: string): Proposal {
  const selected = selectedTarget(facts)
  return proposal(
    'abstain',
    selected ?? UNRESOLVED,
    selected === undefined ? 'unresolved' : 'explicit_selection',
    'abstain',
    {
      uncertainty: ['semantic_assessment_required', reason],
    },
  )
}

const FAMILY_HANDLERS: Record<TextIntent['family'], (facts: Facts, intent: TextIntent) => Proposal> = {
  ack: (facts) => proposal('no_action', thread(facts), 'current_thread', 'family.acknowledgement'),
  control_stop: (facts, intent) => control(facts, 'control_stop', intent.extraRequests),
  control_hold: (facts, intent) => control(facts, 'control_hold', intent.extraRequests),
  control_resume: (facts, intent) => control(facts, 'control_resume', intent.extraRequests),
  explore: (facts) => explore(facts),
  build: (facts) => build(facts),
  followup: (facts) => followup(facts),
  publish: (facts) => publish(facts),
  answer: (facts, intent) => answerOrWork(facts, intent),
  mixed: (facts) => abstain(facts, 'multiple_requests'),
  none: (facts) => abstain(facts, 'outside_lexicon'),
}

const CONTROL_FAMILIES: ReadonlySet<TextIntent['family']> = new Set(['control_stop', 'control_hold', 'control_resume'])

function familyProposal(facts: Facts, intent: TextIntent): Proposal {
  // An "also …" while a mission is current adds to that mission; a question stays a question, a control a control.
  const followsUp = intent.also && intent.family !== 'answer' && !CONTROL_FAMILIES.has(intent.family)
  if (followsUp && resolveMission(facts) !== undefined) return followup(facts)
  return FAMILY_HANDLERS[intent.family](facts, intent)
}

/** Requests a quotation may not carry into action unless the actor explicitly adopts the quoted words (F01). */
const ADOPTION_REQUIRED: ReadonlySet<TextIntent['family']> = new Set([
  'build',
  'followup',
  'explore',
  'publish',
  'control_resume',
])

/**
 * A quotation that cannot be bounded abstains: what is quoted and what is asked are unknown. A bounded quotation
 * beside a consequential request abstains unless the actor adopts it; Stop and Hold are protective and still apply.
 */
function quotationRule(facts: Facts, intent: TextIntent): Proposal | undefined {
  if (intent.malformedQuote) return abstain(facts, 'malformed_quotation')
  if (intent.fencedSpans === 0 || facts.bool('actorExplicitlyAdopts') === true) return undefined
  const asks = ADOPTION_REQUIRED.has(intent.family) || (intent.also && !CONTROL_FAMILIES.has(intent.family))
  return asks && intent.family !== 'answer' ? abstain(facts, 'quoted_content_unadopted') : undefined
}

/** Who the message addresses when no structure says so: Sophia only for a clear request or her own context. */
function inferredAddressee(addressing: Addressing, intent: TextIntent, p: Proposal): Addressee {
  if (addressing.sophia) return { ids: [...addressing.humans, 'sophia'], basis: addressing.basis }
  if (p.kind === 'abstain' || p.kind === 'no_action') return { ids: [], basis: 'unresolved' }
  if (p.targetBasis === 'mission_reference') return { ids: ['sophia'], basis: 'mission_reference' }
  if (intent.family === 'answer' && intent.question)
    return p.targetBasis === 'explicit_selection'
      ? { ids: ['sophia'], basis: 'selected_context' }
      : { ids: [], basis: 'unresolved' }
  return { ids: ['sophia'], basis: 'clear_request' }
}

const QUIETABLE: ReadonlySet<TextIntent['family']> = new Set(['ack', 'none', 'answer'])

function sophiaRule(facts: Facts, addressing: Addressing, intent: TextIntent): Proposal {
  // A no-reply hint quiets an acknowledgement or a remark; it never swallows a request such as Stop.
  if (facts.bool('needsReply') === false && QUIETABLE.has(intent.family))
    return proposal('no_action', thread(facts), 'current_thread', 'family.no_reply_needed', {
      addressee: { ids: addressing.sophia ? ['sophia'] : [], basis: addressing.basis },
    })
  // An identified control precedes ambiguity about unrelated targets (F02); a quotation is checked first (F01).
  const p =
    quotationRule(facts, intent) ??
    (CONTROL_FAMILIES.has(intent.family) ? familyProposal(facts, intent) : undefined) ??
    ambiguityRule(facts) ??
    familyProposal(facts, intent)
  const addressee = inferredAddressee(addressing, intent, p)
  const unaddressed = addressee.ids.length === 0 && !['no_action', 'abstain', 'clarify'].includes(p.kind)
  return unaddressed ? { ...abstain(facts, 'addressee_unresolved_shared_thread'), addressee } : { ...p, addressee }
}

// Blockers ----------------------------------------------------------------------------------------------------------

function delegationUnqualified(facts: Facts): boolean {
  const owner = facts.str('resourceOwner')
  const requester = facts.str('requester')
  const crossMember = owner !== undefined && requester !== undefined && owner !== requester
  return crossMember && facts.bool('nativeDelegationQualified') !== true
}

/** Negative facts that block any new effect, whatever the family, in this order. A positive fact never admits. */
const UNIVERSAL_BLOCKS: readonly (readonly [(facts: Facts) => boolean, Block])[] = [
  [(f) => f.bool('currentSourceEligible') === false, { outcome: 'denied', reason: 'source_ineligible' }],
  [(f) => f.bool('sourcePermission') === false, { outcome: 'denied', reason: 'source_ineligible' }],
  [(f) => f.bool('unrelatedNativeHistory') === true, { outcome: 'denied', reason: 'source_ineligible' }],
  [(f) => f.bool('membershipRemovedBeforePublication') === true, { outcome: 'denied', reason: 'membership_lost' }],
  [(f) => f.bool('grantRevokedBeforeSend') === true, { outcome: 'denied', reason: 'grant_revoked' }],
  [(f) => f.bool('projectExcludedByGrant') === true, { outcome: 'denied', reason: 'project_excluded' }],
  [(f) => f.bool('currentActorAuthorized') === false, { outcome: 'denied', reason: 'actor_unauthorized' }],
  [delegationUnqualified, { outcome: 'denied', reason: 'native_delegation_unqualified' }],
  // A strict pin waits; an available alternate is never switched to silently.
  [(f) => f.has('pin') && f.bool('pinUnavailable') === true, { outcome: 'waiting', reason: 'pin_unavailable' }],
]

function universalBlock(facts: Facts): Block | undefined {
  return UNIVERSAL_BLOCKS.find(([applies]) => applies(facts))?.[1]
}

/** Families sent through a native route besides a new build, which has its own check (r3 F04: known negatives wait). */
const NATIVE_ROUTE_KINDS: ReadonlySet<ProposalKind> = new Set([
  'manager_followup',
  'manager_inquiry',
  'correct_proposal',
])

function nativeBlock(facts: Facts, p: Proposal): Block | undefined {
  if (!NATIVE_ROUTE_KINDS.has(p.kind)) return undefined
  const negative = facts.isNull('nativePair') || facts.str('nativePair') === 'unqualified'
  return negative ? { outcome: 'waiting', reason: 'native_route_unqualified' } : undefined
}

function apiBlock(facts: Facts, p: Proposal): Block | undefined {
  if (p.route !== 'api') return undefined
  if (facts.str('apiResource') === 'unavailable') return { outcome: 'waiting', reason: 'api_resource_unavailable' }
  if (facts.isNull('apiGrant') || facts.str('apiGrant') === 'unqualified')
    return { outcome: 'waiting', reason: 'api_payer_missing' }
  return undefined
}

const SILENT_KINDS: ReadonlySet<ProposalKind> = new Set([
  'human_message',
  'recorded_only',
  'no_action',
  'record_provisional',
  'withhold_from_current_call',
])

function routeUncertainty(facts: Facts, p: Proposal): string[] {
  const apiKnown = facts.has('apiGrant') || facts.has('apiResource')
  return p.route === 'api' && !apiKnown ? ['api_payer_unknown'] : []
}

/** Recording kinds and settled operation outcomes are what they are; no further blocker applies. */
const finalOutcome = (p: Proposal): boolean =>
  SILENT_KINDS.has(p.kind) || p.block?.outcome === 'replay_original' || p.block?.outcome === 'conflict'

const firstBlock = (facts: Facts, p: Proposal): Block | undefined =>
  universalBlock(facts) ?? p.block ?? apiBlock(facts, p) ?? nativeBlock(facts, p)

function admissionOf(facts: Facts, p: Proposal): IntakeObservation['admission'] {
  const blocked = finalOutcome(p) ? p.block : firstBlock(facts, p)
  if (blocked !== undefined) return { outcome: blocked.outcome, reason: blocked.reason, authority: 'none' }
  const outcome = p.kind === 'clarify' ? 'clarification_required' : 'recorded_only'
  // Output provenance is the reason a result is not routed, whatever its kind (F01).
  const fromOutput = p.rule.startsWith('origin.') && p.kind === 'no_action'
  return { outcome, reason: fromOutput ? 'output_not_instruction' : unblockedReason(p.kind), authority: 'none' }
}

const UNBLOCKED_REASON: Partial<Record<ProposalKind, string>> = {
  clarify: 'target_unresolved',
  abstain: 'semantic_assessment_unavailable',
  human_message: 'human_directed',
  recorded_only: 'private_audience_no_attention',
  no_action: 'no_action_needed',
  record_provisional: 'voice_interim_not_instruction',
  withhold_from_current_call: 'audience_changed_withheld',
}

/** Without a blocker a proposal is only recorded: observation mode admits nothing (C03-R07). */
const unblockedReason = (kind: ProposalKind): string => UNBLOCKED_REASON[kind] ?? 'observation_unqualified'

// Observation -------------------------------------------------------------------------------------------------------

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')

/** The semantic payload an operation identity binds: interaction, text and typed context. */
export function inputDigest(input: IntakeInput): string {
  return sha256(canonicalJson({ interaction: input.interaction, text: input.text, context: input.facts.toJSON() }))
}

function legacyProposal(input: IntakeInput, askSophia: boolean): Proposal {
  if (!askSophia)
    return proposal('recorded_only', thread(input.facts), 'current_thread', 'legacy.ask_false', {
      addressee: { ids: [], basis: 'legacy_contract' },
    })
  // Explicit selection only when something was selected; otherwise the current thread, said as such (r12).
  const selected = selectedTarget(input.facts)
  const target = selected ?? thread(input.facts)
  return proposal(
    'answer',
    target,
    selected === undefined ? 'current_thread' : 'explicit_selection',
    'legacy.ask_true',
    {
      addressee: { ids: ['sophia'], basis: 'legacy_contract' },
    },
  )
}

/** The existing explicit path owns a legacy Ask; false never gains an assessment, answer or work (C03-R01). */
function legacyAdmission(askSophia: boolean): IntakeObservation['admission'] {
  const reason = askSophia ? 'legacy_explicit_path' : 'legacy_ask_false_no_assessment'
  return { outcome: 'recorded_only', reason, authority: 'none' }
}

/** Exactly what addressing resolved: trusted structure, reply, direct address or the personal default; else none. */
function resolvedAddressee(addressing: Addressing): Addressee {
  return { ids: addressing.sophia ? [...addressing.humans, 'sophia'] : addressing.humans, basis: addressing.basis }
}

/** A fresh correction of the actor's own operation addresses Sophia's intake unless a structure says otherwise. */
function operationAddressee(addressing: Addressing): Addressee {
  if (addressing.sophia || addressing.humans.length > 0)
    return { ids: addressing.sophia ? [...addressing.humans, 'sophia'] : addressing.humans, basis: addressing.basis }
  return { ids: ['sophia'], basis: 'operation_reference' }
}

function automaticProposal(
  facts: Facts,
  intent: TextIntent,
): { readonly p: Proposal; readonly dropped: readonly string[] } {
  const addressing = resolveAddressing(facts)
  const { dropped } = addressing
  // A new message addressed only to people stays theirs, whatever operation metadata travels with it (F03).
  const human = humanRule(facts, addressing)
  if (human !== undefined) return { p: withIgnoredOperation(facts, human), dropped }
  const failed = failedAddressingRule(addressing)
  if (failed !== undefined) return { p: withIgnoredOperation(facts, failed), dropped }
  const correction = correctionRule(facts)
  if (correction !== undefined) return { p: { ...correction, addressee: operationAddressee(addressing) }, dropped }
  return { p: sophiaRule(facts, addressing, intent), dropped }
}

const OPERATION_FIELDS = ['originalOperation', 'newTarget', 'dispatchState'] as const satisfies readonly ContextField[]

function withIgnoredOperation(facts: Facts, p: Proposal): Proposal {
  if (!OPERATION_FIELDS.some((f) => facts.has(f))) return p
  return { ...p, uncertainty: [...(p.uncertainty ?? []), 'operation_metadata_not_applied'] }
}

function assessmentOf(input: IntakeInput, p: Proposal): IntakeObservation['assessment'] {
  if (input.interaction.contract === 'legacy_explicit_ask') return 'not_permitted'
  return p.kind === 'abstain' ? 'absent_abstained' : 'not_needed'
}

/** Results, legacy paths and transport redeliveries (r9 F02) never ask for new attention. */
const SILENT_RULES = ['origin.', 'legacy.', 'identity.redelivery'] as const

/** Human addressees in a shared audience may get attention; a private audience notifies nobody. */
function attentionOf(facts: Facts, p: Proposal): IntakeObservation['audience']['attention'] {
  const humans = (p.addressee?.ids ?? []).some((id) => id !== 'sophia')
  const silent = p.kind === 'recorded_only' || SILENT_RULES.some((prefix) => p.rule.startsWith(prefix))
  return humans && !silent && facts.str('audience') === 'project' ? 'audience_members' : 'none'
}

/**
 * Origin and transport redelivery are decided before any interaction contract (r8 F01): generated, delayed and
 * interim inputs are results and a redelivery returns its bound operation, whatever a legacy Ask boolean or the
 * automatic contract would otherwise select. A selector is not provenance.
 */
function terminalProposal(facts: Facts): { readonly p: Proposal; readonly dropped: readonly string[] } | undefined {
  const generated = originRule(facts)
  if (generated !== undefined) return { p: generated, dropped: [] }
  const transport = redeliveryRule(facts)
  if (transport === undefined) return undefined
  // Transport redelivery of an already-bound operation returns or conflicts with it: no new interpretation, and only
  // the addressing this delivery itself resolves. A delivery is not a request to Sophia (r9 F02).
  const addressing = resolveAddressing(facts)
  return { p: { ...transport, addressee: resolvedAddressee(addressing) }, dropped: addressing.dropped }
}

interface Chosen {
  readonly p: Proposal
  readonly dropped: readonly string[]
  readonly admission: IntakeObservation['admission']
}

function chooseProposal(input: IntakeInput, intent: TextIntent): Chosen {
  const { facts, interaction } = input
  const terminal = terminalProposal(facts)
  if (terminal !== undefined) return { ...terminal, admission: admissionOf(facts, terminal.p) }
  if (interaction.contract === 'legacy_explicit_ask')
    return {
      p: legacyProposal(input, interaction.askSophia),
      dropped: [],
      admission: legacyAdmission(interaction.askSophia),
    }
  const chosen = automaticProposal(facts, intent)
  return { ...chosen, admission: admissionOf(facts, chosen.p) }
}

/** Outputs and redeliveries are not new human instructions (r8 F01). */
const NOT_HUMAN_INSTRUCTION = ['origin.', 'identity.redelivery'] as const

function provenanceOf(facts: Facts, p: Proposal): IntakeObservation['provenance'] {
  const fromOutput = NOT_HUMAN_INSTRUCTION.some((prefix) => p.rule.startsWith(prefix))
  const correlation = facts.str('causedBy') ?? facts.str('operationId') ?? facts.str('voiceUtterance') ?? null
  return { origin: facts.str('origin') ?? 'unspecified', humanInstruction: !fromOutput, correlation }
}

/** One observation for one validated input. Deterministic: the same input gives the same observation. */
export function observeValidated(input: IntakeInput): IntakeObservation {
  const { facts, interaction } = input
  const intent = readIntent(input.text, facts)
  const { p, dropped, admission } = chooseProposal(input, intent)
  const inputSha256 = inputDigest(input)
  const legacy = interaction.contract === 'legacy_explicit_ask'
  const uncertainty = [
    ...(p.uncertainty ?? []),
    ...(legacy ? [] : routeUncertainty(facts, p)),
    ...dropped.map(() => 'mention_not_current_member'),
  ]
  return {
    policy: INTAKE_OBSERVATION_POLICY_VERSION,
    observationId: sha256(canonicalJson({ policy: INTAKE_OBSERVATION_POLICY_VERSION, input: inputSha256 })),
    inputSha256,
    contract: interaction.contract,
    audience: {
      scope: facts.str('audience') ?? 'unknown',
      change: 'unchanged',
      attention: attentionOf(facts, p),
      exactness: 'scope_only',
    },
    provenance: provenanceOf(facts, p),
    addressee: p.addressee ?? { ids: [], basis: 'unresolved' },
    proposal: { kind: p.kind, target: p.target, targetBasis: p.targetBasis, route: p.route, rule: p.rule },
    uncertainty: [...new Set(uncertainty)].toSorted(),
    fenced: { quotedSpans: legacy ? 0 : intent.fencedSpans, generatedOrigin: p.rule.startsWith('origin.') },
    assessment: assessmentOf(input, p),
    admission,
    effects: ZERO_EFFECTS,
  }
}

/** Validates, then observes. An invalid input is an error, never a safe-looking classification. */
export function observeIntake(raw: unknown): ObservationResult {
  const v = validateIntakeInput(raw)
  return v.ok ? { ok: true, observation: observeValidated(v.input) } : { ok: false, errors: v.errors }
}

/** Observations keyed by operation identity, within one caller-owned scope. */
export type ObservationLedger = Map<string, IntakeObservation>

/**
 * Same operation identity and payload returns the stored observation itself; a changed payload under the same
 * identity is a conflict and is not stored over the original. Inputs without an operation identity are not keyed.
 */
export function observeWithLedger(ledger: ObservationLedger, raw: unknown): ObservationResult {
  const v = validateIntakeInput(raw)
  if (!v.ok) return v
  const key = v.input.facts.str('operationId')
  const prior = key === undefined ? undefined : ledger.get(key)
  const fresh = observeValidated(v.input)
  if (prior === undefined) {
    if (key !== undefined) ledger.set(key, fresh)
    return { ok: true, observation: fresh }
  }
  if (prior.inputSha256 === fresh.inputSha256) return { ok: true, observation: prior }
  const target: Target = { kind: 'operation', id: key ?? '', newTarget: null }
  return {
    ok: true,
    observation: {
      ...fresh,
      proposal: {
        kind: 'conflict',
        target,
        targetBasis: 'operation_identity',
        route: 'none',
        rule: 'identity.ledger_changed_payload',
      },
      admission: { outcome: 'conflict', reason: 'operation_payload_changed', authority: 'none' },
    },
  }
}

// Descriptor and rendering --------------------------------------------------------------------------------------------

/** Everything that decides an observation besides the code: version, lexicon, limits, schema. */
export const INTAKE_OBSERVATION_POLICY = {
  version: INTAKE_OBSERVATION_POLICY_VERSION,
  // The order the code applies (v8 put origin and redelivery before the interaction contract; corrected here in v10).
  order: [
    'origin_terminal',
    'transport_redelivery',
    'interaction',
    'addressing',
    'human_only_terminal',
    'correction',
    'quotation',
    'identified_control',
    'ambiguity',
    'intent',
    'mission_identity',
    'target',
    'blockers',
  ],
  lexicon: LEXICON,
  text: {
    unread: 'a message with no clause in the lexicon abstains (outside_lexicon, semantic assessment required)',
    acknowledgement:
      'leading acknowledgements are a prefix; a message is an acknowledgement only if every authored clause is one, and beside unread words it abstains like those words alone',
    besideRequest: 'an unread clause beside a recognised request is not read; the request decides (disclosed limit)',
    noReplyHint: 'needsReply:false quiets an acknowledgement, unread text or a question, never a request',
  },
  limits: INTAKE_LIMITS,
  contextFields: CONTEXT_FIELDS,
  labelKeys: LABEL_KEYS,
} as const

export function policyDigest(): string {
  return sha256(canonicalJson(INTAKE_OBSERVATION_POLICY))
}

function comparisonRef(refs: readonly string[]): string {
  const [a = '', b = ''] = refs
  const [nameA, versionA] = a.split('@')
  const [nameB, versionB] = b.split('@')
  return nameA === nameB && versionA !== undefined && versionB !== undefined
    ? `${nameA}@${versionA}..${versionB}`
    : refs.join('..')
}

/** A compact notation for a target, used in reports and comparisons. */
export function renderTarget(target: Target): string {
  if (target.kind === 'operation') return target.newTarget === null ? target.id : `${target.id}/${target.newTarget}`
  if ('id' in target) return target.id
  return renderUnkeyed(target)
}

function renderUnkeyed(target: Exclude<Target, { readonly id: string }>): string {
  if (target.kind === 'thread') return `${target.scope}_thread`
  if (target.kind === 'artifact') return target.ref
  if (target.kind === 'comparison') return comparisonRef(target.refs)
  if (target.kind === 'repository_work') return `${target.repo}/${target.item ?? 'text_objective'}`
  if (target.kind === 'native_history') return 'unrelated_native_history'
  return target.kind
}

/** The addressee in the corpus notation: ids sorted and joined with '+', or 'none'. */
export function renderAddressee(ids: readonly string[]): string {
  return ids.length === 0 ? 'none' : ids.toSorted().join('+')
}
