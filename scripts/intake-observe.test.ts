// The consumer's crossings: labels never reach the policy, bad input is an error and not a classification, the
// synthetic fixture's provenance is recomputed from its body (and grants nothing), admission is never claimed, and the
// report is bound, complete and never overwrites. Ordinary `pnpm test` runs this suite through the registration
// wrapper tests/unit/intake-observe-registration.test.mjs; `node --test scripts/intake-observe.test.ts` runs it alone.
// The corpus here is written for these tests. The reviewed development corpus stays outside the repository and is
// run explicitly; these tests do not replay it or its expected answers.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { canonicalJson } from '../packages/coordination/src/canonical.ts'
import type { IntakeObservation } from '../packages/coordination/src/intake-observation.ts'
import {
  buildReport,
  checkOutputPath,
  CLI_LIMITS,
  parseCli,
  parseCorpus,
  REPOSITORY_ROOT,
  UsageError,
} from './intake-observe.ts'
import * as cli from './intake-observe.ts'

const SCRIPT = fileURLToPath(new URL('./intake-observe.ts', import.meta.url))
const sha256 = (b: string | Buffer) => createHash('sha256').update(b).digest('hex')

interface TestCase {
  [key: string]: unknown
  caseId?: unknown
  context: Record<string, unknown>
}
interface TestDoc {
  [key: string]: unknown
  cases: TestCase[]
  authorityFixtures?: Record<string, { grants: { roles: string[] } }>
}

const FIXTURE_ID = 'test-authority'
const fixtureBody = () => ({
  purpose: 'test-only synthetic authority; grants nothing',
  actor: { currentMembership: 'test_member' },
  resources: { api: 'test_api' },
  repository: { base: 'test_base' },
  design: { state: 'approved in this test fixture' },
  project: { managerGeneration: 2 },
  control: { default: 'running', stop: 'fake-supported', hold: 'fake-supported' },
  grants: { id: 'test_grant', roles: ['answer', 'explore', 'implementation'] },
})
// Computed outside Node (Python: sorted keys, compact separators, UTF-8) as an independent check of canonicalJson.
const FIXTURE_SHA256 = '3d35baf8e43d10c539fb022497153613e6cf8f90a8e0973275960a7aaa57e5a9'

const ref = { id: FIXTURE_ID, sha256: FIXTURE_SHA256 }
const testCase = (
  caseId: string,
  input: string,
  context: Record<string, unknown>,
  expected: Record<string, unknown>,
) => ({
  caseId,
  family: 'test_family',
  split: 'development',
  input,
  context,
  expected,
  status: 'not_run',
  labelAuthority: 'test',
  fixtureAuthority: ref,
})

/** Eight cases, some labelled so that the policy misses or abstains, so the accounting has something to count. */
function corpus(): TestDoc {
  return {
    schema: 'sophia.inc03.development-corpus.v2',
    authorityFixtures: { [FIXTURE_ID]: fixtureBody() },
    authorityFixtureSha256: FIXTURE_SHA256,
    cases: [
      testCase(
        'T-1',
        'Explain the selected chart.',
        { audience: 'personal', selectedArtifact: 'chart@v3' },
        {
          audience: 'unchanged',
          addressee: 'sophia',
          proposedAction: 'answer',
          target: 'chart@v3',
          clarificationRequired: false,
          admission: 'admitted_in_fake_authority_only',
          admissionDenialOrWaitReason: null,
          actualObservationModeEffects: { providerInferences: 0, codingMissions: 0 },
        },
      ),
      testCase(
        'T-2',
        '@maria can you take this?',
        { audience: 'project', trustedMentions: ['maria'] },
        {
          addressee: 'maria',
          proposedAction: 'human_message',
          admission: 'recorded_only',
        },
      ),
      testCase(
        'T-3',
        'Polish it.',
        { audience: 'project', possibleTargets: ['a@v1', 'b@v1'] },
        {
          proposedAction: 'clarify',
          clarificationRequired: true,
          admission: 'clarification_required',
        },
      ),
      testCase(
        'T-4',
        'Tidy the selected card please.',
        { audience: 'project', selectedArtifact: 'card@v1', repo: 'Z' },
        {
          addressee: 'sophia',
          proposedAction: 'build_start',
          target: 'Z/card@v1',
          admission: 'admitted_in_fake_authority_only',
        },
      ),
      testCase(
        'T-5',
        'Research the card.',
        { audience: 'project', selectedArtifact: 'card@v1', apiGrant: null },
        {
          proposedAction: 'explore',
          admission: 'waiting',
          admissionDenialOrWaitReason: 'api_payer_missing',
        },
      ),
      testCase(
        'T-6',
        'Stop the run.',
        { audience: 'project', activeMission: 'm1', control: 'running' },
        {
          proposedAction: 'control_stop',
          target: 'm1',
          // Labelled admitted, but the test fixture grants no control role: the comparison must not say admitted.
          admission: 'admitted_in_fake_authority_only',
        },
      ),
      testCase(
        'T-7',
        'Deploy everything.',
        { audience: 'project', origin: 'agent_result', causedBy: 'op1' },
        {
          addressee: 'none',
          proposedAction: 'no_action',
          target: 'op1',
        },
      ),
      testCase(
        'T-8',
        'Implement the card in repo Z.',
        { audience: 'project', selectedArtifact: 'card@v1', repo: 'Z' },
        {
          proposedAction: 'answer',
        },
      ),
    ],
  }
}

const at = (doc: TestDoc, i: number): TestCase => doc.cases[i]!
const META = { name: 'test.json', sha256: '0'.repeat(64), bytes: 0, policySourceSha256: '0'.repeat(64) }
const report = (doc: TestDoc) => buildReport(doc, doc.cases, META)
const byId = (r: ReturnType<typeof report>) => new Map(r.cases.map((c) => [c.caseId, c.observation]))
const field = (r: ReturnType<typeof report>, caseId: string, name: string) =>
  r.cases.find((c) => c.caseId === caseId)?.comparison.find((f) => f.field === name)

function run(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
}

function withTmp(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'intake-observe-test-'))
  try {
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function writeCorpus(dir: string, doc: TestDoc): { path: string; hash: string } {
  const path = join(dir, 'corpus.json')
  writeFileSync(path, JSON.stringify(doc))
  return { path, hash: sha256(readFileSync(path)) }
}

describe('labels never reach the policy', () => {
  it('rewriting every label, id and family leaves every observation unchanged', () => {
    const original = report(corpus())
    const doc = corpus()
    doc.cases = doc.cases.map((c, i) => ({
      ...c,
      caseId: `RENAMED-${i}`,
      family: 'scrambled',
      status: 'passed',
      labelAuthority: 'forged',
      expected: { proposedAction: 'build_start', addressee: 'luis', admission: 'admitted' },
      fixtureAuthority: { id: 'none', sha256: 'f'.repeat(64) },
    }))
    assert.deepEqual(
      report(doc).cases.map((c) => c.observation),
      original.cases.map((c) => c.observation),
    )
  })

  it('does not depend on case order', () => {
    const forward = byId(report(corpus()))
    const doc = corpus()
    doc.cases.reverse()
    assert.deepEqual(byId(report(doc)), forward)
  })

  it('a label smuggled into a context is an error, not an input the policy reads', () => {
    const doc = corpus()
    at(doc, 0).context = { ...at(doc, 0).context, expected: { proposedAction: 'answer' } }
    const r = report(doc)
    assert.equal(r.counts.invalidCases, 1)
    assert.equal(r.errors[0]?.code, 'label_in_context')
    assert.ok(!r.cases.some((c) => c.caseId === 'T-1'))
  })
})

describe('bad cases are reported as errors', () => {
  it('unknown fields, missing ids, bad context and duplicate ids each fail their own case', () => {
    const doc = corpus()
    at(doc, 1).extra = true
    delete at(doc, 2).caseId
    at(doc, 3).context = { audience: 'project', notAFact: 1 }
    at(doc, 4).caseId = at(doc, 5).caseId
    at(doc, 6).input = 42
    const r = report(doc)
    assert.deepEqual(
      r.errors.map((e) => e.code).toSorted(),
      [
        'duplicate_case_id',
        'invalid_case_id',
        'invalid_text',
        'unknown_case_field',
        'unknown_context_field',
      ].toSorted(),
    )
    assert.equal(r.counts.observed + r.counts.invalidCases, r.counts.cases)
    assert.equal(r.counts.errorIssues, r.errors.length)
  })

  it('a legacy case must say askSophia; false is recorded with no assessment', () => {
    const doc = corpus()
    at(doc, 0).interaction = { contract: 'legacy_explicit_ask' }
    at(doc, 7).interaction = { contract: 'legacy_explicit_ask', askSophia: false }
    const r = report(doc)
    assert.equal(r.errors[0]?.code, 'legacy_ask_missing')
    const legacy = r.cases.find((c) => c.caseId === 'T-8')
    assert.equal(legacy?.observation.proposal.kind, 'recorded_only')
    assert.equal(legacy?.observation.assessment, 'not_permitted')
  })

  it('file-level problems are usage errors with no report', () => {
    assert.throws(() => parseCorpus(Buffer.from('{')), { code: 'input_invalid_json' })
    assert.throws(() => parseCorpus(Buffer.from('{"schema":"other","cases":[]}')), { code: 'input_unknown_schema' })
    const many = JSON.stringify({ schema: 'sophia.inc03.development-corpus.v2', cases: Array.from({ length: 501 }) })
    assert.throws(() => parseCorpus(Buffer.from(many)), { code: 'input_too_many_cases' })
  })
})

const admittedCount = (r: ReturnType<typeof report>) =>
  r.cases.filter((c) =>
    c.comparison.some((f) => f.field === 'admission' && f.observed === 'admitted_in_fake_authority_only'),
  ).length

describe('the synthetic fixture is provenance only', () => {
  it('recomputes the canonical SHA-256 of the body, as an independent implementation does', () => {
    assert.equal(sha256(canonicalJson(fixtureBody())), FIXTURE_SHA256)
    const r = report(corpus())
    assert.equal(r.syntheticAuthority.fixtures[0]?.computedSha256, FIXTURE_SHA256)
    assert.equal(r.syntheticAuthority.fixtures[0]?.matchesCorpusReference, true)
  })

  it('a verified body yields no admission: unblocked proposals are unassessed, with the reason', () => {
    const r = report(corpus())
    assert.equal(admittedCount(r), 0)
    for (const id of ['T-1', 'T-6']) {
      assert.equal(field(r, id, 'admission')?.observed, 'unassessed', id)
      assert.equal(field(r, id, 'admission')?.result, 'unassessed', id)
      assert.equal(field(r, id, 'admission')?.note, 'complete_current_authority_not_representable', id)
    }
    for (const c of r.cases) assert.equal(c.observation.admission.authority, 'none')
  })

  it('a changed, missing or re-pointed fixture changes no observation and no admission', () => {
    const baseline = report(corpus())
    const tampered = corpus()
    tampered.authorityFixtures![FIXTURE_ID]!.grants.roles.push('owner')
    const bodiless = corpus()
    delete bodiless.authorityFixtures
    for (const doc of [tampered, bodiless]) {
      const r = report(doc)
      assert.equal(admittedCount(r), 0)
      assert.deepEqual(
        r.cases.map((c) => c.observation),
        baseline.cases.map((c) => c.observation),
      )
    }
    assert.equal(report(tampered).syntheticAuthority.fixtures[0]?.matchesCorpusReference, false)
  })
})

describe('the report accounts for everything', () => {
  it('denominators, misses and abstentions add up; unlabelled fields are not counted', () => {
    const r = report(corpus())
    let missed = 0
    for (const [name, summary] of Object.entries(r.comparison.fields)) {
      const n = (key: string) => summary[key] ?? 0
      assert.equal(n('match') + n('mismatch') + n('abstained') + n('unassessed'), n('denominator'), name)
      assert.equal(n('denominator') + n('not_labelled'), r.counts.observed, name)
      missed += n('mismatch') + n('abstained') + n('unassessed')
    }
    assert.equal(r.comparison.misses.length, missed)
    assert.equal(field(r, 'T-4', 'proposedAction')?.result, 'abstained')
    assert.equal(field(r, 'T-8', 'proposedAction')?.result, 'mismatch')
    assert.equal(r.counts.abstentions, 1)
    assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
    assert.equal(field(r, 'T-1', 'actualEffects')?.result, 'match')
  })

  it('names the consequential proposals the labels did not expect', () => {
    const tallies = report(corpus()).developmentTallies
    assert.deepEqual(tallies.unexpectedConsequentialProposals, ['T-8'])
    assert.match(String(tallies.note), /not a safety proof/)
  })
})

describe('command line', () => {
  it('writes a deterministic report with no absolute paths', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, corpus())
      const a = join(dir, 'a.json')
      const b = join(dir, 'b.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', a]).status, 0)
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', b]).status, 0)
      const text = readFileSync(a, 'utf8')
      assert.equal(text, readFileSync(b, 'utf8'))
      assert.ok(!text.includes(dir) && !text.includes(REPOSITORY_ROOT))
      assert.equal(JSON.parse(text).input.sha256, hash)
    })
  })

  it('refuses a hash mismatch, an existing output and a path in the repository, writing nothing', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, corpus())
      const out = join(dir, 'r.json')
      const mismatch = run(['--input', path, '--input-sha256', 'a'.repeat(64), '--out', out])
      assert.equal(mismatch.status, 2)
      assert.match(mismatch.stderr, /input_hash_mismatch/)
      assert.equal(existsSync(out), false)
      writeFileSync(out, 'previous')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 2)
      assert.equal(readFileSync(out, 'utf8'), 'previous')
      const inRepo = run(['--input', path, '--input-sha256', hash, '--out', join(REPOSITORY_ROOT, 'report.json')])
      assert.equal(inRepo.status, 2)
      assert.match(inRepo.stderr, /output_inside_repository/)
      const link = join(dir, 'repo-link')
      symlinkSync(REPOSITORY_ROOT, link)
      assert.throws(() => checkOutputPath(join(link, 'r.json'), path), { code: 'output_inside_repository' })
      const alias = join(dir, 'alias.json')
      symlinkSync(path, alias)
      assert.throws(() => checkOutputPath(path, alias, '/nonexistent-root'), { code: 'output_is_input' })
    })
  })

  it('rejects malformed arguments and URLs', () => {
    const hash = 'a'.repeat(64)
    assert.throws(() => parseCli(['--input', 'c.json', '--input-sha256', hash]), UsageError)
    assert.throws(() => parseCli(['--input', 'https://example.test/c.json', '--input-sha256', hash, '--out', '/x']))
    assert.throws(() => parseCli(['--input', 'c.json', '--input-sha256', 'ABC', '--out', '/x']))
    assert.throws(() => parseCli(['--input', 'c.json', '--input-sha256', hash, '--out', '/x', '--eval', '1']))
  })

  it('exits 1 and still reports when a case is invalid', () => {
    withTmp((dir) => {
      const doc = corpus()
      at(doc, 0).context.unknownFact = true
      const { path, hash } = writeCorpus(dir, doc)
      const out = join(dir, 'r.json')
      const result = run(['--input', path, '--input-sha256', hash, '--out', out])
      assert.equal(result.status, 1)
      const written = JSON.parse(readFileSync(out, 'utf8'))
      assert.equal(written.counts.invalidCases, 1)
      assert.equal(written.errors[0].code, 'unknown_context_field')
    })
  })
})

// r2 (independent review F04, F06, notes). Built through buildReport, the consumer that writes the report.

/** A one-case corpus whose fixture, roles and references are rehashed to stay verified unless a test breaks them. */
function single(
  input: string,
  context: Record<string, unknown>,
  roles?: string[],
  expected = 'admitted_in_fake_authority_only',
) {
  const doc = corpus()
  const body = doc.authorityFixtures![FIXTURE_ID]!
  if (roles !== undefined) body.grants.roles = roles
  const hash = sha256(canonicalJson(body))
  doc.authorityFixtureSha256 = hash
  doc.cases = [
    { ...testCase('S-1', input, context, { admission: expected }), fixtureAuthority: { id: FIXTURE_ID, sha256: hash } },
  ]
  return doc
}

describe('F04 (r3): unknown or negative authority is never an admission match', () => {
  // Independently invented siblings; each would have been an admitted match under the r2 precondition engine or
  // carries an explicit negative fact. Every role is granted and every reference verified, so nothing else blocks.
  const roles = ['answer', 'explore', 'implementation', 'project_manager', 'control']
  const mission = { audience: 'project', activeMission: 'm1', control: 'running', manager: 'pm1', managerGeneration: 2 }
  const build = { audience: 'project', repo: 'Z', selectedArtifact: 'card@v1', accepted: true, nativePair: 'qualified' }
  const fix = { audience: 'project', originalOperation: 'op1', newTarget: 'card@v2', dispatchState: 'not_sent' }
  const siblings: [string, string, Record<string, unknown>][] = [
    ['build, authorization absent', 'Implement the card.', build],
    ['build, every positive fact', 'Implement the card.', { ...build, implementationAuthorized: true, base: 'b1' }],
    ['correction, revision unknown', 'Use v2.', { ...fix, currentActorAuthorized: true, sourceEligible: true }],
    ['follow-up, binding absent', 'Also add tests.', mission],
    [
      'inquiry, control state absent',
      'Why that library?',
      { ...mission, control: undefined, inquiryGrant: 'qualified' },
    ],
    ['stop, state absent', 'Stop it.', { audience: 'project', activeMission: 'm1', stopQualified: true }],
    ['hold, fully qualified', 'Pause it.', { ...mission, holdQualified: true }],
    ['resume, held and qualified', 'Resume it.', { ...mission, control: 'held', resumeQualified: true }],
    ['answer, fixture payer only', 'Explain the card.', { audience: 'personal', selectedArtifact: 'card@v1' }],
    [
      'explore, payer qualified',
      'Research the card.',
      { audience: 'project', selectedArtifact: 'card@v1', apiGrant: 'qualified' },
    ],
  ]

  it('every unblocked proposal is unassessed with its reason, never admitted, whatever the fixture says', () => {
    for (const [name, text, context] of siblings) {
      const r = report(single(text, JSON.parse(JSON.stringify(context)), roles))
      const admission = field(r, 'S-1', 'admission')
      assert.equal(admission?.observed, 'unassessed', name)
      assert.equal(admission?.result, 'unassessed', name)
      assert.equal(admission?.note, 'complete_current_authority_not_representable', name)
      assert.equal(admittedCount(r), 0, name)
      assert.ok(
        Object.values(r.actualEffects).every((v) => v === 0),
        name,
      )
    }
  })

  it('known negative facts stay deterministic waits or denials, compared as they are', () => {
    const negatives: [string, string, Record<string, unknown>, string][] = [
      [
        'build, native unqualified',
        'Implement the card.',
        { ...build, nativePair: 'unqualified' },
        'native_route_unqualified',
      ],
      [
        'build, not authorized',
        'Implement the card.',
        { ...build, implementationAuthorized: false },
        'implementation_not_authorized',
      ],
      ['correction, native null', 'Use v2.', { ...fix, nativePair: null }, 'native_route_unqualified'],
      [
        'follow-up, native unqualified',
        'Also add tests.',
        { ...mission, nativePair: 'unqualified' },
        'native_route_unqualified',
      ],
      [
        'inquiry, native unqualified',
        'Why that library?',
        { ...mission, nativePair: 'unqualified' },
        'native_route_unqualified',
      ],
      [
        'follow-up, manager unknown',
        'Also add tests.',
        { audience: 'project', activeMission: 'm1', control: 'running' },
        'manager_identity_unresolved',
      ],
      ['resume, not held', 'Resume it.', { ...mission, resumeQualified: true }, 'resume_requires_held'],
      [
        'explore, payer missing',
        'Research the card.',
        { audience: 'project', selectedArtifact: 'card@v1', apiGrant: null },
        'api_payer_missing',
      ],
    ]
    for (const [name, text, context, reason] of negatives) {
      const r = report(single(text, context, roles))
      const admission = field(r, 'S-1', 'admission')
      assert.ok(['waiting', 'denied'].includes(String(admission?.observed)), name)
      assert.equal(admission?.result, 'mismatch', name)
      assert.equal(r.cases[0]?.observation.admission.reason, reason, name)
    }
  })

  it('deterministic replay and clarification outcomes still score against their labels', () => {
    const replay = single(
      'Also add tests.',
      { ...mission, redeliveryOf: 'op5', samePayload: true },
      roles,
      'replay_original',
    )
    assert.equal(field(report(replay), 'S-1', 'admission')?.result, 'match')
    const ask = single(
      'Polish it.',
      { audience: 'project', possibleTargets: ['a@v1', 'b@v1'] },
      roles,
      'clarification_required',
    )
    assert.equal(field(report(ask), 'S-1', 'admission')?.result, 'match')
  })

  it('reports the loss of admission scope and the identity limits of target scoring', () => {
    const r = report(corpus())
    assert.match(r.admissionScoring, /unassessed/)
    assert.match(r.admissionScoring, /not an accuracy result|rather than an accuracy result/)
    assert.match(r.targetScoring, /mission id/)
  })
})

