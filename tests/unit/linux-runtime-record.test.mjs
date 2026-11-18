import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
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
import { join } from 'node:path'
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
  let out = '',
    count = 0
  for (const [key, value] of Object.entries(facts)) {
    const old = get(unit, key)
    const same = JSON.stringify(old) === JSON.stringify(value)
    out += `${same ? 'match   ' : old === undefined ? 'UNRECORDED ' : 'MISMATCH '}${key}\n         built    ${JSON.stringify(value)}\n`
    if (!same) {
      count++
      out +=
        old === undefined
          ? `         nothing is recorded for this platform yet (primary: ${unit.dsh.artifact_primary_platform}); record it with \`pnpm artifacts:record\` in a reviewed commit\n`
          : `         recorded ${JSON.stringify(old)}\n`
    }
  }
  return (
    out +
    `match   ${PROFILE}\n\n${count} identity mismatch(es): this checkout does not reproduce runtime unit ${unit.id}\n`
  )
}
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
        i.log = i.log.replace(`match   ${PROFILE}`, `MISMATCH ${PROFILE}`)
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
        i.log += 'access_token=fixturesecretvalue\n'
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
