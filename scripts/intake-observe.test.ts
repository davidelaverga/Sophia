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
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalJson } from '../packages/coordination/src/canonical.ts'
import type { IntakeObservation } from '../packages/coordination/src/intake-observation.ts'
import { buildReport, checkOutputPath, parseCli, parseCorpus, REPOSITORY_ROOT, UsageError } from './intake-observe.ts'

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
      assert.equal(written.schema, 'sophia.intake-observation.report.v5')
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
        target: 'm9',
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
      assert.equal(written.schema, 'sophia.intake-observation.report.v5')
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
  counts: { observed: number; invalidCases: number; byFamily: Record<string, unknown>; byKind: Record<string, unknown> }
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
    ['unlabelled', 1],
    ['test_family', 3],
  ] as const) {
    assert.ok(Object.hasOwn(families, name), name)
    assert.equal(families[name], n, name)
  }
  const values = Object.values(families)
  assert.ok(values.every((v) => typeof v === 'number'))
  assert.equal(
    values.reduce((sum: number, v) => sum + (typeof v === 'number' ? v : 0), 0),
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