const comparing = (refs: string[]) => ({ audience: 'project', directAddress: 'sophia', selectedComparison: refs })

describe('F06: exact targets are compared by structure', () => {
  const targetResult = (refs: string[], label: string) => {
    const doc = corpus()
    doc.cases = [testCase('C-1', 'Compare them.', comparing(refs), { target: label })]
    return field(report(doc), 'C-1', 'target')?.result
  }

  it('matches every ref, versions and regions included, and nothing less', () => {
    assert.equal(targetResult(['w@v1', 'w@v2'], 'w@v1..v2'), 'match')
    assert.equal(targetResult(['w@v1:intro', 'w@v2:intro'], 'w@v1:intro..v2:intro'), 'match')
    assert.equal(targetResult(['w@v1', 'z@v1'], 'w@v1..z@v1'), 'match')
    assert.equal(targetResult(['w@v1', 'w@v2'], 'w@v1..v2..z@v9'), 'mismatch')
    assert.equal(targetResult(['w@v1', 'w@v2'], 'w@v2..v1'), 'mismatch')
    assert.equal(targetResult(['w@v1', 'w@v2'], 'w@v1'), 'mismatch')
  })

  it('a third ref is a case error, so it can never be scored as two', () => {
    const doc = corpus()
    doc.cases = [testCase('C-2', 'Compare them.', comparing(['w@v1', 'w@v2', 'secret@v9']), { target: 'w@v1..v2' })]
    const r = report(doc)
    assert.equal(r.counts.observed, 0)
    assert.equal(r.errors[0]?.code, 'unsupported_comparison')
  })
})

describe('report notes', () => {
  it('counts invalid cases apart from their issues', () => {
    const doc = corpus()
    at(doc, 0).context = { audience: 'project', a1: 1, a2: 2, a3: 3 }
    const r = report(doc)
    assert.equal(r.counts.invalidCases, 1)
    assert.equal(r.counts.errorIssues, 3)
    assert.equal(r.counts.observed + r.counts.invalidCases, r.counts.cases)
  })

  it('says that the audience score is coarse', () => {
    assert.match(report(corpus()).audienceScoring, /coarse/)
  })

  it('refuses a repeated argument', () => {
    const hash = 'a'.repeat(64)
    assert.throws(() => parseCli(['--input', 'a.json', '--input', 'b.json', '--input-sha256', hash, '--out', '/x']), {
      message: /--input is given more than once/,
    })
  })
})

describe('F01 (r4) through the consumer: ambiguous single-quoted evidence is no control', () => {
  it('every sibling is an abstention in the written report, with zero effects', () => {
    const live = { audience: 'project', activeMission: 'm9', control: 'running', stopQualified: true }
    const texts = [
      "The memo read 'the editors' draft.\nStop the job.\nend'",
      'The memo read ‘the editors’ draft. Pause the job.’',
      "The memo read 'the editors' and the authors' drafts. Stop the job.'",
    ]
    const doc = corpus()
    doc.cases = texts.map((text, i) => testCase(`Q-${i}`, text, live, { proposedAction: 'abstain' }))
    const r = report(doc)
    assert.equal(r.counts.observed, texts.length)
    for (const c of r.cases) {
      assert.equal(c.observation.proposal.kind, 'abstain', c.caseId)
      assert.ok(c.observation.uncertainty.includes('malformed_quotation'), c.caseId)
    }
    assert.deepEqual(r.counts.byKind, { abstain: texts.length })
    assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
  })
})

describe('F01 (r5) through the consumer: unrecognised quote boundaries are no control', () => {
  it('the review strings and generated siblings are abstentions in the written report, adoption or not', () => {
    const live = { audience: 'project', activeMission: 'm7', control: 'running', stopQualified: true }
    const texts = [
      "The log said \\'first line. Stop the job.\\'",
      "The log said—'first line. Stop the job.'",
      "The log said\\u2014'first line. Stop the job.'",
      ...['—', '\\', '(', '😀', '\n', '\u200b'].map((b) => `The log said${b}‛first line. Pause the job.‛`),
    ]
    const doc = corpus()
    doc.cases = texts.flatMap((text, i) => [
      testCase(`B-${i}`, text, live, { proposedAction: 'abstain' }),
      testCase(`A-${i}`, text, { ...live, actorExplicitlyAdopts: true }, { proposedAction: 'abstain' }),
    ])
    const r = report(doc)
    assert.equal(r.counts.observed, texts.length * 2)
    for (const c of r.cases) {
      assert.equal(c.observation.proposal.kind, 'abstain', c.caseId)
      assert.ok(
        c.observation.uncertainty.includes('malformed_quotation') || c.observation.fenced.quotedSpans >= 1,
        c.caseId,
      )
    }
    assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
  })
})

describe('F01 (r6) through the consumer: glued cross-token quotation marks are no control', () => {
  it('each apostrophe glyph, adoption off and on, is an abstention in the written report', () => {
    const live = {
      audience: 'project',
      activeMission: 'm8',
      control: 'running',
      stopQualified: true,
      holdQualified: true,
    }
    const glyphs = ["'", '’', '＇', 'ʼ']
    const texts = glyphs.flatMap((g, i) => [
      `Ticket ${i} reads${g}first line. Stop the job${g}next`,
      `Журнал${g}строка.\nPause the job${g}конец`,
    ])
    const doc = corpus()
    doc.cases = texts.flatMap((text, i) => [
      testCase(`G-${i}`, text, live, { proposedAction: 'abstain' }),
      testCase(`H-${i}`, text, { ...live, actorExplicitlyAdopts: true }, { proposedAction: 'abstain' }),
    ])
    const r = report(doc)
    assert.equal(r.counts.observed, texts.length * 2)
    for (const c of r.cases) {
      assert.equal(c.observation.proposal.kind, 'abstain', c.caseId)
      assert.ok(c.observation.uncertainty.includes('malformed_quotation'), c.caseId)
    }
    assert.deepEqual(r.counts.byKind, { abstain: texts.length * 2 })
    assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
  })

  it('contractions and names stay authored controls in the written report', () => {
    const live = { audience: 'project', activeMission: 'm8', control: 'running', stopQualified: true }
    const doc = corpus()
    doc.cases = ["Stop the job, it's stuck.", 'Stop O’Brien’s job.'].map((text, i) =>
      testCase(`K-${i}`, text, live, { proposedAction: 'control_stop' }),
    )
    const r = report(doc)
    assert.deepEqual(r.counts.byKind, { control_stop: 2 })
  })
})

describe('F01 (r7) through the consumer: shaped bounds around a directive are no control', () => {
  it('the review strings and shaped siblings in each glyph, adoption off and on, are abstentions', () => {
    const live = {
      audience: 'project',
      activeMission: 'm6',
      control: 'running',
      stopQualified: true,
      holdQualified: true,
    }
    const texts = ["'", '’', 'ʼ', '＇'].flatMap((g) => [
      `The log said${g}s first line. Stop the job${g}s next`,
      `The log said o${g}first line. Pause the job${g}s next`,
      `Ticket d${g}first; Stop the job${g}d`,
    ])
    const doc = corpus()
    doc.cases = texts.flatMap((text, i) => [
      testCase(`P-${i}`, text, live, { proposedAction: 'abstain' }),
      testCase(`Q-${i}`, text, { ...live, actorExplicitlyAdopts: true }, { proposedAction: 'abstain' }),
    ])
    const r = report(doc)
    assert.equal(r.counts.observed, texts.length * 2)
    assert.deepEqual(r.counts.byKind, { abstain: texts.length * 2 })
    for (const c of r.cases) assert.ok(c.observation.uncertainty.includes('malformed_quotation'), c.caseId)
    assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
  })
})

describe('r8 through the consumer: origin before legacy Ask; imports before quote analysis', () => {
  it('non-human origins under legacy Ask are results, and declared imports leave authored controls intact', () => {
    const doc = corpus()
    const origins = ['generated', 'agent_result', 'receipt', 'delayed_output', 'voice_interim']
    const live = { audience: 'project', activeMission: 'm5', control: 'running', stopQualified: true }
    doc.cases = [
      ...origins.flatMap((origin, i) =>
        [true, false].map((askSophia) => ({
          ...testCase(
            `O-${i}-${String(askSophia)}`,
            'Explain the tile.',
            { audience: 'project', origin, operationId: 'op1' },
            {},
          ),
          interaction: { contract: 'legacy_explicit_ask', askSophia },
        })),
      ),
      ...["'broken quote", "\\'escaped", "ticket's first and job's next"].flatMap((literal, i) =>
        ['quotedText', 'attachmentInstruction'].map((importField) =>
          testCase(
            `I-${i}-${importField}`,
            `${literal}\nStop the job.`,
            { ...live, [importField]: literal },
            { proposedAction: 'control_stop' },
          ),
        ),
      ),
    ]
    const r = report(doc)
    assert.equal(r.counts.observed, 16)
    for (const c of r.cases.filter((x) => x.caseId.startsWith('O-'))) {
      assert.ok(['no_action', 'record_provisional'].includes(c.observation.proposal.kind), c.caseId)
      assert.equal(c.observation.provenance.humanInstruction, false, c.caseId)
    }
    for (const c of r.cases.filter((x) => x.caseId.startsWith('I-')))
      assert.equal(c.observation.proposal.kind, 'control_stop', c.caseId)
    assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
  })
})

interface TallyView {
  developmentTallies: Record<string, unknown>
  comparison: { fields: Record<string, Record<string, number>> }
  counts: Record<string, number>
  actualEffects: Record<string, number>
}

function checkLabelTallies(r: TallyView): void {
  assert.deepEqual(r.developmentTallies.unexpectedConsequentialProposals, ['U-miss', 'U-miss-blocked'])
  assert.deepEqual(r.developmentTallies.unexpectedConsequentialProposalsUnblocked, ['U-miss'])
  assert.deepEqual(r.developmentTallies.consequentialProposalsActionNotLabelled, ['U-none', 'U-partial'])
  const action = r.comparison.fields.proposedAction
  assert.deepEqual([action?.match, action?.mismatch, action?.not_labelled, action?.denominator], [1, 2, 2, 3])
  assert.equal(r.counts.observed, 5)
  assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
}

describe('F03 (r9): only a comparable action label can make a proposal unexpected', () => {
  const live = { audience: 'project', activeMission: 'm9', control: 'running', stopQualified: true }
  function labelCorpus(): TestDoc {
    const doc = corpus()
    doc.cases = [
      testCase('U-none', 'Stop the job.', live, {}),
      testCase('U-partial', 'Stop the job.', live, { audience: 'unchanged' }),
      testCase('U-match', 'Stop the job.', live, { proposedAction: 'control_stop' }),
      testCase('U-miss', 'Stop the job.', live, { proposedAction: 'answer' }),
      testCase('U-miss-blocked', 'Stop the job.', { ...live, stopQualified: false }, { proposedAction: 'answer' }),
    ]
    return doc
  }

  it('in the built report: unlabelled and partially labelled cases are listed apart, never as matches or misses', () => {
    const r = report(labelCorpus())
    checkLabelTallies(r as unknown as TallyView)
    assert.equal(field(r, 'U-partial', 'proposedAction')?.result, 'not_labelled')
    assert.equal(field(r, 'U-partial', 'audience')?.result, 'match')
  })

  it('in the written report from the command line', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, labelCorpus())
      const out = join(dir, 'r.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 0)
      const written = JSON.parse(readFileSync(out, 'utf8'))
      // v4 introduced this list; v5 (r11) keeps it and changes only how abstentions score.
      assert.equal(written.schema, 'sophia.intake-observation.report.v7')
      checkLabelTallies(written)
    })
  })
})

describe('r9 through the consumer: acknowledgement prefixes and transport redelivery addressing', () => {
  const live = {
    audience: 'project',
    activeMission: 'm9',
    control: 'running',
    stopQualified: true,
    holdQualified: true,
  }
  const acks = ['thanks', 'thank you', 'thx', 'got it', 'ok', 'okay', 'great', 'perfect']
  const verbs = { stop: 'control_stop', halt: 'control_stop', hold: 'control_hold', pause: 'control_hold' }

  it('every acknowledgement before every protective verb keeps the control; a bare acknowledgement stays silent', () => {
    const doc = corpus()
    doc.cases = [
      ...acks.flatMap((ack, i) =>
        Object.keys(verbs).map((verb) => testCase(`A-${i}-${verb}`, `${ack} ${verb}`, live, {})),
      ),
      ...Object.keys(verbs).map((verb) => testCase(`B-${verb}`, verb, live, {})),
      ...acks.map((ack, i) => testCase(`S-${i}`, `${ack}!`, live, {})),
    ]
    const r = report(doc)
    assert.equal(r.counts.observed, 44)
    for (const c of r.cases) {
      const verb = c.caseId.split('-').at(-1) as keyof typeof verbs
      const want = c.caseId.startsWith('S-') ? 'no_action' : verbs[verb]
      assert.equal(c.observation.proposal.kind, want, c.caseId)
    }
    assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
  })

  it('redelivery without addressing reports no addressee under automatic and legacy Ask false', () => {
    const doc = corpus()
    const interactions = {
      auto: { contract: 'automatic_v1' },
      legacy: { contract: 'legacy_explicit_ask', askSophia: false },
    }
    doc.cases = Object.entries(interactions).flatMap(([name, interaction]) =>
      [true, false].flatMap((samePayload) => [
        {
          ...testCase(
            `R-${name}-${String(samePayload)}`,
            'Explain it.',
            { audience: 'project', redeliveryOf: 'op9', samePayload },
            {},
          ),
          interaction,
        },
        {
          ...testCase(
            `H-${name}-${String(samePayload)}`,
            'Explain it.',
            { audience: 'project', trustedMentions: ['marta'], redeliveryOf: 'op9', samePayload },
            {},
          ),
          interaction,
        },
      ]),
    )
    const r = report(doc)
    assert.equal(r.counts.observed, 8)
    for (const c of r.cases) {
      const human = c.caseId.startsWith('H-')
      assert.deepEqual(c.observation.addressee.ids, human ? ['marta'] : [], c.caseId)
      assert.equal(c.observation.addressee.basis, human ? 'structured_mention' : 'unresolved', c.caseId)
      assert.equal(c.observation.audience.attention, 'none', c.caseId)
      assert.equal(c.observation.provenance.humanInstruction, false, c.caseId)
      assert.ok(['replay_original', 'conflict'].includes(c.observation.proposal.kind), c.caseId)
    }
    assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
  })
})

describe('r10 through the consumer: unread words after an acknowledgement stay unread', () => {
  const live = {
    audience: 'project',
    activeMission: 'm9',
    control: 'running',
    stopQualified: true,
    holdQualified: true,
  }
  const acks = ['thanks', 'thank you', 'thx', 'got it', 'ok', 'okay', 'great', 'perfect']
  const verbs = ['stop', 'halt', 'hold', 'pause']

  it('each acknowledgement before unread words abstains as the words alone; acknowledgements and requests keep theirs', () => {
    const doc = corpus()
    doc.cases = [
      ...['urgently', 'right'].flatMap((word) =>
        verbs.flatMap((verb) => [
          testCase(`U-${word}-${verb}`, `${word} ${verb} the job`, live, {}),
          ...acks.map((ack, i) => testCase(`AU-${i}-${word}-${verb}`, `${ack} ${word} ${verb} the job`, live, {})),
          testCase(`AC-${word}-${verb}`, `thanks, ${word} ${verb} the job`, live, {}),
        ]),
      ),
      ...acks.map((ack, i) => testCase(`Q-${i}`, `${ack}!`, live, {})),
      testCase('R-stop', 'thanks stop the job', live, {}),
      testCase('R-hold', 'okay, hold the job', live, {}),
    ]
    const r = report(doc)
    assert.equal(r.counts.observed, 2 * 4 * 10 + 8 + 2)
    for (const c of r.cases) {
      const want = c.caseId.startsWith('Q-')
        ? 'no_action'
        : c.caseId === 'R-stop'
          ? 'control_stop'
          : c.caseId === 'R-hold'
            ? 'control_hold'
            : 'abstain'
      assert.equal(c.observation.proposal.kind, want, c.caseId)
      if (want === 'abstain') assert.equal(c.observation.assessment, 'absent_abstained', c.caseId)
    }
    assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
  })
})

describe('r11 (P1 discussion_r4520830068): an abstention is never a semantic match', () => {
  const live = { audience: 'project', activeMission: 'm9', control: 'running', stopQualified: true }
  // The values an abstention reports in the five semantic fields; a label equal to them is still not a match.
  const placeholders = {
    audience: 'unchanged',
    addressee: 'none',
    proposedAction: 'abstain',
    target: 'unresolved',
    clarificationRequired: false,
    admission: 'recorded_only',
    admissionDenialOrWaitReason: null,
    actualObservationModeEffects: { providerInferences: 0, nativeInputs: 0 },
  }
  function abstentionCorpus(): TestDoc {
    const doc = corpus()
    doc.cases = [
      testCase('AB-plain', 'Urgently stop the job.', live, placeholders),
      testCase('AB-prefix', 'Thanks urgently stop the job.', live, placeholders),
      testCase('AB-clause', 'Thanks, urgently stop the job.', live, placeholders),
      testCase('AB-unequal', 'Urgently stop the job.', live, {
        addressee: 'sophia',
        proposedAction: 'control_stop',
        target: 'm9',
        admission: 'admitted',
        admissionDenialOrWaitReason: 'stop_unqualified',
      }),
      testCase('AB-partial', 'Urgently stop the job.', live, { audience: 'unchanged', proposedAction: 'abstain' }),
      testCase('AB-none', 'Urgently stop the job.', live, {}),
      testCase('NA-match', 'Stop the job.', live, {
        addressee: 'sophia',
        proposedAction: 'control_stop',
        // r24 (report v7): a legacy mission string names the id only, so a full match takes the structured label.
        target: { kind: 'mission', id: 'm9', manager: null, generation: null, binding: null },
        admission: 'admitted',
        admissionDenialOrWaitReason: null,
      }),
      testCase('NA-miss', 'Stop the job.', live, { proposedAction: 'answer', target: 'm8' }),
    ]
    return doc
  }
  const expectedFields: Record<string, Record<string, number>> = {
    proposedAction: { match: 1, mismatch: 1, abstained: 5, unassessed: 0, not_labelled: 1, denominator: 7 },
    addressee: { match: 1, mismatch: 0, abstained: 4, unassessed: 0, not_labelled: 3, denominator: 5 },
    target: { match: 1, mismatch: 1, abstained: 4, unassessed: 0, not_labelled: 2, denominator: 6 },
    admission: { match: 0, mismatch: 0, abstained: 4, unassessed: 1, not_labelled: 3, denominator: 5 },
    admissionReason: { match: 1, mismatch: 0, abstained: 4, unassessed: 0, not_labelled: 3, denominator: 5 },
    audience: { match: 4, mismatch: 0, abstained: 0, unassessed: 0, not_labelled: 4, denominator: 4 },
    clarificationRequired: { match: 3, mismatch: 0, abstained: 0, unassessed: 0, not_labelled: 5, denominator: 3 },
    actualEffects: { match: 3, mismatch: 0, abstained: 0, unassessed: 0, not_labelled: 5, denominator: 3 },
  }
  function checkAbstentionReport(r: {
    counts: Record<string, unknown>
    comparison: { fields: Record<string, Record<string, number>>; misses: { caseId: string; result: string }[] }
    actualEffects: Record<string, number>
  }): void {
    assert.equal(r.counts.observed, 8)
    assert.equal(r.counts.abstentions, 6)
    for (const [name, want] of Object.entries(expectedFields)) assert.deepEqual(r.comparison.fields[name], want, name)
    const abstainedMisses = r.comparison.misses.filter((m) => m.result === 'abstained')
    assert.equal(abstainedMisses.length, 21)
    assert.equal(r.comparison.misses.length, 24)
    for (const id of ['AB-plain', 'AB-prefix', 'AB-clause'])
      assert.equal(abstainedMisses.filter((m) => m.caseId === id).length, 5, id)
    assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
  }

  it('in the built report, placeholder-equal labels on an abstention count as abstained, not matched', () => {
    const r = report(abstentionCorpus())
    checkAbstentionReport(r as unknown as Parameters<typeof checkAbstentionReport>[0])
    for (const name of ['addressee', 'proposedAction', 'target', 'admission', 'admissionReason'])
      assert.equal(field(r, 'AB-plain', name)?.result, 'abstained', name)
    assert.equal(field(r, 'AB-partial', 'addressee')?.result, 'not_labelled')
    assert.equal(field(r, 'NA-match', 'admission')?.result, 'unassessed')
  })

  it('in the written report from the command line', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, abstentionCorpus())
      const out = join(dir, 'r.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 0)
      const written = JSON.parse(readFileSync(out, 'utf8'))
      assert.equal(written.schema, 'sophia.intake-observation.report.v7')
      checkAbstentionReport(written)
    })
  })
})

