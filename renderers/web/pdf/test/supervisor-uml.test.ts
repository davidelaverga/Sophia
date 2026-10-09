// SDD-01, Render: the supervisor's UML mode (SOPHIA_RENDER_ISOLATION=uml) against a stand-in API, with the launchers
// replaced by a stand-in guest. It shows the per-job protocol (the job on the input disk with the guest's paths, the
// output taken back from the fixed-size disk), the launchers' policy records required before any output is taken,
// and cancellation owned by the supervisor: a Stop or the job's time running out kills the launchers' whole process
// group, and nothing is uploaded or settled. The real launchers, kernel and browser run in the UML image (CI).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { ApiTimeout, HostTainted, runOnce, supervise } from '../supervisor.mjs'

const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')
// The UML host is Linux: the stand-in guest writes its output with GNU tar, as the guest's busybox writes ustar (macOS's
// bsdtar adds AppleDouble entries, which the reader rightly refuses), and the process checks read /proc.
const onLinux =
  process.platform === 'linux' && /GNU tar/u.test(spawnSync('tar', ['--version'], { encoding: 'utf8' }).stdout ?? '')
const hasPython = process.platform === 'linux' && spawnSync('python3', ['--version']).status === 0
const TOKEN = 'runner-capability'
const HTML = Buffer.from('<!doctype html><title>t</title><p>Città.</p><img src="img/chart.png">')
const PNG = Buffer.from('89504e470d0a1a0a', 'hex')

/** The stand-in guest: it prints the launchers' records, then renders a stand-in output onto the output disk. */
const GUEST = `
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const [mode, dir, pids] = process.argv.slice(2)
const say = (line) => process.stdout.write(line + '\\n')
const adverse = '{"event": "UML_HOST_ADVERSE_CONTROLS", "baseline_world_readable": true, "excluded_errno": {"/etc/hostname": 13, "/proc/1/environ": 13, "/run/token": 13}, "own_job_read_write": true, "symlink_errno": 13, "socket_errno": 1, "descendant_inherits": true, "hostCPUs": [0]}'
const policy = mode === 'weak'
  ? '{"event": "UML_HOST_POLICY_APPLIED", "landlockABI": 4, "uid": 10001, "seccomp": 0, "qualification": false}'
  : '{"event": "UML_HOST_POLICY_APPLIED", "landlockABI": 4, "uid": 10001, "seccomp": 2, "qualification": false}'
const pause = () => new Promise((r) => setTimeout(r, 60))
if (mode === 'split') {
  // The first record in two writes with a line of the other stream between them: each stream keeps its own line.
  process.stdout.write(adverse.slice(0, 40))
  await pause()
  process.stderr.write('a console line on the other stream\\n')
  await pause()
  process.stdout.write(adverse.slice(40) + '\\n')
  say(policy)
} else if (mode !== 'norecords') { say(adverse); say(policy) }
if (mode === 'hang') {
  const child = spawn('sleep', ['600'], { stdio: 'ignore' })
  fs.writeFileSync(pids, process.pid + ' ' + child.pid)
  setInterval(() => {}, 1000)
} else {
  const into = fs.mkdtempSync(path.join(dir, 'guest-'))
  if (spawnSync('tar', ['-xf', path.join(dir, 'input.tar'), '-C', into]).status !== 0) process.exit(3)
  const listing = spawnSync('tar', ['-tf', path.join(dir, 'input.tar')], { encoding: 'utf8' }).stdout.trim().split('\\n')
  const job = JSON.parse(fs.readFileSync(path.join(into, 'job.json'), 'utf8'))
  const kernel = fs.readFileSync(path.join(into, 'kernel'), 'utf8')
  const out = path.join(into, 'out')
  fs.mkdirSync(out)
  const sha = (b) => createHash('sha256').update(b).digest('hex')
  const seen = { job, kernel, listing, entry: fs.readFileSync(path.join(into, 'src', 'report.html'), 'utf8') }
  let receipt
  if (kernel === 'pdf') {
    const pdf = Buffer.from('%PDF-1.7 stand-in')
    fs.writeFileSync(path.join(out, 'report.pdf'), pdf)
    receipt = { status: 'succeeded', output: { sha256: sha(pdf) }, seen }
  } else {
    const png = Buffer.from('stand-in capture')
    fs.writeFileSync(path.join(out, 'w390-light-overview-1.png'), png)
    receipt = { status: 'succeeded', captures: [{ name: 'w390-light-overview-1.png', sha256: sha(png) }], seen }
  }
  if (mode === 'link') { fs.rmSync(path.join(out, 'report.pdf')); fs.symlinkSync('/etc/passwd', path.join(out, 'report.pdf')) }
  fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt))
  const tarred = spawnSync('tar', ['-cf', '-', '-C', out, '.'], { maxBuffer: 1 << 26 }).stdout
  const fd = fs.openSync(path.join(dir, 'output.img'), 'r+')
  fs.writeSync(fd, tarred, 0, tarred.length, 0)
  fs.closeSync(fd)
  if (mode === 'duplicate') say(policy)
  // The guest's side puts a FIFO where its output disk was: the supervisor reads the disk it made, never this path.
  if (mode === 'fifo') { fs.rmSync(path.join(dir, 'output.img')); spawnSync('mkfifo', [path.join(dir, 'output.img')]) }
  // A descendant whose main thread exited while another runs on: it reads Z, and is alive.
  if (mode === 'zombie') {
    const py = 'import ctypes, os, platform, threading, time\\n' +
      'def work():\\n    time.sleep(30)\\n    os._exit(0)\\n' +
      'threading.Thread(target=work).start()\\ntime.sleep(0.1)\\n' +
      'ctypes.CDLL(None).syscall(60 if platform.machine() == "x86_64" else 93, 0)\\n'
    const left = spawn('python3', ['-I', '-c', py], { stdio: 'ignore' })
    left.unref()
    fs.writeFileSync(pids, process.pid + ' ' + left.pid)
    await new Promise((r) => setTimeout(r, 400))
  }
  // A descendant left behind in the launchers' group, deaf to TERM, when the leader exits on its own.
  if (mode === 'orphan') {
    const left = spawn('sh', ['-c', 'trap "" TERM; sleep 600'], { stdio: 'ignore' })
    left.unref()
    fs.writeFileSync(pids, process.pid + ' ' + left.pid)
  }
  say('UML_JOB_KERNEL_EXIT:0\\u0007\\u001b[2J')
}
`

