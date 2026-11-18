import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { runInNewContext } from 'node:vm'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  realpathSync,
  symlinkSync,
  readdirSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { describe, it } from 'node:test'
import {
  guard,
  produce,
  validateDelta,
  verifyEvidence,
  execute,
  outsideSource,
  capturePaths,
  assertLocation,
  createLocation,
  captureInvocation,
  readCapture,
  exportPacket,
} from '../../scripts/ci/linux-runtime-record.mjs'

const ROW = 'dsh.artifacts_by_platform.linux-x64'
const PRIMARY = 'dsh.artifact_digest'
const DIGEST = 'sophia-tree-v2:sha256:' + 'a'.repeat(64)
const OLD = 'sophia-tree-v2:sha256:' + 'b'.repeat(64)
const PROFILE = '/fixture/config/dsh/profile/pnpm-lock.yaml'
const get = (object, key) => key.split('.').reduce((v, k) => v?.[k], object)
const bytes = (object) => JSON.stringify(object, null, 2) + '\n'
function fixture() {
  const unit = {
    id: 'fixture',
    dsh: {
      artifact_primary_platform: 'linux-x64',
      artifact_digest: OLD,
      artifacts_by_platform: { 'linux-x64': { digest: OLD, entries: 1 }, 'darwin-arm64': { digest: OLD, entries: 2 } },
      release_integrity: { 'dsh@fixture': 'sha512-fixture' },
    },
    workspace_lock_sha256: 'c'.repeat(64),
    sophia_bundle: {
      archive_sha256: 'd'.repeat(64),
      archive_integrity: 'sha512-fixture',
      artifact_digest: 'sha256:' + 'd'.repeat(64),
    },
  }
  // Same key ordering as maintained buildArtifacts; fixture facts never assert a real Linux producer run.
  const facts = {
    [ROW]: { digest: DIGEST, entries: 3 },
    'dsh.release_integrity': unit.dsh.release_integrity,
    workspace_lock_sha256: unit.workspace_lock_sha256,
    [PRIMARY]: DIGEST,
    'sophia_bundle.archive_sha256': unit.sophia_bundle.archive_sha256,
    'sophia_bundle.archive_integrity': unit.sophia_bundle.archive_integrity,
    'sophia_bundle.artifact_digest': unit.sophia_bundle.artifact_digest,
  }
  const before = {
    head: '1'.repeat(40),
    tree: '2'.repeat(40),
    parents: ['3'.repeat(40)],
    config: bytes(unit),
    profile: 'fixture lock\n',
    source: {
      clean: true,
      rows: [
        { path: 'config/runtime-unit.json', actual: 'old' },
        { path: 'unchanged', actual: 'same' },
      ],
    },
  }
  const next = structuredClone(unit)
  next.dsh.artifacts_by_platform['linux-x64'] = facts[ROW]
  next.dsh.artifact_digest = DIGEST
  const after = { ...structuredClone(before), config: bytes(next), facts: structuredClone(facts) }
  after.source.clean = false
  after.source.rows[0].actual = 'new'
  const input = {
    event: 'push',
    ref: 'refs/heads/fixture',
    sha: before.head,
    platform: 'linux',
    arch: 'x64',
    outcome: 'failure',
    checkStatus: 1,
    checkContained: true,
    node: '24.21.0',
    pnpm: '11.7.0',
    initialFactsAbsent: true,
    overflow: false,
    before,
    current: structuredClone(before),
    facts,
    profilePath: PROFILE,
    log: verifyLog(unit, facts),
  }
  return { unit, input, before, after, facts }
}
function verifyLog(unit, facts) {
  const { stdout, stderr } = maintainedVerify(unit, facts)
  return { stdout, stderr }
}
// Execute the unchanged maintained formatter body. Only static imports are removed; every build/file/tool seam
// is synthetic and assertions refuse any unexpected I/O. No artifact, profile, native or network operation runs.
function noIO() {
  throw new Error('Unexpected formatter I/O')
}
function maintainedVerify(unit, facts, profile = 'fixture lock\n') {
  const source = readFileSync(new URL('../../scripts/build-artifacts.mjs', import.meta.url), 'utf8')
  const imports = source.match(/^import .* from .*$/gm)
  assert.deepEqual(imports, [
    "import { readFileSync, writeFileSync } from 'node:fs'",
    "import { ARTIFACTS_DIR, RUNTIME_UNIT_PATH, loadRuntimeUnit, readJson, writeJson } from './lib/common.mjs'",
    "import { profileLockPath, buildArtifacts, getPath, setPath } from './lib/artifacts.mjs'",
    "import { assertToolchain } from './lib/toolchain.mjs'",
  ])
  const streams = { stdout: '', stderr: '' },
    writes = [],
    ended = new Error('synthetic formatter exit')
  let status
  const context = {
    process: {
      argv: [],
      exit: (code) => {
        status = code
        throw ended
      },
    },
    console: {
      log: (text) => {
        streams.stdout += text + '\n'
      },
      error: (text) => {
        streams.stderr += text + '\n'
      },
    },
    ARTIFACTS_DIR: '/synthetic-artifacts',
    RUNTIME_UNIT_PATH: '/synthetic-unit',
    assertToolchain: () => undefined,
    loadRuntimeUnit: () => unit,
    buildArtifacts: (actual) => {
      assert.equal(actual, unit)
      return { facts, profileLock: profile, lintFindings: [] }
    },
    profileLockPath: () => PROFILE,
    readFileSync: (path, encoding) => {
      assert.equal(path, PROFILE)
      assert.equal(encoding, 'utf8')
      return 'fixture lock\n'
    },
    writeJson: (path, value) => {
      assert.equal(path, '/synthetic-artifacts/identities.json')
      assert.equal(value, facts)
      writes.push(path)
    },
    getPath: get,
    writeFileSync: noIO,
    readJson: noIO,
    setPath: noIO,
  }
  try {
    runInNewContext(source.replace(/^import .* from .*$/gm, ''), context, { timeout: 1000 })
  } catch (error) {
    if (error !== ended) throw error
  }
  assert.deepEqual(writes, ['/synthetic-artifacts/identities.json'])
  return { ...streams, status }
}

