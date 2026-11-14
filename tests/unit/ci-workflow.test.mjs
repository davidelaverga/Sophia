// PR519-CI-PAIRING-REPAIR-001: the `ci` workflow's scheduling, read from the maintained file itself.
//
// A branch push and the pull request it updates used to share one concurrency group with cancel-in-progress, so the
// pull request's run (always a few seconds later) cancelled the push's run, and the push run's aggregate check, which
// runs under always(), then failed on its cancelled parts. These checks parse .github/workflows/ci.yml and evaluate its
// concurrency expressions for bounded GitHub contexts. The evaluator is a LOCAL MODEL of the few expression forms the
// two fields use (GitHub's documented `||`, `&&`, `==`, `!=` on strings), not GitHub's scheduler: it shows which runs
// share a group, and it refuses any other syntax rather than guess.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { parse } from 'yaml'

const WORKFLOW = new URL('../../.github/workflows/ci.yml', import.meta.url)
const ci = parse(readFileSync(WORKFLOW, 'utf8'))

/** The group key d3e5ba9c shipped, under which a push and its pull request shared one lane. */
const D3E_GROUP = "ci-${{ github.head_ref || (github.ref_name == 'main' && github.sha) || github.ref_name }}"

const TOKEN = /\s*(\|\||&&|==|!=|\(|\)|'(?:[^']|'')*'|[A-Za-z_][\w.-]*)/y
function expression(source, ctx) {
  const tokens = []
  TOKEN.lastIndex = 0
  while (TOKEN.lastIndex < source.trimEnd().length) {
    const m = TOKEN.exec(source)
    if (!m) throw new Error(`unsupported expression syntax at ${String(TOKEN.lastIndex)}: ${source}`)
    tokens.push(m[1])
  }
  let at = 0
  const next = () => tokens[at++]
  const truthy = (v) => v !== '' && v !== false && v !== null && v !== undefined
  function primary() {
    const t = next()
    if (t === '(') {
      const v = or()
      assert.equal(next(), ')', `unbalanced parentheses: ${source}`)
      return v
    }
    if (t?.startsWith("'")) return t.slice(1, -1).replaceAll("''", "'")
    if (t?.startsWith('github.') && Object.hasOwn(ctx, t)) return ctx[t]
    throw new Error(`unsupported operand ${String(t)} in: ${source}`)
  }
  function comparison() {
    const left = primary()
    if (tokens[at] !== '==' && tokens[at] !== '!=') return left
    const op = next()
    // GitHub compares strings case-insensitively.
    const same = String(left).toLowerCase() === String(primary()).toLowerCase()
    return op === '==' ? same : !same
  }
  function and() {
    let v = comparison()
    while (tokens[at] === '&&') {
      next()
      const r = comparison()
      v = truthy(v) ? r : v
    }
    return v
  }
  function or() {
    let v = and()
    while (tokens[at] === '||') {
      next()
      const r = and()
      v = truthy(v) ? v : r
    }
    return v
  }
  const value = or()
  assert.equal(at, tokens.length, `trailing tokens in: ${source}`)
  return value
}
/** A `${{ }}` template, as GitHub interpolates it; a field that is one whole expression keeps the expression's value. */
function evaluate(template, ctx) {
  // A literal YAML value (`cancel-in-progress: false`) is its own value: there is nothing to interpolate.
  if (typeof template !== 'string') return template
  const whole = /^\$\{\{(.*)\}\}$/s.exec(template)
  if (whole && !whole[1].includes('}}')) return expression(whole[1], ctx)
  return template.replace(/\$\{\{(.*?)\}\}/g, (_, e) => String(expression(e, ctx)))
}

// The values GitHub documents for each event: head_ref is set only on pull_request, whose ref_name is `<n>/merge` and
// whose sha is the merge commit's.
const push = (branch, sha) => ({ 'github.event_name': 'push', 'github.head_ref': '', 'github.ref_name': branch, 'github.sha': sha })
const pullRequest = (branch, n, mergeSha) => ({ 'github.event_name': 'pull_request', 'github.head_ref': branch, 'github.ref_name': `${String(n)}/merge`, 'github.sha': mergeSha })
const lane = (ctx, group = ci.concurrency.group) => ({ group: evaluate(group, ctx), cancel: evaluate(ci.concurrency['cancel-in-progress'], ctx) })

const BRANCH = 'inc04-s01b-coherent-001'