type Job = { format: 'pdf' | 'png'; timeoutMs?: number }
type Seen = { uploads: { route: string; bytes: Buffer }[]; settles: unknown[]; beats: number }
type Reply = { status: number; value: unknown; type?: string }

const keepGoing = (): string => 'continue'

/** The claim's reply for one job: its package (the entry, and for a PDF an image), its format and its time. */
function claimed(job: Job): Reply {
  const files = [
    { path: 'report.html', role: 'entry', sha256: sha(HTML), byteLength: HTML.length },
    ...(job.format === 'pdf'
      ? [{ path: 'img/chart.png', role: 'asset', sha256: sha(PNG), byteLength: PNG.length }]
      : []),
  ]
  const targets = job.format === 'png' ? ['w390-light'] : []
  const timeoutMs = job.timeoutMs ?? 120_000
  return {
    status: 200,
    value: {
      job: {
        jobId: 'job-1',
        leaseToken: 'lease-1',
        language: 'it',
        sourceManifestHash: 'm',
        timeoutMs,
        files,
        format: job.format,
        targets,
        sections: null,
      },
    },
  }
}

/** What the sentinel settles to: the work raced against it had not settled in its time. */
const LOST = Symbol('the work had not settled in its time')

/**
 * What `work` settles to (its value, or what it rejected with), or LOST if it has not settled within `ms`. A test that
 * awaits this and asserts LOST lost fails, never hangs, when the work would wait for good (CONTRIBUTING.md).
 */