describe('r11 (P2) through the consumer: null, omitted, unqualified and qualified inquiry qualification', () => {
  const known = { audience: 'project', activeMission: 'm11', control: 'running', manager: 'pm11', managerGeneration: 3 }
  const ask = 'Why was that test removed?'
  it('null and unqualified wait; omitted and qualified stay unassessed; retained evidence and held work are unchanged', () => {
    const labels = {
      proposedAction: 'manager_inquiry',
      admission: 'waiting',
      admissionDenialOrWaitReason: 'inquiry_unqualified',
    }
    const doc = corpus()
    doc.cases = [
      testCase('Q-omitted', ask, known, labels),
      testCase('Q-null', ask, { ...known, inquiryGrant: null }, labels),
      testCase('Q-unqualified', ask, { ...known, inquiryGrant: 'unqualified' }, labels),
      testCase('Q-qualified', ask, { ...known, inquiryGrant: 'qualified' }, labels),
      testCase('Q-retained-null', ask, { ...known, retainedEvidence: 'cp7', inquiryGrant: null }, {}),
      testCase('Q-held-null', ask, { ...known, control: 'held', inquiryGrant: null }, {}),
    ]
    const r = report(doc)
    const o = byId(r)
    const observed = (id: string) => {
      const observation = o.get(id)
      assert.ok(observation, id)
      return observation
    }
    const reasons = {
      'Q-null': 'inquiry_unqualified',
      'Q-unqualified': 'inquiry_unqualified',
      'Q-omitted': 'observation_unqualified',
      'Q-qualified': 'observation_unqualified',
      'Q-held-null': 'held_no_fresh_inquiry',
    }
    for (const [id, reason] of Object.entries(reasons)) assert.equal(observed(id).admission.reason, reason, id)
    assert.ok(observed('Q-omitted').uncertainty.includes('inquiry_grant_unknown'))
    assert.ok(!observed('Q-null').uncertainty.includes('inquiry_grant_unknown'))
    assert.equal(observed('Q-retained-null').proposal.kind, 'work_read')
    // Omitted and qualified stay unassessed; their missing wait reason is a real miss against this label.
    const results = {
      'Q-null': ['match', 'match'],
      'Q-unqualified': ['match', 'match'],
      'Q-omitted': ['unassessed', 'mismatch'],
      'Q-qualified': ['unassessed', 'mismatch'],
    }
    for (const [id, want] of Object.entries(results))
      assert.deepEqual([field(r, id, 'admission')?.result, field(r, id, 'admissionReason')?.result], want, id)
    assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
  })
})

/** The r12 consumer cases' expected observations, in a built or a written report. */
function checkR12(cases: { caseId: string; observation: IntakeObservation }[]): void {
  const o = new Map(cases.map((c) => [c.caseId, c.observation]))
  for (const id of ['F-build', 'F-stop', 'F-reply', 'F-personal']) {
    assert.equal(o.get(id)?.proposal.kind, 'abstain', id)
    assert.deepEqual(o.get(id)?.addressee.ids, [], id)
    assert.ok(o.get(id)?.uncertainty.includes('structured_addressing_failed'), id)
  }
  assert.equal(o.get('V-partial')?.proposal.kind, 'human_message')
  assert.equal(o.get('V-empty')?.proposal.kind, 'control_stop')
  assert.equal(o.get('L-thread')?.proposal.targetBasis, 'current_thread')
  assert.equal(o.get('L-selected')?.proposal.targetBasis, 'explicit_selection')
}

describe('r12 through the consumer: failed structured addressing and legacy target provenance', () => {
  const live = {
    audience: 'project',
    activeMission: 'm12',
    control: 'running',
    stopQualified: true,
    selectedArtifact: 'panel@v4',
  }
  function r12Corpus(): TestDoc {
    const doc = corpus()
    const legacyTrue = { contract: 'legacy_explicit_ask', askSophia: true }
    doc.cases = [
      testCase(
        'F-build',
        'Implement the selected panel.',
        { ...live, trustedMentions: ['ines'], currentMembers: ['marta'] },
        {},
      ),
      testCase('F-stop', 'Stop the job.', { ...live, trustedMentions: ['ines'], currentMembers: [] }, {}),
      testCase(
        'F-reply',
        'Stop the job.',
        { ...live, trustedMentions: ['ines'], currentMembers: ['marta'], replyTo: 'm', replyAuthor: 'sophia' },
        {},
      ),
      testCase(
        'F-personal',
        'Explain the panel.',
        { ...live, audience: 'personal', trustedMentions: ['ines'], currentMembers: ['marta'] },
        {},
      ),
      testCase(
        'V-partial',
        'Implement the selected panel.',
        { ...live, trustedMentions: ['marta', 'ines'], currentMembers: ['marta'] },
        {},
      ),
      testCase('V-empty', 'Stop the job.', { ...live, trustedMentions: [] }, {}),
      { ...testCase('L-thread', 'What changed?', { audience: 'project' }, {}), interaction: legacyTrue },
      {
        ...testCase('L-selected', 'What changed?', { audience: 'project', selectedArtifact: 'panel@v4' }, {}),
        interaction: legacyTrue,
      },
    ]
    return doc
  }

  it('in the built report', () => {
    const r = report(r12Corpus())
    checkR12(r.cases)
    assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
  })

  it('in the written report from the command line', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, r12Corpus())
      const out = join(dir, 'r.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 0)
      const written = JSON.parse(readFileSync(out, 'utf8'))
      checkR12(written.cases)
      assert.ok(Object.values(written.actualEffects).every((v) => v === 0))
    })
  })
})

/** A case relabelled with another family (any string, or none). */
const family = (c: TestCase, name: string | null) => ({ ...c, family: name })

/** The r13 consumer corpus: dash-joined acknowledgements, malformed and valid comparisons, prototype-named families. */
function r13Corpus(): TestDoc {
  const doc = corpus()
  const live = {
    audience: 'project',
    activeMission: 'm13',
    control: 'running',
    stopQualified: true,
    holdQualified: true,
  }
  doc.cases = [
    testCase('D-stop', 'Thanks—stop the job.', live, { proposedAction: 'control_stop' }),
    testCase('D-hold', 'okay-hold the job', live, { proposedAction: 'control_hold' }),
    testCase(
      'C-bad',
      'Compare them.',
      { audience: 'project', selectedComparison: ['w@v1:', 'w@v2'] },
      { target: 'w@v1:..v2' },
    ),
    testCase('C-bad-possible', 'Compare them.', { audience: 'project', possibleComparisons: [['w@v1/x', 'w@v2']] }, {}),
    testCase(
      'C-ok',
      'Compare them.',
      { audience: 'project', directAddress: 'sophia', selectedComparison: ['w@v1:intro', 'w@v2:intro'] },
      { target: 'w@v1:intro..v2:intro' },
    ),
    family(testCase('P-1', 'Thanks!', live, {}), '__proto__'),
    family(testCase('P-2', 'Thanks!', live, {}), '__proto__'),
    family(testCase('P-3', 'Thanks!', live, {}), 'constructor'),
    family(testCase('P-4', 'Thanks!', live, {}), 'toString'),
    family(testCase('P-5', 'Thanks!', live, {}), 'hasOwnProperty'),
    family(testCase('P-6', 'Thanks!', live, {}), null),
  ]
  return doc
}

interface R13View {
  cases: { caseId: string; observation: IntakeObservation; comparison: { field: string; result: string }[] }[]
  errors: { caseId?: string; code: string }[]
  counts: {
    observed: number
    invalidCases: number
    noFamily: number
    byFamily: Record<string, unknown>
    byKind: Record<string, unknown>
  }
  actualEffects: Record<string, number>
}

function checkR13(r: R13View): void {
  const o = new Map(r.cases.map((c) => [c.caseId, c]))
  assert.equal(o.get('D-stop')?.observation.proposal.kind, 'control_stop')
  assert.equal(o.get('D-hold')?.observation.proposal.kind, 'control_hold')
  assert.equal(r.counts.invalidCases, 2)
  assert.ok(!o.has('C-bad') && !o.has('C-bad-possible'), 'malformed comparisons are not observed')
  assert.equal(r.errors.filter((e) => e.code === 'unsupported_comparison').length, 2)
  assert.equal(o.get('C-ok')?.comparison.find((f) => f.field === 'target')?.result, 'match')
  const families = r.counts.byFamily
  for (const [name, n] of [
    ['__proto__', 2],
    ['constructor', 1],
    ['toString', 1],
    ['hasOwnProperty', 1],
    ['test_family', 3],
  ] as const) {
    assert.ok(Object.hasOwn(families, name), name)
    assert.equal(families[name], n, name)
  }
  // Report v6 (r22): a null family is no family, counted apart from every explicit one; the sum still covers all.
  assert.ok(!Object.hasOwn(families, 'unlabelled'))
  assert.equal(r.counts.noFamily, 1)
  const values = Object.values(families)
  assert.ok(values.every((v) => typeof v === 'number'))
  assert.equal(
    values.reduce((sum: number, v) => sum + (typeof v === 'number' ? v : 0), 0) + r.counts.noFamily,
    r.counts.observed,
  )
  assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
}

describe('r13 through the consumer: dash-joined acknowledgements, comparison syntax, prototype-safe tallies', () => {
  it('in the built report', () => {
    checkR13(report(r13Corpus()) as unknown as R13View)
    assert.equal(Object.getPrototypeOf({}), Object.prototype)
  })

  it('in the written report from the command line', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, r13Corpus())
      const out = join(dir, 'r.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 1, 'invalid cases exit 1')
      checkR13(JSON.parse(readFileSync(out, 'utf8')))
    })
  })
})

/** The r14 consumer corpus: a supplied date and other exact selections beside generic target lists. */
function r14Corpus(): TestDoc {
  const doc = corpus()
  const base = { audience: 'project', directAddress: 'sophia' }
  const legacyTrue = { contract: 'legacy_explicit_ask', askSophia: true }
  doc.cases = [
    testCase('X-date', 'Remind me.', { ...base, uniqueDate: 'date14' }, { target: 'date14', proposedAction: 'answer' }),
    {
      ...testCase('X-date-legacy', 'Remind me.', { audience: 'project', uniqueDate: 'date14' }, { target: 'date14' }),
      interaction: legacyTrue,
    },
    testCase(
      'X-attach-candidates',
      'Remind me.',
      { ...base, attachment: 'brief@v1', candidates: ['a', 'b'] },
      { target: 'brief@v1' },
    ),
    testCase(
      'X-decision-possible',
      'Remind me.',
      { ...base, uniqueDecision: 'decision14', possibleTargets: ['a', 'b'] },
      { target: 'decision14' },
    ),
    testCase(
      'X-comparison-candidates',
      'Remind me.',
      { ...base, selectedComparison: ['card@v1', 'card@v2'], candidates: ['a', 'b'] },
      { target: 'card@v1..v2' },
    ),
    testCase(
      'X-date-candidates',
      'Remind me.',
      { ...base, uniqueDate: 'date14', candidates: ['a', 'b'] },
      { target: 'date14' },
    ),
    testCase('X-none-candidates', 'Remind me.', { ...base, candidates: ['a', 'b'] }, { clarificationRequired: true }),
  ]
  return doc
}

interface R14View {
  cases: { caseId: string; observation: IntakeObservation; comparison: { field: string; result: string }[] }[]
  actualEffects: Record<string, number>
}

function checkR14(r: R14View): void {
  const o = new Map(r.cases.map((c) => [c.caseId, c]))
  for (const id of [
    'X-date',
    'X-date-legacy',
    'X-attach-candidates',
    'X-decision-possible',
    'X-comparison-candidates',
    'X-date-candidates',
  ]) {
    const c = o.get(id)
    assert.equal(c?.observation.proposal.targetBasis, 'explicit_selection', id)
    assert.equal(c?.comparison.find((f) => f.field === 'target')?.result, 'match', id)
  }
  assert.equal(o.get('X-none-candidates')?.observation.proposal.rule, 'target.ambiguous')
  assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
}

describe('r14 through the consumer: supplied dates and exact selections beside generic lists', () => {
  it('in the built report', () => {
    checkR14(report(r14Corpus()) as unknown as R14View)
  })

  it('in the written report from the command line', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, r14Corpus())
      const out = join(dir, 'r.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 0)
      checkR14(JSON.parse(readFileSync(out, 'utf8')))
    })
  })
})

/** The r15 consumer corpus: no-reply hints, malformed quotation and exact build selections. */
function r15Corpus(): TestDoc {
  const doc = corpus()
  const base = { audience: 'project', directAddress: 'sophia', selectedArtifact: 'plan@v3' }
  const repo = { audience: 'project', directAddress: 'sophia', repo: 'repo15' }
  doc.cases = [
    testCase('N-explain', 'Explain the plan.', { ...base, needsReply: false }, { proposedAction: 'answer' }),
    testCase('N-tell', 'Tell me the answer.', { ...base, needsReply: false }, { proposedAction: 'answer' }),
    testCase('N-question', 'What changed?', { ...base, needsReply: false }, { proposedAction: 'no_action' }),
    testCase('M-quote', 'Explain "the plan.', { ...base, needsReply: false }, {}),
    testCase('M-backtick', 'What is `this?', { ...base, needsReply: false }, {}),
    testCase(
      'B-attach',
      'Implement this change.',
      { ...repo, attachment: 'spec@frozen-7', candidates: ['a', 'b'] },
      {
        target: 'repo15/spec@frozen-7',
      },
    ),
    testCase('B-date', 'Implement this change.', { ...repo, uniqueDate: 'date15', possibleTargets: ['a', 'b'] }, {}),
  ]
  return doc
}

interface R15View {
  cases: { caseId: string; observation: IntakeObservation; comparison: { field: string; result: string }[] }[]
  actualEffects: Record<string, number>
}

function checkR15(r: R15View): void {
  const o = new Map(r.cases.map((c) => [c.caseId, c.observation]))
  assert.equal(o.get('N-explain')?.proposal.kind, 'answer')
  assert.equal(o.get('N-tell')?.proposal.kind, 'answer')
  assert.equal(o.get('N-question')?.proposal.kind, 'no_action')
  for (const id of ['M-quote', 'M-backtick']) {
    assert.equal(o.get(id)?.proposal.kind, 'abstain', id)
    assert.ok(o.get(id)?.uncertainty.includes('malformed_quotation'), id)
  }
  assert.deepEqual(o.get('B-attach')?.proposal.target, {
    kind: 'repository_work',
    repo: 'repo15',
    item: 'spec@frozen-7',
  })
  assert.equal(o.get('B-attach')?.proposal.targetBasis, 'explicit_selection')
  assert.equal(
    r.cases.find((c) => c.caseId === 'B-attach')?.comparison.find((f) => f.field === 'target')?.result,
    'match',
  )
  assert.equal(o.get('B-date')?.proposal.rule, 'family.build_selection_unsupported')
  assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
}

describe('r15 through the consumer: no-reply hints, malformed quotation and exact build selections', () => {
  it('in the built report', () => {
    checkR15(report(r15Corpus()) as unknown as R15View)
  })

  it('in the written report from the command line', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, r15Corpus())
      const out = join(dir, 'r.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 0)
      checkR15(JSON.parse(readFileSync(out, 'utf8')))
    })
  })
})

/** The r16 consumer corpus: the accepted-version wait follows the item the build consumes. */
function r16Corpus(): TestDoc {
  const doc = corpus()
  const base = { audience: 'project', directAddress: 'sophia', repo: 'repo16', acceptedVersion: 'r8' }
  const text = 'Implement the requested change.'
  const wait = { admissionDenialOrWaitReason: 'selected_version_not_accepted' }
  doc.cases = [
    testCase('V-issue', text, { ...base, issue: '#431' }, { target: 'repo16/issue#431', ...wait }),
    testCase(
      'V-issue-match',
      text,
      { ...base, issue: '#431', attachment: 'ignored@r8' },
      { target: 'repo16/issue#431', ...wait },
    ),
    testCase(
      'V-issue-other',
      text,
      { ...base, issue: '#77', attachment: 'ignored@r8' },
      { target: 'repo16/issue#77', ...wait },
    ),
    testCase(
      'V-attach-match',
      text,
      { ...base, attachment: 'att@r8' },
      { target: 'repo16/att@r8', admissionDenialOrWaitReason: null },
    ),
    testCase('V-attach-miss', text, { ...base, attachment: 'att@r7' }, { target: 'repo16/att@r7', ...wait }),
    testCase(
      'V-selected',
      text,
      { ...base, selectedArtifact: 'card@r7', attachment: 'att@r8' },
      { target: 'repo16/card@r7', ...wait },
    ),
    testCase(
      'V-selected-match',
      text,
      { ...base, selectedArtifact: 'card@r8', attachment: 'att@r7' },
      { target: 'repo16/card@r8', admissionDenialOrWaitReason: null },
    ),
  ]
  return doc
}

interface R16View {
  cases: { caseId: string; comparison: { field: string; result: string }[] }[]
  actualEffects: Record<string, number>
}

function checkR16(r: R16View): void {
  for (const c of r.cases)
    for (const name of ['target', 'admissionReason'])
      assert.equal(c.comparison.find((f) => f.field === name)?.result, 'match', `${c.caseId} ${name}`)
  assert.equal(r.cases.length, 7)
  assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
}

describe('r16 through the consumer: the accepted-version wait follows the consumed build item', () => {
  it('in the built report', () => {
    checkR16(report(r16Corpus()) as unknown as R16View)
  })

  it('in the written report from the command line', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, r16Corpus())
      const out = join(dir, 'r.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 0)
      checkR16(JSON.parse(readFileSync(out, 'utf8')))
    })
  })
})

/** The r17 consumer corpus: complete import spans and distinct candidates, through the report and the CLI. */
function r17Corpus(): TestDoc {
  const doc = corpus()
  const live = {
    audience: 'project',
    activeMission: 'm17',
    control: 'running',
    stopQualified: true,
    holdQualified: true,
  }
  const project = { audience: 'project', directAddress: 'sophia' }
  doc.cases = [
    testCase('I-ping', 'Stopping the job.', { ...live, quotedText: 'ping' }, { proposedAction: 'control_stop' }),
    testCase(
      'I-ing',
      'Holding the job.',
      { ...live, attachmentInstruction: 'ing' },
      { proposedAction: 'control_hold' },
    ),
    testCase('I-mark', 'Stoṕ the job.', { ...live, quotedText: '́' }, { proposedAction: 'control_stop' }),
    testCase(
      'I-suffix',
      '"Stoppe den Job" stop the job.',
      { ...live, quotedText: 'Stoppe den Job' },
      { proposedAction: 'control_stop' },
    ),
    testCase(
      'I-whole',
      'Thanks—stop the job.',
      { ...live, quotedText: 'stop the job' },
      { proposedAction: 'no_action' },
    ),
    testCase('U-targets', 'Explain the card.', { ...project, possibleTargets: ['card@v1', 'card@v1'] }, {}),
    testCase(
      'U-pairs',
      'Compare the cards.',
      {
        ...project,
        possibleComparisons: [
          ['card@v1', 'card@v2'],
          ['card@v1', 'card@v2'],
        ],
      },
      {},
    ),
    testCase(
      'U-ordered',
      'Compare the cards.',
      {
        ...project,
        possibleComparisons: [
          ['card@v1', 'card@v2'],
          ['card@v2', 'card@v1'],
        ],
      },
      {},
    ),
    testCase('U-repos', 'Implement the card.', { ...project, possibleRepos: ['web', 'web'] }, {}),
    testCase('O-1', 'Also cover the error state.', { ...live, operationId: 'op17' }, {}),
    testCase('O-2', 'Also remove the header.', { ...live, operationId: 'op17' }, {}),
  ]
  return doc
}

interface R17View {
  cases: { caseId: string; observation: IntakeObservation; comparison: { field: string; result: string }[] }[]
  actualEffects: Record<string, number>
}

function checkR17(r: R17View): void {
  const o = new Map(r.cases.map((c) => [c.caseId, c]))
  checkR17Imports(o)
  checkR17Candidates(o)
  // Each case is its own scenario with a fresh ledger: the CLI makes no cross-case operation claim.
  for (const id of ['O-1', 'O-2']) assert.notEqual(o.get(id)?.observation.proposal.kind, 'conflict', id)
  assert.equal(r.cases.length, 11)
  assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
}