it('LVP source-bound maintained formatter reaches the Linux-only decision', () => {
  const f = fixture(),
    streams = maintainedVerify(f.unit, f.facts)
  assert.equal(streams.status, 1)
  assert.match(streams.stdout, /^match    dsh.release_integrity$/m)
  assert.match(streams.stdout, /^match    \/fixture\/config\/dsh\/profile\/pnpm-lock.yaml$/m)
  assert.equal(streams.stderr, '\n2 identity mismatch(es): this checkout does not reproduce runtime unit fixture\n')
  assert.deepEqual(verifyEvidence(streams, f.facts, f.unit, PROFILE), [ROW, PRIMARY])
})

const success = () => ({
  status: 0,
  signal: null,
  stdout: 'normal record\n',
  stderr: '',
  overflow: false,
  timedOut: false,
  lingering: false,
  groupGone: true,
})

const INVOCATION = '00000000-0000-4000-8000-000000000001'
function ownedFixture() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lrec-custody-')))
  const source = join(dir, 'source'),
    temp = join(dir, 'temp')
  mkdirSync(source, { mode: 0o700 })
  mkdirSync(temp, { mode: 0o700 })
  return { dir, context: { source, temp, id: '101', attempt: '1', invocation: INVOCATION } }
}
function allFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? allFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  )
}

describe('LREC-F01: canonical outside-source location and fresh current invocation', () => {
  for (const [name, path, expected] of [
    ['equal', '/fixture/repo', false],
    ['normal child', '/fixture/repo/packet', false],
    ['dot-dot-prefixed child', '/fixture/repo/..packet', false],
    ['sibling', '/fixture/packet', true],
  ])
    it(`${name} uses path components`, () => assert.equal(outsideSource('/fixture/repo', path), expected))

  for (const kind of ['equal', 'child', 'dot-dot-child', 'symlink-parent'])
    it(`refuses actual ${kind} custody before creating a packet`, () => {
      const f = ownedFixture()
      try {
        const bad =
          kind === 'equal' ? f.context.source : join(f.context.source, kind === 'dot-dot-child' ? '..packet' : 'packet')
        if (kind === 'symlink-parent') symlinkSync(f.context.temp, bad)
        else if (kind !== 'equal') mkdirSync(bad)
        assert.throws(() => createLocation({ ...f.context, temp: bad }))
        assert.equal(allFiles(f.context.temp).length, 0)
      } finally {
        rmSync(f.dir, { recursive: true, force: true })
      }
    })

  for (const kind of ['existing-packet', 'symlink-packet', 'existing-scratch', 'symlink-scratch']) {
    for (const status of [0, 7, 143])
      it(`${kind}: no unproven write/readiness, canonical ${status} retained`, async () => {
        const f = ownedFixture(),
          published = [],
          calls = []
        try {
          const paths = capturePaths(f.context)
          const target = join(f.dir, 'unproven')
          mkdirSync(target, { mode: 0o700 })
          writeFileSync(join(target, 'capture.json'), 'OLD-CAPTURE-MUST-STAY-EXACT')
          const collision = kind.endsWith('packet') ? paths.packet : paths.scratch
          if (kind.startsWith('symlink')) symlinkSync(target, collision)
          else {
            mkdirSync(collision, { mode: 0o700 })
            writeFileSync(join(collision, 'capture.json'), 'OLD-CAPTURE-MUST-STAY-EXACT')
          }
          const result = await captureInvocation({
            context: f.context,
            takeSnapshot: () => fixture().before,
            check: async (command) => {
              calls.push(command)
              return { ...success(), status: status === 143 ? null : status, signal: status === 143 ? 'SIGTERM' : null }
            },
            publish: (values) => published.push(values),
            initialFactsAbsent: true,
          })
          assert.equal(result.ready, false)
          assert.equal(result.location, undefined)
          assert.equal(result.result.status, status === 143 ? null : status)
          assert.equal(result.result.signal, status === 143 ? 'SIGTERM' : null)
          assert.deepEqual(calls, [{ executable: 'pnpm', args: ['check'] }])
          assert.deepEqual(published, [])
          assert.equal(readFileSync(join(target, 'capture.json'), 'utf8'), 'OLD-CAPTURE-MUST-STAY-EXACT')
          if (!kind.startsWith('symlink'))
            assert.equal(readFileSync(join(collision, 'capture.json'), 'utf8'), 'OLD-CAPTURE-MUST-STAY-EXACT')
          assert.throws(() => readCapture(f.context, '0'.repeat(64)))
          assert.deepEqual(published, [], 'no current-step upload authority is emitted')
        } finally {
          rmSync(f.dir, { recursive: true, force: true })
        }
      })
  }
  it('binds a successful capture to fresh identities, exact current bytes and invocation', async () => {
    const f = ownedFixture(),
      published = []
    try {
      const result = await captureInvocation({
        context: f.context,
        takeSnapshot: () => fixture().before,
        check: async () => ({ ...success(), status: 1 }),
        publish: (value) => published.push(value),
        initialFactsAbsent: true,
      })
      assert.equal(result.ready, true)
      assert.equal(published.length, 1)
      const loaded = readCapture(f.context, published[0].capture_sha256)
      assert.equal(loaded.location.invocation, INVOCATION)
      assert.throws(() =>
        readCapture({ ...f.context, invocation: '00000000-0000-4000-8000-000000000002' }, published[0].capture_sha256),
      )
      writeFileSync(
        join(result.location.scratch, 'capture.json'),
        JSON.stringify({ ...loaded, initialFactsAbsent: false }),
      )
      assert.throws(() => readCapture(f.context, published[0].capture_sha256))
    } finally {
      rmSync(f.dir, { recursive: true, force: true })
    }
  })
  it('refuses a scratch directory replaced with a symlink after capture', async () => {
    const f = ownedFixture(),
      published = []
    try {
      const result = await captureInvocation({
        context: f.context,
        takeSnapshot: () => fixture().before,
        check: async () => ({ ...success(), status: 1 }),
        publish: (value) => published.push(value),
        initialFactsAbsent: true,
      })
      const target = join(f.dir, 'replacement')
      mkdirSync(target, { mode: 0o700 })
      writeFileSync(join(target, 'sentinel'), 'UNCHANGED')
      rmSync(result.location.scratch, { recursive: true })
      symlinkSync(target, result.location.scratch)
      assert.throws(() => assertLocation(result.location))
      assert.throws(() => readCapture(f.context, published[0].capture_sha256))
      assert.throws(() => exportPacket(result.location, fixture().input, { state: 'skipped', reason: 'fixture' }))
      assert.deepEqual(readdirSync(target), ['sentinel'])
      assert.deepEqual(readdirSync(result.location.packet), [])
    } finally {
      rmSync(f.dir, { recursive: true, force: true })
    }
  })
  it('does not emit readiness when the current pre-check snapshot is unavailable', async () => {
    const f = ownedFixture(),
      published = []
    try {
      const result = await captureInvocation({
        context: f.context,
        takeSnapshot: () => {
          throw new Error('fixture unavailable')
        },
        check: async () => ({ ...success(), status: 7 }),
        publish: (value) => published.push(value),
        initialFactsAbsent: true,
      })
      assert.equal(result.result.status, 7)
      assert.equal(result.ready, false)
      assert.deepEqual(published, [])
      assert.equal(allFiles(f.context.temp).length, 0)
    } finally {
      rmSync(f.dir, { recursive: true, force: true })
    }
  })
  it('the actual producer refuses stale files before invoking even fake pnpm or publishing output', async () => {
    const f = ownedFixture()
    try {
      const oldPacket = join(f.context.temp, 'sophia-linux-runtime-record-101-1')
      mkdirSync(oldPacket)
      mkdirSync(oldPacket + '.private')
      const stale = join(oldPacket + '.private', 'capture.json')
      writeFileSync(stale, 'OLD-UNPROVEN-CAPTURE')
      const output = join(f.dir, 'step-output')
      writeFileSync(output, '')
      const bin = join(f.dir, 'bin')
      mkdirSync(bin)
      const marker = join(f.dir, 'pnpm-called')
      writeFileSync(join(bin, 'pnpm'), '#!/bin/sh\nprintf called >> "$PNPM_CALLS"\nexit 0\n', { mode: 0o755 })
      const cli = new URL('../../scripts/ci/linux-runtime-record.mjs', import.meta.url)
      const child = spawn(process.execPath, [cli.pathname, 'produce'], {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          RUNNER_TEMP: f.context.temp,
          GITHUB_RUN_ID: '101',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_OUTPUT: output,
          SOPHIA_CAPTURE_READY: '',
          SOPHIA_CAPTURE_ID: INVOCATION,
          SOPHIA_CAPTURE_SHA256: '0'.repeat(64),
          PNPM_CALLS: marker,
        },
        stdio: 'ignore',
      })
      assert.equal((await once(child, 'close'))[0], 1)
      assert.equal(existsSync(marker), false)
      assert.equal(readFileSync(output, 'utf8'), '')
      assert.equal(readFileSync(stale, 'utf8'), 'OLD-UNPROVEN-CAPTURE')
      assert.deepEqual(readdirSync(oldPacket), [])
    } finally {
      rmSync(f.dir, { recursive: true, force: true })
    }
  })
})

