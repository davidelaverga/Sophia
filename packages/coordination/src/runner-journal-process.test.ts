// One writer per gateway journal across REAL processes (r2, R1-F02): each contender is a separate Node process running
// runner-contender.fixture.ts with its own FAKE T3, so every native mutation is counted per process and summed here.
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FakeT3 } from './runner-fake-t3.ts'
import { RunnerGateway } from './runner-gateway.ts'
import { RunnerJournal } from './runner-journal.ts'
import { digestOf, type RunnerEnvelope } from './runner-port.ts'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'runner-contender.fixture.ts')
const root = mkdtempSync(join(tmpdir(), 'sophia-runner-process-'))
/** Every contender this file starts: killed after the tests, so a failed assertion never leaves one holding a lock. */
const children: ReturnType<typeof spawn>[] = []
after(() => {
  for (const c of children) if (c.exitCode === null && c.signalCode === null) c.kill('SIGKILL')
  rmSync(root, { recursive: true, force: true })
})
let n = 0

const envelope: RunnerEnvelope = {
  v: 1,
  operationId: '00000000-0000-4000-8000-000000000001',
  kind: 'create',
  projectId: '00000000-0000-4000-8000-0000000000a1',
  ownerId: '00000000-0000-4000-8000-0000000000b1',
  resourceId: '00000000-0000-4000-8000-0000000000c1',
  bindingId: '00000000-0000-4000-8000-0000000000d1',
  goalId: '00000000-0000-4000-8000-0000000000e1',
  qualificationId: '00000000-0000-4000-8000-0000000000f1',
  qualificationRevision: 1,
  adapterPin: 'ade473018d32003658b7d38693e083ee2e314bd8',
  environmentRef: 'env-owner-1',
  nativeProjectRef: 'project-sophia',
  profileId: 'read-only-v1',
  profileRevision: 1,
  accountKey: 'claude:acct-1',
  authorityEpoch: 1,
  message: 'Report the Ask admission boundary.',
  title: 'Read-only qualification',
  targetOperationId: null,
  nativeThreadId: null,
}

interface Report {
  pid: number
  opened: boolean
  ready?: boolean
  error?: string
  answer?: string
  launches: number
  calls: number
}

function world() {
  const dir = join(root, `w${(n += 1)}`)
  const journal = join(dir, 'journal.jsonl')
  const envelopeFile = join(root, `envelope-${n}.json`)
  writeFileSync(envelopeFile, JSON.stringify(envelope))
  return { dir, journal, envelopeFile }
}

/** How long a contender may take to report before it is killed and its report rejected. */
const REPORT_MS = 30_000

/**
 * Start a contender; resolve its first report line, and its exit. The report is bounded: it rejects, and the child is
 * killed, if the child fails to start, exits before reporting, prints a line that is not a report, or does not report
 * within REPORT_MS. A broken fixture therefore fails its own test instead of hanging the run.
 */
function contender(
  journal: string,
  envelopeFile: string,
  mode: 'send' | 'send-and-crash' | 'hold' | 'silent',
  reportMs = REPORT_MS,
) {
  const child = spawn(process.execPath, [FIXTURE, journal, envelopeFile, mode], { stdio: ['pipe', 'pipe', 'inherit'] })
  children.push(child)
  const exit = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)))
  const report = new Promise<Report>((resolve, reject) => {
    let out = ''
    let settled = false
    const timer = setTimeout(
      () => fail(new Error(`contender (${mode}) did not report within ${reportMs} ms`)),
      reportMs,
    )
    function finish(): boolean {
      if (settled) return false
      settled = true
      clearTimeout(timer)
      return true
    }
    function fail(err: Error) {
      if (!finish()) return
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      reject(err)
    }
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8')
      const end = out.indexOf('\n')
      if (end < 0) return
      let parsed: unknown
      try {
        parsed = JSON.parse(out.slice(0, end))
      } catch {
        return fail(new Error(`contender (${mode}) printed a line that is not a report: ${out.slice(0, 200)}`))
      }
      if (finish()) resolve(parsed as Report)
    })
    child.on('error', (err) => fail(err))
    // `close`, not `exit`: it comes after the child's output is drained, so a report printed just before exiting counts.
    child.on('close', (code, signal) =>
      fail(new Error(`contender (${mode}) exited (${String(code ?? signal)}) before it reported`)),
    )
  })
  // A rejected report is still observed by the test that awaits it; this only keeps an unawaited one from crashing.
  report.catch(() => undefined)
  return { child, report, exit }
}