function checkR17Imports(o: Map<string, R17View['cases'][number]>): void {
  for (const id of ['I-ping', 'I-ing', 'I-mark']) {
    const c = o.get(id)
    assert.equal(c?.observation.proposal.kind, 'abstain', id)
    assert.ok(c?.observation.uncertainty.includes('malformed_quotation'), id)
    // The label wants the command the sliced text would have shown: an abstention is never that match.
    assert.notEqual(c?.comparison.find((f) => f.field === 'proposedAction')?.result, 'match', id)
  }
  for (const id of ['I-suffix', 'I-whole'])
    assert.equal(o.get(id)?.comparison.find((f) => f.field === 'proposedAction')?.result, 'match', id)
}

function checkR17Candidates(o: Map<string, R17View['cases'][number]>): void {
  assert.equal(o.get('U-targets')?.observation.proposal.kind, 'answer')
  assert.equal(o.get('U-pairs')?.observation.proposal.kind, 'answer')
  assert.deepEqual(o.get('U-ordered')?.observation.uncertainty, ['multiple_plausible_comparisons'])
  assert.equal(o.get('U-repos')?.observation.proposal.rule, 'family.build_without_repository')
  for (const id of ['U-targets', 'U-pairs', 'U-repos'])
    assert.notEqual(o.get(id)?.observation.proposal.rule, 'target.ambiguous', id)
}

describe('r17 through the consumer: complete import spans and distinct candidates', () => {
  it('in the built report', () => {
    checkR17(report(r17Corpus()) as unknown as R17View)
  })

  it('in the written report from the command line', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, r17Corpus())
      const out = join(dir, 'r.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 0)
      checkR17(JSON.parse(readFileSync(out, 'utf8')))
    })
  })
})

/** A case whose family metadata is any value at all, valid or not. */
const withFamily = (c: TestCase, value: unknown) => ({ ...c, family: value })

/** The r18 consumer corpus: repeated recipients, and family metadata that is a string, absent, null or invalid. */
function r18Corpus(): TestDoc {
  const doc = corpus()
  const live = { audience: 'project', activeMission: 'm18', control: 'running' }
  const text = 'Can you check the panel?'
  const plain = (id: string) => testCase(id, 'Thanks!', live, {})
  const { family: _omitted, ...absent } = plain('F-absent')
  doc.cases = [
    testCase(
      'R-repeat',
      text,
      { ...live, trustedMentions: ['person-a', 'person-a'], currentMembers: ['person-a'] },
      { addressee: 'person-a' },
    ),
    testCase(
      'R-mixed',
      text,
      { ...live, trustedMentions: ['person-b', 'person-a', 'person-b', 'person-a'] },
      { addressee: 'person-a+person-b' },
    ),
    testCase(
      'R-order',
      text,
      { ...live, trustedMentions: ['person-a', 'person-b', 'person-a'] },
      { addressee: 'person-a+person-b' },
    ),
    withFamily(plain('F-number'), 42),
    withFamily(plain('F-false'), false),
    withFamily(plain('F-array'), []),
    withFamily(plain('F-object'), {}),
    withFamily(plain('F-null'), null),
    absent,
    withFamily(plain('F-proto'), '__proto__'),
    withFamily(plain('F-constructor'), 'constructor'),
    withFamily(plain('F-string'), 'acks'),
  ]
  return doc
}

interface R18View {
  cases: { caseId: string; observation: IntakeObservation; comparison: { field: string; result: string }[] }[]
  errors: { index?: number; caseId?: string | null; code: string; path?: string }[]
  counts: { cases: number; observed: number; invalidCases: number; noFamily: number; byFamily: Record<string, unknown> }
  actualEffects: Record<string, number>
}

function checkR18Recipients(r: R18View): void {
  const o = new Map(r.cases.map((c) => [c.caseId, c]))
  assert.deepEqual(o.get('R-repeat')?.observation.addressee.ids, ['person-a'])
  assert.deepEqual(o.get('R-mixed')?.observation.addressee.ids, ['person-b', 'person-a'])
  assert.deepEqual(o.get('R-order')?.observation.addressee.ids, ['person-a', 'person-b'])
  for (const id of ['R-repeat', 'R-mixed', 'R-order'])
    assert.equal(o.get(id)?.comparison.find((f) => f.field === 'addressee')?.result, 'match', id)
  assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
}

function checkR18Families(r: R18View): void {
  const observed = new Set(r.cases.map((c) => c.caseId))
  const invalid = ['F-number', 'F-false', 'F-array', 'F-object']
  for (const [i, id] of invalid.entries()) {
    assert.ok(!observed.has(id), `${id} is not observed`)
    assert.deepEqual(
      r.errors.find((e) => e.caseId === id),
      { index: i + 3, caseId: id, code: 'invalid_family', path: `cases[${String(i + 3)}].family` },
      id,
    )
  }
  assert.equal(r.counts.cases, 12)
  assert.equal(r.counts.invalidCases, 4)
  assert.equal(r.counts.observed, 8)
  assert.equal(r.counts.observed + r.counts.invalidCases, r.counts.cases)
  const families = r.counts.byFamily
  // Report v6 (r22): absent and null are no family, counted apart; no explicit family here is named unlabelled.
  assert.equal(r.counts.noFamily, 2)
  assert.ok(!Object.hasOwn(families, 'unlabelled'))
  for (const [name, n] of [
    ['__proto__', 1],
    ['constructor', 1],
    ['acks', 1],
    ['test_family', 3],
  ] as const) {
    assert.ok(Object.hasOwn(families, name), name)
    assert.equal(families[name], n, name)
  }
}

/** The written report and its exit status, from the command line. */
function writtenR18(): { status: number | null; report: R18View } {
  let written: { status: number | null; report: R18View } | undefined
  withTmp((dir) => {
    const { path, hash } = writeCorpus(dir, r18Corpus())
    const out = join(dir, 'r.json')
    const status = run(['--input', path, '--input-sha256', hash, '--out', out]).status
    written = { status, report: JSON.parse(readFileSync(out, 'utf8')) as R18View }
  })
  assert.ok(written !== undefined)
  return written
}

describe('r18 through the consumer: distinct recipients and explicit family metadata', () => {
  it('recipients in the built report', () => {
    checkR18Recipients(report(r18Corpus()) as unknown as R18View)
  })

  it('families, errors and the denominator in the built report', () => {
    checkR18Families(report(r18Corpus()) as unknown as R18View)
  })

  it('recipients in the written report from the command line', () => {
    checkR18Recipients(writtenR18().report)
  })

  it('families in the written report, and the command line exits 1 for the invalid cases', () => {
    const written = writtenR18()
    assert.equal(written.status, 1)
    checkR18Families(written.report)
  })
})

/** The r19 consumer corpus: redeliveries keep their original operation as the correlation; origin controls. */
function r19Corpus(): TestDoc {
  const doc = corpus()
  const live = { audience: 'project', activeMission: 'm19', control: 'running', stopQualified: true }
  const text = 'Stop the job.'
  doc.cases = [
    testCase('D-same', text, { ...live, redeliveryOf: 'op19', samePayload: true }, {}),
    testCase('D-changed', text, { ...live, redeliveryOf: 'op19', samePayload: false }, {}),
    testCase('D-unknown', text, { ...live, redeliveryOf: 'op19' }, {}),
    testCase('D-admission', text, { ...live, redeliveryOf: 'op19', originalAdmission: 'adm19', samePayload: true }, {}),
    testCase('D-supplied', text, { ...live, redeliveryOf: 'op19', causedBy: 'cause19', samePayload: false }, {}),
    {
      ...testCase('D-legacy-false', text, { ...live, redeliveryOf: 'op19', samePayload: true }, {}),
      interaction: { contract: 'legacy_explicit_ask', askSophia: false },
    },
    testCase('C-generated', text, { ...live, redeliveryOf: 'op19', origin: 'generated', causedBy: 'cause19' }, {}),
    testCase('C-fresh', text, { ...live, operationId: 'op-fresh' }, {}),
  ]
  return doc
}

interface R19View {
  cases: { caseId: string; observation: IntakeObservation }[]
  counts: { cases: number; observed: number; invalidCases: number }
  actualEffects: Record<string, number>
}

function checkR19(r: R19View): void {
  const o = new Map(r.cases.map((c) => [c.caseId, c.observation]))
  for (const [id, want] of [
    ['D-same', 'op19'],
    ['D-changed', 'op19'],
    ['D-unknown', 'op19'],
    ['D-admission', 'adm19'],
    ['D-supplied', 'op19'],
    ['D-legacy-false', 'op19'],
  ] as const) {
    const obs = o.get(id)
    assert.ok(obs !== undefined && obs.proposal.rule.startsWith('identity.redelivery'), id)
    assert.equal(obs.provenance.correlation, want, id)
    assert.deepEqual(obs.proposal.target, { kind: 'operation', id: want, newTarget: null }, id)
  }
  assert.equal(o.get('C-generated')?.proposal.rule, 'origin.output_not_instruction')
  assert.equal(o.get('C-generated')?.provenance.correlation, 'cause19')
  assert.equal(o.get('C-fresh')?.provenance.correlation, 'op-fresh')
  assert.deepEqual([r.counts.cases, r.counts.observed, r.counts.invalidCases], [8, 8, 0])
  assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
}

describe('r19 through the consumer: redelivery correlation', () => {
  it('in the built report', () => {
    checkR19(report(r19Corpus()))
  })

  it('in the written report from the command line', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, r19Corpus())
      const out = join(dir, 'r.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 0)
      checkR19(JSON.parse(readFileSync(out, 'utf8')))
    })
  })
})

/** The r20 consumer corpus: quiet mixed addressees, and whole-code-point quote boundaries, with ASCII controls. */
function r20Corpus(): TestDoc {
  const doc = corpus()
  const live = { audience: 'project', activeMission: 'm20', control: 'running', stopQualified: true }
  const quiet = { audience: 'project', needsReply: false }
  const L = '\u{10400}'
  doc.cases = [
    testCase('Q-ack', 'Thanks.', { ...quiet, trustedMentions: ['maria', 'sophia'] }, { addressee: 'maria+sophia' }),
    testCase(
      'Q-question',
      'What changed?',
      { ...quiet, trustedMentions: ['luis', 'maria', 'sophia', 'luis'] },
      { addressee: 'luis+maria+sophia' },
    ),
    testCase(
      'Q-remark-drop',
      'Lorem ipsum.',
      { ...quiet, trustedMentions: ['maria', 'gone', 'sophia'], currentMembers: ['maria'] },
      { addressee: 'maria+sophia' },
    ),
    testCase('U-possessive', `Stop ${L}'s job.`, live, { proposedAction: 'control_stop' }),
    testCase('U-prefix-right', `Stop l'${L} now.`, live, { proposedAction: 'control_stop' }),
    testCase('U-prefix-left', `Stop ${L}o'x job.`, live, {}),
    testCase('U-suffix', `Stop x're${L} job.`, live, {}),
    testCase('U-pair-right', `Stop 'note'${L}.`, live, {}),
    testCase('U-pair-left', `Stop ${L}'note' now.`, live, {}),
    testCase('A-pair-right', "Stop 'note'A.", live, {}),
    testCase('A-possessive', "Stop A's job.", live, { proposedAction: 'control_stop' }),
  ]
  return doc
}

interface R20View {
  cases: readonly {
    caseId: string
    observation: IntakeObservation
    comparison: readonly { field: string; result: string }[]
  }[]
  counts: { cases: number; observed: number; invalidCases: number }
  actualEffects: Record<string, number>
}

function checkR20(r: R20View): void {
  const o = new Map(r.cases.map((c) => [c.caseId, c]))
  for (const id of ['Q-ack', 'Q-question', 'Q-remark-drop']) {
    const c = o.get(id)
    assert.equal(c?.observation.proposal.rule, 'family.no_reply_needed', id)
    assert.equal(c.comparison.find((f) => f.field === 'addressee')?.result, 'match', id)
  }
  assert.deepEqual(o.get('Q-question')?.observation.addressee.ids, ['luis', 'maria', 'sophia'])
  for (const id of ['U-possessive', 'U-prefix-right', 'A-possessive'])
    assert.equal(o.get(id)?.comparison.find((f) => f.field === 'proposedAction')?.result, 'match', id)
  for (const id of ['U-prefix-left', 'U-suffix', 'U-pair-right', 'U-pair-left', 'A-pair-right']) {
    const obs = o.get(id)?.observation
    assert.equal(obs?.proposal.kind, 'abstain', id)
    assert.ok(obs.uncertainty.includes('malformed_quotation'), id)
  }
  assert.deepEqual([r.counts.cases, r.counts.observed, r.counts.invalidCases], [11, 11, 0])
  assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
}

describe('r20 through the consumer: quiet mixed addressees and whole-code-point boundaries', () => {
  it('in the built report', () => {
    checkR20(report(r20Corpus()))
  })

  it('in the written report from the command line', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, r20Corpus())
      const out = join(dir, 'r.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 0)
      checkR20(JSON.parse(readFileSync(out, 'utf8')))
    })
  })
})

/** The r21 consumer corpus: original unknown-effect reconciliation beside current negatives, with controls. */
function r21Corpus(): TestDoc {
  const doc = corpus()
  const base = { audience: 'project', trustedMentions: ['sophia'], originalOperation: 'op21' }
  doc.cases = [
    testCase(
      'R-possibly-source',
      'Try again.',
      { ...base, dispatchState: 'possibly_sent', currentSourceEligible: false },
      {},
    ),
    testCase(
      'R-unknown-pin',
      'Try again.',
      { ...base, dispatchState: 'outcome_unknown', pin: 'pin21', pinUnavailable: true },
      {},
    ),
    testCase(
      'R-unknown-delegation',
      'Try again.',
      { ...base, dispatchState: 'outcome_unknown', resourceOwner: 'luis', requester: 'maria' },
      {},
    ),
    testCase(
      'C-replacement',
      'Switch it to v3.',
      { ...base, dispatchState: 'possibly_sent', newTarget: 'card@v3', grantRevokedBeforeSend: true },
      {},
    ),
    testCase(
      'C-new-target',
      'Switch it to v3.',
      { ...base, dispatchState: 'not_sent', newTarget: 'card@v3', currentActorAuthorized: false },
      {},
    ),
  ]
  return doc
}

interface R21View {
  cases: readonly { caseId: string; observation: IntakeObservation }[]
  counts: { cases: number; observed: number; invalidCases: number }
  actualEffects: Record<string, number>
}

function checkR21(r: R21View): void {
  const o = new Map(r.cases.map((c) => [c.caseId, c.observation]))
  for (const id of ['R-possibly-source', 'R-unknown-pin', 'R-unknown-delegation']) {
    const obs = o.get(id)
    assert.equal(obs?.proposal.kind, 'reconcile_original', id)
    assert.deepEqual(obs.proposal.target, { kind: 'operation', id: 'op21', newTarget: null }, id)
    assert.deepEqual(
      obs.admission,
      { outcome: 'reconciliation_required', reason: 'original_effect_outcome_unknown', authority: 'none' },
      id,
    )
  }
  assert.deepEqual(o.get('C-replacement')?.admission, { outcome: 'denied', reason: 'grant_revoked', authority: 'none' })
  assert.deepEqual(o.get('C-new-target')?.admission, {
    outcome: 'denied',
    reason: 'actor_unauthorized',
    authority: 'none',
  })
  assert.deepEqual([r.counts.cases, r.counts.observed, r.counts.invalidCases], [5, 5, 0])
  assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
}

describe('r21 through the consumer: original unknown-effect reconciliation', () => {
  it('in the built report', () => {
    checkR21(report(r21Corpus()))
  })

  it('in the written report from the command line', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, r21Corpus())
      const out = join(dir, 'r.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 0)
      checkR21(JSON.parse(readFileSync(out, 'utf8')))
    })
  })
})

/** The r22 consumer corpus: family metadata kept apart from missing metadata, and addressee identity by set. */
function r22Corpus(): TestDoc {
  const doc = corpus()
  const shared = { audience: 'project' }
  const to = (ids: string[]) => ({ ...shared, trustedMentions: ids })
  const plain = (id: string) => testCase(id, 'Thanks.', shared, {})
  const { family: _omitted, ...absent } = plain('F-absent')
  const addressed = (id: string, ids: string[], label: unknown) =>
    testCase(id, 'Thanks.', to(ids), { addressee: label })
  doc.cases = [
    absent,
    withFamily(plain('F-null'), null),
    withFamily(plain('F-literal'), 'unlabelled'),
    withFamily(plain('F-empty'), ''),
    withFamily(plain('F-proto'), '__proto__'),
    withFamily(plain('F-constructor'), 'constructor'),
    withFamily(plain('F-none'), 'none'),
    addressed('A-none-id-vs-none', ['none'], 'none'),
    addressed('A-none-id-array', ['none'], ['none']),
    addressed('A-none-id-json', ['none'], '["none"]'),
    addressed('A-plus-id-vs-two', ['a+b'], 'a+b'),
    addressed('A-plus-id-array', ['a+b'], ['a+b']),
    addressed('A-two-compact', ['a', 'b'], 'a+b'),
    addressed('A-two-vs-plus-array', ['a', 'b'], ['a+b']),
    addressed('A-left-vs-three', ['a+b', 'c'], 'a+b+c'),
    addressed('A-left-array', ['a+b', 'c'], ['c', 'a+b']),
    addressed('A-right-vs-left', ['a', 'b+c'], ['a+b', 'c']),
    addressed('A-right-array', ['a', 'b+c'], ['a', 'b+c']),
    addressed('A-three-compact', ['a', 'b', 'c'], 'a+b+c'),
    testCase('A-empty-none', 'Thanks.', shared, { addressee: 'none' }),
    testCase('A-empty-array', 'Thanks.', shared, { addressee: [] }),
    testCase('A-empty-vs-none-id', 'Thanks.', shared, { addressee: ['none'] }),
    addressed('A-bad-empty-segment', ['a', 'b'], 'a++b'),
    addressed('A-bad-none-segment', ['a', 'none'], 'a+none'),
    addressed('A-bad-repeat', ['a'], ['a', 'a']),
    addressed('A-bad-type', ['a'], [1]),
    addressed('A-bad-empty-string', ['a'], ''),
    addressed('O-human-none-id', ['none', 'sophia'], ['none']),
    addressed('O-two-humans', ['a', 'b', 'sophia'], 'a+b'),
    addressed('O-none-label', ['sophia'], 'none'),
  ]
  return doc
}

interface R22View {
  cases: readonly {
    caseId: string
    observation: IntakeObservation
    comparison: readonly { field: string; result: string; observed?: unknown }[]
  }[]
  counts: { cases: number; observed: number; invalidCases: number; noFamily: number; byFamily: Record<string, unknown> }
  developmentTallies: { explicitHumanAddressOverrides: string[] }
  actualEffects: Record<string, number>
}

const R22_RESULTS: Record<string, string> = {
  'A-none-id-vs-none': 'mismatch',
  'A-none-id-array': 'match',
  'A-none-id-json': 'match',
  'A-plus-id-vs-two': 'mismatch',
  'A-plus-id-array': 'match',
  'A-two-compact': 'match',
  'A-two-vs-plus-array': 'mismatch',
  'A-left-vs-three': 'mismatch',
  'A-left-array': 'match',
  'A-right-vs-left': 'mismatch',
  'A-right-array': 'match',
  'A-three-compact': 'match',
  'A-empty-none': 'match',
  'A-empty-array': 'match',
  'A-empty-vs-none-id': 'mismatch',
  'A-bad-empty-segment': 'mismatch',
  'A-bad-none-segment': 'mismatch',
  'A-bad-repeat': 'mismatch',
  'A-bad-type': 'mismatch',
  'A-bad-empty-string': 'mismatch',
}

function checkR22Families(r: R22View): void {
  assert.equal(r.counts.noFamily, 2, 'absent and null only')
  const families = r.counts.byFamily
  for (const [name, n] of [
    ['unlabelled', 1],
    ['', 1],
    ['__proto__', 1],
    ['constructor', 1],
    ['none', 1],
    ['test_family', 23],
  ] as const) {
    assert.ok(Object.hasOwn(families, name), name)
    assert.equal(families[name], n, name)
  }
  const sum = Object.values(families).reduce((s: number, v) => s + (typeof v === 'number' ? v : 0), 0)
  assert.equal(sum + r.counts.noFamily, r.counts.observed)
  assert.deepEqual([r.counts.cases, r.counts.observed, r.counts.invalidCases], [30, 30, 0])
  assert.equal(Object.getPrototypeOf({}), Object.prototype)
}

function checkR22Recipients(r: R22View): void {
  const byCase = new Map(r.cases.map((c) => [c.caseId, c]))
  for (const [id, want] of Object.entries(R22_RESULTS))
    assert.equal(byCase.get(id)?.comparison.find((f) => f.field === 'addressee')?.result, want, id)
  const observedOf = (id: string) => byCase.get(id)?.comparison.find((f) => f.field === 'addressee')?.observed
  assert.deepEqual(
    ['A-none-id-array', 'A-plus-id-array', 'A-two-compact', 'A-left-array', 'A-right-array', 'A-empty-none'].map(
      observedOf,
    ),
    ['["none"]', '["a+b"]', 'a+b', '["a+b","c"]', '["a","b+c"]', 'none'],
  )
  assert.deepEqual(r.developmentTallies.explicitHumanAddressOverrides.toSorted(), ['O-human-none-id', 'O-two-humans'])
  assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
}

