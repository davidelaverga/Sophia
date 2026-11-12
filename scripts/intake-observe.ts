#!/usr/bin/env node
/**
 * Offline intake observation replay (INC03-CC-001): runs a bounded corpus file through the intake observation policy
 * and writes a versioned comparison report to an explicit path outside the repository.
 *
 *   node scripts/intake-observe.ts --input <corpus.json> --input-sha256 <hex> --out <report.json>
 *
 * It guarantees: the input bytes match the given SHA-256 before anything is read from them; every case is validated
 * and its labels (caseId, family, split, expected, status, labelAuthority, fixtureAuthority) are kept apart as
 * comparison metadata, never passed to the policy; a case that fails validation is reported as an error, not as a
 * classification; every miss and abstention is reported with its denominator; the report is written once, atomically,
 * never over an existing file. Admission is never claimed: deterministic policy waits, denials, conflicts, replays,
 * reconciliations and clarifications are compared as they are, and every unblocked consequential proposal's admission
 * is reported unassessed. A synthetic fixture body is checked for provenance (its canonical SHA-256) only; it is not
 * an admission engine and grants nothing.
 *
 * It does not: call a model, open a network connection, import or evaluate anything named by the input, read the
 * environment, notify anyone, control or dispatch work, or write anywhere but the report path. It is not the
 * installed intake consumer (docs/plans/intake-observation.md).
 */