describe('LREC-F02: all selected after fields are checked before any raw payload export', () => {
  it('retains failed status/hash-only evidence without the invented after.profile token in ANY packet file', async () => {
    const f = ownedFixture(),
      data = fixture()
    try {
      const location = createLocation(f.context)
      const token = 'INVENTED_TEST_VALUE_0123456789'
      data.after.profile += `access_token=${token}\n`
      const receipt = await produce(
        data.input,
        async () => success(),
        () => data.after,
      )
      assert.equal(receipt.reason, 'unexpected_generated_delta')
      const final = exportPacket(location, data.input, receipt)
      assert.equal(final.state, 'failed')
      assert.equal(final.reason, 'payload_refused')
      assert.equal(final.originalReason, 'unexpected_generated_delta')
      for (const file of allFiles(location.packet))
        assert.equal(readFileSync(file, 'utf8').includes(token), false, file)
      assert.deepEqual(readdirSync(location.packet).sort(), ['field-hashes.json', 'receipt.json', 'record-status.json'])
      assert.equal(JSON.parse(readFileSync(join(location.packet, 'record-status.json'), 'utf8')).status, 0)
    } finally {
      rmSync(f.dir, { recursive: true, force: true })
    }
  })
  it('retains safe unexpected after.profile bytes and truthful failed diagnostic', async () => {
    const f = ownedFixture(),
      data = fixture()
    try {
      const location = createLocation(f.context)
      data.after.profile += 'ordinary nonsecret mismatch\n'
      const receipt = await produce(
        data.input,
        async () => success(),
        () => data.after,
      )
      const final = exportPacket(location, data.input, receipt)
      assert.equal(final.reason, 'unexpected_generated_delta')
      assert.equal(JSON.parse(readFileSync(join(location.packet, 'after.json'), 'utf8')).profile, data.after.profile)
    } finally {
      rmSync(f.dir, { recursive: true, force: true })
    }
  })
  it('normal successful fixture output keeps the exact safe identity delta', async () => {
    const f = ownedFixture(),
      data = fixture()
    try {
      const location = createLocation(f.context)
      const receipt = await produce(
        data.input,
        async () => success(),
        () => data.after,
      )
      assert.equal(exportPacket(location, data.input, receipt).state, 'recorded_unaccepted')
      assert.equal(
        JSON.parse(readFileSync(join(location.packet, 'linux-identity-diff.json'), 'utf8')).after.digest,
        DIGEST,
      )
    } finally {
      rmSync(f.dir, { recursive: true, force: true })
    }
  })
})