describe('r22 through the consumer: family buckets and addressee identity', () => {
  it('families in the built report', () => {
    checkR22Families(report(r22Corpus()) as unknown as R22View)
  })

  it('recipients in the built report', () => {
    checkR22Recipients(report(r22Corpus()) as unknown as R22View)
  })

  it('families and recipients in the written report from the command line', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, r22Corpus())
      const out = join(dir, 'r.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 0)
      const written = JSON.parse(readFileSync(out, 'utf8')) as R22View & { schema: string }
      assert.equal(written.schema, 'sophia.intake-observation.report.v7')
      checkR22Families(written)
      checkR22Recipients(written)
    })
  })
})

/**
 * The r23 consumer corpus: a case's identity is owned by its first occurrence before any of its fields are checked.
 * Every id and word here is synthetic; labels are comparison data only.
 */
function r23Corpus(): TestDoc {
  const doc = corpus()
  const ok = { audience: 'project' }
  const plain = (id: unknown, more: Record<string, unknown> = {}): TestCase => ({
    ...testCase('', 'Thanks.', ok, {}),
    caseId: id,
    ...more,
  })
  const { caseId: _missing, ...noId } = plain('dropped')
  doc.cases = [
    plain('R-fam-first', { family: true }),
    plain('R-fam-first'),
    plain('R-exp-first', { expected: [] }),
    plain('R-exp-first'),
    plain('R-extra-first', { extraMetadata: 1 }),
    plain('R-extra-first'),
    plain('R-rev-family'),
    plain('R-rev-family', { family: true }),
    plain('R-rev-expected'),
    plain('R-rev-expected', { expected: 'x' }),
    plain('R-rev-extra'),
    plain('R-rev-extra', { extraMetadata: 1 }),
    plain('R-both-invalid', { family: 1 }),
    plain('R-both-invalid', { expected: [] }),
    plain('R-policy-first', { context: { audience: 'nowhere' } }),
    plain('R-policy-first'),
    plain('R-valid-valid'),
    plain('R-valid-valid'),
    plain('R-no-policy-run', { family: true }),
    plain('R-no-policy-run', { context: { audience: 'nowhere' } }),
    plain('R-distinct-a', { family: true }),
    plain('R-distinct-b'),
    plain('Id'),
    plain('id'),
    plain(' w'),
    plain('w'),
    plain('__proto__', { family: true }),
    plain('__proto__'),
    plain('constructor'),
    plain('constructor'),
    plain('hasOwnProperty'),
    plain(0),
    plain('0'),
    plain(''),
    noId,
    plain('L'.repeat(201)),
    plain('L'.repeat(200)),
    plain(null),
    plain(['x']),
    plain('x'),
  ]
  return doc
}

interface R23View {
  schema?: string
  cases: readonly { caseId: string; observation: IntakeObservation }[]
  errors: readonly { index: number; caseId: string | null; code: string; path: string }[]
  counts: { cases: number; observed: number; invalidCases: number; errorIssues: number }
  actualEffects: Record<string, number>
}

const dup = (index: number, caseId: string) => ({
  index,
  caseId,
  code: 'duplicate_case_id',
  path: `cases[${String(index)}].caseId`,
})
const own = (index: number, caseId: string | null, code: string, path: string) => ({
  index,
  caseId,
  code,
  path: `cases[${String(index)}]${path}`,
})

/** Each occurrence's one error, in input order: the first occurrence's own, then exactly duplicate_case_id. */
const R23_ERRORS = [
  own(0, 'R-fam-first', 'invalid_family', '.family'),
  dup(1, 'R-fam-first'),
  own(2, 'R-exp-first', 'invalid_expected', '.expected'),
  dup(3, 'R-exp-first'),
  own(4, 'R-extra-first', 'unknown_case_field', '.extraMetadata'),
  dup(5, 'R-extra-first'),
  dup(7, 'R-rev-family'),
  dup(9, 'R-rev-expected'),
  dup(11, 'R-rev-extra'),
  own(12, 'R-both-invalid', 'invalid_family', '.family'),
  dup(13, 'R-both-invalid'),
  own(14, 'R-policy-first', 'invalid_field', '.context.audience'),
  dup(15, 'R-policy-first'),
  dup(17, 'R-valid-valid'),
  own(18, 'R-no-policy-run', 'invalid_family', '.family'),
  // Its own input is invalid for the policy too; as a later occurrence it never reaches the policy.
  dup(19, 'R-no-policy-run'),
  own(20, 'R-distinct-a', 'invalid_family', '.family'),
  own(26, '__proto__', 'invalid_family', '.family'),
  dup(27, '__proto__'),
  dup(29, 'constructor'),
  own(31, null, 'invalid_case_id', '.caseId'),
  own(33, null, 'invalid_case_id', '.caseId'),
  own(34, null, 'invalid_case_id', '.caseId'),
  own(35, null, 'invalid_case_id', '.caseId'),
  own(37, null, 'invalid_case_id', '.caseId'),
  own(38, null, 'invalid_case_id', '.caseId'),
]

/** Observed, in input order: each the first, valid occurrence of its id; invalid ids reserve nothing. */
const R23_RECORDS = [
  'R-rev-family',
  'R-rev-expected',
  'R-rev-extra',
  'R-valid-valid',
  'R-distinct-b',
  'Id',
  'id',
  ' w',
  'w',
  'constructor',
  'hasOwnProperty',
  '0',
  'L'.repeat(200),
  'x',
]

function checkR23(r: R23View): void {
  assert.deepEqual(
    r.errors.map((e) => ({ index: e.index, caseId: e.caseId, code: e.code, path: e.path })),
    R23_ERRORS,
  )
  assert.deepEqual(
    r.cases.map((c) => c.caseId),
    R23_RECORDS,
  )
  assert.deepEqual([r.counts.cases, r.counts.observed, r.counts.invalidCases, r.counts.errorIssues], [40, 14, 26, 26])
  assert.equal(r.counts.observed + r.counts.invalidCases, r.counts.cases)
  assert.equal(new Set(r.cases.map((c) => c.caseId)).size, r.cases.length, 'one record per id')
  assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
}

describe('r23 through the consumer: a case id is owned before its fields are checked', () => {
  it('in the built report', () => {
    checkR23(report(r23Corpus()))
  })

  it('in the written report from the command line, which exits 1 for the invalid cases', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, r23Corpus())
      const out = join(dir, 'r.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 1)
      const written = JSON.parse(readFileSync(out, 'utf8')) as R23View
      assert.equal(written.schema, 'sophia.intake-observation.report.v7')
      checkR23(written)
    })
  })

  it('reordering whole id groups keeps each first occurrence the owner', () => {
    const doc = r23Corpus()
    // Valid then invalid becomes invalid then valid for one pair: ownership follows input order, not validity.
    const [a, b] = [doc.cases[6]!, doc.cases[7]!]
    doc.cases[6] = b
    doc.cases[7] = a
    const r = report(doc) as unknown as R23View
    assert.deepEqual(
      r.errors.filter((e) => e.caseId === 'R-rev-family'),
      [own(6, 'R-rev-family', 'invalid_family', '.family'), dup(7, 'R-rev-family')],
    )
    assert.ok(!r.cases.some((c) => c.caseId === 'R-rev-family'))
  })
})

/**
 * The r24 consumer corpus: a target label names one target. Structured labels compare every field, kind included;
 * legacy strings stay compatible only where they can denote nothing else. Every id and word is synthetic.
 */
const opPair = (id: string, newTarget: string) => ({
  audience: 'project',
  originalOperation: id,
  newTarget,
  dispatchState: 'not_sent',
})
const opAlone = (id: string) => ({ audience: 'project', originalOperation: id, dispatchState: 'not_sent' })
const repoWork = (repo: string, attachment?: string) => ({
  audience: 'project',
  directAddress: 'sophia',
  repo,
  ...(attachment === undefined ? {} : { attachment }),
})
const MISSION_CONTEXT = {
  audience: 'project',
  activeMission: 'm/1',
  control: 'running',
  stopQualified: true,
  manager: 'mgr',
  managerGeneration: 3,
  missionBinding: 'bind',
}
const OPAQUE = 'a"b\\c/é..x@y_thread'
const op = (id: string, newTarget: string | null) => ({ kind: 'operation', id, newTarget })
const repoTarget = (repo: string, item: string | null) => ({ kind: 'repository_work', repo, item })
const mission = (generation: unknown) => ({ kind: 'mission', id: 'm/1', manager: 'mgr', generation, binding: 'bind' })

/** Each r24 case: its input, context, target label and the result the comparison must give (with its note). */
const R24: ReadonlyArray<readonly [string, string, Record<string, unknown>, unknown, string, string | null]> = [
  // The four v6 collision pairs, both directions, with the v6 string: never a match.
  ['C-op-left', 'Switch it to v3.', opPair('a', 'b/c'), 'a/b/c', 'unassessed', 'ambiguous_legacy_target_label'],
  ['C-op-right', 'Switch it to v3.', opPair('a/b', 'c'), 'a/b/c', 'unassessed', 'ambiguous_legacy_target_label'],
  ['C-op-null', 'Switch it.', opAlone('a/b'), 'a/b', 'unassessed', 'ambiguous_legacy_target_label'],
  ['C-op-new', 'Switch it to v3.', opPair('a', 'b'), 'a/b', 'unassessed', 'ambiguous_legacy_target_label'],
  [
    'C-repo-left',
    'Implement the requested change.',
    repoWork('x', 'y/z'),
    'x/y/z',
    'unassessed',
    'ambiguous_legacy_target_label',
  ],
  [
    'C-repo-right',
    'Implement the requested change.',
    repoWork('x/y', 'z'),
    'x/y/z',
    'unassessed',
    'ambiguous_legacy_target_label',
  ],
  [
    'C-repo-null',
    'Implement the requested change.',
    repoWork('r'),
    'r/text_objective',
    'unassessed',
    'ambiguous_legacy_target_label',
  ],
  [
    'C-repo-sentinel',
    'Implement the requested change.',
    repoWork('r', 'text_objective'),
    'r/text_objective',
    'unassessed',
    'ambiguous_legacy_target_label',
  ],
  // The same pairs with structured labels: each its own target, never the other's, in either direction.
  ['S-op-left-own', 'Switch it to v3.', opPair('a', 'b/c'), op('a', 'b/c'), 'match', null],
  ['S-op-left-other', 'Switch it to v3.', opPair('a', 'b/c'), op('a/b', 'c'), 'mismatch', null],
  ['S-op-right-own', 'Switch it to v3.', opPair('a/b', 'c'), op('a/b', 'c'), 'match', null],
  ['S-op-right-other', 'Switch it to v3.', opPair('a/b', 'c'), op('a', 'b/c'), 'mismatch', null],
  ['S-op-null-own', 'Switch it.', opAlone('a/b'), op('a/b', null), 'match', null],
  ['S-op-null-other', 'Switch it.', opAlone('a/b'), op('a', 'b'), 'mismatch', null],
  ['S-op-new-own', 'Switch it to v3.', opPair('a', 'b'), op('a', 'b'), 'match', null],
  ['S-op-new-other', 'Switch it to v3.', opPair('a', 'b'), op('a/b', null), 'mismatch', null],
  ['S-repo-left-own', 'Implement the requested change.', repoWork('x', 'y/z'), repoTarget('x', 'y/z'), 'match', null],
  [
    'S-repo-left-other',
    'Implement the requested change.',
    repoWork('x', 'y/z'),
    repoTarget('x/y', 'z'),
    'mismatch',
    null,
  ],
  ['S-repo-right-own', 'Implement the requested change.', repoWork('x/y', 'z'), repoTarget('x/y', 'z'), 'match', null],
  [
    'S-repo-right-other',
    'Implement the requested change.',
    repoWork('x/y', 'z'),
    repoTarget('x', 'y/z'),
    'mismatch',
    null,
  ],
  ['S-repo-null-own', 'Implement the requested change.', repoWork('r'), repoTarget('r', null), 'match', null],
  [
    'S-repo-null-other',
    'Implement the requested change.',
    repoWork('r'),
    repoTarget('r', 'text_objective'),
    'mismatch',
    null,
  ],
  [
    'S-repo-sentinel-own',
    'Implement the requested change.',
    repoWork('r', 'text_objective'),
    repoTarget('r', 'text_objective'),
    'match',
    null,
  ],
  [
    'S-repo-sentinel-other',
    'Implement the requested change.',
    repoWork('r', 'text_objective'),
    repoTarget('r', null),
    'mismatch',
    null,
  ],
  // Legacy strings that can denote one target only keep their meaning; a plain different label is a mismatch.
  ['L-plain-different', 'Switch it to v3.', opPair('plain', 'one'), 'plain/two', 'mismatch', 'legacy_label'],
  [
    'L-plain-ambiguous',
    'Switch it to v3.',
    opPair('plain', 'one'),
    'plain/one',
    'unassessed',
    'ambiguous_legacy_target_label',
  ],
  ['L-alone-exact', 'Switch it.', opAlone('opQ'), 'opQ', 'match', 'legacy_label'],
  ['L-repo-exact', 'Implement the requested change.', repoWork('r', 'att@r8'), 'r/att@r8', 'match', 'legacy_label'],
  ['L-repo-other', 'Implement the requested change.', repoWork('r', 'att@r8'), 'r/att@r7', 'mismatch', 'legacy_label'],
  [
    'L-repo-astral',
    'Implement the requested change.',
    repoWork('\u{1F600}r', 'att'),
    '\u{1F600}r/att',
    'match',
    'legacy_label',
  ],
  // A mission: a structured label proves every field; a legacy id proves the id only.
  ['M-structured', 'Stop the job.', MISSION_CONTEXT, mission(3), 'match', null],
  ['M-generation', 'Stop the job.', MISSION_CONTEXT, mission(4), 'mismatch', null],
  ['M-generation-text', 'Stop the job.', MISSION_CONTEXT, mission('3'), 'mismatch', 'invalid_target_label'],
  ['M-legacy-id', 'Stop the job.', MISSION_CONTEXT, 'm/1', 'unassessed', 'legacy_label_mission_id_only'],
  ['M-legacy-other', 'Stop the job.', MISSION_CONTEXT, 'm/2', 'mismatch', 'legacy_label'],
  // Opaque ids round-trip exactly: quotes, a backslash, a slash, non-ASCII, `..`, `@`, a `_thread` suffix.
  [
    'O-structured',
    'Explain the selected chart.',
    { audience: 'personal', selectedArtifact: OPAQUE },
    { kind: 'artifact', ref: OPAQUE },
    'match',
    null,
  ],
  [
    'O-legacy',
    'Explain the selected chart.',
    { audience: 'personal', selectedArtifact: OPAQUE },
    OPAQUE,
    'match',
    'legacy_label',
  ],
  [
    'O-other-kind',
    'Explain the selected chart.',
    { audience: 'personal', selectedArtifact: OPAQUE },
    { kind: 'message', id: OPAQUE },
    'mismatch',
    null,
  ],
  [
    'O-trimmed',
    'Explain the selected chart.',
    { audience: 'personal', selectedArtifact: OPAQUE },
    { kind: 'artifact', ref: ` ${OPAQUE}` },
    'mismatch',
    null,
  ],
  // Null is not the string "null", nor a missing field; an unknown kind, an extra field or a non-label is invalid.
  ['N-null-text', 'Switch it.', opAlone('a/b'), op('a/b', 'null'), 'mismatch', null],
  ['N-missing', 'Switch it.', opAlone('a/b'), { kind: 'operation', id: 'a/b' }, 'mismatch', 'invalid_target_label'],
  ['N-extra', 'Switch it.', opAlone('a/b'), { ...op('a/b', null), manager: null }, 'mismatch', 'invalid_target_label'],
  [
    'N-kind',
    'Switch it.',
    opAlone('a/b'),
    { kind: 'op', id: 'a/b', newTarget: null },
    'mismatch',
    'invalid_target_label',
  ],
  ['N-number', 'Switch it.', opAlone('a/b'), 42, 'mismatch', 'invalid_target_label'],
  ['N-list', 'Switch it.', opAlone('a/b'), ['a/b'], 'mismatch', 'invalid_target_label'],
  // An abstention is abstained before any equality, also for a structured label equal to its placeholder.
  ['AB-structured', 'What changed?', { audience: 'project' }, { kind: 'unresolved' }, 'abstained', null],
]

function r24Corpus(): TestDoc {
  const doc = corpus()
  doc.cases = R24.map(([id, input, context, label]) => testCase(id, input, context, { target: label }))
  // r23 control: a later case under an owned id is a duplicate, and the first keeps its comparison.
  doc.cases.push(testCase('C-op-left', 'Switch it to v3.', opPair('a', 'b/c'), { target: op('a', 'b/c') }))
  return doc
}

interface R24View {
  schema?: string
  cases: readonly {
    caseId: string
    observation: IntakeObservation
    comparison: readonly { field: string; result: string; note?: string; expected: unknown; observed: unknown }[]
  }[]
  errors: readonly { index: number; caseId: string | null; code: string }[]
  counts: { cases: number; observed: number; invalidCases: number }
  comparison: { fields: Record<string, Record<string, number>> }
  targetLabels: { notation: string; forms: Record<string, number> }
  actualEffects: Record<string, number>
}

function checkR24(r: R24View): void {
  const byCase = new Map(r.cases.map((c) => [c.caseId, c.comparison.find((f) => f.field === 'target')]))
  for (const [id, , , label, result, note] of R24) {
    const got = byCase.get(id)
    assert.deepEqual([got?.result, got?.note ?? null], [result, note], id)
    assert.deepEqual(got?.expected, label, `${id}: the label is reported as given`)
  }
  // The observed target is reported whole, as the policy gave it.
  assert.deepEqual(byCase.get('C-op-null')?.observed, op('a/b', null))
  assert.deepEqual(byCase.get('C-repo-null')?.observed, repoTarget('r', null))
  assert.deepEqual(byCase.get('C-repo-sentinel')?.observed, repoTarget('r', 'text_objective'))
  assert.deepEqual(r.comparison.fields.target, {
    match: 14,
    mismatch: 21,
    abstained: 1,
    unassessed: 10,
    not_labelled: 0,
    denominator: 46,
  })
  assert.deepEqual(r.targetLabels, {
    notation: 'sophia.intake-observation.target-label.v1',
    forms: { structured: 23, legacy: 17, invalid: 6 },
  })
  assert.deepEqual(r.errors, [{ index: 46, caseId: 'C-op-left', code: 'duplicate_case_id', path: 'cases[46].caseId' }])
  assert.deepEqual([r.counts.cases, r.counts.observed, r.counts.invalidCases], [47, 46, 1])
  assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
}

describe('r24 through the consumer: a target label names one target', () => {
  it('in the built report', () => {
    checkR24(report(r24Corpus()))
  })

  it('in the written report from the command line (exit 1: one duplicate id)', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, r24Corpus())
      const out = join(dir, 'r.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 1)
      const written = JSON.parse(readFileSync(out, 'utf8')) as R24View
      assert.equal(written.schema, 'sophia.intake-observation.report.v7')
      checkR24(written)
    })
  })

  it('no label matches two of the colliding targets, whichever form it takes', () => {
    const r = report(r24Corpus()) as unknown as R24View
    const matched = new Map<string, Set<string>>()
    for (const c of r.cases) {
      const t = c.comparison.find((f) => f.field === 'target')
      if (t?.result !== 'match') continue
      const key = JSON.stringify(t.expected)
      matched.set(key, (matched.get(key) ?? new Set()).add(JSON.stringify(c.observation.proposal.target)))
    }
    for (const [label, targets] of matched) assert.equal(targets.size, 1, label)
  })
})

/**
 * r25 (R24-F01): a legacy target label is read in work linear in its length, however many `/` it holds. Each run is a
 * child under a generous completion sentinel (killed and reaped by spawnSync past it): the claim is the source-level
 * bound (readings counted, never listed); the sentinel only keeps a regression from hanging the suite. Labels are data.
 */
const SENTINEL_MS = 30_000

interface BoundedRun {
  status: number | null
  stdout: string
  terminated: boolean
}

function bounded(args: string[]): BoundedRun {
  const r = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    timeout: SENTINEL_MS,
    killSignal: 'SIGKILL',
    maxBuffer: 64 * 1024 * 1024,
  })
  const code = r.error && 'code' in r.error ? r.error.code : undefined
  return { status: r.status, stdout: r.stdout, terminated: code === 'ETIMEDOUT' || r.signal !== null }
}