describe('ci concurrency: a push and its pull request are separate lanes (PR519-CI-PAIRING-REPAIR-001)', () => {
  it('fail-before: under d3e5ba9c’s group, the pull request for the same head joins the push’s group with cancel-in-progress', () => {
    const p = lane(push(BRANCH, 'd3e5ba9c'), D3E_GROUP)
    const r = lane(pullRequest(BRANCH, 519, 'cab9abe0'), D3E_GROUP)
    assert.equal(p.group, `ci-${BRANCH}`)
    assert.equal(r.group, p.group, 'one group: the later pull request run cancels the push run (8 of 8 heads on PR519)')
    assert.equal(r.cancel, true)
  })

  it('the push and the pull request for the same head are in different groups, so neither cancels the other', () => {
    const p = lane(push(BRANCH, 'd3e5ba9c'))
    const r = lane(pullRequest(BRANCH, 519, 'cab9abe0'))
    assert.equal(p.group, `ci-push-${BRANCH}`)
    assert.equal(r.group, `ci-pull_request-${BRANCH}`)
    assert.notEqual(p.group, r.group)
  })

  it('a newer push on a branch still cancels the older push', () => {
    const older = lane(push(BRANCH, 'e62c4ad5'))
    const newer = lane(push(BRANCH, 'd3e5ba9c'))
    assert.equal(newer.group, older.group)
    assert.equal(newer.cancel, true)
  })

  it('a newer pull request event still cancels the older pull request run', () => {
    const older = lane(pullRequest(BRANCH, 519, 'aaaa0001'))
    const newer = lane(pullRequest(BRANCH, 519, 'aaaa0002'))
    assert.equal(newer.group, older.group)
    assert.equal(newer.cancel, true)
  })

  it('the trade-off, as it is: a newer push does not cancel an older pull request run; the next pull request event does', () => {
    const olderPr = lane(pullRequest(BRANCH, 519, 'aaaa0001'))
    assert.notEqual(lane(push(BRANCH, 'd3e5ba9c')).group, olderPr.group)
    assert.equal(lane(pullRequest(BRANCH, 519, 'aaaa0002')).group, olderPr.group)
  })

  it('different branches stay in different groups, for pushes and for pull requests', () => {
    assert.notEqual(lane(push('a-branch', 's1')).group, lane(push('b-branch', 's1')).group)
    assert.notEqual(lane(pullRequest('a-branch', 1, 'm1')).group, lane(pullRequest('b-branch', 2, 'm1')).group)
  })

  it('main keeps every commit: each is its own group, and nothing on main is cancelled', () => {
    const c1 = lane(push('main', 'c1c1c1c1'))
    const c2 = lane(push('main', 'c2c2c2c2'))
    assert.equal(c1.group, 'ci-push-c1c1c1c1')
    assert.notEqual(c1.group, c2.group)
    assert.equal(c1.cancel, false)
    assert.equal(c2.cancel, false)
    assert.equal(lane(push(BRANCH, 's')).cancel, true, 'a branch push is still cancellable by a newer one')
  })

  it('the model refuses syntax it does not know instead of guessing', () => {
    assert.throws(() => evaluate("ci-${{ format('{0}', github.ref) }}", push(BRANCH, 's')), /unsupported/)
    assert.throws(() => evaluate('ci-${{ github.run_id }}', push(BRANCH, 's')), /unsupported operand/)
  })
})

describe('ci: everything else in the workflow is unchanged from d3e5ba9c', () => {
  it('triggers, permissions, jobs, check names and action pins are the ones d3e5ba9c carried', () => {
    assert.deepEqual(Object.keys(ci.on), ['push', 'pull_request'])
    assert.equal(ci.on.push, null, 'every branch push runs')
    assert.equal(ci.on.pull_request, null, 'every pull request event runs')
    assert.deepEqual(ci.permissions, { contents: 'read' })
    assert.deepEqual(
      Object.entries(ci.jobs).map(([id, job]) => [id, job.name ?? id]),
      [
        ['runtime-unit', 'runtime-unit'],
        ['renderer', 'Confined PDF renderer on a real Chromium'],
        ['database', 'SQL, persistence and API on PostgreSQL 16'],
        ['room-media', 'Media bridge against a real LiveKit server'],
        ['supabase-live', 'Live auth on local Supabase'],
        ['studio-browser-part', 'The room in Chromium, part ${{ matrix.part }} of 3'],
        ['studio-browser', 'The room in Chromium, on its fixture page'],
      ],
    )
    const pins = new Set(Object.values(ci.jobs).flatMap((job) => (job.steps ?? []).map((s) => s.uses).filter(Boolean)))
    assert.deepEqual([...pins].toSorted(), [
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
      'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
      'pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413',
    ])
    assert.equal(ci.jobs['studio-browser-part'].strategy['fail-fast'], false)
    assert.deepEqual(ci.jobs['studio-browser-part'].strategy.matrix.part, [1, 2, 3])
  })

  it('the whole parsed workflow, apart from the concurrency group, is byte-for-byte the structure d3e5ba9c parsed to', () => {
    // A digest of the parsed workflow with only concurrency.group set back to d3e5ba9c's value. Any other change to a
    // trigger, job, step, timeout, service, pin, permission, matrix or the aggregate changes it; update it only with a
    // reviewed reason.
    const rest = structuredClone(ci)
    rest.concurrency.group = D3E_GROUP
    const digest = createHash('sha256').update(JSON.stringify(rest)).digest('hex')
    assert.equal(digest, 'fc501764446a618da3ad44170b8cbf0fe266943c13e31903986c04e37110448f')
  })
})

describe('ci: the room’s aggregate check still passes only when every part ran and passed', () => {
  const aggregate = ci.jobs['studio-browser']

  it('runs even after a cancellation, so it is never absent, and reads the parts’ combined result', () => {
    assert.equal(aggregate.needs, 'studio-browser-part')
    assert.equal(aggregate.if, 'always()')
    assert.equal(aggregate.steps.length, 1)
    assert.equal(aggregate.steps[0].env.PARTS, '${{ needs.studio-browser-part.result }}')
  })

  // The step's own shell text, run as GitHub runs it (bash -e), for each result `needs` can report. A part that timed
  // out reports `failure` or `cancelled` there, never success.
  for (const [parts, ok] of [
    ['success', true],
    ['failure', false],
    ['cancelled', false],
    ['skipped', false],
  ]) {
    it(`parts ${parts}: the aggregate ${ok ? 'passes' : 'fails'}`, () => {
      const run = spawnSync('bash', ['-e', '-c', aggregate.steps[0].run], { env: { PATH: process.env.PATH, PARTS: parts }, encoding: 'utf8' })
      assert.equal(run.stdout.trim(), `The room's three parts: ${parts}`)
      assert.equal(run.status === 0, ok, `exit ${String(run.status)}`)
    })
  }
})