async function within(work: Promise<unknown>, ms: number): Promise<unknown> {
  let timer: NodeJS.Timeout | undefined
  const sentinel = new Promise<typeof LOST>((resolve) => {
    timer = setTimeout(() => resolve(LOST), ms)
  })
  try {
    return await Promise.race([work.catch((error: unknown) => error), sentinel])
  } finally {
    clearTimeout(timer)
  }
}

/** Kill the whole process group of the stand-in guest whose pids a file holds (its leader's first), if any is left. */
function killGroup(file: string): void {
  const [leader] = readFileSync(file, 'utf8').split(' ').map(Number)
  try {
    if (leader) process.kill(-leader, 'SIGKILL')
  } catch {
    // already gone
  }
}

/** Whether a process runs on: present, and not a zombie (one thread left); one whose main thread exited still runs. */
function alive(pid: number | undefined): boolean {
  try {
    const status = readFileSync(`/proc/${String(pid)}/status`, 'utf8')
    const threads = Number(/^Threads:\s+(\d+)/mu.exec(status)?.[1] ?? 1)
    return !/^State:\s+Z/mu.test(status) || threads > 1
  } catch {
    return false
  }
}

/** Whether a process still runs: present in /proc and not a zombie waiting for its reaper. */
function running(pid: number | undefined): boolean {
  try {
    return !/^\d+ \(.*\) Z /su.test(readFileSync(`/proc/${String(pid)}/stat`, 'utf8'))
  } catch {
    return false
  }
}