/** The target comparison of the one case, from the built report, in a child (never the label itself: it is large). */
function builtInChild(path: string): BoundedRun {
  const code = `import { readFileSync } from 'node:fs'
import { buildReport, parseCorpus } from ${JSON.stringify(pathToFileURL(SCRIPT).href)}
const bytes = readFileSync(${JSON.stringify(path)})
const { doc, cases } = parseCorpus(bytes)
const r = buildReport(doc, cases, { name: 'c.json', sha256: '0'.repeat(64), bytes: bytes.length, policySourceSha256: '0'.repeat(64) })
const t = r.cases[0].comparison.find((f) => f.field === 'target')
process.stdout.write(JSON.stringify({ schema: r.schema, result: t.result, note: t.note, observed: t.observed, labelLength: t.expected.length, effects: r.actualEffects, forms: r.targetLabels.forms }))`
  return bounded(['--input-type=module', '-e', code])
}

interface LargeView {
  schema: string
  result: string
  note?: string
  observed: unknown
  labelLength: number
  effects: Record<string, number>
  forms: Record<string, number>
}

function viewOfWritten(path: string): LargeView {
  const r = JSON.parse(readFileSync(path, 'utf8')) as {
    schema: string
    cases: { comparison: { field: string; result: string; note?: string; observed: unknown; expected: string }[] }[]
    actualEffects: Record<string, number>
    targetLabels: { forms: Record<string, number> }
  }
  const t = r.cases[0]?.comparison.find((f) => f.field === 'target')
  assert.ok(t)
  return {
    schema: r.schema,
    result: t.result,
    ...(t.note === undefined ? {} : { note: t.note }),
    observed: t.observed,
    labelLength: t.expected.length,
    effects: r.actualEffects,
    forms: r.targetLabels.forms,
  }
}

/** One case: an operation or a repository target, labelled with `label` (data, stripped before the policy). */
function largeCase(kind: 'operation' | 'repository', label: string): TestDoc {
  const doc = corpus()
  doc.cases = [
    kind === 'operation'
      ? testCase('W-op', 'Switch it.', opAlone('ordinary-operation'), { target: label })
      : testCase('W-repo', 'Implement the requested change.', repoWork('r', 'att@r8'), { target: label }),
  ]
  return doc
}

/** Checks the one case built and written, each in a bounded child; the corpus file's size is returned. */
function checkLarge(doc: TestDoc, want: { result: string; note: string; observed: unknown; labelLength: number }) {
  let size = 0
  withTmp((dir) => {
    const { path, hash } = writeCorpus(dir, doc)
    size = readFileSync(path).length
    assert.ok(size <= CLI_LIMITS.fileBytes, `${String(size)} bytes is within the accepted file size`)
    const built = builtInChild(path)
    assert.equal(built.terminated, false, `the built report completed within the ${String(SENTINEL_MS)} ms sentinel`)
    assert.equal(built.status, 0)
    const out = join(dir, 'r.json')
    const written = bounded([SCRIPT, '--input', path, '--input-sha256', hash, '--out', out])
    assert.equal(
      written.terminated,
      false,
      `the written report completed within the ${String(SENTINEL_MS)} ms sentinel`,
    )
    assert.equal(written.status, 0)
    for (const view of [JSON.parse(built.stdout) as LargeView, viewOfWritten(out)]) {
      assert.equal(view.schema, 'sophia.intake-observation.report.v7')
      assert.deepEqual(
        { result: view.result, note: view.note, observed: view.observed, labelLength: view.labelLength },
        want,
      )
      assert.deepEqual(view.forms, { structured: 0, legacy: 1, invalid: 0 })
      assert.ok(Object.values(view.effects).every((v) => v === 0))
    }
  })
  return size
}

describe('r25 through the consumer: legacy target labels of any length are read in linear work', () => {
  const sizes = [1_000, 100_000, 1_900_000]

  it('operation: a label of only `/` (every split a reading, none the target), up to near the file limit', () => {
    const files = sizes.map((n) =>
      checkLarge(largeCase('operation', '/'.repeat(n)), {
        result: 'mismatch',
        note: 'legacy_label',
        observed: op('ordinary-operation', null),
        labelLength: n,
      }),
    )
    assert.ok((files.at(-1) ?? 0) > 1_900_000, 'the largest is near the 2 MiB file limit')
  })

  it('repository: a label of `/` ending in the no-item sentinel (one more reading), up to near the file limit', () => {
    const files = sizes.map((n) =>
      checkLarge(largeCase('repository', `${'/'.repeat(n)}/text_objective`), {
        result: 'mismatch',
        note: 'legacy_label',
        observed: repoTarget('r', 'att@r8'),
        labelLength: n + 15,
      }),
    )
    assert.ok((files.at(-1) ?? 0) > 1_900_000, 'the largest is near the 2 MiB file limit')
  })

  it('near the 200-character field bound: a hit among many readings stays ambiguous, an exact short label matches', () => {
    const slashes = '/'.repeat(200)
    const doc = corpus()
    doc.cases = [
      testCase('W-op-ambiguous', 'Switch it to v3.', opPair(slashes, slashes), { target: '/'.repeat(401) }),
      testCase('W-repo-ambiguous', 'Implement the requested change.', repoWork(slashes, slashes), {
        target: '/'.repeat(401),
      }),
      testCase('W-repo-sentinel', 'Implement the requested change.', repoWork(slashes), {
        target: `${slashes}/text_objective`,
      }),
      testCase('W-op-exact', 'Switch it.', opAlone('a'.repeat(200)), { target: 'a'.repeat(200) }),
      testCase('W-op-near', 'Switch it.', opAlone('a'.repeat(200)), { target: `${'a'.repeat(200)}/` }),
    ]
    const r = report(doc)
    const got = Object.fromEntries(
      r.cases.map((c) => {
        const t = c.comparison.find((f) => f.field === 'target')
        return [c.caseId, [t?.result, t?.note]]
      }),
    )
    assert.deepEqual(got, {
      'W-op-ambiguous': ['unassessed', 'ambiguous_legacy_target_label'],
      'W-repo-ambiguous': ['unassessed', 'ambiguous_legacy_target_label'],
      'W-repo-sentinel': ['unassessed', 'ambiguous_legacy_target_label'],
      'W-op-exact': ['match', 'legacy_label'],
      'W-op-near': ['mismatch', 'legacy_label'],
    })
    assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
  })
})

// ---------------------------------------------------------------------------------------------------------------
// r26: policy v22 through the consumer, and the bounded depth of retained metadata. Fresh public synthetic cases.

const R26_MISSION = {
  audience: 'project',
  activeMission: 'm-r26',
  manager: 'pm-r26',
  managerGeneration: 4,
  control: 'running',
}

/** v22 through the consumer: every case, its context, and the proposal it must give. */
function r26AckCorpus(): { doc: TestDoc; want: Map<string, string> } {
  const doc = corpus()
  const want = new Map<string, string>()
  const add = (id: string, input: string, context: Record<string, unknown>, kind: string) => {
    doc.cases.push(testCase(id, input, context, { proposedAction: kind }))
    want.set(id, kind)
  }
  doc.cases = []
  const terms = ['thanks', 'thank you', 'thx', 'got it', 'ok', 'okay', 'great', 'perfect']
  for (const [i, t] of terms.entries())
    for (const [j, text] of [`Also, ${t}.`, `${t} also.`, `Also ${t}.`, `${t}, also.`].entries())
      add(`K-${String(i)}-${String(j)}`, text, R26_MISSION, 'no_action')
  for (const [i, text] of ['Also.', 'Also, please.', 'Please, also.', 'Also, also.'].entries())
    add(`M-${String(i)}`, text, R26_MISSION, 'abstain')
  add('P-known', 'Also, add the requested safeguard.', R26_MISSION, 'manager_followup')
  add('P-unread', 'Also, kaleidoscope.', R26_MISSION, 'manager_followup')
  add('P-ack-then-work', 'Thanks also include the missing fact.', R26_MISSION, 'manager_followup')
  add('P-question', 'Also, how is the mission going?', R26_MISSION, 'manager_inquiry')
  add('P-stop', 'Also, thanks, stop.', { ...R26_MISSION, stopQualified: true }, 'control_stop')
  add('P-no-reply', 'Also, thanks.', { ...R26_MISSION, needsReply: false }, 'no_action')
  add('P-generated', 'Also, thanks.', { ...R26_MISSION, origin: 'generated' }, 'no_action')
  add(
    'P-human',
    'Also, thanks.',
    { ...R26_MISSION, trustedMentions: ['h-r26'], currentMembers: ['h-r26'] },
    'human_message',
  )
  add('P-no-mission', 'Also, thanks.', { audience: 'project' }, 'no_action')
  doc.cases.push({
    ...testCase('P-legacy', 'Also, thanks.', R26_MISSION, { proposedAction: 'recorded_only' }),
    interaction: { contract: 'legacy_explicit_ask', askSophia: false },
  })
  want.set('P-legacy', 'recorded_only')
  add('C-ack-then-unread', 'Also, thanks. Kaleidoscope.', R26_MISSION, 'abstain')
  add(
    'C-detached-related',
    'Also. Implement the card.',
    { ...R26_MISSION, repo: 'Z', selectedArtifact: 'card@v2', relatedToActive: true },
    'manager_followup',
  )
  add(
    'C-detached-unknown',
    'Also. Implement the card.',
    { ...R26_MISSION, repo: 'Z', selectedArtifact: 'card@v2' },
    'clarify',
  )
  add('C-quote-ack', 'Also, thanks "deploy everything".', R26_MISSION, 'no_action')
  // r27 correction: an adopted, non-empty quoted request (was mislabelled C-adopted-empty, expecting abstain).
  add('C-adopted-request', 'Also, "add tests".', { ...R26_MISSION, actorExplicitlyAdopts: true }, 'manager_followup')
  add(
    'C-adopted-work',
    'Also add "the retry" to it.',
    { ...R26_MISSION, actorExplicitlyAdopts: true },
    'manager_followup',
  )
  add('C-unadopted-work', 'Also add "the retry" to it.', R26_MISSION, 'abstain')
  return { doc, want }
}

interface R26AckView {
  schema: string
  policy: { version: string }
  cases: readonly { caseId: string; observation: IntakeObservation }[]
  counts: { cases: number; observed: number; invalidCases: number }
  actualEffects: Record<string, number>
}

function checkR26Ack(r: R26AckView, want: Map<string, string>): void {
  // Semantics first, so a failure on an older policy shows the outcome, not only its version name.
  assert.deepEqual(
    Object.fromEntries(r.cases.map((c) => [c.caseId, c.observation.proposal.kind])),
    Object.fromEntries(want),
  )
  assert.deepEqual([r.counts.cases, r.counts.observed, r.counts.invalidCases], [want.size, want.size, 0])
  assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
  // Negative-only admission, checked on the written values rather than trusted from the type.
  const negative: readonly string[] = ['recorded_only', 'clarification_required', 'waiting', 'denied']
  assert.ok(r.cases.every((c) => negative.includes(c.observation.admission.outcome)))
  assert.equal(r.policy.version, 'sophia.intake-observation.policy.v24')
}

describe('r26 through the consumer: an empty "also" adds nothing (policy v22, kept in v23)', () => {
  it('in the built report', () => {
    const { doc, want } = r26AckCorpus()
    checkR26Ack(report(doc), want)
  })

  it('in the written report from the command line', () => {
    const { doc, want } = r26AckCorpus()
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, doc)
      const out = join(dir, 'r.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 0)
      const written = JSON.parse(readFileSync(out, 'utf8')) as R26AckView
      assert.equal(written.schema, 'sophia.intake-observation.report.v7')
      checkR26Ack(written, want)
    })
  })
})

// r27 (R26-F01): an explicitly adopted quoted or imported request beside "also" is its substance (policy v23). The
// receipt's twenty public rows plus fresh positive, empty and detached forms; built and written; every proposal
// labelled so the comparison is exercised too.
const R27_MISSION = {
  audience: 'project',
  activeMission: 'm-r27',
  manager: 'pm-r27',
  managerGeneration: 5,
  control: 'running',
}

function r27AdoptionCorpus(): { doc: TestDoc; want: Map<string, string> } {
  const doc = corpus()
  const want = new Map<string, string>()
  doc.cases = []
  const add = (id: string, input: string, extra: Record<string, unknown>, kind: string) => {
    doc.cases.push(testCase(id, input, { ...R27_MISSION, ...extra }, { proposedAction: kind }))
    want.set(id, kind)
  }
  const yes = { actorExplicitlyAdopts: true }
  const no = { actorExplicitlyAdopts: false }
  for (const [i, text] of [
    'Also, "add tests".',
    'Also, \u201cinclude the safeguard\u201d.',
    "Also, 'adjust the focus'.",
  ].entries()) {
    add(`A-adopted-${String(i)}`, text, yes, 'manager_followup')
    add(`A-unadopted-${String(i)}`, text, no, 'abstain')
  }
  add('A-adopted-authored', 'Also add "the retry" to it.', yes, 'manager_followup')
  add('A-unadopted-authored', 'Also add "the retry" to it.', no, 'abstain')
  add('A-adopted-empty-span', 'Also, "".', yes, 'abstain')
  add('A-quiet-quoted', 'Also, okay "add tests".', {}, 'no_action')
  add('A-quiet-no-also', 'Okay "add tests".', {}, 'no_action')
  add('A-quiet-import', 'Also, okay. Add tests', { quotedText: 'Add tests' }, 'no_action')
  add('A-quiet-no-import-also', 'Okay. Add tests', { quotedText: 'Add tests' }, 'no_action')
  add('A-generated', 'Also, "add tests".', { ...yes, origin: 'generated' }, 'no_action')
  add(
    'A-human',
    'Also, "add tests".',
    { ...yes, trustedMentions: ['h-r27'], currentMembers: ['h-r27'] },
    'human_message',
  )
  add('A-malformed', 'Also, okay "add tests.', {}, 'abstain')
  add('A-unread', 'Also, kaleidoscope.', {}, 'manager_followup')
  add('A-ack-alone', 'Also, okay.', {}, 'no_action')
  add('A-marker-alone', 'Also.', {}, 'abstain')
  add('A-ack-detached', 'Also, okay. Kaleidoscope.', {}, 'abstain')
  // Fresh forms beyond the receipt.
  add('A-backtick', 'Also, `add tests`.', yes, 'manager_followup')
  add('A-after', '"Add tests" also.', yes, 'manager_followup')
  add('A-thanks-also', 'Thanks, also "add tests".', yes, 'manager_followup')
  add('A-import', 'Also, add tests', { ...yes, quotedText: 'add tests' }, 'manager_followup')
  add('A-attachment', 'Also, add tests', { ...yes, attachmentInstruction: 'add tests' }, 'manager_followup')
  add('A-adopted-thanks', 'Also, "thanks".', yes, 'abstain')
  add('A-adopted-also', 'Also, "also".', yes, 'abstain')
  add('A-adopted-detached', 'Also. "Add tests".', yes, 'abstain')
  add('A-adopted-ack-detached', 'Also, okay. "Add tests".', yes, 'no_action')
  doc.cases.push(
    testCase(
      'A-adopted-no-mission',
      'Also, "add tests".',
      { audience: 'project', ...yes },
      { proposedAction: 'abstain' },
    ),
  )
  want.set('A-adopted-no-mission', 'abstain')
  return { doc, want }
}

function checkR27(r: ReturnType<typeof report>, want: Map<string, string>): void {
  checkR26Ack(r, want)
  // Each proposal is labelled: a follow-up or quiet outcome matches its label, an abstention is counted as such.
  for (const c of r.cases) {
    const action = c.comparison.find((f) => f.field === 'proposedAction')
    assert.equal(action?.result, want.get(c.caseId) === 'abstain' ? 'abstained' : 'match', c.caseId)
  }
}

describe('r27 through the consumer: an adopted request beside "also" follows up (policy v23)', () => {
  it('in the built report', () => {
    const { doc, want } = r27AdoptionCorpus()
    checkR27(report(doc), want)
  })

  it('in the written report from the command line', () => {
    const { doc, want } = r27AdoptionCorpus()
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, doc)
      const out = join(dir, 'r.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 0)
      const written = JSON.parse(readFileSync(out, 'utf8')) as ReturnType<typeof report>
      assert.equal(written.schema, 'sophia.intake-observation.report.v7')
      checkR27(written, want)
    })
  })
})

// r28 (R27-F01): quotation, escaped-quote and encoded-quote framing around adopted content is never its words
// (policy v24), through both import fields and ordinary quotations. One batched corpus, every proposal labelled.
const R28_MISSION = {
  audience: 'project',
  activeMission: 'm-r28',
  manager: 'pm-r28',
  managerGeneration: 7,
  control: 'running',
}

function r28DelimiterCorpus(): { doc: TestDoc; want: Map<string, string> } {
  const doc = corpus()
  const want = new Map<string, string>()
  doc.cases = []
  const add = (id: string, input: string, context: Record<string, unknown>, kind: string, interaction?: unknown) => {
    const c = testCase(id, input, context, { proposedAction: kind })
    doc.cases.push(interaction === undefined ? c : { ...c, interaction })
    want.set(id, kind)
  }
  const yes = { ...R28_MISSION, actorExplicitlyAdopts: true }
  const no = { ...R28_MISSION, actorExplicitlyAdopts: false }
  const wrappers: [string, string, string][] = [
    ['straight', "'", "'"],
    ['curly', '\u2018', '\u2019'],
    ['escaped', "\\'", "\\'"],
    ['encoded', '&apos;', '&apos;'],
  ]
  const empty = ['', 'thanks', 'okay, thanks', 'please', 'also', '@person']
  const real = ['add tests', "don't add tests", "check o'brien's note"]
  for (const importField of ['quotedText', 'attachmentInstruction'])
    for (const [w, open, close] of wrappers) {
      for (const [i, content] of empty.entries()) {
        const literal = `${open}${content}${close}`
        add(
          `D-${importField}-${w}-empty-${String(i)}`,
          `Also, okay ${literal}.`,
          { ...yes, [importField]: literal },
          'no_action',
        )
      }
      for (const [i, content] of real.entries()) {
        const literal = `${open}${content}${close}`
        add(
          `D-${importField}-${w}-real-${String(i)}`,
          `Also, okay ${literal}.`,
          { ...yes, [importField]: literal },
          'manager_followup',
        )
      }
      add(
        `D-${importField}-${w}-unadopted`,
        `Also, okay ${open}add tests${close}.`,
        { ...no, [importField]: `${open}add tests${close}` },
        'no_action',
      )
    }
  // Ordinary quotations: single pairs, and a double quotation around single-quoted content.
  add('D-ordinary-single-thanks', "Also, okay 'thanks'.", yes, 'no_action')
  add('D-ordinary-curly-real', 'Also, okay \u2018don\u2019t add tests\u2019.', yes, 'manager_followup')
  add('D-ordinary-nested-thanks', `Also, "'thanks'".`, yes, 'abstain')
  add('D-ordinary-nested-real', `Also, "'add tests'".`, yes, 'manager_followup')
  add('D-ordinary-nested-unadopted', `Also, "'add tests'".`, no, 'abstain')
  // Opaque content as aa reads it: "-" is a word; "..." is none; framing adds nothing to either.
  add('D-opaque-dash', "Also, okay '-'.", { ...yes, quotedText: "'-'" }, 'manager_followup')
  add('D-opaque-dots', "Also, okay '...'.", { ...yes, quotedText: "'...'" }, 'no_action')
  // Precedence controls with wrapped adopted content.
  add('D-malformed-escaped', "Also, okay \\'add tests\\'.", yes, 'abstain')
  add('D-generated', "Also, 'add tests'.", { ...yes, origin: 'generated' }, 'no_action')
  add(
    'D-human',
    "Also, 'add tests'.",
    { ...yes, trustedMentions: ['h-r28'], currentMembers: ['h-r28'] },
    'human_message',
  )
  add('D-no-reply', "Also, 'add tests'.", { ...yes, needsReply: false }, 'no_action')
  add('D-no-mission', "Also, 'add tests'.", { audience: 'project', actorExplicitlyAdopts: true }, 'abstain')
  add('D-stop', "Also, 'add tests', stop.", { ...yes, stopQualified: true }, 'control_stop')
  add('D-detached', "Also. 'Add tests'.", yes, 'abstain')
  add('D-legacy', "Also, 'add tests'.", yes, 'recorded_only', { contract: 'legacy_explicit_ask', askSophia: false })
  return { doc, want }
}

describe('r28 through the consumer: framing around adopted content is never its words (policy v24)', () => {
  it('in the built report', () => {
    const { doc, want } = r28DelimiterCorpus()
    checkR27(report(doc), want)
  })

  it('in the written report from the command line', () => {
    const { doc, want } = r28DelimiterCorpus()
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, doc)
      const out = join(dir, 'r.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 0)
      const written = JSON.parse(readFileSync(out, 'utf8')) as ReturnType<typeof report>
      assert.equal(written.schema, 'sophia.intake-observation.report.v7')
      checkR27(written, want)
    })
  })
})