import { createHash, randomBytes } from 'node:crypto'
import {
  closeSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { canonicalJson } from '../packages/coordination/src/canonical.ts'
import {
  INTAKE_OBSERVATION_POLICY_VERSION,
  LABEL_KEYS,
  ZERO_EFFECTS,
  observeWithLedger,
  policyDigest,
  isCompactAddresseeId,
  renderAddressee,
  type InputError,
  type IntakeObservation,
  type ObservationLedger,
  type ObservationResult,
  type ProposalKind,
  type Target,
  type ZeroEffects,
} from '../packages/coordination/src/intake-observation.ts'

export const REPORT_SCHEMA = 'sophia.intake-observation.report.v7'
export const CLI_LIMITS = {
  fileBytes: 2 * 1024 * 1024,
  cases: 500,
  idChars: 200,
  /** How deep a scored label may nest (r26): the report retains it, and a deeper value could overflow serializing it. */
  labelDepth: 32,
  /** How deep a declared authority fixture body may nest (r26): its provenance digest canonicalizes it recursively. */
  fixtureDepth: 32,
} as const

/** Corpus schemas this tool reads, and the interaction a case without an `interaction` member is observed under. */
const CORPUS_SCHEMAS = {
  // The INC03-R16 development corpus is, by its definition, a set of automatic-mode inputs.
  'sophia.inc03.development-corpus.v2': { defaultInteraction: { contract: 'automatic_v1' } },
} as const

const CASE_KEYS = ['input', 'context', 'interaction', ...LABEL_KEYS] as const

export const SCORED_FIELDS = [
  'audience',
  'addressee',
  'proposedAction',
  'target',
  'clarificationRequired',
  'admission',
  'admissionReason',
  'actualEffects',
] as const
type ScoredField = (typeof SCORED_FIELDS)[number]

/** Label fields present in the corpus that this program does not score, and why. */
export const UNSCORED_FIELDS = {
  unambiguous: 'implied by clarificationRequired',
  selectedResource: 'resource allocation is INC-04; the policy only names a route (api/native/none)',
  resourcePin: 'pins are read as blockers only',
  authorizedFakeEffects: 'no fake or real effect is dispatched by this program',
  forbiddenFakeEffects: 'no effect is dispatched; actual effects are scored as zero instead',
  maxNewCodingMissionsPerInput: 'no effect is dispatched',
  maxNewNativeInputs: 'no effect is dispatched',
  maxNewProviderInferences: 'no assessment or answer is called',
  maxHumanAttentionItems: 'attention is proposed, never sent',
  noWorkerFanout: 'no effect is dispatched',
  noBudgetReset: 'no effect is dispatched',
  observationModeEffect: 'prose',
} as const

const CONSEQUENTIAL: ReadonlySet<ProposalKind> = new Set([
  'explore',
  'manager_inquiry',
  'manager_followup',
  'build_start',
  'control_hold',
  'control_stop',
  'control_resume',
  'publish_existing',
  'correct_proposal',
])

// ---------------------------------------------------------------------------------------------------------------
// Errors

export class UsageError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

/**
 * An expected filesystem failure (r29): Node's system-error shape, an Error with a string errno `code` and a string
 * `syscall`. Only these are translated into usage errors. A TypeError, RangeError or any other programming error has
 * no `syscall` and stays visible, uncaught.
 */
function isSystemError(err: unknown): err is Error & { readonly code: string; readonly syscall: string } {
  return (
    err instanceof Error &&
    'code' in err &&
    typeof err.code === 'string' &&
    'syscall' in err &&
    typeof err.syscall === 'string'
  )
}

/** The fixed, path-free input refusal: no errno text, no path, no stack. */
const unreadableInput = () => new UsageError('input_unreadable', 'the input is not a readable file')
/** The fixed, path-free output refusal (r29): the report path cannot be resolved or written; nothing is published. */
const unusableOutput = () => new UsageError('output_unusable', 'the report path cannot be used; no report was written')
/**
 * The fixed, path-free refusal when publication cannot be proved to be this run's report (r29 repair1): no success is
 * announced, and nothing is claimed about whatever another party left at the report path.
 */
const unverifiedPublication = () =>
  new UsageError(
    'output_unusable',
    'the report could not be published as written; anything at the report path is not this report',
  )

/** Runs a filesystem step, turning an expected filesystem failure into `failure()`; anything else passes through. */
function filesystem<T>(step: () => T, failure: () => UsageError): T {
  try {
    return step()
  } catch (err: unknown) {
    if (isSystemError(err)) throw failure()
    throw err
  }
}

export interface CaseError {
  readonly index: number
  readonly caseId: string | null
  readonly code: string
  readonly path: string
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isBoundedId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= CLI_LIMITS.idChars
const sha256 = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex')
const isSchema = (s: unknown): s is keyof typeof CORPUS_SCHEMAS =>
  typeof s === 'string' && Object.hasOwn(CORPUS_SCHEMAS, s)

// ---------------------------------------------------------------------------------------------------------------
// Arguments and paths

export interface CliArgs {
  readonly input: string
  readonly inputSha256: string
  readonly out: string
}

const URL_LIKE = /^[a-z][a-z0-9+.-]*:/i

function pathArg(name: string, value: string | undefined): string {
  if (value === undefined || value.length === 0) throw new UsageError('usage', `--${name} is required`)
  if (URL_LIKE.test(value)) throw new UsageError('usage', `--${name} must be a file path, not a URL`)
  return resolve(value)
}

export function parseCli(argv: readonly string[]): CliArgs {
  let values: { input?: string | undefined; 'input-sha256'?: string | undefined; out?: string | undefined }
  try {
    const parsed = parseArgs({
      args: [...argv],
      options: { input: { type: 'string' }, 'input-sha256': { type: 'string' }, out: { type: 'string' } },
      strict: true,
      allowPositionals: false,
      tokens: true,
    })
    const names = parsed.tokens.filter((t) => t.kind === 'option').map((t) => t.name)
    const repeated = names.find((name, i) => names.indexOf(name) !== i)
    if (repeated !== undefined) throw new UsageError('usage', `--${repeated} is given more than once`)
    values = parsed.values
  } catch (err: unknown) {
    throw new UsageError('usage', err instanceof Error ? err.message : 'invalid arguments')
  }
  const inputSha256 = values['input-sha256'] ?? ''
  if (!/^[0-9a-f]{64}$/.test(inputSha256))
    throw new UsageError('usage', '--input-sha256 must be 64 lowercase hex digits')
  return { input: pathArg('input', values.input), inputSha256, out: pathArg('out', values.out) }
}

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const POLICY_SOURCE = resolve(REPOSITORY_ROOT, 'packages/coordination/src/intake-observation.ts')

const inside = (root: string, path: string): boolean => {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** The report goes to an explicit journal path: outside the repository, not the input, not an existing file. */
export function checkOutputPath(out: string, input: string, repositoryRoot = REPOSITORY_ROOT): void {
  if (out === input) throw new UsageError('output_is_input', 'the report path is the input')
  // Resolving the report location may fail on the filesystem (a looping link, an over-long name): output_unusable (r29).
  const directory = filesystem(() => statSync(dirname(out), { throwIfNoEntry: false }), unusableOutput)
  if (!directory?.isDirectory()) throw new UsageError('output_directory_missing', 'the report directory does not exist')
  // Compare real locations, so a symlinked directory cannot carry the report into the repository.
  const real = join(
    filesystem(() => realpathSync(dirname(out)), unusableOutput),
    basename(out),
  )
  const realRoot =
    statSync(repositoryRoot, { throwIfNoEntry: false }) === undefined ? repositoryRoot : realpathSync(repositoryRoot)
  if (inside(repositoryRoot, out) || inside(realRoot, real))
    throw new UsageError('output_inside_repository', 'the report path is inside the repository')
  // The input is resolved here, before it is read: its filesystem failures are already input_unreadable (r29).
  const inputStat = filesystem(() => statSync(input, { throwIfNoEntry: false }), unreadableInput)
  if (inputStat !== undefined && filesystem(() => realpathSync(input), unreadableInput) === real)
    throw new UsageError('output_is_input', 'the report path is the input')
  // linkSync at write time settles a race with a file created after this check.
  if (filesystem(() => lstatSync(out, { throwIfNoEntry: false }), unusableOutput) !== undefined)
    throw new UsageError('output_exists', 'the report path already exists; nothing is overwritten')
}

export function readBoundedInput(
  path: string,
  expectedSha256: string,
): { readonly bytes: Buffer; readonly sha256: string } {
  const stat = filesystem(() => statSync(path, { throwIfNoEntry: false }), unreadableInput)
  if (!stat?.isFile()) throw unreadableInput()
  if (stat.size > CLI_LIMITS.fileBytes)
    throw new UsageError('input_too_large', `the input exceeds ${CLI_LIMITS.fileBytes} bytes`)
  const grew = () => new UsageError('input_too_large', 'the input grew past the limit')
  let bytes: Buffer
  try {
    bytes = filesystem(() => readFileSync(path), unreadableInput)
  } catch (err: unknown) {
    // The read itself refusing a file that grew past what a buffer holds is the same growth (r29); nothing broader.
    if (err instanceof RangeError && 'code' in err && err.code === 'ERR_FS_FILE_TOO_LARGE') throw grew()
    throw err
  }
  if (bytes.length > CLI_LIMITS.fileBytes) throw grew()
  const digest = sha256(bytes)
  if (digest !== expectedSha256) throw new UsageError('input_hash_mismatch', `input SHA-256 is ${digest}`)
  return { bytes, sha256: digest }
}

interface FileIdentity {
  readonly dev: number
  readonly ino: number
}

const sameFile = (a: FileIdentity | undefined, b: FileIdentity | undefined): boolean =>
  a !== undefined && b !== undefined && a.dev === b.dev && a.ino === b.ino

/** What a name refers to without following it, or undefined when it cannot be observed (an expected failure). */
function observe(path: string, follow = false) {
  try {
    return (follow ? statSync : lstatSync)(path, { throwIfNoEntry: false })
  } catch (err: unknown) {
    if (isSystemError(err)) return undefined
    throw err
  }
}

/** Whether a name refers, without following it, to the regular file with this identity. */
function namesFile(path: string, owned: FileIdentity): boolean {
  const now = observe(path)
  return now !== undefined && now.isFile() && sameFile(now, owned)
}

/**
 * Removes the temporary file this invocation created, and only it: the name is unlinked only while it still names the
 * file whose identity was recorded at creation, so a replacement or foreign file is left alone. Never throws for an
 * expected filesystem failure; reports whether nothing of ours is left under the name.
 */
function removeOwnTemporary(tmp: string, owned: FileIdentity | undefined): boolean {
  // Without the recorded identity the file cannot be told apart from a replacement: it is left, and said to be.
  if (owned === undefined) return false
  try {
    const now = lstatSync(tmp, { throwIfNoEntry: false })
    if (now === undefined || !sameFile(now, owned)) return true
    unlinkSync(tmp)
    return true
  } catch (err: unknown) {
    if (isSystemError(err)) return false
    throw err
  }
}

/**
 * After a link this run made whose result is not its report (r29 repair1): the report path is unlinked only when it
 * names the same file the temporary name holds or resolves to (so it is the link this run just made from it) and that
 * file has another name (so no foreign data is lost). Otherwise the report path is left untouched: it may be foreign,
 * or replaced after the link. Nothing is read from it.
 */
function withdrawForeignLink(out: string, tmp: string): void {
  const atOut = observe(out)
  if (atOut === undefined || atOut.nlink < 2) return
  if (!sameFile(atOut, observe(tmp)) && !sameFile(atOut, observe(tmp, true))) return
  try {
    unlinkSync(out)
  } catch (err: unknown) {
    if (!isSystemError(err)) throw err
  }
}

/**
 * Exclusive-create a temporary file beside the target, write and sync it, then link it to the final name (fails if
 * taken). The descriptor stays open until every identity check and the cleanup are done, so the file it names cannot be
 * freed and its identity cannot be reused.
 *
 * Publication is bound to that file (r29 repair1): right before the link, the temporary name must still be the regular
 * file this run wrote and synced (a fence); right after it, the report path must be that same regular file (the
 * verification), which also catches a replacement at the link call itself. If either fails, no success is announced
 * (output_unusable), a link this run made to something else is withdrawn when that can be proved, and foreign files are
 * left untouched. The verification boundary is the moment of that check: later changes by whoever can write the
 * directory, and physical crashes, are outside it.
 *
 * Before publication any expected filesystem failure is output_unusable and the temporary file is removed; a cleanup or
 * close failure never replaces the original failure. After a verified publication the result is whether the private
 * temporary name was also removed, and a later close failure changes nothing.
 */
export function writeReportAtomically(out: string, text: string): boolean {
  const tmp = join(dirname(out), `.${basename(out)}.${randomBytes(6).toString('hex')}.tmp`)
  const fd = filesystem(() => openSync(tmp, 'wx', 0o600), unusableOutput)
  let owned: FileIdentity | undefined
  let failure: unknown
  let linking = false
  let published = false
  try {
    const stat = fstatSync(fd)
    owned = { dev: stat.dev, ino: stat.ino }
    writeFileSync(fd, text)
    fsyncSync(fd)
    if (!namesFile(tmp, owned)) throw unverifiedPublication()
    linking = true
    linkSync(tmp, out)
    if (namesFile(out, owned)) published = true
    else {
      withdrawForeignLink(out, tmp)
      throw unverifiedPublication()
    }
  } catch (err: unknown) {
    failure = err
  }
  const removed = removeOwnTemporary(tmp, owned)
  try {
    closeSync(fd)
  } catch (err: unknown) {
    // An earlier failure stands; after a verified publication an expected close failure changes nothing.
    if (failure === undefined && !isSystemError(err)) throw err
  }
  if (published) return removed
  throw publicationFailure(failure, linking)
}

/** What an unpublished write reports: a deliberate refusal stands; expected filesystem failures become usage errors. */
function publicationFailure(failure: unknown, linking: boolean): unknown {
  if (failure instanceof UsageError) return failure
  // Only the final link can find the target taken: a foreign file is never overwritten or removed.
  if (linking && isSystemError(failure) && failure.code === 'EEXIST')
    return new UsageError('output_exists', 'the report path appeared while writing; nothing is overwritten')
  return isSystemError(failure) ? unusableOutput() : failure
}

// ---------------------------------------------------------------------------------------------------------------
// Corpus preparation: the policy input is built from input, context and interaction only.

export interface CaseMeta {
  readonly index: number
  readonly caseId: string
  readonly family: string | null
  readonly expected: Record<string, unknown> | null
}

export interface PreparedCase {
  readonly meta: CaseMeta
  readonly policyInput: { readonly interaction: unknown; readonly text: unknown; readonly context: unknown }
}

/**
 * A case's identity: its caseId when the case is a record and the id is bounded (a non-empty string of at most
 * CLI_LIMITS.idChars), else null. Decided once, here, for both the reservation and the case's own checks; never
 * coerced, trimmed or truncated, so an invalid id stays invalid and is never reserved.
 */
const boundedCaseId = (raw: unknown): string | null => (isRecord(raw) && isBoundedId(raw.caseId) ? raw.caseId : null)

/**
 * Whether a JSON value nests deeper than `limit` (r26). Depth: a scalar is 0; an array or an object is 1 + its deepest
 * member, so an empty one is 1. One walk with an explicit stack, each node visited once and the walk ending at the first
 * node past the limit: linear work, never recursion, so no nesting the parser accepted can overflow it.
 */
export function nestingExceeds(value: unknown, limit: number): boolean {
  const stack: Array<{ node: unknown; above: number }> = [{ node: value, above: 0 }]
  for (let top = stack.pop(); top !== undefined; top = stack.pop()) {
    const { node, above } = top
    if (typeof node !== 'object' || node === null) continue
    const depth = above + 1
    if (depth > limit) return true
    for (const member of Array.isArray(node) ? node : Object.values(node)) stack.push({ node: member, above: depth })
  }
  return false
}

/** The scored label that nests past CLI_LIMITS.labelDepth, first in SCORED_FIELDS order, by its corpus key. */
function tooDeepLabel(expected: Record<string, unknown> | null): string | undefined {
  if (expected === null) return undefined
  return SCORED_FIELDS.map((field) => LABEL_SOURCE[field]).find(
    (key) => Object.hasOwn(expected, key) && nestingExceeds(expected[key], CLI_LIMITS.labelDepth),
  )
}

export function prepareCase(raw: unknown, index: number, defaultInteraction: unknown): PreparedCase | CaseError {
  if (!isRecord(raw)) return { index, caseId: null, code: 'invalid_case', path: `cases[${index}]` }
  const caseId = boundedCaseId(raw)
  const fail = (code: string, path: string): CaseError => ({ index, caseId, code, path: `cases[${index}]${path}` })
  if (caseId === null) return fail('invalid_case_id', '.caseId')
  const unknown = Object.keys(raw).find((k) => !CASE_KEYS.some((allowed) => allowed === k))
  if (unknown !== undefined) return fail('unknown_case_field', `.${unknown}`)
  if (raw.expected !== undefined && !isRecord(raw.expected)) return fail('invalid_expected', '.expected')
  // A family is any string; absent or null means no family (r18). Anything else is an error, never "unlabelled".
  const family = raw.family ?? null
  if (family !== null && typeof family !== 'string') return fail('invalid_family', '.family')
  const expected = isRecord(raw.expected) ? raw.expected : null
  // Last, after the case's identity and its earlier checks (r26): the report retains every scored label, so one nested
  // past the bound makes the case invalid and is never kept, compared or serialized. Unscored labels are not retained.
  const deep = tooDeepLabel(expected)
  if (deep !== undefined) return fail('label_too_deep', `.expected.${deep}`)
  const meta: CaseMeta = { index, caseId, family, expected }
  const interaction = Object.hasOwn(raw, 'interaction') ? raw.interaction : defaultInteraction
  return { meta, policyInput: { interaction, text: raw.input, context: raw.context } }
}

// ---------------------------------------------------------------------------------------------------------------
// Synthetic authority: recomputed from the body, never taken from a referenced hash alone.

export interface FixtureCheck {
  readonly id: string
  readonly computedSha256: string
  readonly corpusReference: string | null
  readonly matchesCorpusReference: boolean | null
  readonly roles: readonly string[]
}

function rolesOf(body: Record<string, unknown>): string[] {
  const grants = body.grants
  if (!isRecord(grants) || !Array.isArray(grants.roles)) return []
  return grants.roles.filter((r): r is string => typeof r === 'string')
}

const invalidFixtures = () =>
  new UsageError('input_invalid_authority_fixtures', 'the declared authority fixtures or their reference are malformed')
const SHA256_HEX = /^[0-9a-f]{64}$/

/**
 * The declared fixtures, validated whole before any is hashed (r29): an absent container and an empty one are valid;
 * a container that is present but not an object, any entry whose body is not an object, or a present corpus reference
 * that is not a lowercase SHA-256 refuses the file. Nothing is filtered out, so the single-fixture rule counts exactly
 * the declared bodies. Ids stay arbitrary data keys; bodies stay opaque but for the depth bound and the role list.
 */
function declaredFixtures(doc: Record<string, unknown>): {
  readonly bodies: readonly (readonly [string, Record<string, unknown>])[]
  readonly reference: string | null
} {
  const fixtures = doc.authorityFixtures
  if (fixtures !== undefined && !isRecord(fixtures)) throw invalidFixtures()
  const entries = fixtures === undefined ? [] : Object.entries(fixtures)
  const bodies = entries.filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
  if (bodies.length !== entries.length) throw invalidFixtures()
  const declared = doc.authorityFixtureSha256
  if (declared !== undefined && !(typeof declared === 'string' && SHA256_HEX.test(declared))) throw invalidFixtures()
  return { bodies, reference: declared ?? null }
}

/**
 * Provenance only: each fixture body's recomputed SHA-256 and whether a corpus-level reference matches it. A verified
 * body proves where the fixture came from, not current authority; no admission label is derived from it (r3 F04).
 */
export function checkFixtures(doc: Record<string, unknown>): FixtureCheck[] {
  const { bodies, reference } = declaredFixtures(doc)
  // Canonical JSON recurses through each body: one nested past the bound refuses the file before any of them is
  // hashed or anything is reported (r26), once every declaration is known to be well-formed (r29).
  if (bodies.some(([, body]) => nestingExceeds(body, CLI_LIMITS.fixtureDepth)))
    throw new UsageError(
      'input_fixture_too_deep',
      `an authority fixture nests deeper than ${String(CLI_LIMITS.fixtureDepth)}`,
    )
  // One corpus-level reference can only vouch for a single fixture; with several, none is corpus-verified.
  const single = bodies.length === 1
  return bodies.map(([id, body]) => {
    const computedSha256 = sha256(canonicalJson(body))
    const corpusReference = single ? reference : null
    const matchesCorpusReference = corpusReference === null ? null : corpusReference === computedSha256
    return { id, computedSha256, corpusReference, matchesCorpusReference, roles: rolesOf(body) }
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Comparison: separate from the policy, which never saw the labels.

export type FieldResult = 'match' | 'mismatch' | 'abstained' | 'unassessed' | 'not_labelled'

export interface FieldComparison {
  readonly field: ScoredField
  readonly expected: unknown
  readonly observed: unknown
  readonly result: FieldResult
  /** Why a dimension was not assessed, when it was not. */
  readonly note?: string
}

/** The one reason a positive admission is never claimed offline (r3 F04, the coordinator's bounded choice). */
export const ADMISSION_UNASSESSED_REASON = 'complete_current_authority_not_representable'

/**
 * The admission label this comparison assigns. A deterministic policy result (waiting, denied, conflict, replay,
 * reconciliation, clarification, or a recorded-only with a non-admission reason) is itself. An unblocked proposal is
 * `unassessed`: current source, native/profile, manager/binding, payer and grant authority are not representable
 * offline, and a verified fixture body or role list does not prove them. Never `admitted`.
 */
export function comparisonAdmission(o: IntakeObservation): string {
  const { outcome, reason } = o.admission
  return outcome === 'recorded_only' && reason === 'observation_unqualified' ? 'unassessed' : outcome
}

const BLOCKING = new Set(['waiting', 'denied'])

function observedFields(o: IntakeObservation): Record<ScoredField, unknown> {
  return {
    audience: o.audience.change,
    addressee: renderAddressee(o.addressee.ids),
    proposedAction: o.proposal.kind,
    target: o.proposal.target,
    clarificationRequired: o.proposal.kind === 'clarify',
    admission: comparisonAdmission(o),
    admissionReason: BLOCKING.has(o.admission.outcome) ? o.admission.reason : null,
    actualEffects: o.effects,
  }
}

const LABEL_SOURCE: Record<ScoredField, string> = {
  audience: 'audience',
  addressee: 'addressee',
  proposedAction: 'proposedAction',
  target: 'target',
  clarificationRequired: 'clarificationRequired',
  admission: 'admission',
  admissionReason: 'admissionDenialOrWaitReason',
  actualEffects: 'actualObservationModeEffects',
}

function effectsMatch(expected: unknown, observed: ZeroEffects): boolean {
  if (!isRecord(expected)) return false
  const known = new Map<string, number>(Object.entries(observed))
  return Object.entries(expected).every(([key, value]) => known.get(key) === value)
}

/**
 * A comparison label in corpus notation, read back into its exact refs: `name@vA..vB` or `a@x..b@y`. Anything else
 * (a third ref, an empty side) is unparseable and never matches.
 */
export function parseComparisonLabel(label: string): string[] | undefined {
  const sides = label.split('..')
  const [first, second] = sides
  if (sides.length !== 2 || first === undefined || second === undefined || !first.includes('@') || second === '')
    return undefined
  if (second.includes('@')) return [first, second]
  return [first, `${first.slice(0, first.indexOf('@'))}@${second}`]
}

/** The target label notation this report reads (r24): structured labels in full, legacy strings explicitly limited. */
export const TARGET_LABEL_NOTATION = 'sophia.intake-observation.target-label.v1'

export type TargetLabelForm = 'structured' | 'legacy' | 'invalid'
export interface TargetVerdict {
  readonly result: 'match' | 'mismatch' | 'unassessed'
  readonly form: TargetLabelForm
  readonly note?: string
}

const isText = (v: unknown): v is string => typeof v === 'string'
const isNullableText = (v: unknown): boolean => v === null || typeof v === 'string'

/**
 * Each kind of the policy's Target and its fields, in a fixed order, with the type each must have (policy v21). A
 * structured label names exactly these fields, no more and no fewer; a target's identity is these fields, kind
 * included.
 */
const TARGET_FIELDS: Readonly<Record<Target['kind'], ReadonlyArray<readonly [string, (v: unknown) => boolean]>>> = {
  thread: [['scope', isText]],
  artifact: [['ref', isText]],
  comparison: [['refs', (v) => Array.isArray(v) && v.every(isText)]],
  mission: [
    ['id', isText],
    ['manager', isNullableText],
    ['generation', (v) => v === null || (typeof v === 'number' && Number.isSafeInteger(v))],
    ['binding', isNullableText],
  ],
  message: [['id', isText]],
  reference: [['id', isText]],
  operation: [
    ['id', isText],
    ['newTarget', isNullableText],
  ],
  utterance: [['id', isText]],
  repository_work: [
    ['repo', isText],
    ['item', isNullableText],
  ],
  native_history: [],
  text_objective: [],
  unresolved: [],
}

const isTargetKind = (k: unknown): k is Target['kind'] => typeof k === 'string' && Object.hasOwn(TARGET_FIELDS, k)

/** A target's identity as one exact key: its kind and its fields in their fixed order (JSON keeps null apart from "null"). */
const identityKey = (kind: Target['kind'], values: readonly unknown[]): string => JSON.stringify([kind, ...values])

function fieldsOf(target: Target): unknown[] {
  const record: Record<string, unknown> = { ...target }
  return TARGET_FIELDS[target.kind].map(([name]) => record[name])
}

/**
 * A structured target label read exactly (r24): an object with a kind the policy has and exactly that kind's fields,
 * each of its type. Its identity key, or undefined when it is no such object. Nothing is coerced, trimmed or split.
 */
export function structuredTargetKey(label: Record<string, unknown>): string | undefined {
  const { kind } = label
  if (!isTargetKind(kind)) return undefined
  const fields = TARGET_FIELDS[kind]
  const names = Object.keys(label).filter((k) => k !== 'kind')
  if (names.length !== fields.length) return undefined
  if (!fields.every(([name, ok]) => Object.hasOwn(label, name) && ok(label[name]))) return undefined
  return identityKey(
    kind,
    fields.map(([name]) => label[name]),
  )
}

/** The repository item the v6 notation wrote for a repository target with no item. */
const NO_ITEM = 'text_objective'

/** How many `/` a legacy label holds: counted in place, nothing allocated (r25). */
function slashCount(label: string): number {
  let count = 0
  for (let at = label.indexOf('/'); at !== -1; at = label.indexOf('/', at + 1)) count += 1
  return count
}

/** Whether `label` is exactly `head`, a `/`, then `tail`: checked in place, at UTF-16 positions, nothing allocated. */
const joins = (label: string, head: string, tail: string): boolean =>
  label.length === head.length + 1 + tail.length &&
  label.startsWith(head) &&
  label.charCodeAt(head.length) === 0x2f &&
  label.startsWith(tail, head.length + 1)

type LegacyKind = Exclude<Target, { readonly kind: 'comparison' } | { readonly kind: 'mission' }>

/**
 * What a legacy string label says of the observed target, read in its kind under the v6 notation (a string never names
 * a kind): how many targets of that kind it could denote (`readings`), and whether the observed target is one of them
 * (`hit`). The readings are counted, never listed or serialized (r25, R24-F01): work is linear in the label and the
 * target, whatever the label holds.
 * - operation: the whole label as an id with no new target, or a split at any `/` (1 + the number of `/`);
 * - repository_work: a split at any `/`, and the split before a final `/text_objective` also as no item;
 * - thread: the scope before a final `_thread`; kind-only targets: their fixed word; the others: the label as the id.
 */
function legacyReading(target: LegacyKind, label: string): { readings: number; hit: boolean } {
  if (target.kind === 'operation')
    return {
      readings: 1 + slashCount(label),
      hit: target.newTarget === null ? label === target.id : joins(label, target.id, target.newTarget),
    }
  if (target.kind === 'repository_work')
    return {
      readings: slashCount(label) + (label.endsWith(`/${NO_ITEM}`) ? 1 : 0),
      hit: joins(label, target.repo, target.item ?? NO_ITEM),
    }
  return singleReading(target, label)
}

/** The kinds a legacy string can denote at most one way: whether it is such a string, and whether it names the target. */
function singleReading(
  target: Exclude<LegacyKind, { readonly kind: 'operation' } | { readonly kind: 'repository_work' }>,
  label: string,
): { readings: number; hit: boolean } {
  if (target.kind === 'thread')
    return { readings: label.endsWith('_thread') ? 1 : 0, hit: label === `${target.scope}_thread` }
  if (target.kind === 'artifact') return { readings: 1, hit: label === target.ref }
  if ('id' in target) return { readings: 1, hit: label === target.id }
  const word = target.kind === 'native_history' ? 'unrelated_native_history' : target.kind
  return { readings: label === word ? 1 : 0, hit: label === word }
}

/** A legacy string label against the observed target (compatibility, r24): never more than the string can say. */
function legacyVerdict(target: Target, label: string): TargetVerdict {
  if (target.kind === 'comparison') {
    const refs = parseComparisonLabel(label)
    const same = refs !== undefined && refs.length === target.refs.length && refs.every((r, i) => r === target.refs[i])
    return { result: same ? 'match' : 'mismatch', form: 'legacy', note: 'legacy_label' }
  }
  // An id is all a legacy mission label says: it never proves the manager, the generation or the binding.
  if (target.kind === 'mission')
    return label === target.id
      ? { result: 'unassessed', form: 'legacy', note: 'legacy_label_mission_id_only' }
      : { result: 'mismatch', form: 'legacy', note: 'legacy_label' }
  const { readings, hit } = legacyReading(target, label)
  if (!hit) return { result: 'mismatch', form: 'legacy', note: 'legacy_label' }
  if (readings === 1) return { result: 'match', form: 'legacy', note: 'legacy_label' }
  return { result: 'unassessed', form: 'legacy', note: 'ambiguous_legacy_target_label' }
}

/**
 * Exact-target comparison (r24, report v7). A structured label is compared field by field, kind included: one label
 * names one target. A legacy string is read in the observed kind and is a match only when it can denote nothing else;
 * a string that could denote several targets is unassessed, never a match. Comparison refs keep their order.
 */
export function targetVerdict(target: Target, label: unknown): TargetVerdict {
  if (typeof label === 'string') return legacyVerdict(target, label)
  const key = isRecord(label) ? structuredTargetKey(label) : undefined
  if (key === undefined) return { result: 'mismatch', form: 'invalid', note: 'invalid_target_label' }
  return { result: key === identityKey(target.kind, fieldsOf(target)) ? 'match' : 'mismatch', form: 'structured' }
}

/** How many target labels of each form the report compared, and the notation it read them in. */
function targetLabelCounts(records: readonly CaseRecord[]) {
  const forms = { structured: 0, legacy: 0, invalid: 0 }
  for (const r of records) {
    const c = r.comparison.find((f) => f.field === 'target')
    if (c !== undefined && c.result !== 'not_labelled') forms[targetLabelForm(c.expected)] += 1
  }
  return { notation: TARGET_LABEL_NOTATION, forms }
}

/** The form of a target label, for the report's count of the labels it compared. */
export function targetLabelForm(label: unknown): TargetLabelForm {
  if (typeof label === 'string') return 'legacy'
  return isRecord(label) && structuredTargetKey(label) !== undefined ? 'structured' : 'invalid'
}

/** A list of distinct ids, each a non-empty string: the only set an addressee label can name. */
function distinctIds(values: unknown): string[] | undefined {
  if (!Array.isArray(values) || !values.every((v): v is string => typeof v === 'string' && v !== '')) return undefined
  return new Set(values).size === values.length ? values : undefined
}

/**
 * The recipients an addressee label names, or undefined when it names none clearly (r22). The one reader of the
 * notation, for comparison and tallies alike: a list of ids; or a string, `none` for no recipient, a JSON list of ids
 * (starting with `[`), or compact ids joined by `+`, each one the compact notation can carry. A label is data; it is
 * never read by the policy.
 */
export function addresseeLabelIds(label: unknown): string[] | undefined {
  if (Array.isArray(label)) return distinctIds(label)
  if (typeof label !== 'string' || label === '') return undefined
  if (label === 'none') return []
  if (label.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(label)
      return distinctIds(parsed)
    } catch {
      return undefined
    }
  }
  const ids = label.split('+')
  return ids.every(isCompactAddresseeId) ? distinctIds(ids) : undefined
}

/** Whether a label names exactly these recipients: the same set, whatever the order or notation. */
export function addresseeMatches(ids: readonly string[], label: unknown): boolean {
  const named = addresseeLabelIds(label)
  if (named === undefined || named.length !== ids.length) return false
  const sorted = named.toSorted()
  return ids.toSorted().every((id, i) => id === sorted[i])
}

function equalField(field: ScoredField, expected: unknown, o: IntakeObservation, observed: unknown): boolean {
  if (field === 'actualEffects') return effectsMatch(expected, o.effects)
  if (field === 'addressee') return addresseeMatches(o.addressee.ids, expected)
  return expected === observed
}

const ABSTAINABLE: ReadonlySet<ScoredField> = new Set([
  'addressee',
  'proposedAction',
  'target',
  'admission',
  'admissionReason',
])

function fieldResult(
  field: ScoredField,
  expected: unknown,
  observed: unknown,
  o: IntakeObservation,
): { result: FieldResult; note?: string } {
  // An abstention leaves addressee, action, target and admission unknown: abstained before any equality, so a label
  // that happens to equal an abstention's placeholder (abstain, none, unresolved, recorded_only, null) is never a
  // match (r11, report v5; unchanged in v6 and v7).
  if (ABSTAINABLE.has(field) && o.proposal.kind === 'abstain') return { result: 'abstained' }
  if (field === 'target') {
    const { result, note } = targetVerdict(o.proposal.target, expected)
    return note === undefined ? { result } : { result, note }
  }
  if (equalField(field, expected, o, observed)) return { result: 'match' }
  if (field === 'admission' && observed === 'unassessed')
    return { result: 'unassessed', note: ADMISSION_UNASSESSED_REASON }
  return { result: 'mismatch' }
}

export function compareCase(o: IntakeObservation, meta: CaseMeta): FieldComparison[] {
  const observed = observedFields(o)
  const expected = meta.expected
  return SCORED_FIELDS.map((field) => {
    const source = LABEL_SOURCE[field]
    if (expected === null || !Object.hasOwn(expected, source))
      return { field, expected: null, observed: observed[field], result: 'not_labelled' }
    const label = expected[source]
    const { result, note } = fieldResult(field, label, observed[field], o)
    return { field, expected: label, observed: observed[field], result, ...(note === undefined ? {} : { note }) }
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Report

export interface CaseRecord {
  readonly caseId: string
  readonly family: string | null
  readonly observation: IntakeObservation
  readonly comparison: readonly FieldComparison[]
}

/**
 * Counts per value, as own numeric properties for every value (r13): a Map accumulates, so a family or kind named
 * `__proto__`, `constructor` or `toString` is counted like any other, never read from or lost to Object.prototype.
 * Object.fromEntries defines own properties, `__proto__` included.
 */
const tally = (values: readonly string[]): Record<string, number> => {
  const counts = new Map<string, number>()
  for (const v of values.toSorted()) counts.set(v, (counts.get(v) ?? 0) + 1)
  return Object.fromEntries(counts)
}

function fieldSummary(records: readonly CaseRecord[]): Record<string, Record<string, number>> {
  return Object.fromEntries(
    SCORED_FIELDS.map((field) => {
      const results = records.map((r) => r.comparison.find((c) => c.field === field)?.result ?? 'not_labelled')
      const counts = tally(results)
      const denominator = results.filter((r) => r !== 'not_labelled').length
      return [field, { match: 0, mismatch: 0, abstained: 0, unassessed: 0, not_labelled: 0, ...counts, denominator }]
    }),
  )
}

function misses(records: readonly CaseRecord[]): unknown[] {
  return records.flatMap((r) =>
    r.comparison
      .filter((c) => c.result === 'mismatch' || c.result === 'abstained' || c.result === 'unassessed')
      .map((c) => ({
        caseId: r.caseId,
        family: r.family,
        field: c.field,
        result: c.result,
        expected: c.expected,
        observed: c.observed,
        ...(c.note === undefined ? {} : { note: c.note }),
      })),
  )
}

const labelOf = (r: CaseRecord, field: ScoredField): unknown => r.comparison.find((c) => c.field === field)?.expected

/**
 * Development-set tallies for INC03-R16's promotion list. They are observations on this corpus only, not safety
 * evidence: the r1 review found novel inputs that a clean tally had not revealed.
 */
const actionResult = (r: CaseRecord): FieldResult | undefined =>
  r.comparison.find((c) => c.field === 'proposedAction')?.result

function developmentTallies(records: readonly CaseRecord[]): Record<string, unknown> {
  const consequential = records.filter((r) => CONSEQUENTIAL.has(r.observation.proposal.kind))
  // Only an actual action label can be missed; a case without one is not assessed here, never a match (r9 F03).
  const unexpected = consequential.filter((r) => actionResult(r) === 'mismatch')
  const notLabelled = consequential.filter((r) => actionResult(r) === 'not_labelled')
  const humanOverrides = records.filter((r) => {
    const named = addresseeLabelIds(labelOf(r, 'addressee'))
    const humanOnly = named !== undefined && named.length > 0 && !named.includes('sophia')
    return humanOnly && r.observation.addressee.ids.includes('sophia')
  })
  return {
    unexpectedConsequentialProposals: unexpected.map((r) => r.caseId),
    unexpectedConsequentialProposalsUnblocked: unexpected
      .filter((r) => !BLOCKING.has(r.observation.admission.outcome))
      .map((r) => r.caseId),
    consequentialProposalsActionNotLabelled: notLabelled.map((r) => r.caseId),
    explicitHumanAddressOverrides: humanOverrides.map((r) => r.caseId),
    audienceMismatches: records
      .filter((r) => r.comparison.some((c) => c.field === 'audience' && c.result === 'mismatch'))
      .map((r) => r.caseId),
    policyAdmissions: 0,
    note: 'Development-set tallies only, not a safety proof: novel counterexamples found r1 gaps these counts missed. The policy has no admitted outcome and this program dispatches nothing.',
  }
}

function sumEffects(records: readonly CaseRecord[]): Record<string, number> {
  const totals: Record<string, number> = Object.fromEntries(Object.keys(ZERO_EFFECTS).map((k) => [k, 0]))
  for (const r of records) {
    const effects: Record<string, number> = { ...r.observation.effects }
    for (const [k, v] of Object.entries(effects)) totals[k] = (totals[k] ?? 0) + v
  }
  return totals
}

export interface ReportInput {
  readonly name: string
  readonly sha256: string
  readonly bytes: number
  readonly policySourceSha256: string
}

/** Each case is its own scenario: a fresh ledger, so no case's operation identity leaks into another's. */
function observeCase(prepared: PreparedCase): ObservationResult {
  const ledger: ObservationLedger = new Map()
  return observeWithLedger(ledger, prepared.policyInput)
}

const recordOf = (meta: CaseMeta, observation: IntakeObservation): CaseRecord => ({
  caseId: meta.caseId,
  family: meta.family,
  observation,
  comparison: compareCase(observation, meta),
})

function observeCases(doc: Record<string, unknown>, rawCases: readonly unknown[]) {
  const defaults = isSchema(doc.schema) ? CORPUS_SCHEMAS[doc.schema].defaultInteraction : null
  const fixtures = checkFixtures(doc)
  const records: CaseRecord[] = []
  const errors: CaseError[] = []
  // Identity first (r23): the first case, in input order, with a bounded caseId owns it, valid or not; every later
  // case with that id is duplicate_case_id and nothing else, and is neither checked further nor observed.
  const owned = new Set<string>()
  for (const [index, raw] of rawCases.entries()) {
    const caseId = boundedCaseId(raw)
    if (caseId !== null) {
      if (owned.has(caseId)) {
        errors.push({ index, caseId, code: 'duplicate_case_id', path: `cases[${index}].caseId` })
        continue
      }
      owned.add(caseId)
    }
    const prepared = prepareCase(raw, index, defaults)
    if ('code' in prepared) {
      errors.push(prepared)
      continue
    }
    const { meta } = prepared
    const result = observeCase(prepared)
    if (result.ok) records.push(recordOf(meta, result.observation))
    else errors.push(...result.errors.map((e: InputError) => caseInputError(meta, e)))
  }
  return { records, errors, fixtures }
}

const caseInputError = (meta: CaseMeta, e: InputError): CaseError => ({
  index: meta.index,
  caseId: meta.caseId,
  code: e.code,
  path: `cases[${meta.index}].${e.path === '' ? 'input' : e.path.replace(/^text$/, 'input')}`,
})

/** Parses and checks a corpus document; anything wrong at file level is a usage error and no report. */
export function parseCorpus(bytes: Buffer): {
  readonly doc: Record<string, unknown>
  readonly cases: readonly unknown[]
} {
  let doc: unknown
  try {
    doc = JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new UsageError('input_invalid_json', 'the input is not valid JSON')
  }
  if (!isRecord(doc) || !isSchema(doc.schema)) throw new UsageError('input_unknown_schema', 'unknown corpus schema')
  if (!Array.isArray(doc.cases)) throw new UsageError('input_invalid_cases', 'cases must be an array')
  if (doc.cases.length > CLI_LIMITS.cases)
    throw new UsageError('input_too_many_cases', `more than ${CLI_LIMITS.cases} cases`)
  return { doc, cases: doc.cases }
}

export function buildReport(doc: Record<string, unknown>, cases: readonly unknown[], input: ReportInput) {
  const { records, errors, fixtures } = observeCases(doc, cases)
  const kinds = records.map((r) => r.observation.proposal.kind)
  return {
    schema: REPORT_SCHEMA,
    tool: 'scripts/intake-observe.ts',
    policy: {
      version: INTAKE_OBSERVATION_POLICY_VERSION,
      descriptorSha256: policyDigest(),
      sourceSha256: input.policySourceSha256,
    },
    input: { name: input.name, sha256: input.sha256, bytes: input.bytes, schema: doc.schema, caseCount: cases.length },
    mode: 'offline_observation: no model, network, provider, native, notification, control or dispatch effect',
    semanticAssessment:
      'absent: meaning outside the policy rules (version in policy.version) abstains; no model is called to improve accuracy',
    audienceScoring:
      'coarse: compares only change=unchanged; not owner, member, revision, thread or publication qualification',
    admissionScoring: `deterministic policy outcomes (waiting, denied, conflict, replay, reconciliation, clarification, non-admission recorded-only) are compared as they are; every unblocked proposal is unassessed (${ADMISSION_UNASSESSED_REASON}): this offline evaluator makes no positive admission claim, and a positive admission label counts as unassessed, a loss of evaluation scope rather than an accuracy result`,
    targetScoring: `structural (r24, ${TARGET_LABEL_NOTATION}): a structured label {kind, ...fields} with exactly that kind's fields is compared field by field, kind included, so one label names one target; a legacy string is read in the observed kind and is a match only when it can denote nothing else; a string that could denote several targets (a / in an operation or repository field, the text_objective sentinel) is unassessed (ambiguous_legacy_target_label), and a legacy mission string names the mission id only (legacy_label_mission_id_only), never manager, generation or binding; comparison refs are compared in order`,
    targetLabels: targetLabelCounts(records),
    labelsStrippedBeforePolicy: LABEL_KEYS,
    scoredFields: SCORED_FIELDS,
    unscoredLabelFields: UNSCORED_FIELDS,
    syntheticAuthority: {
      fixtures,
      rule: 'provenance only: recomputed canonical SHA-256 of each fixture body and its corpus reference; no admission label is derived and nothing is granted',
    },
    counts: {
      cases: cases.length,
      observed: records.length,
      invalidCases: new Set(errors.map((e) => e.index)).size,
      errorIssues: errors.length,
      abstentions: kinds.filter((k) => k === 'abstain').length,
      clarifications: kinds.filter((k) => k === 'clarify').length,
      byKind: tally(kinds),
      byPolicyAdmission: tally(records.map((r) => r.observation.admission.outcome)),
      // Every explicit family is its own key, `unlabelled` included; absent or null family is counted apart (r22).
      byFamily: tally(records.flatMap((r) => (r.family === null ? [] : [r.family]))),
      noFamily: records.filter((r) => r.family === null).length,
    },
    comparison: { fields: fieldSummary(records), misses: misses(records) },
    developmentTallies: developmentTallies(records),
    actualEffects: sumEffects(records),
    errors,
    cases: records,
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Entry

export function main(argv: readonly string[]): number {
  try {
    const args = parseCli(argv)
    checkOutputPath(args.out, args.input)
    const { bytes, sha256: digest } = readBoundedInput(args.input, args.inputSha256)
    const { doc, cases } = parseCorpus(bytes)
    const policySourceSha256 = sha256(readFileSync(POLICY_SOURCE))
    const report = buildReport(doc, cases, {
      name: basename(args.input),
      sha256: digest,
      bytes: bytes.length,
      policySourceSha256,
    })
    const cleaned = writeReportAtomically(args.out, `${JSON.stringify(report, null, 2)}\n`)
    // Published, complete; only the private temporary name may remain (r29): said once, without any path.
    if (!cleaned)
      console.error(
        'intake-observe: warning: temporary_report_left: a private temporary copy of the report could not be removed',
      )
    const { counts } = report
    console.log(
      `intake-observe: ${counts.observed}/${counts.cases} observed, ${counts.invalidCases} invalid cases (${counts.errorIssues} issues), ${counts.abstentions} abstentions → ${args.out}`,
    )
    return counts.invalidCases > 0 ? 1 : 0
  } catch (err: unknown) {
    if (err instanceof UsageError) {
      console.error(`intake-observe: ${err.code}: ${err.message}`)
      return 2
    }
    throw err
  }
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