describe('Linux record: exact maintained evidence, not inferred platform or stale files', () => {
  it('accepts Linux-row/primary mismatch and its exact maintained fact order', () => {
    const f = fixture()
    assert.equal(guard(f.input), null)
    assert.deepEqual(verifyEvidence(f.input.log, f.facts, f.unit, PROFILE), [ROW, PRIMARY])
  })
  it('accepts a genuinely unrecorded Linux row and a nonprimary Linux-only record', () => {
    const f = fixture()
    f.unit.dsh.artifact_primary_platform = 'darwin-arm64'
    delete f.unit.dsh.artifacts_by_platform['linux-x64']
    delete f.facts[PRIMARY]
    f.input.before.config = f.input.current.config = bytes(f.unit)
    f.input.log = verifyLog(f.unit, f.facts)
    assert.equal(guard(f.input), null)
  })
  it('uses the retained committed common identities as data, with a clearly synthetic Linux row', () => {
    const f = fixture()
    const retained = JSON.parse(readFileSync(new URL('../../config/runtime-unit.json', import.meta.url), 'utf8'))
    const facts = {
      [ROW]: f.facts[ROW],
      'dsh.release_integrity': retained.dsh.release_integrity,
      workspace_lock_sha256: retained.workspace_lock_sha256,
      [PRIMARY]: DIGEST,
      'sophia_bundle.archive_sha256': retained.sophia_bundle.archive_sha256,
      'sophia_bundle.archive_integrity': retained.sophia_bundle.archive_integrity,
      'sophia_bundle.artifact_digest': retained.sophia_bundle.artifact_digest,
    }
    f.input.facts = facts
    f.input.before.config = f.input.current.config = bytes(retained)
    f.input.log = verifyLog(retained, facts)
    assert.equal(guard(f.input), null)
  })
  it('refuses a real common-fact MISMATCH block even when its log and generated facts agree', () => {
    const f = fixture()
    f.facts.workspace_lock_sha256 = 'e'.repeat(64)
    f.input.log = verifyLog(f.unit, f.facts)
    assert.equal(guard(f.input), 'verify_not_linux_only')
  })
  for (const [name, change, reason] of [
    [
      'Mac',
      (i) => {
        i.platform = 'darwin'
      },
      'not_linux_x64',
    ],
    [
      'ARM Linux',
      (i) => {
        i.arch = 'arm64'
      },
      'not_linux_x64',
    ],
    [
      'PR merge checkout',
      (i) => {
        i.event = 'pull_request'
      },
      'not_branch_push',
    ],
    [
      'tag push',
      (i) => {
        i.ref = 'refs/tags/fixture'
      },
      'not_branch_push',
    ],
    [
      'unsettled check child',
      (i) => {
        i.checkContained = false
      },
      'not_canonical_failure',
    ],
    [
      'successful check',
      (i) => {
        i.checkStatus = 0
      },
      'not_canonical_failure',
    ],
    [
      'unsettled canonical descendants',
      (i) => {
        i.checkContained = false
      },
      'not_canonical_failure',
    ],
    [
      'wrong toolchain',
      (i) => {
        i.node = '24.0.0'
      },
      'toolchain_mismatch',
    ],
    [
      'preexisting facts',
      (i) => {
        i.initialFactsAbsent = false
      },
      'source_or_capture_unavailable',
    ],
    [
      'capture overflow',
      (i) => {
        i.overflow = true
      },
      'source_or_capture_unavailable',
    ],
    [
      'capture unavailable',
      (i) => {
        i.captureProblem = 'input_unavailable'
      },
      'source_or_capture_unavailable',
    ],
    [
      'overridden artifact location',
      (i) => {
        i.artifactsOverride = true
      },
      'source_or_capture_unavailable',
    ],
    [
      'dirty source',
      (i) => {
        i.current.source.clean = false
      },
      'source_or_capture_unavailable',
    ],
    [
      'changed source',
      (i) => {
        i.current.source.rows[1].actual = 'changed'
      },
      'source_changed',
    ],
    [
      'changed profile',
      (i) => {
        i.current.profile += 'changed'
      },
      'source_changed',
    ],
    [
      'different head',
      (i) => {
        i.sha = '4'.repeat(40)
      },
      'source_changed',
    ],
    [
      'missing facts',
      (i) => {
        i.facts = null
      },
      'verify_missing',
    ],
    [
      'missing VERIFY log',
      (i) => {
        i.log = null
      },
      'verify_missing',
    ],
    [
      'profile mismatch',
      (i) => {
        i.log.stdout = i.log.stdout.replace(`match    ${PROFILE}`, `MISMATCH ${PROFILE}`)
      },
      'verify_not_linux_only',
    ],
    [
      'common mismatch',
      (i) => {
        i.facts.workspace_lock_sha256 = 'wrong'
      },
      'verify_not_linux_only',
    ],
    [
      'unknown fact',
      (i) => {
        i.facts.unexpected = true
      },
      'verify_not_linux_only',
    ],
    [
      'secret-shaped output',
      (i) => {
        i.log.stdout += 'access_token=fixturesecretvalue\n'
      },
      'verify_not_linux_only',
    ],
  ])
    it(`refuses ${name} before executing anything`, async () => {
      const f = fixture()
      change(f.input)
      assert.equal(guard(f.input), reason)
      let calls = 0
      const result = await produce(
        f.input,
        () => {
          calls++
        },
        () => {
          throw new Error('not reached')
        },
      )
      assert.equal(result.state, 'skipped')
      assert.equal(calls, 0)
    })
})