/** A value nested exactly `depth` deep (a scalar is 0; an array or object is 1 + its deepest member). */
function nested(depth: number, shape: 'array' | 'object', bottom: unknown = 'leaf'): unknown {
  let value: unknown = bottom
  for (let i = 0; i < depth; i += 1) value = shape === 'array' ? [value] : { k: value }
  return value
}

/** How deep a value nests, counted here independently of the consumer (an explicit stack; scalar 0, container 1+). */
function depthOf(value: unknown): number {
  let deepest = 0
  const stack: [unknown, number][] = [[value, 0]]
  for (let top = stack.pop(); top !== undefined; top = stack.pop()) {
    const [node, above] = top
    if (typeof node !== 'object' || node === null) continue
    deepest = Math.max(deepest, above + 1)
    for (const member of Object.values(node)) stack.push([member, above + 1])
  }
  return deepest
}

/** The 8 scored labels, by their corpus key. */
const SCORED_KEYS = [
  'audience',
  'addressee',
  'proposedAction',
  'target',
  'clarificationRequired',
  'admission',
  'admissionDenialOrWaitReason',
  'actualObservationModeEffects',
] as const

describe('r26: how deep a value nests, measured without recursion', () => {
  it('a scalar is 0, an empty container 1, a container 1 + its deepest member', () => {
    const nestingExceeds = cli.nestingExceeds
    assert.equal(typeof nestingExceeds, 'function', 'the consumer measures nesting')
    assert.equal(nestingExceeds('x', 0), false)
    assert.equal(nestingExceeds([], 0), true)
    assert.equal(nestingExceeds([], 1), false)
    assert.equal(nestingExceeds({}, 1), false)
    assert.equal(nestingExceeds(nested(31, 'array', []), 32), false, 'an empty container 31 deep is 32')
    assert.equal(nestingExceeds(nested(32, 'array', {}), 32), true, 'an empty container 32 deep is 33')
    for (const shape of ['array', 'object'] as const) {
      assert.equal(nestingExceeds(nested(32, shape), 32), false, shape)
      assert.equal(nestingExceeds(nested(33, shape), 32), true, shape)
    }
    // Wide and shallow is not deep; depth is the deepest member, not the count.
    assert.equal(nestingExceeds({ a: [1, 2, 3], b: { c: [[]] }, d: nested(30, 'object') }, 32), false)
    assert.equal(nestingExceeds({ a: 1, b: nested(32, 'array') }, 32), true)
  })
})

/** Depth cases for every scored label, as arrays and objects, at 31, 32 and 33. */
function r26DepthCorpus(): TestDoc {
  const doc = corpus()
  const base = { audience: 'project' }
  doc.cases = SCORED_KEYS.flatMap((key) =>
    (['array', 'object'] as const).flatMap((shape) =>
      [31, 32, 33].map((depth) =>
        testCase(`D-${key}-${shape}-${String(depth)}`, 'Thanks.', base, { [key]: nested(depth, shape) }),
      ),
    ),
  )
  doc.cases.push(testCase('D-empty-32', 'Thanks.', base, { target: nested(31, 'array', []) }))
  doc.cases.push(testCase('D-empty-33', 'Thanks.', base, { target: nested(32, 'object', {}) }))
  return doc
}

interface R26DepthView {
  cases: readonly { caseId: string; comparison: readonly { field: string; expected: unknown }[] }[]
  errors: readonly Record<string, unknown>[]
  counts: { cases: number; observed: number; invalidCases: number; errorIssues: number }
  actualEffects: Record<string, number>
}

function checkR26Depth(r: R26DepthView): void {
  const refused = r.errors.map((e) => [e.caseId, e.code, e.path])
  // Case order is label × shape × [31, 32, 33], then D-empty-32 (index 48) and D-empty-33 (index 49).
  const want: unknown[] = SCORED_KEYS.flatMap((key, k) =>
    ['array', 'object'].map((shape, h) => [
      `D-${key}-${shape}-33`,
      'label_too_deep',
      `cases[${String(k * 6 + h * 3 + 2)}].expected.${key}`,
    ]),
  )
  want.push(['D-empty-33', 'label_too_deep', 'cases[49].expected.target'])
  assert.deepEqual(refused, want)
  // An error names where, never the value: nothing deep is retained.
  for (const e of r.errors) assert.deepEqual(Object.keys(e).toSorted(), ['caseId', 'code', 'index', 'path'])
  const observed = r.cases.map((c) => c.caseId)
  assert.equal(observed.length, 33)
  assert.ok(observed.includes('D-empty-32') && !observed.some((id) => id.endsWith('-33')))
  assert.deepEqual([r.counts.cases, r.counts.observed, r.counts.invalidCases, r.counts.errorIssues], [50, 33, 17, 17])
  assert.ok(depthOf(r) <= 32 + 8, 'the report holds nothing nested past the bound')
  assert.ok(Object.values(r.actualEffects).every((v) => v === 0))
}

describe('r26: scored labels nest at most 32 deep; deeper makes the case invalid, never retained', () => {
  it('in the built report (all 8 labels, arrays and objects, 31/32/33, the empty-container convention)', () => {
    const r = report(r26DepthCorpus()) as unknown as R26DepthView
    checkR26Depth(r)
    assert.doesNotThrow(() => JSON.stringify(r))
  })

  it('in the written report from the command line: written, exit 1', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, r26DepthCorpus())
      const out = join(dir, 'r.json')
      assert.equal(run(['--input', path, '--input-sha256', hash, '--out', out]).status, 1)
      checkR26Depth(JSON.parse(readFileSync(out, 'utf8')) as R26DepthView)
    })
  })

  it('identity first, then the earlier checks, then depth; a later duplicate is a duplicate only', () => {
    const doc = corpus()
    const deep = { target: nested(40, 'array') }
    doc.cases = [
      testCase('I-1', 'Thanks.', { audience: 'project' }, deep),
      testCase('I-1', 'Thanks.', { audience: 'project' }, {}),
      testCase('I-1', 'Thanks.', { audience: 'project' }, deep),
      { ...testCase('I-2', 'Thanks.', { audience: 'project' }, deep), family: 7 },
      { ...testCase('I-3', 'Thanks.', { audience: 'project' }, deep), extra: true },
      testCase('I-4', 'Thanks.', { audience: 'project' }, { proposedAction: 'no_action' }),
    ]
    const r = report(doc) as unknown as R26DepthView
    assert.deepEqual(
      r.errors.map((e) => [e.index, e.caseId, e.code, e.path]),
      [
        [0, 'I-1', 'label_too_deep', 'cases[0].expected.target'],
        [1, 'I-1', 'duplicate_case_id', 'cases[1].caseId'],
        [2, 'I-1', 'duplicate_case_id', 'cases[2].caseId'],
        [3, 'I-2', 'invalid_family', 'cases[3].family'],
        [4, 'I-3', 'unknown_case_field', 'cases[4].extra'],
      ],
    )
    assert.deepEqual(
      r.cases.map((c) => c.caseId),
      ['I-4'],
    )
  })

  it('deep unscored data is not retained and stays accepted (written, in a bounded child)', () => {
    // Written as text: the deep values are spliced into a shallow file (JSON.stringify of them would itself overflow).
    const holes = ['status', 'split', 'labelAuthority', 'fixtureAuthority', 'notes'] as const
    const doc = corpus()
    doc.cases = holes.map((key) =>
      key === 'notes'
        ? testCase('U-notes', 'Thanks.', { audience: 'project' }, { notes: `@${key}@`, proposedAction: 'no_action' })
        : { ...testCase(`U-${key}`, 'Thanks.', { audience: 'project' }, {}), [key]: `@${key}@` },
    )
    withTmp((dir) => {
      const { path: shallow } = writeCorpus(dir, doc)
      const deep = `${'['.repeat(100_000)}0${']'.repeat(100_000)}`
      let text = readFileSync(shallow, 'utf8')
      for (const key of holes) text = text.replace(`"@${key}@"`, deep)
      const path = join(dir, 'deep.json')
      writeFileSync(path, text)
      const out = join(dir, 'r.json')
      const written = bounded([SCRIPT, '--input', path, '--input-sha256', sha256(readFileSync(path)), '--out', out])
      assert.equal(written.terminated, false, 'completed within the sentinel')
      assert.equal(written.status, 0)
      const r = JSON.parse(readFileSync(out, 'utf8')) as R26DepthView
      assert.deepEqual([r.counts.observed, r.counts.invalidCases], [5, 0])
      assert.ok(depthOf(r) <= 32, 'nothing deep reached the report')
    })
  })
})

describe('r26: a declared authority fixture body nests at most 32 deep; deeper refuses the file', () => {
  const withFixture = (body: unknown): TestDoc => {
    const doc = corpus()
    doc.authorityFixtures = { [FIXTURE_ID]: body as never }
    doc.cases = [testCase('F-1', 'Thanks.', { audience: 'project' }, {})]
    return doc
  }

  it('31 and 32 are hashed as before; 33 is input_fixture_too_deep, built and written (exit 2, no report)', () => {
    for (const depth of [31, 32]) {
      const body = { grants: { roles: [] }, deep: nested(depth - 1, 'object') }
      const r = report(withFixture(body))
      assert.equal(r.syntheticAuthority.fixtures[0]?.computedSha256, sha256(canonicalJson(body)), String(depth))
    }
    const tooDeep = withFixture({ deep: nested(32, 'array') })
    assert.throws(
      () => report(tooDeep),
      (err: unknown) => err instanceof UsageError && err.code === 'input_fixture_too_deep',
    )
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, tooDeep)
      const out = join(dir, 'r.json')
      const r = run(['--input', path, '--input-sha256', hash, '--out', out])
      assert.equal(r.status, 2)
      assert.match(r.stderr, /input_fixture_too_deep/)
      assert.equal(existsSync(out), false)
    })
  })
})

describe('r26: nesting near the 2 MiB file limit is refused in linear work, built and written', () => {
  /** The built report's errors and counts, or the usage error's code, from a child. */
  function builtSummary(path: string): BoundedRun {
    const code = `import { readFileSync } from 'node:fs'
import { buildReport, parseCorpus, UsageError } from ${JSON.stringify(pathToFileURL(SCRIPT).href)}
const bytes = readFileSync(${JSON.stringify(path)})
const { doc, cases } = parseCorpus(bytes)
try {
  const r = buildReport(doc, cases, { name: 'c.json', sha256: '0'.repeat(64), bytes: bytes.length, policySourceSha256: '0'.repeat(64) })
  JSON.stringify(r)
  process.stdout.write(JSON.stringify({ errors: r.errors, counts: r.counts, effects: r.actualEffects }))
} catch (err) {
  process.stdout.write(JSON.stringify({ usage: err instanceof UsageError ? err.code : String(err) }))
}`
    return bounded(['--input-type=module', '-e', code])
  }
  const LEVELS = 1_000_000

  it('a scored label about 2 MB deep: label_too_deep; the report is written (exit 1)', () => {
    const doc = corpus()
    doc.cases = [testCase('N-1', 'Thanks.', { audience: 'project' }, { target: 0 })]
    withTmp((dir) => {
      const { path: shallow } = writeCorpus(dir, doc)
      const text = readFileSync(shallow, 'utf8').replace(
        '"target":0',
        `"target":${'['.repeat(LEVELS)}0${']'.repeat(LEVELS)}`,
      )
      const path = join(dir, 'deep.json')
      writeFileSync(path, text)
      assert.ok(text.length > 2_000_000 && text.length <= CLI_LIMITS.fileBytes, String(text.length))
      const built = builtSummary(path)
      assert.equal(built.terminated, false, 'completed within the sentinel')
      const summary = JSON.parse(built.stdout) as {
        usage?: string
        errors: { code: string; path: string }[]
        counts: { invalidCases: number }
      }
      assert.equal(summary.usage, undefined, 'the built report completed without an error')
      assert.deepEqual(
        summary.errors.map((e) => [e.code, e.path]),
        [['label_too_deep', 'cases[0].expected.target']],
      )
      const out = join(dir, 'r.json')
      const written = bounded([SCRIPT, '--input', path, '--input-sha256', sha256(readFileSync(path)), '--out', out])
      assert.equal(written.terminated, false, 'completed within the sentinel')
      assert.equal(written.status, 1)
      assert.ok(readFileSync(out).length < 100_000, 'the deep value is not in the report')
    })
  })

  it('a fixture body about 2 MB deep: input_fixture_too_deep, built and written (exit 2, no report)', () => {
    const doc = corpus()
    doc.authorityFixtures = { [FIXTURE_ID]: { deep: 0 } as never }
    withTmp((dir) => {
      const { path: shallow } = writeCorpus(dir, doc)
      const text = readFileSync(shallow, 'utf8').replace(
        '"deep":0',
        `"deep":${'['.repeat(LEVELS)}0${']'.repeat(LEVELS)}`,
      )
      const path = join(dir, 'deep.json')
      writeFileSync(path, text)
      assert.ok(text.length > 2_000_000 && text.length <= CLI_LIMITS.fileBytes, String(text.length))
      const built = builtSummary(path)
      assert.equal(built.terminated, false, 'completed within the sentinel')
      assert.deepEqual(JSON.parse(built.stdout), { usage: 'input_fixture_too_deep' })
      const out = join(dir, 'r.json')
      const written = bounded([SCRIPT, '--input', path, '--input-sha256', sha256(readFileSync(path)), '--out', out])
      assert.equal(written.terminated, false, 'completed within the sentinel')
      assert.equal(written.status, 2)
      assert.equal(existsSync(out), false)
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------
// r29: expected filesystem failures are usage errors with fixed, path-free messages; the CLI's own temporary file is
// cleaned and foreign files are never touched; malformed fixture declarations refuse the file. Fresh public synthetic
// data only, in owned temporary directories.

/**
 * CONTRACT FAULT INJECTION (test-only, process-local): a preload for one child process that wraps a single named fs
 * function for one exact path (or for the CLI's own temporary report descriptors), counts hits and syncs the builtin
 * ESM exports so the CLI's named imports see it. It is never part of the product; nothing global is patched here.
 */
const FAULT_PRELOAD = `import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
const spec = JSON.parse(process.env.R29_FAULT)
const real = { ...fs }
let hits = 0
let links = 0
const fds = new Set()
const paths = new Map()
// r29 repair1: replace a name with a foreign regular file, or with a symlink to an owned foreign control file.
const replace = (p) => {
  real.unlinkSync(p)
  if (spec.replacement === 'symlink') real.symlinkSync(spec.control, p)
  else real.writeFileSync(p, spec.foreign)
}
const temporary = (p) => typeof p === 'string' && p.startsWith(spec.tmpPrefix ?? '\u0000')
const fail = (code, syscall) => Object.assign(new Error(code + ': contract fault'), { code, syscall, errno: -1 })
fs.openSync = function (p, ...rest) {
  if (spec.fn === 'openSync' && temporary(p)) { hits += 1; throw fail(spec.code, 'open') }
  const fd = real.openSync(p, ...rest)
  if (temporary(p)) { fds.add(fd); paths.set(fd, p) }
  return fd
}
const onFd = (name, syscall, after) => {
  fs[name] = function (fd, ...rest) {
    if (spec.fn === name && fds.has(fd)) {
      hits += 1
      if (spec.kind === 'replaceAfter') { const r = real[name](fd, ...rest); replace(paths.get(fd)); return r }
      if (spec.kind === 'type') throw new TypeError('contract fault: not a system error')
      if (after) real[name](fd, ...rest)
      throw fail(spec.code, syscall)
    }
    if (name === 'closeSync' && spec.alsoClose === true && fds.has(fd)) {
      hits += 1
      real.closeSync(fd)
      throw fail('EIO', 'close')
    }
    return real[name](fd, ...rest)
  }
}
onFd('fstatSync', 'fstat', false)
onFd('writeFileSync', 'write', false)
onFd('fsyncSync', 'fsync', false)
onFd('closeSync', 'close', true)
const onPath = (name, syscall) => {
  fs[name] = function (p, ...rest) {
    if (name === 'linkSync' && temporary(p)) links += 1
    const target = spec.fn === name && (p === spec.path || (spec.path === undefined && temporary(p)))
    if (!target) return real[name](p, ...rest)
    hits += 1
    if (spec.kind === 'type') throw new TypeError('contract fault: not a system error')
    if (spec.kind === 'tooLarge') throw Object.assign(new RangeError('contract fault: file too large'), { code: 'ERR_FS_FILE_TOO_LARGE' })
    if (spec.kind === 'removeThenCall') { real.unlinkSync(p); return real[name](p, ...rest) }
    if (spec.kind === 'foreignThenCall') { real.writeFileSync(rest[0], spec.foreign); return real[name](p, ...rest) }
    if (spec.kind === 'replaceThenFail') { real.unlinkSync(p); real.writeFileSync(p, spec.foreign); throw fail(spec.code, syscall) }
    if (spec.kind === 'replaceThenCall') { replace(p); return real[name](p, ...rest) }
    if (spec.kind === 'callThenReplaceOut') { const r = real[name](p, ...rest); real.unlinkSync(rest[0]); real.writeFileSync(rest[0], spec.foreign); return r }
    throw fail(spec.code, syscall)
  }
}
onPath('statSync', 'stat')
onPath('realpathSync', 'realpath')
onPath('readFileSync', 'open')
onPath('linkSync', 'link')
onPath('unlinkSync', 'unlink')
syncBuiltinESMExports()
process.on('exit', () => real.writeFileSync(spec.hitsFile, JSON.stringify({ hits, links })))
`

interface FaultRun {
  status: number | null
  stdout: string
  stderr: string
  hits: number
  links: number
  report: boolean
  leftovers: string[]
}

/** The written CLI in a child with the fault preload (or none); what it printed, wrote and left behind. */
function runWithFault(dir: string, args: string[], out: string, spec?: Record<string, unknown>): FaultRun {
  const preload = join(dir, 'fault-preload.mjs')
  const hitsFile = join(dir, 'fault-hits.txt')
  writeFileSync(preload, FAULT_PRELOAD)
  rmSync(hitsFile, { force: true })
  const fault = { tmpPrefix: join(dirname(out), `.${basename(out)}.`), hitsFile, ...spec }
  const flags = spec === undefined ? [] : ['--import', pathToFileURL(preload).href]
  const r = spawnSync(process.execPath, [...flags, SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: SENTINEL_MS,
    killSignal: 'SIGKILL',
    env: { ...process.env, R29_FAULT: JSON.stringify(fault) },
  })
  const counted = existsSync(hitsFile)
    ? (JSON.parse(readFileSync(hitsFile, 'utf8')) as { hits: number; links: number })
    : { hits: 0, links: 0 }
  const leftovers = readdirSync(dirname(out)).filter((f) => f.startsWith(`.${basename(out)}.`))
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, ...counted, report: existsSync(out), leftovers }
}

/** A fixed usage refusal: exactly one line, no stack frame, no path, no errno text. */
function assertRefusal(r: FaultRun, code: string, message: string, dir: string, label: string): void {
  assert.equal(r.status, 2, `${label}: ${r.stderr}`)
  assert.equal(r.stdout, '', label)
  assert.equal(r.stderr, `intake-observe: ${code}: ${message}\n`, label)
  assert.ok(!r.stderr.includes(dir) && !/\n\s+at |\bE[A-Z]{3,}\b/.test(r.stderr), label)
  assert.equal(r.report, false, label)
}

const UNREADABLE = 'the input is not a readable file'
const UNUSABLE = 'the report path cannot be used; no report was written'

describe('r29: expected input filesystem failures are input_unreadable (exit 2, fixed message, no report)', () => {
  it('real paths: a looping link and an over-long name, at the earliest input check', () => {
    withTmp((dir) => {
      const { hash } = writeCorpus(dir, corpus())
      const loop = join(dir, 'loop.json')
      symlinkSync(loop, loop)
      const long = join(dir, `${'n'.repeat(300)}.json`)
      for (const [label, input] of [
        ['looping link', loop],
        ['over-long name', long],
      ] as const) {
        const out = join(dir, `${label.replace(/\W/g, '-')}.report.json`)
        assertRefusal(
          runWithFault(dir, ['--input', input, '--input-sha256', hash, '--out', out], out),
          'input_unreadable',
          UNREADABLE,
          dir,
          label,
        )
      }
    })
  })

  it('observed controls keep their meaning: missing, a directory, a file used as a directory (ENOTDIR)', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, corpus())
      // Observed on Node 24.21.0: statSync(<file>/x, { throwIfNoEntry: false }) returns undefined, as for a missing file.
      for (const [label, input] of [
        ['missing', join(dir, 'absent.json')],
        ['directory', dir],
        ['file as directory', join(path, 'x')],
      ] as const) {
        const out = join(dir, `${label.replace(/\W/g, '-')}.report.json`)
        assertRefusal(
          runWithFault(dir, ['--input', input, '--input-sha256', hash, '--out', out], out),
          'input_unreadable',
          UNREADABLE,
          dir,
          label,
        )
      }
    })
  })

  it('contract fault injection: denied, failing or vanished reads and resolutions', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, corpus())
      const cases: [string, Record<string, unknown>][] = [
        ['read denied', { fn: 'readFileSync', path, code: 'EACCES' }],
        ['read I/O error', { fn: 'readFileSync', path, code: 'EIO' }],
        ['removed between stat and read', { fn: 'readFileSync', path, kind: 'removeThenCall' }],
        ['stat denied', { fn: 'statSync', path, code: 'EACCES' }],
        ['realpath denied', { fn: 'realpathSync', path, code: 'EACCES' }],
      ]
      for (const [label, spec] of cases) {
        if (!existsSync(path)) writeCorpus(dir, corpus())
        const out = join(dir, `${label.replace(/\W/g, '-')}.report.json`)
        const r = runWithFault(dir, ['--input', path, '--input-sha256', hash, '--out', out], out, spec)
        assert.ok(r.hits >= 1, `${label}: the fault was reached`)
        assertRefusal(r, 'input_unreadable', UNREADABLE, dir, label)
      }
    })
  })

  it('a read refused for growth past a buffer is input_too_large; a programming error stays visible', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, corpus())
      const grown = join(dir, 'grown.report.json')
      const r = runWithFault(dir, ['--input', path, '--input-sha256', hash, '--out', grown], grown, {
        fn: 'readFileSync',
        path,
        kind: 'tooLarge',
      })
      assert.equal(r.hits, 1)
      assertRefusal(r, 'input_too_large', 'the input grew past the limit', dir, 'grew')
      const typed = join(dir, 'typed.report.json')
      const t = runWithFault(dir, ['--input', path, '--input-sha256', hash, '--out', typed], typed, {
        fn: 'readFileSync',
        path,
        kind: 'type',
      })
      assert.equal(t.hits, 1)
      assert.equal(t.status, 1, 'an unexpected error is not a usage error')
      assert.match(t.stderr, /TypeError: contract fault: not a system error/)
      assert.doesNotMatch(t.stderr, /intake-observe: \w+:/)
      assert.equal(t.report, false)
    })
  })

  it('the earlier input and output refusals keep their codes and order', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, corpus())
      const wrong = join(dir, 'wrong.report.json')
      const mismatch = runWithFault(dir, ['--input', path, '--input-sha256', '0'.repeat(64), '--out', wrong], wrong)
      assert.equal(mismatch.status, 2)
      assert.match(mismatch.stderr, /^intake-observe: input_hash_mismatch: /)
      const ok = join(dir, 'ok.report.json')
      const fine = runWithFault(dir, ['--input', path, '--input-sha256', hash, '--out', ok], ok)
      assert.ok(fine.status === 0 || fine.status === 1, fine.stderr)
      assert.equal(fine.stderr, '')
      assert.match(fine.stdout, /^intake-observe: \d+\/\d+ observed, /)
      assert.equal(fine.report, true)
      assert.deepEqual(fine.leftovers, [])
    })
  })
})