/**
 * Independent deadlines (r4, INC01-R3-F01). A test never waits on the report helper or a child's exit alone: each wait
 * races a sentinel timer of its own, separate from the helper's REPORT_MS timer, and asserts which settled first. A
 * broken helper (its own timer slowed or gone) therefore fails an assertion here; it is never only cancelled by an
 * outer runner timeout. The sentinel is always cleared, whichever wins.
 */
const REPORT_WAIT_MS = REPORT_MS + 15_000
const EXIT_WAIT_MS = 15_000
const SENTINEL = Symbol('independent sentinel')
type Settled<T> = { readonly value: T } | { readonly error: unknown }

async function settledWithin<T>(what: string, promise: Promise<T>, ms: number): Promise<Settled<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const sentinel = new Promise<typeof SENTINEL>((resolve) => {
    timer = setTimeout(() => resolve(SENTINEL), ms)
  })
  try {
    const winner = await Promise.race([
      promise.then(
        (value): Settled<T> => ({ value }),
        (error: unknown): Settled<T> => ({ error }),
      ),
      sentinel,
    ])
    if (winner === SENTINEL) assert.fail(`${what} did not settle within ${ms} ms: the independent sentinel won`)
    return winner
  } finally {
    clearTimeout(timer)
  }
}

/** The promise's value, asserted to arrive before an independent deadline. */
async function within<T>(what: string, promise: Promise<T>, ms: number): Promise<T> {
  const settled = await settledWithin(what, promise, ms)
  if ('error' in settled) throw settled.error
  return settled.value
}

/** The promise asserted to REJECT, matching `pattern`, before an independent deadline. */
async function rejectsWithin(what: string, promise: Promise<unknown>, ms: number, pattern: RegExp): Promise<void> {
  const settled = await settledWithin(what, promise, ms)
  assert.ok('error' in settled, `${what} resolved; it was expected to reject`)
  assert.match(settled.error instanceof Error ? settled.error.message : String(settled.error), pattern)
}

const reportOf = (c: ReturnType<typeof contender>, what = 'the contender report') =>
  within(what, c.report, REPORT_WAIT_MS)
const exitOf = (c: ReturnType<typeof contender>, what = 'the contender exit') => within(what, c.exit, EXIT_WAIT_MS)

/** Kill this test's own live children (only them), so a failed assertion leaves none running. */
function stop(...owned: ReturnType<typeof contender>[]): void {
  for (const { child } of owned) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
}

const journalLines = (file: string) =>
  readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { type: string; operationId?: string })

describe('the contender report is bounded', () => {
  it('rejects, and the run goes on, when a contender exits before it reports', async () => {
    const { journal } = world()
    const broken = contender(journal, join(root, 'no-such-envelope.json'), 'send')
    try {
      await rejectsWithin('the early-exit report', broken.report, 10_000, /exited \(\d+\) before it reported/)
      assert.notEqual(await exitOf(broken, 'the early-exit child'), 0)
    } finally {
      stop(broken)
    }
  })

  it('rejects and kills a contender that does not report in time', async () => {
    const { journal, envelopeFile } = world()
    // The helper's own bound is 300 ms; the independent sentinels below are 5 s and are not that timer.
    const silent = contender(journal, envelopeFile, 'silent', 300)
    try {
      await rejectsWithin('the silent report', silent.report, 5_000, /did not report within 300 ms/)
      await within('the silent child exit after its kill', silent.exit, 5_000)
      assert.equal(silent.child.signalCode, 'SIGKILL')
    } finally {
      stop(silent)
    }
  })
})