describe('LVP: maintained formatter and independent bounded channels', () => {
  it('accepts a recorded nonprimary Linux-only mismatch using actual formatter routing', () => {
    const f = fixture()
    f.unit.dsh.artifact_primary_platform = 'darwin-arm64'
    delete f.facts[PRIMARY]
    f.input.before.config = f.input.current.config = bytes(f.unit)
    f.input.log = verifyLog(f.unit, f.facts)
    assert.equal(
      f.input.log.stderr,
      '\n1 identity mismatch(es): this checkout does not reproduce runtime unit fixture\n',
    )
    assert.deepEqual(verifyEvidence(f.input.log, f.facts, f.unit, PROFILE), [ROW])
    assert.equal(guard(f.input), null)
  })
  it('source-binds the CLI evidence to its two current captured streams', () => {
    const source = readFileSync(new URL('../../scripts/ci/linux-runtime-record.mjs', import.meta.url), 'utf8')
    assert.match(source, /log: \{ stdout: saved\.result\.stdout, stderr: saved\.result\.stderr \}/)
    assert.doesNotMatch(source, /log: saved\.result\.combined/)
  })
  for (const position of ['before', 'middle', 'after'])
    it(`summary ${position} fragmented stdout gives the same guarded one-call decision`, async () => {
      const f = fixture(),
        streams = verifyLog(f.unit, f.facts),
        calls = []
      // Split inside both a header and JSON. Each pipe retains order, with no imposed cross-pipe order.
      const cut = streams.stdout.indexOf('match    ') + 4
      const stdout = [streams.stdout.slice(0, cut), streams.stdout.slice(cut, cut + 17), streams.stdout.slice(cut + 17)]
      const stderr = [streams.stderr.slice(0, 13), streams.stderr.slice(13)]
      const chunks = stdout.map((value) => ['stdout', value])
      chunks.splice(
        position === 'before' ? 0 : position === 'middle' ? 1 : chunks.length,
        0,
        ...stderr.map((value) => ['stderr', value]),
      )
      const program = `for (const [stream,text] of ${JSON.stringify(chunks)}) { process[stream].write(text); await new Promise(r=>setTimeout(r,15)); } process.exitCode=1`
      const captured = await execute(process.execPath, ['--input-type=module', '-e', program], { timeoutMs: 3000 })
      assert.equal(captured.status, 1)
      assert.equal(captured.signal, null)
      assert.equal(captured.overflow, false)
      assert.equal(captured.timedOut, false)
      assert.equal(captured.lingering, false)
      assert.equal(captured.groupGone, true)
      assert.equal(captured.stdout, streams.stdout)
      assert.equal(captured.stderr, streams.stderr)
      f.input.log = captured
      assert.equal(guard(f.input), null)
      assert.deepEqual(verifyEvidence(captured, f.facts, f.unit, PROFILE), [ROW, PRIMARY])
      const receipt = await produce(
        f.input,
        async (command) => {
          calls.push(command)
          return success()
        },
        () => f.after,
      )
      assert.equal(f.input.checkStatus, 1, 'canonical failure stays failed')
      assert.deepEqual(calls, [{ executable: 'pnpm', args: ['artifacts:record'] }])
      assert.equal(receipt.state, 'recorded_unaccepted')
    })
  it('accounts explicitly for successful maintained pipeline diagnostics and both lifecycle failures', () => {
    const f = fixture()
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
    const contracts = JSON.parse(
      readFileSync(new URL('../../packages/contracts/package.json', import.meta.url), 'utf8'),
    )
    f.input.log.stdout =
      [
        `$ ${pkg.scripts.check}`,
        `$ ${pkg.scripts['toolchain:check']}`,
        'toolchain ok: node 24.21.0, pnpm 11.7.0',
        `$ ${pkg.scripts['format:check']}`,
        'Checking formatting...',
        'All matched files use Prettier code style!',
        `$ ${pkg.scripts.lint}`,
        'Found 0 warnings and 0 errors.',
        'Finished in 6.7s on 1709 files with 207 rules using 4 threads.',
        `$ ${pkg.scripts.build}`,
        'Scope: 2 of 19 workspace projects',
        'apps/execution-host build$ tsc -p tsconfig.json',
        'apps/execution-host build: Done',
        'packages/dsh-bundle build$ tsc -p tsconfig.json',
        'packages/dsh-bundle build: Done',
        `$ ${pkg.scripts.typecheck}`,
        'Scope: 18 of 19 workspace projects',
        'packages/contracts typecheck$ tsc --noEmit -p .',
        'packages/contracts typecheck: Done',
        `$ ${pkg.scripts['contracts:check']}`,
        `$ ${contracts.scripts['generate:check']}`,
        'OpenAPI equals the pack plus its amendments',
        'Generated API types match OpenAPI',
        'Generated validators match OpenAPI',
        'Runtime wire module matches OpenAPI',
        'Specialist modules match config/specialists.json',
        `$ ${pkg.scripts.artifacts}`,
        '',
      ].join('\n') +
      f.input.log.stdout +
      '[ELIFECYCLE] Command failed with exit code 1.\n'
    f.input.log.stderr += '[ELIFECYCLE] Command failed with exit code 1.\n'
    assert.equal(guard(f.input), null)
  })
  it('exports the current safe channels separately without copying arrival order into evidence', () => {
    const owned = ownedFixture(),
      f = fixture()
    try {
      const location = createLocation(owned.context)
      const receipt = { state: 'recorded_unaccepted', result: success(), after: f.after }
      assert.equal(exportPacket(location, f.input, receipt).state, 'recorded_unaccepted')
      assert.equal(readFileSync(join(location.packet, 'verify.stdout'), 'utf8'), f.input.log.stdout)
      assert.equal(readFileSync(join(location.packet, 'verify.stderr'), 'utf8'), f.input.log.stderr)
      assert.equal(existsSync(join(location.packet, 'verify.log')), false)
    } finally {
      rmSync(owned.dir, { recursive: true, force: true })
    }
  })
  for (const [name, mutate] of [
    [
      'three match spaces',
      (f) => {
        f.input.log.stdout = f.input.log.stdout.replaceAll('match    ', 'match   ')
      },
    ],
    [
      'five match spaces',
      (f) => {
        f.input.log.stdout = f.input.log.stdout.replaceAll('match    ', 'match     ')
      },
    ],
    [
      'tab match separator',
      (f) => {
        f.input.log.stdout = f.input.log.stdout.replaceAll('match    ', 'match\t')
      },
    ],
    [
      'wrong MISMATCH separator',
      (f) => {
        f.input.log.stdout = f.input.log.stdout.replace('MISMATCH ', 'MISMATCH  ')
      },
    ],
    [
      'missing common block',
      (f) => {
        f.input.log.stdout = f.input.log.stdout.replace(/match    workspace_lock_sha256\n[^\n]*\n/, '')
      },
    ],
    [
      'duplicate common block',
      (f) => {
        const block = f.input.log.stdout.match(/match    workspace_lock_sha256\n[^\n]*\n/)[0]
        f.input.log.stdout = f.input.log.stdout.replace(block, block + block)
      },
    ],
    [
      'extra field',
      (f) => {
        f.input.log.stdout += 'match    unexpected\n         built    true\n'
      },
    ],
    [
      'duplicate complete table',
      (f) => {
        f.input.log.stdout += f.input.log.stdout
      },
    ],
    [
      'unknown prefix diagnostic',
      (f) => {
        f.input.log.stdout = 'arbitrary diagnostic\n' + f.input.log.stdout
      },
    ],
    [
      'unknown trailing diagnostic',
      (f) => {
        f.input.log.stdout += 'arbitrary diagnostic\n'
      },
    ],
    [
      'fake command diagnostic',
      (f) => {
        f.input.log.stdout = '$ some unrelated command\n' + f.input.log.stdout
      },
    ],
    [
      'duplicate summary',
      (f) => {
        f.input.log.stderr += f.input.log.stderr
      },
    ],
    [
      'conflicting summary',
      (f) => {
        f.input.log.stderr += '\n3 identity mismatch(es): this checkout does not reproduce runtime unit other\n'
      },
    ],
    [
      'wrong summary count',
      (f) => {
        f.input.log.stderr = f.input.log.stderr.replace('2 identity', '1 identity')
      },
    ],
    [
      'wrong runtime unit',
      (f) => {
        f.input.log.stderr = f.input.log.stderr.replace('unit fixture', 'unit other')
      },
    ],
    [
      'summary on stdout',
      (f) => {
        f.input.log.stdout += f.input.log.stderr
        f.input.log.stderr = ''
      },
    ],
    [
      'table on stderr',
      (f) => {
        f.input.log.stderr = f.input.log.stdout + f.input.log.stderr
        f.input.log.stdout = ''
      },
    ],
    [
      'missing summary',
      (f) => {
        f.input.log.stderr = ''
      },
    ],
    [
      'unknown stderr diagnostic',
      (f) => {
        f.input.log.stderr += 'unrecognized warning\n'
      },
    ],
    [
      'third lifecycle failure',
      (f) => {
        f.input.log.stderr += '[ELIFECYCLE] Command failed with exit code 1.\n'.repeat(3)
      },
    ],
    [
      'malformed built JSON',
      (f) => {
        f.input.log.stdout = f.input.log.stdout.replace('built    {', 'built    !{')
      },
    ],
    [
      'wrong built value',
      (f) => {
        f.input.log.stdout = f.input.log.stdout.replace('"entries":3', '"entries":4')
      },
    ],
    [
      'wrong recorded value',
      (f) => {
        f.input.log.stdout = f.input.log.stdout.replace('"entries":1', '"entries":9')
      },
    ],
    [
      'wrong profile path',
      (f) => {
        f.input.log.stdout = f.input.log.stdout.replace(PROFILE, PROFILE + '.other')
      },
    ],
    [
      'profile mismatch',
      (f) => {
        f.input.log = maintainedVerify(f.unit, f.facts, 'changed lock\n')
      },
    ],
    [
      'common mismatch agrees with facts',
      (f) => {
        f.facts.workspace_lock_sha256 = 'e'.repeat(64)
        f.input.log = verifyLog(f.unit, f.facts)
      },
    ],
    [
      'no Linux mismatch',
      (f) => {
        f.facts[ROW] = f.unit.dsh.artifacts_by_platform['linux-x64']
        f.facts[PRIMARY] = OLD
        f.input.log = verifyLog(f.unit, f.facts)
      },
    ],
    [
      'primary mismatch without Linux mismatch',
      (f) => {
        f.facts[ROW] = f.unit.dsh.artifacts_by_platform['linux-x64']
        f.input.log = verifyLog(f.unit, f.facts)
      },
    ],
    [
      'zero entries',
      (f) => {
        f.facts[ROW].entries = 0
        f.input.log = verifyLog(f.unit, f.facts)
      },
    ],
    [
      'malformed digest',
      (f) => {
        f.facts[ROW].digest = 'wrong'
        f.facts[PRIMARY] = 'wrong'
        f.input.log = verifyLog(f.unit, f.facts)
      },
    ],
    [
      'UNRECORDED for recorded row',
      (f) => {
        f.input.log.stdout = f.input.log.stdout.replace('MISMATCH ' + ROW, 'UNRECORDED ' + ROW)
      },
    ],
    [
      'secret on stderr',
      (f) => {
        f.input.log.stderr += 'password=INVENTED_SECRET_0123456789\n'
      },
    ],
    [
      'unterminated stdout',
      (f) => {
        f.input.log.stdout = f.input.log.stdout.slice(0, -1)
      },
    ],
    [
      'unterminated stderr',
      (f) => {
        f.input.log.stderr = f.input.log.stderr.slice(0, -1)
      },
    ],
    [
      'bounded channel overflow',
      (f) => {
        f.input.log.stderr += 'x'.repeat(8 * 1024 * 1024)
      },
    ],
  ])
    it(`refuses ${name} before any record dispatch`, async () => {
      const f = fixture()
      mutate(f)
      assert.equal(guard(f.input), 'verify_not_linux_only')
      let calls = 0
      const receipt = await produce(
        f.input,
        async () => {
          calls++
          return success()
        },
        () => f.after,
      )
      assert.equal(receipt.state, 'skipped')
      assert.equal(calls, 0)
    })
})

