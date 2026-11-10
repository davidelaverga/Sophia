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
  renderAddressee,
  renderTarget,
  type InputError,
  type IntakeObservation,
  type ObservationLedger,
  type ObservationResult,
  type ProposalKind,
  type Target,
  type ZeroEffects,
} from '../packages/coordination/src/intake-observation.ts'

export const REPORT_SCHEMA = 'sophia.intake-observation.report.v5'
export const CLI_LIMITS = { fileBytes: 2 * 1024 * 1024, cases: 500, idChars: 200 } as const

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
  if (!statSync(dirname(out), { throwIfNoEntry: false })?.isDirectory())
    throw new UsageError('output_directory_missing', 'the report directory does not exist')
  // Compare real locations, so a symlinked directory cannot carry the report into the repository.
  const real = join(realpathSync(dirname(out)), basename(out))
  const realRoot =
    statSync(repositoryRoot, { throwIfNoEntry: false }) === undefined ? repositoryRoot : realpathSync(repositoryRoot)
  if (inside(repositoryRoot, out) || inside(realRoot, real))
    throw new UsageError('output_inside_repository', 'the report path is inside the repository')
  if (statSync(input, { throwIfNoEntry: false }) !== undefined && realpathSync(input) === real)
    throw new UsageError('output_is_input', 'the report path is the input')
  // linkSync at write time settles a race with a file created after this check.
  if (lstatSync(out, { throwIfNoEntry: false }) !== undefined)
    throw new UsageError('output_exists', 'the report path already exists; nothing is overwritten')
}

export function readBoundedInput(
  path: string,
  expectedSha256: string,
): { readonly bytes: Buffer; readonly sha256: string } {
  const stat = statSync(path, { throwIfNoEntry: false })
  if (!stat?.isFile()) throw new UsageError('input_unreadable', 'the input is not a readable file')
  if (stat.size > CLI_LIMITS.fileBytes)
    throw new UsageError('input_too_large', `the input exceeds ${CLI_LIMITS.fileBytes} bytes`)
  const bytes = readFileSync(path)
  if (bytes.length > CLI_LIMITS.fileBytes) throw new UsageError('input_too_large', 'the input grew past the limit')
  const digest = sha256(bytes)
  if (digest !== expectedSha256) throw new UsageError('input_hash_mismatch', `input SHA-256 is ${digest}`)
  return { bytes, sha256: digest }
}

/** Exclusive-create a temporary file beside the target, sync it, then link it to the final name (fails if taken). */
export function writeReportAtomically(out: string, text: string): void {
  const tmp = join(dirname(out), `.${basename(out)}.${randomBytes(6).toString('hex')}.tmp`)
  const fd = openSync(tmp, 'wx', 0o600)
  try {
    writeFileSync(fd, text)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  try {
    linkSync(tmp, out)
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && err.code === 'EEXIST')
      throw new UsageError('output_exists', 'the report path appeared while writing; nothing is overwritten')
    throw err
  } finally {
    unlinkSync(tmp)
  }
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

export function prepareCase(raw: unknown, index: number, defaultInteraction: unknown): PreparedCase | CaseError {
  if (!isRecord(raw)) return { index, caseId: null, code: 'invalid_case', path: `cases[${index}]` }
  const caseId = isBoundedId(raw.caseId) ? raw.caseId : null
  const fail = (code: string, path: string): CaseError => ({ index, caseId, code, path: `cases[${index}]${path}` })
  if (caseId === null) return fail('invalid_case_id', '.caseId')
  const unknown = Object.keys(raw).find((k) => !CASE_KEYS.some((allowed) => allowed === k))
  if (unknown !== undefined) return fail('unknown_case_field', `.${unknown}`)
  if (raw.expected !== undefined && !isRecord(raw.expected)) return fail('invalid_expected', '.expected')
  const meta: CaseMeta = {
    index,
    caseId,
    family: typeof raw.family === 'string' ? raw.family : null,
    expected: isRecord(raw.expected) ? raw.expected : null,
  }
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

/**
 * Provenance only: each fixture body's recomputed SHA-256 and whether a corpus-level reference matches it. A verified
 * body proves where the fixture came from, not current authority; no admission label is derived from it (r3 F04).
 */
export function checkFixtures(doc: Record<string, unknown>): FixtureCheck[] {
  const fixtures = doc.authorityFixtures
  if (!isRecord(fixtures)) return []
  const reference = typeof doc.authorityFixtureSha256 === 'string' ? doc.authorityFixtureSha256 : null
  // One corpus-level reference can only vouch for a single fixture; with several, none is corpus-verified.
  const single = Object.keys(fixtures).length === 1
  return Object.entries(fixtures)
    .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
    .map(([id, body]) => {
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

/** Exact-target acceptance compares structure: every comparison ref, in order; other targets by their full id. */
export function targetMatches(target: Target, label: unknown): boolean {
  if (typeof label !== 'string') return false
  if (target.kind !== 'comparison') return renderTarget(target) === label
  const refs = parseComparisonLabel(label)
  return refs !== undefined && refs.length === target.refs.length && refs.every((r, i) => r === target.refs[i])
}

function equalField(field: ScoredField, expected: unknown, o: IntakeObservation, observed: unknown): boolean {
  if (field === 'actualEffects') return effectsMatch(expected, o.effects)
  if (field === 'target') return targetMatches(o.proposal.target, expected)
  return expected === observed
}

const ABSTAINABLE: ReadonlySet<ScoredField> = new Set([
  'addressee',
  'proposedAction',
  'target',
  'admission',
  'admissionReason',
])

function fieldResult(field: ScoredField, expected: unknown, observed: unknown, o: IntakeObservation): FieldResult {
  // An abstention leaves addressee, action, target and admission unknown: abstained before any equality, so a label
  // that happens to equal an abstention's placeholder (abstain, none, unresolved, recorded_only, null) is never a
  // match (r11, report v5).
  if (ABSTAINABLE.has(field) && o.proposal.kind === 'abstain') return 'abstained'
  if (equalField(field, expected, o, observed)) return 'match'
  if (field === 'admission' && observed === 'unassessed') return 'unassessed'
  return 'mismatch'
}

export function compareCase(o: IntakeObservation, meta: CaseMeta): FieldComparison[] {
  const observed = observedFields(o)
  const expected = meta.expected
  return SCORED_FIELDS.map((field) => {
    const source = LABEL_SOURCE[field]
    if (expected === null || !Object.hasOwn(expected, source))
      return { field, expected: null, observed: observed[field], result: 'not_labelled' }
    const label = expected[source]
    const result = fieldResult(field, label, observed[field], o)
    const note = result === 'unassessed' ? ADMISSION_UNASSESSED_REASON : undefined
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
    const label = labelOf(r, 'addressee')
    const humanOnly = typeof label === 'string' && label !== 'none' && !label.split('+').includes('sophia')
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
  const seen = new Set<string>()
  for (const [index, raw] of rawCases.entries()) {
    const prepared = prepareCase(raw, index, defaults)
    if ('code' in prepared) {
      errors.push(prepared)
      continue
    }
    const { meta } = prepared
    if (seen.has(meta.caseId)) {
      errors.push({ index, caseId: meta.caseId, code: 'duplicate_case_id', path: `cases[${index}].caseId` })
      continue
    }
    seen.add(meta.caseId)
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
    targetScoring:
      'structured: comparison refs exactly; a mission label scores only the mission id, not manager, generation or binding identity',
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
      byFamily: tally(records.map((r) => r.family ?? 'unlabelled')),
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
    writeReportAtomically(args.out, `${JSON.stringify(report, null, 2)}\n`)
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