describe('one gateway journal writer across processes', () => {
  it('refuses a second process while the first holds the journal, then serves one writer after it lets go', async () => {
    const { journal, envelopeFile } = world()
    const holder = contender(journal, envelopeFile, 'hold')
    const owned = [holder]
    try {
      try {
        assert.equal((await reportOf(holder, 'the holder report')).ready, true)
        const refused = contender(journal, envelopeFile, 'send')
        owned.push(refused)
        const r = await reportOf(refused, 'the refused report')
        assert.equal(r.opened, false)
        assert.match(r.error ?? '', /held by live process/)
        assert.equal(r.calls, 0)
      } finally {
        holder.child.stdin.end()
      }
      assert.equal(await exitOf(holder, 'the holder exit'), 0)
      const next = contender(journal, envelopeFile, 'send')
      owned.push(next)
      const s = await reportOf(next, 'the next report')
      assert.equal(s.opened, true)
      assert.equal(s.launches, 1)
      assert.equal(journalLines(journal).filter((l) => l.type === 'possible_send').length, 1)
    } finally {
      stop(...owned)
    }
  })

  it('lets processes racing for one journal make at most one native mutation between them', async () => {
    const { journal, envelopeFile } = world()
    const racers = Array.from({ length: 4 }, () => contender(journal, envelopeFile, 'send'))
    let reports: Report[]
    try {
      reports = await within('the racers reports', Promise.all(racers.map((r) => r.report)), REPORT_WAIT_MS)
      await within('the racers exits', Promise.all(racers.map((r) => r.exit)), EXIT_WAIT_MS)
    } finally {
      stop(...racers)
    }
    assert.equal(
      reports.reduce((sum, r) => sum + r.launches, 0),
      1,
      JSON.stringify(reports),
    )
    // Each opener after the first answered from the journal; each refused one touched nothing.
    for (const r of reports) if (!r.opened) assert.equal(r.calls, 0)
    const lines = journalLines(journal)
    assert.equal(lines.filter((l) => l.type === 'intent').length, 1)
    assert.equal(lines.filter((l) => l.type === 'possible_send').length, 1)
  })

  it("recovers a crashed holder's stale lock, then reconciles: never a second send, under any namespace", async () => {
    const { dir, journal, envelopeFile } = world()
    const crashed = contender(journal, envelopeFile, 'send-and-crash')
    try {
      const c = await reportOf(crashed, 'the crashed report')
      assert.equal(c.answer, 'unknown')
      assert.equal(c.launches, 1, 'the native effect happened; its receipt was lost')
      await exitOf(crashed, 'the crashed exit')
    } finally {
      stop(crashed)
    }
    // The crashed process left its lock; this process recovers it (the holder is gone) and keeps it as evidence.
    const t3 = new FakeT3('client:fake-session-recovered')
    const gateway = new RunnerGateway({
      journal: new RunnerJournal(journal),
      transport: t3,
      profile: {
        ownerId: envelope.ownerId,
        environmentRef: envelope.environmentRef,
        adapterPin: envelope.adapterPin,
        nativeProjectRefs: new Set([envelope.nativeProjectRef]),
        accountKey: envelope.accountKey,
        profileId: envelope.profileId,
        profileRevision: envelope.profileRevision,
        operations: new Set(['create'] as const),
      },
    })
    assert.ok(readdirSync(dir).some((f) => f.includes('.lock.stale.')))
    const digest = digestOf(envelope)
    assert.equal((await gateway.send(envelope, digest, gateway.journalId)).kind, 'unknown')
    assert.equal((await gateway.reconcile({ envelope, digest, journalId: gateway.journalId })).kind, 'unknown')
    assert.equal(t3.effects.launches, 0)
    assert.equal(t3.count('t3_thread_launch'), 0)
    gateway.close()
  })
})