describe('Linux record: normal command, bounded result and generated delta', () => {
  it('dispatches exactly normal pnpm artifacts:record once and leaves it unaccepted', async () => {
    const f = fixture(),
      calls = []
    const result = await produce(
      f.input,
      async (command) => {
        calls.push(command)
        return success()
      },
      () => f.after,
    )
    assert.deepEqual(calls, [{ executable: 'pnpm', args: ['artifacts:record'] }])
    assert.equal(result.state, 'recorded_unaccepted')
    assert.equal(validateDelta(f.before, f.after, f.facts), true)
  })
  it('retains normal nonzero status, stdout and stderr rather than accepting it', async () => {
    const f = fixture(),
      failed = { ...success(), status: 7, stdout: 'partial', stderr: 'fixture failure' }
    const result = await produce(
      f.input,
      async () => failed,
      () => f.after,
    )
    assert.equal(result.state, 'failed')
    assert.deepEqual(result.result, failed)
  })
  for (const field of ['overflow', 'timedOut', 'lingering'])
    it(`refuses a recorded ${field} outcome`, async () => {
      const f = fixture(),
        result = { ...success(), [field]: true }
      assert.equal(
        (
          await produce(
            f.input,
            async () => result,
            () => f.after,
          )
        ).reason,
        'normal_record_failed',
      )
    })
  for (const [name, mutation] of [
    [
      'other platform',
      (f) => {
        const u = JSON.parse(f.after.config)
        u.dsh.artifacts_by_platform['darwin-arm64'].entries++
        f.after.config = bytes(u)
      },
    ],
    [
      'common fact',
      (f) => {
        const u = JSON.parse(f.after.config)
        u.workspace_lock_sha256 = 'changed'
        f.after.config = bytes(u)
      },
    ],
    [
      'profile lock',
      (f) => {
        f.after.profile += 'changed'
      },
    ],
    [
      'other tracked source',
      (f) => {
        f.after.source.rows[1].actual = 'changed'
      },
    ],
    [
      'after facts',
      (f) => {
        f.after.facts[ROW].entries++
      },
    ],
    [
      'noncanonical serialization',
      (f) => {
        f.after.config += '\n'
      },
    ],
  ])
    it(`rejects an unexpected generated ${name} change`, async () => {
      const f = fixture()
      mutation(f)
      assert.equal(validateDelta(f.before, f.after, f.facts), false)
      assert.equal(
        (
          await produce(
            f.input,
            async () => success(),
            () => f.after,
          )
        ).reason,
        'unexpected_generated_delta',
      )
    })
  it('keeps a completed record status when its after snapshot is unavailable', async () => {
    const f = fixture()
    const result = await produce(
      f.input,
      async () => success(),
      () => {
        throw new Error('fixture unavailable')
      },
    )
    assert.equal(result.reason, 'after_snapshot_unavailable')
    assert.equal(result.result.status, 0)
  })
})