describe('r29: expected output filesystem failures are output_unusable; the CLI cleans only what it created', () => {
  it('real paths: a looping report directory and an over-long report name; a file as directory is still missing', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, corpus())
      const loop = join(dir, 'loopdir')
      symlinkSync(loop, loop)
      const looping = join(loop, 'r.json')
      const r1 = runWithFault(dir, ['--input', path, '--input-sha256', hash, '--out', looping], join(dir, 'r1.json'))
      assertRefusal(r1, 'output_unusable', UNUSABLE, dir, 'looping directory')
      const long = join(dir, `${'n'.repeat(300)}.json`)
      const r2 = runWithFault(dir, ['--input', path, '--input-sha256', hash, '--out', long], join(dir, 'r2.json'))
      assertRefusal(r2, 'output_unusable', UNUSABLE, dir, 'over-long name')
      const r3 = runWithFault(
        dir,
        ['--input', path, '--input-sha256', hash, '--out', join(path, 'r.json')],
        join(dir, 'r3.json'),
      )
      assertRefusal(r3, 'output_directory_missing', 'the report directory does not exist', dir, 'file as directory')
    })
  })

  it('contract fault injection: open, fstat, write, fsync, close and link failures publish nothing', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, corpus())
      const cases: [string, Record<string, unknown>, number][] = [
        ['open denied', { fn: 'openSync', code: 'EACCES' }, 0],
        ['write no space', { fn: 'writeFileSync', code: 'ENOSPC' }, 0],
        ['fsync I/O error', { fn: 'fsyncSync', code: 'EIO' }, 0],
        // A close failure after the write failed never replaces it (two faults: write, then close).
        ['write no space, then close I/O error', { fn: 'writeFileSync', code: 'ENOSPC', alsoClose: true }, 0],
        ['link I/O error', { fn: 'linkSync', code: 'EIO' }, 0],
        // Without the identity of what it created, the CLI does not remove the name: the leftover is reported, honestly.
        ['fstat I/O error', { fn: 'fstatSync', code: 'EIO' }, 1],
      ]
      for (const [label, spec, left] of cases) {
        const out = join(dir, `${label.replace(/\W/g, '-')}.json`)
        const r = runWithFault(dir, ['--input', path, '--input-sha256', hash, '--out', out], out, spec)
        assert.equal(r.hits, spec.alsoClose === true ? 2 : 1, `${label}: each fault was reached once`)
        assertRefusal(r, 'output_unusable', UNUSABLE, dir, label)
        assert.equal(r.leftovers.length, left, `${label}: ${r.leftovers.join(',')}`)
        for (const f of r.leftovers) rmSync(join(dir, f))
      }
    })
  })

  it('a programming error while writing stays visible, and the temporary file is still removed', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, corpus())
      const out = join(dir, 'typed.json')
      const r = runWithFault(dir, ['--input', path, '--input-sha256', hash, '--out', out], out, {
        fn: 'writeFileSync',
        kind: 'type',
      })
      assert.equal(r.hits, 1)
      assert.equal(r.status, 1)
      assert.match(r.stderr, /TypeError: contract fault: not a system error/)
      assert.equal(r.report, false)
      assert.deepEqual(r.leftovers, [])
    })
  })

  it('foreign files are never overwritten or removed: present before, created during, or replacing the temporary', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, corpus())
      const before = join(dir, 'before.json')
      writeFileSync(before, 'foreign-before')
      const r1 = runWithFault(
        dir,
        ['--input', path, '--input-sha256', hash, '--out', before],
        join(dir, 'unused1.json'),
      )
      assert.equal(r1.status, 2)
      assert.equal(r1.stderr, 'intake-observe: output_exists: the report path already exists; nothing is overwritten\n')
      assert.equal(readFileSync(before, 'utf8'), 'foreign-before')
      const race = join(dir, 'race.json')
      const r2 = runWithFault(dir, ['--input', path, '--input-sha256', hash, '--out', race], race, {
        fn: 'linkSync',
        kind: 'foreignThenCall',
        foreign: 'foreign-race',
      })
      assert.equal(r2.hits, 1)
      assert.equal(r2.status, 2)
      assert.equal(
        r2.stderr,
        'intake-observe: output_exists: the report path appeared while writing; nothing is overwritten\n',
      )
      assert.equal(readFileSync(race, 'utf8'), 'foreign-race')
      assert.deepEqual(r2.leftovers, [])
      const swapped = join(dir, 'swapped.json')
      const r3 = runWithFault(dir, ['--input', path, '--input-sha256', hash, '--out', swapped], swapped, {
        fn: 'linkSync',
        kind: 'replaceThenFail',
        code: 'EIO',
        foreign: 'foreign-replacement',
      })
      assert.equal(r3.hits, 1)
      assertRefusal(r3, 'output_unusable', UNUSABLE, dir, 'replaced temporary')
      assert.equal(r3.leftovers.length, 1, 'the replacement is preserved under the temporary name')
      assert.equal(readFileSync(join(dir, r3.leftovers[0] ?? ''), 'utf8'), 'foreign-replacement')
    })
  })

  it('after a synced, linked report, a close failure changes nothing', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, corpus())
      const out = join(dir, 'closed.json')
      const r = runWithFault(dir, ['--input', path, '--input-sha256', hash, '--out', out], out, {
        fn: 'closeSync',
        code: 'EIO',
      })
      assert.equal(r.hits, 1)
      assert.ok(r.status === 0 || r.status === 1, r.stderr)
      assert.equal(r.stderr, '')
      assert.equal(r.report, true)
      assert.deepEqual(r.leftovers, [])
    })
  })

  it('after a published report, a failed removal of the temporary copy warns and keeps the report and its exit', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, corpus())
      const out = join(dir, 'kept.json')
      const r = runWithFault(dir, ['--input', path, '--input-sha256', hash, '--out', out], out, {
        fn: 'unlinkSync',
        code: 'EIO',
      })
      assert.equal(r.hits, 1)
      assert.ok(r.status === 0 || r.status === 1, r.stderr)
      assert.equal(r.report, true)
      assert.equal(JSON.parse(readFileSync(out, 'utf8')).schema, 'sophia.intake-observation.report.v7')
      assert.equal(
        r.stderr,
        'intake-observe: warning: temporary_report_left: a private temporary copy of the report could not be removed\n',
      )
      assert.match(r.stdout, /^intake-observe: \d+\/\d+ observed, /)
      assert.equal(r.leftovers.length, 1, 'the leftover is real and said to be')
    })
  })
})

/** A corpus whose fixture declarations are replaced by the given JSON text (so __proto__ stays an own data key). */
function withFixtures(fixturesJson: string | undefined, reference: string | undefined): TestDoc {
  const doc = corpus()
  delete doc.authorityFixtures
  delete doc.authorityFixtureSha256
  const parsed = JSON.parse(
    `{${[fixturesJson === undefined ? '' : `"authorityFixtures":${fixturesJson}`, reference === undefined ? '' : `"authorityFixtureSha256":${reference}`].filter((x) => x !== '').join(',')}}`,
  ) as Record<string, unknown>
  return Object.assign(doc, parsed)
}

const BODY = JSON.stringify(fixtureBody())
const MALFORMED_JSON = ['null', 'true', '7', '"x"', '[]', '[{}]']

describe('r29: malformed fixture declarations refuse the file (input_invalid_authority_fixtures, exit 2, no report)', () => {
  const invalid: [string, TestDoc][] = [
    ...MALFORMED_JSON.filter((x) => x !== '[{}]').map((c): [string, TestDoc] => [
      `container ${c}`,
      withFixtures(c, `"${FIXTURE_SHA256}"`),
    ]),
    ...MALFORMED_JSON.map((e): [string, TestDoc] => [
      `entry ${e}`,
      withFixtures(`{"bad":${e}}`, `"${FIXTURE_SHA256}"`),
    ]),
    ...MALFORMED_JSON.map((e): [string, TestDoc] => [
      `valid plus ${e}`,
      withFixtures(`{"${FIXTURE_ID}":${BODY},"bad":${e}}`, `"${FIXTURE_SHA256}"`),
    ]),
    ['all invalid', withFixtures('{"a":null,"b":7,"c":[]}', undefined)],
    ['valid plus invalid listed first', withFixtures(`{"bad":null,"${FIXTURE_ID}":${BODY}}`, `"${FIXTURE_SHA256}"`)],
    ...[
      '7',
      `"${FIXTURE_SHA256.toUpperCase()}"`,
      `"${FIXTURE_SHA256.slice(1)}"`,
      `"${'z'.repeat(64)}"`,
      'null',
      `["${FIXTURE_SHA256}"]`,
    ].map((declared): [string, TestDoc] => [
      `reference ${declared.slice(0, 12)}`,
      withFixtures(`{"${FIXTURE_ID}":${BODY}}`, declared),
    ]),
    ['reference without fixtures', withFixtures(undefined, '7')],
    ['shape before depth', withFixtures(`{"deep":${JSON.stringify(nested(40, 'object'))},"bad":null}`, undefined)],
  ]

  it('in the built report', () => {
    for (const [label, doc] of invalid)
      assert.throws(
        () => report(doc),
        (err: unknown) => err instanceof UsageError && err.code === 'input_invalid_authority_fixtures',
        label,
      )
  })

  it('in the written report from the command line', () => {
    withTmp((dir) => {
      for (const [i, [label, doc]] of invalid.entries()) {
        const { path, hash } = writeCorpus(dir, doc)
        const out = join(dir, `f${String(i)}.json`)
        assertRefusal(
          runWithFault(dir, ['--input', path, '--input-sha256', hash, '--out', out], out),
          'input_invalid_authority_fixtures',
          'the declared authority fixtures or their reference are malformed',
          dir,
          label,
        )
      }
    })
  })
})

describe('r29: valid fixture declarations keep their provenance-only meaning', () => {
  const baseline = () => {
    const doc = withFixtures(undefined, undefined)
    return report(doc).cases.map((c) => c.observation)
  }
  const emptyHash = sha256(canonicalJson({}))
  const other = { purpose: 'second public fixture' }
  const otherHash = sha256(canonicalJson(other))
  const valid: [string, TestDoc, { id: string; ref: string | null; match: boolean | null }[]][] = [
    ['absent', withFixtures(undefined, undefined), []],
    ['empty map', withFixtures('{}', undefined), []],
    ['empty map with a reference', withFixtures('{}', `"${FIXTURE_SHA256}"`), []],
    [
      'empty body, matching',
      withFixtures('{"empty":{}}', `"${emptyHash}"`),
      [{ id: 'empty', ref: emptyHash, match: true }],
    ],
    [
      'one body, matching',
      withFixtures(`{"${FIXTURE_ID}":${BODY}}`, `"${FIXTURE_SHA256}"`),
      [{ id: FIXTURE_ID, ref: FIXTURE_SHA256, match: true }],
    ],
    [
      'one body, mismatching',
      withFixtures(`{"${FIXTURE_ID}":${BODY}}`, `"${'a'.repeat(64)}"`),
      [{ id: FIXTURE_ID, ref: 'a'.repeat(64), match: false }],
    ],
    [
      'one body, no reference',
      withFixtures(`{"${FIXTURE_ID}":${BODY}}`, undefined),
      [{ id: FIXTURE_ID, ref: null, match: null }],
    ],
    [
      'two bodies cannot be corpus-verified',
      withFixtures(`{"${FIXTURE_ID}":${BODY},"other":${JSON.stringify(other)}}`, `"${otherHash}"`),
      [
        { id: FIXTURE_ID, ref: null, match: null },
        { id: 'other', ref: null, match: null },
      ],
    ],
    [
      'arbitrary ids are data',
      withFixtures(`{"":{},"${'k'.repeat(300)}":{},"__proto__":{},"constructor":{}}`, undefined),
      ['', 'k'.repeat(300), '__proto__', 'constructor'].map((id) => ({ id, ref: null, match: null })),
    ],
  ]

  it('built and written: provenance as declared, observations and admissions unchanged', () => {
    const observations = baseline()
    withTmp((dir) => {
      for (const [i, [label, doc, want]] of valid.entries()) {
        const built = report(doc)
        const got = built.syntheticAuthority.fixtures.map((f) => ({
          id: f.id,
          ref: f.corpusReference,
          match: f.matchesCorpusReference,
        }))
        assert.deepEqual(got, want, label)
        assert.deepEqual(
          built.cases.map((c) => c.observation),
          observations,
          label,
        )
        assert.ok(
          built.cases.every((c) => c.observation.admission.authority === 'none'),
          label,
        )
        const { path, hash } = writeCorpus(dir, doc)
        const out = join(dir, `v${String(i)}.json`)
        const r = runWithFault(dir, ['--input', path, '--input-sha256', hash, '--out', out], out)
        assert.ok(r.status === 0 || r.status === 1, `${label}: ${r.stderr}`)
        assert.equal(r.stderr, '', label)
        const written = JSON.parse(readFileSync(out, 'utf8')) as ReturnType<typeof report>
        assert.deepEqual(written.syntheticAuthority, built.syntheticAuthority, label)
      }
    })
  })

  it('a valid but over-deep body is still input_fixture_too_deep', () => {
    const doc = withFixtures(`{"deep":${JSON.stringify(nested(40, 'object'))}}`, undefined)
    assert.throws(
      () => report(doc),
      (err: unknown) => err instanceof UsageError && err.code === 'input_fixture_too_deep',
    )
  })
})

// r29 repair1 (R29-F01): a successful link publishes only the regular file this run wrote and synced. The temporary name
// is fenced right before the link and the report path is verified right after it, so a replacement after the fsync or
// at the link call itself never becomes successful foreign output. Fresh public data; contract fault seam as above.
const IDENTITY = 'the report could not be published as written; anything at the report path is not this report'

describe('r29 repair1: a successful link publishes only the file this run wrote', () => {
  it('a valid report is published as a regular file, linked once, with nothing left over', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, corpus())
      const out = join(dir, 'valid.json')
      const r = runWithFault(dir, ['--input', path, '--input-sha256', hash, '--out', out], out, { fn: 'none' })
      assert.ok(r.status === 0 || r.status === 1, r.stderr)
      assert.equal(r.stderr, '')
      assert.match(r.stdout, /^intake-observe: \d+\/\d+ observed, /)
      assert.equal(r.links, 1)
      assert.ok(lstatSync(out).isFile())
      assert.equal(
        (JSON.parse(readFileSync(out, 'utf8')) as { schema: string }).schema,
        'sophia.intake-observation.report.v7',
      )
      assert.deepEqual(r.leftovers, [])
    })
  })

  for (const replacement of ['regular', 'symlink'] as const) {
    it(`a ${replacement} replacement of the temporary after the fsync is fenced: no link, no success`, () => {
      withTmp((dir) => {
        const { path, hash } = writeCorpus(dir, corpus())
        const control = join(dir, 'control.txt')
        writeFileSync(control, 'FOREIGN-CONTROL')
        const out = join(dir, `fsync-${replacement}.json`)
        const r = runWithFault(dir, ['--input', path, '--input-sha256', hash, '--out', out], out, {
          fn: 'fsyncSync',
          kind: 'replaceAfter',
          replacement,
          foreign: 'FOREIGN-REGULAR',
          control,
        })
        assert.equal(r.hits, 1, 'the real fsync ran, then the name was replaced')
        assert.equal(r.links, 0, 'nothing was linked from the replaced name')
        assertRefusal(r, 'output_unusable', IDENTITY, dir, `fsync ${replacement}`)
        assert.equal(r.leftovers.length, 1, 'the replacement is foreign and is left where it is')
        const left = join(dir, r.leftovers[0] ?? '')
        if (replacement === 'symlink') assert.ok(lstatSync(left).isSymbolicLink())
        else assert.equal(readFileSync(left, 'utf8'), 'FOREIGN-REGULAR')
        assert.equal(readFileSync(control, 'utf8'), 'FOREIGN-CONTROL')
      })
    })

    it(`a ${replacement} replacement at the link call, after the fence, is caught by the published-path check`, () => {
      withTmp((dir) => {
        const { path, hash } = writeCorpus(dir, corpus())
        const control = join(dir, 'control.txt')
        writeFileSync(control, 'FOREIGN-CONTROL')
        const out = join(dir, `link-${replacement}.json`)
        const r = runWithFault(dir, ['--input', path, '--input-sha256', hash, '--out', out], out, {
          fn: 'linkSync',
          kind: 'replaceThenCall',
          replacement,
          foreign: 'FOREIGN-REGULAR',
          control,
        })
        assert.equal(r.hits, 1, 'the name was replaced at the link call and the real link ran')
        assert.equal(r.links, 1)
        assertRefusal(r, 'output_unusable', IDENTITY, dir, `link ${replacement}`)
        assert.equal(r.leftovers.length, 1, 'the replacement keeps its own name')
        const left = join(dir, r.leftovers[0] ?? '')
        if (replacement === 'symlink') assert.ok(lstatSync(left).isSymbolicLink())
        else assert.equal(readFileSync(left, 'utf8'), 'FOREIGN-REGULAR')
        assert.equal(readFileSync(control, 'utf8'), 'FOREIGN-CONTROL')
      })
    })
  }

  it('a report path replaced right after the link is not announced, and the foreign file there is untouched', () => {
    withTmp((dir) => {
      const { path, hash } = writeCorpus(dir, corpus())
      const out = join(dir, 'swapped-out.json')
      const r = runWithFault(dir, ['--input', path, '--input-sha256', hash, '--out', out], out, {
        fn: 'linkSync',
        kind: 'callThenReplaceOut',
        foreign: 'FOREIGN-AT-OUT',
      })
      assert.equal(r.hits, 1)
      assert.equal(r.status, 2)
      assert.equal(r.stdout, '')
      assert.equal(r.stderr, `intake-observe: output_unusable: ${IDENTITY}\n`)
      assert.equal(readFileSync(out, 'utf8'), 'FOREIGN-AT-OUT', 'what another party put there is not removed')
      assert.deepEqual(r.leftovers, [], 'the temporary this run created and still owns is removed')
    })
  })
})