describe(
  'the supervisor in UML mode (SDD-01)',
  { skip: !onLinux && 'the UML host is Linux, with GNU tar and /proc' },
  () => {
    const scratch = mkdtempSync(join(tmpdir(), 'sophia-supervisor-uml-'))
    const guest = join(scratch, 'guest.mjs')
    const work = join(scratch, 'work')
    let base = ''
    let server: ReturnType<typeof createServer>
    let next: Job | null = null
    let beat: () => string = keepGoing
    let seen: Seen = { uploads: [], settles: [], beats: 0 }
    /** Routes the stand-in API answers with headers and part of a body, and never finishes. */
    let silent = new Set<string>()
    /** Routes the stand-in API carries out (an upload is recorded) and then answers as `silent` does: the answer lost. */
    let lost = new Set<string>()
    /** The job the stand-in last handed out, and how many settlements it refused. */
    let current: Job | null = null
    let refusedSettles = 0

    before(async () => {
      writeFileSync(guest, GUEST)
      spawnSync('mkdir', ['-p', '-m', '0755', work])
      /** As renderer_settle: a succeeded PDF settles only with the output its lease recorded. */
      const settleReply = (body: Buffer): Reply => {
        const settle = JSON.parse(body.toString('utf8')) as { receipt?: { status?: string } }
        const recorded = seen.uploads.some((u) => u.route === '/v1/renderer/jobs/job-1/output')
        if (settle.receipt?.status === 'succeeded' && current?.format === 'pdf' && !recorded) {
          refusedSettles += 1
          return { status: 422, value: { code: 'invalid_request', message: 'names its recorded output' } }
        }
        seen.settles.push(settle)
        return { status: 200, value: { state: 'settled' } }
      }
      /** The stand-in API's reply to one request. */
      const reply = (req: IncomingMessage, body: Buffer): Reply => {
        const url = new URL(req.url ?? '/', 'http://x')
        if (req.headers.authorization !== `Bearer ${TOKEN}`) return { status: 401, value: { error: 'no' } }
        if (url.pathname === '/v1/renderer/claim') {
          const job = next
          next = null
          current = job ?? current
          return job ? claimed(job) : { status: 200, value: { job: null } }
        }
        if (url.pathname === '/v1/renderer/jobs/job-1/file') {
          const bytes = url.searchParams.get('path') === 'report.html' ? HTML : PNG
          return { status: 200, value: bytes, type: 'application/octet-stream' }
        }
        if (url.pathname === '/v1/renderer/jobs/job-1/heartbeat') {
          seen.beats += 1
          return { status: 200, value: { state: beat() } }
        }
        if (req.method === 'PUT') {
          seen.uploads.push({ route: url.pathname, bytes: body })
          return { status: 200, value: {} }
        }
        if (url.pathname === '/v1/renderer/jobs/job-1/settle') return settleReply(body)
        return { status: 404, value: { error: url.pathname } }
      }
      server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          const route = new URL(req.url ?? '/', 'http://x').pathname
          if (lost.has(route)) reply(req, Buffer.concat(chunks))
          if (silent.has(route) || lost.has(route)) {
            res.writeHead(200, { 'content-type': 'application/json' })
            res.write('{')
            return
          }
          const { status, value, type } = reply(req, Buffer.concat(chunks))
          res.writeHead(status, { 'content-type': type ?? 'application/json' })
          res.end(Buffer.isBuffer(value) ? value : JSON.stringify(value))
        })
      })
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      base = `http://127.0.0.1:${String(typeof address === 'object' && address ? address.port : 0)}`
    })
    after(async () => {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
      rmSync(scratch, { recursive: true, force: true })
    })

    const run = async (job: Job, mode: string, extra: { marginMs?: number } = {}, apiMs?: number) => {
      next = job
      seen = { uploads: [], settles: [], beats: 0 }
      const pids = join(scratch, `${mode}.pids`)
      const log: string[] = []
      const outcome = await runOnce({
        apiUrl: base,
        token: TOKEN,
        workDir: work,
        heartbeatMs: 100,
        isolation: 'uml',
        uml: { command: (dir: string) => [process.execPath, guest, mode, dir, pids], ...extra },
        log: (line: string) => log.push(line),
        ...(apiMs === undefined ? {} : { apiMs }),
      })
      return { outcome, log, pids }
    }
    const gone = async (pids: string) => {
      const [a, b] = readFileSync(pids, 'utf8').split(' ').map(Number)
      for (let i = 0; i < 60 && [a, b].some(running); i += 1) await new Promise((r) => setTimeout(r, 50))
      if (process.platform === 'linux') assert.ok(![a, b].some(running), 'the guest and its descendant are gone')
    }

    it('renders a PDF job in the guest: the job on its input disk, the output taken back and delivered', async () => {
      const { outcome } = await run({ format: 'pdf' }, 'ok')
      assert.deepEqual(outcome, { claimed: true, jobId: 'job-1', outcome: 'settled' })
      assert.deepEqual(
        seen.uploads.map((u) => [u.route, u.bytes.toString()]),
        [['/v1/renderer/jobs/job-1/output', '%PDF-1.7 stand-in']],
      )
      const settle = seen.settles[0] as { leaseToken: string; receipt: { seen: Record<string, unknown> } }
      assert.equal(settle.leaseToken, 'lease-1')
      const { job, kernel, listing, entry } = settle.receipt.seen as {
        job: Record<string, unknown>
        kernel: string
        listing: string[]
        entry: string
      }
      assert.equal(kernel, 'pdf')
      assert.equal(entry, HTML.toString())
      assert.deepEqual(job, {
        jobId: 'job-1',
        sourceRoot: '/work/job/src',
        entry: { path: 'report.html', sha256: sha(HTML) },
        language: 'it',
        outputDir: '/work/job/out',
        scratchDir: '/work/job',
        timeoutMs: 120_000,
        assets: [{ path: 'img/chart.png', sha256: sha(PNG) }],
      })
      assert.deepEqual(listing, ['kernel', 'job.json', 'src/', 'src/report.html', 'src/img/', 'src/img/chart.png'])
      assert.deepEqual(readdirSync(work), [], 'the job directory is removed')
    })

    it('runs a capture job the same way and uploads each capture its receipt names', async () => {
      const { outcome } = await run({ format: 'png' }, 'ok')
      assert.equal(outcome.claimed && outcome.outcome, 'settled')
      assert.deepEqual(
        seen.uploads.map((u) => [u.route, u.bytes.toString()]),
        [['/v1/renderer/jobs/job-1/captures/w390-light-overview-1.png', 'stand-in capture']],
      )
    })

    it('a Stop kills the launchers’ whole process group: nothing is uploaded or settled', async () => {
      // Stopped once the guest has started its descendant and said so (its pids), whatever the machine's load: a Stop
      // sent at a set time could kill it before, leaving no group to check.
      const started = join(scratch, 'hang.pids')
      rmSync(started, { force: true })
      let beats = 0
      beat = () => (existsSync(started) && ++beats >= 2 ? 'stop' : 'continue')
      try {
        const { outcome, pids } = await run({ format: 'pdf' }, 'hang')
        assert.equal(outcome.claimed && outcome.outcome, 'cancelled')
        assert.deepEqual(seen.uploads, [])
        assert.deepEqual(seen.settles, [])
        await gone(pids)
      } finally {
        beat = keepGoing
      }
    })

    it('a guest past its job’s time plus the margin is killed and its job abandoned, nothing uploaded', async () => {
      // A margin a loaded machine's guest starts within: its group is checked only once it started its descendant.
      const { outcome, pids, log } = await run({ format: 'pdf', timeoutMs: 200 }, 'hang', { marginMs: 3000 })
      assert.equal(outcome.claimed && outcome.outcome, 'abandoned')
      assert.ok(
        log.some((l) => /ran past its job's time/u.test(l)),
        log.join('\n'),
      )
      assert.deepEqual(seen.uploads, [])
      assert.deepEqual(seen.settles, [])
      await gone(pids)
    })

    it('reads the output disk it made even when the guest put a FIFO at its path: delivered, never waiting', async () => {
      const { outcome } = await run({ format: 'pdf' }, 'fifo')
      assert.deepEqual(outcome, { claimed: true, jobId: 'job-1', outcome: 'settled' })
      assert.deepEqual(
        seen.uploads.map((u) => u.bytes.toString()),
        ['%PDF-1.7 stand-in'],
      )
    })

    it('kills what the guest left in its group once the leader exits, before the job directory is removed', async () => {
      const { outcome, pids, log } = await run({ format: 'pdf' }, 'orphan')
      assert.deepEqual(outcome, { claimed: true, jobId: 'job-1', outcome: 'settled' })
      const [, left] = readFileSync(pids, 'utf8').split(' ').map(Number)
      if (process.platform === 'linux') assert.equal(running(left), false, 'gone when the run ends, not later')
      assert.deepEqual(readdirSync(work), [])
      assert.ok(
        log.some((l) => l.includes('UML_JOB_KERNEL_EXIT:0??[2J')),
        'a marked line is logged printable',
      )
    })

    it(
      'waits for a descendant whose main thread exited while another runs: gone when the run ends',
      { skip: !hasPython && 'needs python3 on Linux' },
      async () => {
        const { outcome, pids } = await run({ format: 'pdf' }, 'zombie')
        assert.deepEqual(outcome, { claimed: true, jobId: 'job-1', outcome: 'settled' })
        const [, left] = readFileSync(pids, 'utf8').split(' ').map(Number)
        assert.equal(alive(left), false, 'its other thread was killed too, before the run ended')
      },
    )

    it('a job whose processes outlive the reap taints the host: its directory kept, nothing delivered, no more claims', async () => {
      const existing = new Set(readdirSync(work))
      const pidFiles = [join(scratch, 'tainted-1.pids'), join(scratch, 'tainted-2.pids')]
      const cfg = (pids: string) => ({
        apiUrl: base,
        token: TOKEN,
        workDir: work,
        heartbeatMs: 100,
        isolation: 'uml' as const,
        // The reap's wait already over at its first look: the descendant the guest leaves is still there.
        uml: { command: (dir: string) => [process.execPath, guest, 'orphan', dir, pids], goneMs: -1 },
        log: () => undefined,
      })
      try {
        next = { format: 'pdf' }
        seen = { uploads: [], settles: [], beats: 0 }
        await assert.rejects(runOnce(cfg(pidFiles[0] ?? '')), HostTainted)
        const kept = readdirSync(work).filter((d) => !existing.has(d))
        assert.equal(kept.length, 1, 'the job directory is kept for the restart')
        assert.deepEqual(seen.uploads, [])
        assert.deepEqual(seen.settles, [])
        // The loop stops claiming: it ends with the taint rather than taking the next job.
        next = { format: 'pdf' }
        const loop = new AbortController()
        try {
          // Raced: a loop that went on claiming would never settle.
          const ended = await within(supervise(cfg(pidFiles[1] ?? ''), loop.signal), 10_000)
          assert.ok(ended instanceof HostTainted, `the loop ends with the taint, not ${String(ended)}`)
        } finally {
          loop.abort()
        }
        assert.equal(next, null, 'that one job was claimed, and no other')
      } finally {
        next = null
        // What the reap left: the guest's whole group, the descendant's own child included.
        for (const file of pidFiles) killGroup(file)
        for (const d of readdirSync(work)) if (!existing.has(d)) rmSync(join(work, d), { recursive: true, force: true })
      }
    })

    // A run that is still waiting, after its sentinel won: end the silent answers and the guest it started, then let it
    // settle, within a bound too, so a failed check leaves nothing behind.
    const release = async (pending: Promise<unknown>, pids: string | null) => {
      server.closeAllConnections()
      if (pids && existsSync(pids)) killGroup(pids)
      await within(pending, 10_000)
    }

    it('a claim whose answer never finishes gives up within its time', async () => {
      silent = new Set(['/v1/renderer/claim'])
      const pending = run({ format: 'pdf' }, 'ok', {}, 300)
      const settled = await within(pending, 5000)
      try {
        assert.notEqual(settled, LOST, 'the claim gave up within its time')
        assert.ok(settled instanceof ApiTimeout, String(settled))
      } finally {
        if (settled === LOST) await release(pending, null)
        silent = new Set()
        next = null
      }
    })

    it('a heartbeat whose answer never finishes stops the job: nothing uploaded or settled', async () => {
      silent = new Set(['/v1/renderer/jobs/job-1/heartbeat'])
      const pending = run({ format: 'pdf' }, 'hang', {}, 300)
      const settled = await within(pending, 5000)
      try {
        assert.notEqual(settled, LOST, 'the job ended within its time')
        const { outcome, pids } = settled as Awaited<typeof pending>
        assert.equal(outcome.claimed && outcome.outcome, 'cancelled', 'a heartbeat with no answer stops the job')
        assert.deepEqual(seen.uploads, [])
        assert.deepEqual(seen.settles, [])
        await gone(pids)
      } finally {
        if (settled === LOST) await release(pending, join(scratch, 'hang.pids'))
        silent = new Set()
      }
    })

    it('a PDF the API recorded, its answer lost, is settled: settlement finds the output its lease recorded', async () => {
      lost = new Set(['/v1/renderer/jobs/job-1/output'])
      const pending = run({ format: 'pdf' }, 'ok', {}, 300)
      const settled = await within(pending, 5000)
      try {
        assert.notEqual(settled, LOST, 'the job ended within its time')
        const { outcome, log } = settled as Awaited<typeof pending>
        assert.equal(outcome.claimed && outcome.outcome, 'settled', log.join('\n'))
        const asked =
          /the PDF's upload got no whole answer: its outcome is unknown; settling asks the API whether the PDF was recorded/u
        assert.ok(
          log.some((l) => asked.test(l)),
          log.join('\n'),
        )
        assert.equal(seen.uploads.length, 1, 'uploaded once, never sent again')
        assert.equal(seen.settles.length, 1)
      } finally {
        if (settled === LOST) await release(pending, null)
        lost = new Set()
      }
    })

    it('a PDF whose upload got no answer and was not recorded is refused at settlement: left to its lease', async () => {
      silent = new Set(['/v1/renderer/jobs/job-1/output'])
      refusedSettles = 0
      const pending = run({ format: 'pdf' }, 'ok', {}, 300)
      const settled = await within(pending, 5000)
      try {
        assert.notEqual(settled, LOST, 'the job ended within its time')
        const { outcome, log } = settled as Awaited<typeof pending>
        assert.equal(outcome.claimed && outcome.outcome, 'abandoned')
        assert.ok(
          log.some((l) => /the PDF was not recorded: settlement refused it/u.test(l)),
          log.join('\n'),
        )
        assert.equal(refusedSettles, 1, 'settlement asked once, and refused')
        assert.deepEqual(seen.settles, [], 'nothing settled on a guess')
      } finally {
        if (settled === LOST) await release(pending, null)
        silent = new Set()
      }
    })

    it('a capture whose upload got no answer is left to its lease: no settlement asked', async () => {
      silent = new Set(['/v1/renderer/jobs/job-1/captures/w390-light-overview-1.png'])
      refusedSettles = 0
      const pending = run({ format: 'png' }, 'ok', {}, 300)
      const settled = await within(pending, 5000)
      try {
        assert.notEqual(settled, LOST, 'the job ended within its time')
        const { outcome, log } = settled as Awaited<typeof pending>
        assert.equal(outcome.claimed && outcome.outcome, 'abandoned', log.join('\n'))
        assert.deepEqual(seen.settles, [])
        assert.equal(refusedSettles, 0)
      } finally {
        if (settled === LOST) await release(pending, null)
        silent = new Set()
      }
    })

    it('reads each stream’s lines apart: a record split around a line of the other stream still counts', async () => {
      const { outcome, log } = await run({ format: 'pdf' }, 'split')
      assert.deepEqual(outcome, { claimed: true, jobId: 'job-1', outcome: 'settled' }, log.join('\n'))
    })

    it('abandons a job whose launcher never starts, and refuses a claim whose time is out of bounds', async () => {
      next = { format: 'pdf' }
      seen = { uploads: [], settles: [], beats: 0 }
      const log: string[] = []
      const outcome = await runOnce({
        apiUrl: base,
        token: TOKEN,
        workDir: work,
        heartbeatMs: 100,
        isolation: 'uml',
        uml: { command: () => [join(scratch, 'no-such-launcher')] },
        log: (line: string) => log.push(line),
      })
      assert.deepEqual(outcome, { claimed: true, jobId: 'job-1', outcome: 'abandoned' })
      assert.ok(
        log.some((l) => /did not start/u.test(l)),
        log.join('\n'),
      )
      assert.deepEqual(readdirSync(work), [])
      for (const timeoutMs of [2 ** 31, 0, 1.5]) {
        await assert.rejects(run({ format: 'pdf', timeoutMs }, 'ok'), /timeout that is not 1 to 600000 ms/u)
      }
      next = null
    })

    for (const [mode, why] of [
      ['norecords', /did not report their host policy applied/u],
      ['weak', /did not report their host policy applied/u],
      ['duplicate', /reported twice/u],
      ['link', /"2" entry/u],
    ] as const) {
      it(`refuses the guest's output (${mode}): nothing is uploaded or settled`, async () => {
        const { outcome, log } = await run({ format: 'pdf' }, mode)
        assert.equal(outcome.claimed && outcome.outcome, 'abandoned')
        assert.ok(
          log.some((l) => why.test(l)),
          log.join('\n'),
        )
        assert.deepEqual(seen.uploads, [])
        assert.deepEqual(seen.settles, [])
      })
    }

    it('takes no job on a host without its launchers: as root, root-owned immutable artifacts; else, root', async () => {
      next = { format: 'pdf' }
      const root = mkdtempSync(join(scratch, 'artifacts-'))
      await assert.rejects(
        runOnce({ apiUrl: base, token: TOKEN, workDir: work, isolation: 'uml', uml: { root } }),
        process.getuid?.() === 0 ? /no UML artifact/u : /runs its supervisor as root/u,
      )
      assert.deepEqual(next, { format: 'pdf' }, 'nothing was claimed')
      next = null
    })
  },
)