describe('raw shell capture fixtures: no actual artifact/check producer invocation', () => {
  for (const status of [0, 7, 143])
    it(`the actual GitHub capture shell preserves fake pnpm status ${status}`, async () => {
      const dir = realpathSync(mkdtempSync(join(tmpdir(), 'linux-capture-fixture-')))
      try {
        const bin = join(dir, 'bin')
        mkdirSync(bin)
        writeFileSync(
          join(bin, 'pnpm'),
          `#!/bin/sh\nprintf 'fixture check stdout\\n'\nprintf 'fixture check stderr\\n' >&2\n${status === 143 ? 'kill -TERM $$' : `exit ${status}`}\n`,
          { mode: 0o755 },
        )
        const output = join(dir, 'step-output')
        writeFileSync(output, '', { mode: 0o600 })
        const script = join(dir, 'run.sh')
        writeFileSync(script, 'pnpm check\n')
        const cli = new URL('../../scripts/ci/linux-runtime-record.mjs', import.meta.url)
        const child = spawn(process.execPath, [cli.pathname, 'capture', script], {
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            RUNNER_TEMP: dir,
            GITHUB_OUTPUT: output,
            GITHUB_RUN_ID: '101',
            GITHUB_RUN_ATTEMPT: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stdout = '',
          stderr = ''
        child.stdout.on('data', (data) => {
          stdout += data
        })
        child.stderr.on('data', (data) => {
          stderr += data
        })
        const [exit] = await once(child, 'close')
        assert.equal(exit, status)
        assert.match(stdout, /fixture check stdout/)
        assert.match(stderr, /fixture check stderr/)
        const values = Object.fromEntries(
          readFileSync(output, 'utf8')
            .trim()
            .split('\n')
            .map((line) => line.split('=')),
        )
        if (values.capture_ready === 'true') {
          const saved = JSON.parse(
            readFileSync(
              join(dir, `sophia-linux-runtime-record-101-1-${values.capture_id}.private/capture.json`),
              'utf8',
            ),
          )
          assert.equal(saved.result.status, status === 143 ? null : status)
          assert.equal(saved.result.signal, status === 143 ? 'SIGTERM' : null)
          assert.equal(saved.result.groupGone, true)
          assert.ok(
            saved.before.source.rows.some(
              (row) => row.path === 'db/tests/0110_research_call_observed_facts.sql' && row.opaque,
            ),
          )
        } else {
          // An uncommitted candidate has an index different from HEAD. R1 must not qualify it.
          assert.equal(readFileSync(output, 'utf8'), '')
          assert.match(stderr, /current capture unavailable/)
          assert.equal(
            allFiles(dir).some((file) => file.endsWith('/capture.json')),
            false,
          )
        }
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  for (const status of [0, 7])
    it(`preserves shell status ${status} and both output streams`, async () => {
      const result = await execute(
        '/bin/bash',
        ['-c', `printf 'fixture stdout'; printf 'fixture stderr' >&2; exit ${status}`],
        { timeoutMs: 3000 },
      )
      assert.equal(result.status, status)
      assert.equal(result.stdout, 'fixture stdout')
      assert.equal(result.stderr, 'fixture stderr')
      assert.equal(result.groupGone, true)
    })
  it('contains an owned timed-out shell fixture and records its signal', async () => {
    const result = await execute('/bin/bash', ['-c', 'exec sleep 30'], { timeoutMs: 50 })
    assert.equal(result.timedOut, true)
    assert.equal(result.signal, 'SIGTERM')
    assert.equal(result.groupGone, true)
  })
  it('forwards SIGTERM to its own detached child, without orphaning the fixture', async () => {
    const moduleUrl = new URL('../../scripts/ci/linux-runtime-record.mjs', import.meta.url).href
    const source = `import { execute } from ${JSON.stringify(moduleUrl)}; const p=execute('/bin/bash',['-c','exec sleep 30'],{timeoutMs:10000}); console.log('fixture-ready'); const r=await p; console.log(JSON.stringify(r)); process.exitCode=r.signal==='SIGTERM'?143:1;`
    const child = spawn(process.execPath, ['--input-type=module', '-e', source], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (data) => {
      out += data
    })
    while (!out.includes('fixture-ready')) await once(child.stdout, 'data')
    child.kill('SIGTERM')
    const [status] = await once(child, 'close')
    assert.equal(status, 143)
    const result = JSON.parse(out.trim().split('\n').at(-1))
    assert.equal(result.signal, 'SIGTERM')
    assert.equal(result.groupGone, true)
  })
})


// LSE: six literal diagnostics copied from the sealed actual local CEB1 child stderr streams.
// The formatter/identities below remain synthetic; none of these fixtures is the missing Linux capture.
const sealedStderrCommands = [
  '$ node scripts/toolchain-check.mjs',
  '$ prettier --check .',
  '$ oxlint --type-aware .',
  '$ pnpm --filter @sophia/dsh-bundle --filter @sophia/execution-host run build',
  '$ pnpm --filter @sophia/contracts run generate:check',
  '$ node scripts/apply-amendments.ts --check && node scripts/generate-types.ts --check && node scripts/generate-validators.ts --check && node scripts/generate-runtime-wire.ts --check && node scripts/generate-specialists.ts --check',
  '$ node scripts/build-artifacts.mjs',
]
function stderrCommands() {
  const root = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).scripts
  const contracts = JSON.parse(readFileSync(new URL('../../packages/contracts/package.json', import.meta.url), 'utf8')).scripts
  return ['check', 'toolchain:check', 'format:check', 'lint', 'build', 'typecheck', 'contracts:check', 'artifacts']
    .flatMap((key) => key === 'contracts:check' ? [`$ ${root[key]}`, `$ ${contracts['generate:check']}`] : [`$ ${root[key]}`])
}
describe('LSE: exact maintained command prefix on stderr', () => {
  it('accepts the sealed actual local stderr commands with labelled synthetic VERIFY', () => {
    const f = fixture(), commands = stderrCommands()
    assert.deepEqual(sealedStderrCommands, commands.filter((line) => !line.startsWith('$ pnpm toolchain:check &&') && !line.startsWith('$ pnpm -r ')))
    f.input.log.stderr = sealedStderrCommands.join('\n') + '\n' + f.input.log.stderr
    assert.deepEqual(verifyEvidence(f.input.log, f.facts, f.unit, PROFILE), [ROW, PRIMARY])
    assert.equal(guard(f.input), null)
  })
  it('accepts exact command subsequences without moving the table or summary', () => {
    for (const commands of [stderrCommands(), [stderrCommands()[0]], [stderrCommands()[5]], []]) {
      const f = fixture()
      f.input.log.stderr = (commands.length ? commands.join('\n') + '\n' : '') + f.input.log.stderr
      assert.equal(guard(f.input), null)
    }
  })
  for (const [name, prefix, suffix] of [
    ['unknown command', '$ node unexpected.mjs\n', ''],
    ['unit command after VERIFY boundary', '$ ' + JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).scripts.test + '\n', ''],
    ['integration command after VERIFY boundary', '$ node scripts/test-integration.mjs\n', ''],
    ['record command', '$ node scripts/build-artifacts.mjs --record\n', ''],
    ['changed command', sealedStderrCommands[0] + ' --extra\n', ''],
    ['warning', 'warning: ignored error\n', ''],
    ['error', 'Error: failed build\n', ''],
    ['stdout success on stderr', 'All matched files use Prettier code style!\n', ''],
    ['duplicate command', sealedStderrCommands[0] + '\n' + sealedStderrCommands[0] + '\n', ''],
    ['out of order commands', sealedStderrCommands[1] + '\n' + sealedStderrCommands[0] + '\n', ''],
    ['blank inside command prefix', sealedStderrCommands[0] + '\n\n' + sealedStderrCommands[1] + '\n', ''],
    ['two blanks before summary', sealedStderrCommands[0] + '\n\n', ''],
    ['command after summary', '', sealedStderrCommands[0] + '\n'],
    ['command after lifecycle', '', '[ELIFECYCLE] Command failed with exit code 1.\n' + sealedStderrCommands[0] + '\n'],
    ['duplicate summary with command', sealedStderrCommands[0] + '\n', '\n2 identity mismatch(es): this checkout does not reproduce runtime unit fixture\n'],
  ]) it(`refuses ${name} before any record dispatch`, async () => {
    const f = fixture()
    f.input.log.stderr = prefix + f.input.log.stderr + suffix
    assert.equal(guard(f.input), 'verify_not_linux_only')
    let called = false
    const receipt = await produce(f.input, async () => { called = true; return success() }, () => f.after)
    assert.equal(called, false)
    assert.equal(receipt.state, 'skipped')
  })
  it('transports maintained root check/typecheck commands through actual pinned pnpm in a benign fixture', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lse-pnpm-')))
    const root = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
    const run = (args) => new Promise((resolve, reject) => {
      // Actual pnpm and TypeScript, no fake pnpm. Every leaf script is benign fixture code; no product checks run.
      const child = spawn('pnpm', args, { cwd: dir, env: { ...process.env, PATH: new URL('../../node_modules/.bin', import.meta.url).pathname + delimiter + process.env.PATH } })
      let stdout = '', stderr = ''
      child.stdout.on('data', (b) => { stdout += b })
      child.stderr.on('data', (b) => { stderr += b })
      child.on('error', reject)
      child.on('close', (status, signal) => resolve({ stdout, stderr, status, signal }))
    })
    try {
      const scripts = Object.fromEntries(['toolchain:check', 'format:check', 'lint', 'build', 'contracts:check', 'artifacts', 'test', 'test:integration'].map((key) => [key, 'node benign.mjs']))
      scripts.check = root.scripts.check
      scripts.typecheck = root.scripts.typecheck
      writeFileSync(join(dir, 'package.json'), bytes({ name: 'lse-benign', private: true, packageManager: root.packageManager, scripts }))
      writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - child\n')
      writeFileSync(join(dir, 'benign.mjs'), 'console.log("LSE benign leaf; no product execution")\n')
      writeFileSync(join(dir, 'probe.ts'), 'export {};\n')
      writeFileSync(join(dir, 'tsconfig.json'), bytes({ compilerOptions: { types: [], noEmit: true }, files: ['probe.ts'] }))
      mkdirSync(join(dir, 'child'))
      writeFileSync(join(dir, 'child/package.json'), bytes({ name: 'lse-child', private: true, scripts: { typecheck: 'node ../benign.mjs' } }))
      const version = await run(['--version'])
      assert.equal(version.status, 0)
      assert.equal(version.stdout.trim(), '11.7.0')
      const captured = await run(['run', 'check'])
      console.log('LSE_ACTUAL_PNPM_TRANSPORT_SYNTHETIC_VERIFY ' + JSON.stringify({ version, ...captured }))
      assert.equal(captured.status, 0)
      assert.equal(captured.signal, null)
      assert.match(captured.stdout, /LSE benign leaf; no product execution/)
      const wanted = [`$ ${root.scripts.check}`, `$ ${root.scripts.typecheck}`]
      const actual = captured.stderr.split(/\r?\n/).filter((line) => wanted.includes(line))
      assert.deepEqual(actual, wanted, 'actual pinned pnpm emits both exact maintained command forms on stderr')
      const f = fixture()
      // Only the two measured exact maintained command forms are reused; benign leaf diagnostics are not admitted.
      f.input.log.stderr = actual.join('\n') + '\n' + f.input.log.stderr
      assert.deepEqual(verifyEvidence(f.input.log, f.facts, f.unit, PROFILE), [ROW, PRIMARY])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
