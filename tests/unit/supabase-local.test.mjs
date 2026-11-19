/**
 * CI-3A1E-SUPABASE-ISOLATION-REPAIR-001 (attempt R1): scripts/supabase-local.ts isolates a CI attempt's local Supabase
 * project.
 *
 * What is shown: the attempt identity is checked before any effect; the committed config keeps the developer defaults
 * and the attempt's copy changes only its project id and host ports; a port block inside the ephemeral range or with a
 * busy port (a REAL listener) is passed over and the listener is never touched; a start happens only after Docker
 * positively answered that nothing carries the project's name, and an unknown answer or an existing (even partial)
 * stack means no start and no stop; the attempt owns what its start creates, and only that; `--stop` acts only on a
 * workdir, record and config that are exactly the attempt's (no links, no drift, no look-alike); every cleanup failure
 * is kept beside the original failure.
 * The Supabase CLI and Docker are an injected runner here (no Docker daemon): these tests say nothing about a real
 * `supabase start`, a real Docker answer or what the CLI writes into its workdir.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { connect, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  BLOCKS,
  absenceProblem,
  chooseBlock,
  isBlock,
  isolatedConfig,
  isolationFrom,
  ownershipProblem,
  portsAt,
  released,
  startIsolated,
  stopIsolated,
  workdirOf,
} from '../../scripts/supabase-local.ts'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SCRIPT = join(ROOT, 'scripts', 'supabase-local.ts')
const COMMITTED = readFileSync(join(ROOT, 'supabase', 'config.toml'), 'utf8')
const EXCLUDED = 'realtime,storage-api,imgproxy,studio,postgres-meta,edge-runtime,logflare,vector,supavisor'
const tmp = mkdtempSync(join(tmpdir(), 'sophia-supabase-local-test-'))
after(() => rmSync(tmp, { recursive: true, force: true }))

const keys = join(tmp, 'signing_keys.json')
writeFileSync(keys, '[]')
const sources = { config: join(ROOT, 'supabase', 'config.toml'), signingKeys: keys }
const allFree = async () => true
let next = 0
/** A fresh root and a fresh attempt for each case, so no case meets another's workdir. */
const fresh = () => {
  next += 1
  const root = join(tmp, `root-${next}`)
  mkdirSync(root)
  return { root, iso: isolationFrom({ SOPHIA_SUPABASE_ISOLATION: `9${next}-1` }) }
}

const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' })
const failed = (stderr, status = 1) => ({ status, stdout: '', stderr })
/** Records every call as [tool, ...args]; `answer(tool, args)` says what it returns. */
const runner = (answer) => {
  const calls = []
  return { calls, run: (tool, args) => (calls.push([tool, ...args]), answer(tool, args)) }
}
const supabaseCalls = (calls) => calls.filter(([tool]) => tool === 'supabase').map(([, ...args]) => args)
const workdirArg = (args) => args[args.indexOf('--workdir') + 1]
/** The ports a real CLI would read: the `[api]` and `[db]` port lines of the workdir's own config. */
const configuredPorts = (workdir) => {
  let section = ''
  const ports = {}
  for (const line of readFileSync(join(workdir, 'supabase', 'config.toml'), 'utf8').split('\n')) {
    section = /^\[([^\]]+)\]$/.exec(line)?.[1] ?? section
    const m = /^port = (\d+)$/.exec(line)
    if (m && (section === 'api' || section === 'db')) ports[section] = Number(m[1])
  }
  return ports
}
const statusOf = ({ api, db }) =>
  JSON.stringify({
    API_URL: `http://127.0.0.1:${api}`,
    DB_URL: `postgresql://postgres:local-test@127.0.0.1:${db}/postgres`,
    PUBLISHABLE_KEY: 'publishable-test',
    SECRET_KEY: 'secret-test',
    MAILPIT_URL: 'http://127.0.0.1:1',
  })
/**
 * Docker that answers "nothing with that name" to every query, and a CLI that starts with `start` and reports what its
 * workdir's config says. `docker(args)` and `start(args)` replace those answers.
 */
const healthyCli = ({ start = () => ok(), docker = () => ok('') } = {}) =>
  runner((tool, args) => {
    if (tool === 'docker') return docker(args)
    if (args[0] === 'status' && args[1] === '-o')
      return ok(`Stopped services\n${statusOf(configuredPorts(workdirArg(args)))}`)
    if (args[0] === 'start') return start(args)
    if (args[0] === 'stop') return ok()
    return failed(`unexpected ${args.join(' ')}`)
  })

/** Every path under `dir`, links read as links (never followed), with its bytes or link target. */
const snapshot = (dir) => {
  const out = {}
  const walk = (path) => {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) out[path] = `link:${readlinkSync(path)}`
    else if (stat.isDirectory()) for (const name of readdirSync(path).toSorted()) walk(join(path, name))
    else out[path] = readFileSync(path, 'utf8')
  }
  walk(dir)
  return out
}
/** A workdir exactly as a successful isolated start leaves it. */
const ownedWorkdir = async () => {
  const { root, iso } = fresh()
  const cli = healthyCli()
  const { workdir } = await startIsolated(cli.run, iso, root, { probe: allFree, sources })
  return { root, iso, workdir }
}
const recordPath = (workdir) => join(workdir, 'sophia-owner.json')
const configPath = (workdir) => join(workdir, 'supabase', 'config.toml')
const readRecord = (workdir) => JSON.parse(readFileSync(recordPath(workdir), 'utf8'))
const writeRecord = (workdir, record) => writeFileSync(recordPath(workdir), `${JSON.stringify(record)}\n`)
const sha256 = (data) => createHash('sha256').update(data).digest('hex')
/** `--stop` on a workdir it must refuse: no CLI call of any kind, and nothing under the root changed. */
const refusesUntouched = (root, iso, pattern) => {
  const before = snapshot(root)
  const cli = runner(() => ok())
  assert.throws(() => stopIsolated(cli.run, iso, root), pattern)
  assert.deepEqual(cli.calls, [], 'no CLI call')
  assert.deepEqual(snapshot(root), before, 'nothing changed')
}

const listen = (port) =>
  new Promise((settle, reject) => {
    const server = createServer((socket) => socket.end())
    server.once('error', reject)
    server.listen({ port, host: '0.0.0.0', exclusive: true }, () => settle(server))
  })
const accepts = (port) =>
  new Promise((settle) => {
    const socket = connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => (socket.destroy(), settle(true)))
    socket.once('error', () => settle(false))
  })
const close = (server) => new Promise((settle) => server.close(() => settle()))

describe('the attempt identity, checked before any effect', () => {
  test('no variable keeps the developer defaults; a valid one names its own project', () => {
    assert.equal(isolationFrom({}), null)
    assert.deepEqual(isolationFrom({ SOPHIA_SUPABASE_ISOLATION: '43826175983-2' }), {
      id: '43826175983-2',
      projectId: 'sophia-ci-43826175983-2',
    })
  })

  test('an empty or malformed value is refused, never read as "no isolation"', () => {
    for (const bad of ['', '43826175983', '0-1', '1-0', 'x-1', '1-1; supabase stop --all', '1-1 ', '../1-1']) {
      assert.throws(() => isolationFrom({ SOPHIA_SUPABASE_ISOLATION: bad }), /<run id>-<run attempt>/, bad)
    }
  })
})

describe('the config: defaults kept, the attempt copy changes only its project and ports', () => {
  test('the committed config still holds the developer defaults', () => {
    assert.match(COMMITTED, /\nproject_id = "sophia-next"\n/)
    assert.match(COMMITTED, /\n\[api\]\nenabled = true\n# Port to use for the API URL.\nport = 54321\n/)
    assert.match(COMMITTED, /\n\[db\]\n# Port to use for the local database URL.\nport = 54322\n/)
  })

  test('the copy differs in exactly the eight overridden lines, and no active line keeps a default port', () => {
    const ports = portsAt(23_450)
    const before = COMMITTED.split('\n')
    const after = isolatedConfig(COMMITTED, 'sophia-ci-7-1', ports).split('\n')
    assert.equal(after.length, before.length)
    const changed = after.flatMap((line, i) => (line === before[i] ? [] : [line]))
    assert.deepEqual(changed, [
      'project_id = "sophia-ci-7-1"',
      'port = 23451',
      'port = 23452',
      'shadow_port = 23450',
      'port = 23459',
      'port = 23453',
      'port = 23454',
      'port = 23457',
    ])
    assert.equal(after.filter((l) => !l.startsWith('#') && /\b543\d\d\b/.test(l)).length, 0)
  })

  test('a config where an override is missing or repeated, or with a multi-line string, is refused before anything starts', () => {
    const noAnalytics = COMMITTED.replace(
      '[analytics]\nenabled = true\nport = 54327\n',
      '[analytics]\nenabled = true\n',
    )
    assert.notEqual(noAnalytics, COMMITTED)
    assert.throws(
      () => isolatedConfig(noAnalytics, 'sophia-ci-7-1', portsAt(23_450)),
      /not exactly one analytics\.port/,
    )
    const twice = COMMITTED.replace('port = 54321\n', 'port = 54321\nport = 54321\n')
    assert.throws(() => isolatedConfig(twice, 'sophia-ci-7-1', portsAt(23_450)), /not exactly one api\.port/)
    const multiline = COMMITTED.replace(
      'project_id = "sophia-next"\n',
      'project_id = "sophia-next"\nnote = """\nx\n"""\n',
    )
    assert.throws(() => isolatedConfig(multiline, 'sophia-ci-7-1', portsAt(23_450)), /multi-line strings/)
  })
})

describe('host ports: below the ephemeral range, busy ones passed over and never touched', () => {
  test("every candidate block lies in 20000-31999, outside Linux's default ephemeral range", async () => {
    for (const id of ['1-1', '43826175983-1', '43826175983-2', '43826170487-1']) {
      const ports = await chooseBlock(id, allFree, [32_768, 60_999])
      assert.ok(
        Object.values(ports).every((p) => p >= BLOCKS.first && p < 32_000),
        `${id}: ${Object.values(ports)}`,
      )
      assert.equal(isBlock(ports), true)
    }
    assert.equal(isBlock(portsAt(20_005)), false, 'off the grid')
    assert.equal(isBlock(portsAt(32_000)), false, 'past the last block')
    assert.equal(isBlock({ ...portsAt(20_000), db: 20_003 }), false, 'roles out of place')
  })

  test('a block inside the ephemeral range is refused without probing; bounded, and nothing was stopped', async () => {
    let probes = 0
    const probe = async () => ((probes += 1), true)
    await assert.rejects(chooseBlock('5-1', probe, [1, 65_535]), (err) => {
      assert.match(err.message, /no free Supabase port block for attempt 5-1; nothing was stopped/)
      assert.equal(err.message.match(/inside the ephemeral range 1-65535/g).length, BLOCKS.tries)
      return true
    })
    assert.equal(probes, 0)
  })

  test('a REAL listener on the chosen block moves the attempt to another block, and the listener keeps serving', async () => {
    const first = await chooseBlock('424242-1')
    const holder = await listen(first.db)
    try {
      const second = await chooseBlock('424242-1')
      assert.notEqual(second.db, first.db)
      assert.ok(!Object.values(second).includes(first.db), 'the busy port is in no chosen role')
      assert.equal(await accepts(first.db), true, 'the foreign listener was not touched')
    } finally {
      await close(holder)
    }
  })

  test('every block busy: the error names each busy port and the bound; nothing is asked, started or stopped', async () => {
    const { root, iso } = fresh()
    const cli = runner(() => ok())
    const busy = async () => false
    await assert.rejects(startIsolated(cli.run, iso, root, { probe: busy, sources }), (err) => {
      assert.equal(err.message.match(/: busy \d+/g).length, BLOCKS.tries)
      return true
    })
    assert.deepEqual(cli.calls, [])
    assert.equal(existsSync(workdirOf(iso, root)), false, 'its own empty workdir is removed')
  })
})

describe('F01: a start only after known absence; unknown or existing means no start and no stop', () => {
  test("an existing workdir is not this attempt's: refused, its contents kept, no CLI call", async () => {
    const { root, iso } = fresh()
    const workdir = workdirOf(iso, root)
    mkdirSync(workdir)
    writeFileSync(join(workdir, 'foreign'), 'kept')
    const cli = runner(() => ok())
    await assert.rejects(
      startIsolated(cli.run, iso, root, { probe: allFree, sources }),
      /already exists, so it is not this attempt's/,
    )
    assert.equal(readFileSync(join(workdir, 'foreign'), 'utf8'), 'kept')
    assert.deepEqual(cli.calls, [])
  })

  test('an unknown answer is never absence: no daemon, no permission, no client, a null status, on any query', async () => {
    const unknowns = [
      failed('failed to connect to the docker API at unix:///var/run/docker.sock: no such file or directory'),
      failed('permission denied while trying to connect to the Docker daemon socket'),
      failed('', 127),
      { status: null, stdout: '', stderr: '' },
      { status: 1, stdout: '', stderr: '' },
    ]
    for (const answer of unknowns) {
      for (const at of [0, 1, 2]) {
        const { root, iso } = fresh()
        let query = -1
        const cli = healthyCli({ docker: () => ((query += 1), query === at ? answer : ok('')) })
        await assert.rejects(startIsolated(cli.run, iso, root, { probe: allFree, sources }), (err) => {
          assert.match(err.message, /its absence is unknown: docker .* (did not run|exited \d+)/)
          assert.match(err.message, /nothing was started or stopped/)
          return true
        })
        assert.deepEqual(supabaseCalls(cli.calls), [], 'no start and no stop')
        assert.equal(cli.calls.length, at + 1, 'no question after the unknown answer')
        assert.equal(existsSync(workdirOf(iso, root)), false, 'only its own files were removed')
        // The always() step that follows finds nothing it owns and calls nothing.
        const later = runner(() => ok())
        assert.match(stopIsolated(later.run, iso, root), /nothing to stop/)
        assert.deepEqual(later.calls, [])
      }
    }
  })

  test('an existing or partial stack under the name (a container, a volume or a network alone) is refused untouched', async () => {
    const kinds = ['ps -a', 'volume ls', 'network ls']
    for (const at of [0, 1, 2]) {
      const { root, iso } = fresh()
      let query = -1
      const cli = healthyCli({ docker: () => ((query += 1), query === at ? ok(`found-${at}\n`) : ok('')) })
      await assert.rejects(startIsolated(cli.run, iso, root, { probe: allFree, sources }), (err) => {
        assert.match(
          err.message,
          new RegExp(`docker ${kinds[at]} already lists found-${at}; nothing was started or stopped`),
        )
        return true
      })
      assert.deepEqual(supabaseCalls(cli.calls), [], 'a foreign or unknown stack is never started over, nor stopped')
    }
  })

  test('known absence takes three positive answers by the unique name, and only then are ownership and the start written', async () => {
    const { root, iso } = fresh()
    const workdir = workdirOf(iso, root)
    let recordAtStart = null
    const cli = healthyCli({ start: () => ((recordAtStart = readRecord(workdir)), ok()) })
    await startIsolated(cli.run, iso, root, { probe: allFree, sources })
    const name = `name=${iso.projectId}`
    assert.deepEqual(cli.calls.slice(0, 3), [
      ['docker', 'ps', '-a', '-q', '--filter', name],
      ['docker', 'volume', 'ls', '-q', '--filter', name],
      ['docker', 'network', 'ls', '-q', '--filter', name],
    ])
    assert.deepEqual(cli.calls[3], ['supabase', 'start', '-x', EXCLUDED, '--workdir', workdir])
    assert.deepEqual(Object.keys(recordAtStart).toSorted(), ['config', 'id', 'ports', 'projectId', 'version'])
    assert.equal(recordAtStart.projectId, iso.projectId)
    assert.equal(recordAtStart.config, sha256(readFileSync(configPath(workdir), 'utf8')))
    assert.equal(absenceProblem(runner(() => ok('')).run, iso.projectId), null)
  })

  test('an owned start that fails part-way (a partial stack of its own) is stopped, and only that project', async () => {
    const { root, iso } = fresh()
    const cli = healthyCli({ start: () => failed('failed to start docker container: address already in use') })
    await assert.rejects(
      startIsolated(cli.run, iso, root, { probe: allFree, sources }),
      /supabase start .* failed:\nfailed to start docker container: address already in use/,
    )
    const workdir = workdirOf(iso, root)
    assert.deepEqual(
      supabaseCalls(cli.calls).filter(([c]) => c === 'stop'),
      [['stop', '--no-backup', '--workdir', workdir]],
    )
    assert.ok(cli.calls.every((args) => !args.includes('--all') && !args.includes('--project-id')))
    assert.ok(cli.calls.every(([tool, cmd]) => tool !== 'docker' || ['ps', 'volume', 'network'].includes(cmd)))
    assert.equal(existsSync(workdir), false)
  })
})

describe("startup, handoff and cleanup of the attempt's own project", () => {
  test('starts from its own workdir, hands on the chosen ports, and --stop stops only that project', async () => {
    const { root, iso } = fresh()
    const cli = healthyCli()
    const { status, workdir } = await startIsolated(cli.run, iso, root, { probe: allFree, sources })
    const ports = configuredPorts(workdir)
    assert.equal(workdir, workdirOf(iso, root))
    assert.equal(new URL(status.API_URL).port, String(ports.api))
    assert.ok(ports.api >= BLOCKS.first && ports.api < 32_000)
    assert.match(readFileSync(configPath(workdir), 'utf8'), new RegExp(`\nproject_id = "${iso.projectId}"\n`))
    assert.equal(statSync(join(workdir, 'supabase', 'signing_keys.json')).mode & 0o777, 0o600)
    assert.deepEqual(supabaseCalls(cli.calls), [
      ['start', '-x', EXCLUDED, '--workdir', workdir],
      ['status', '-o', 'json', '--workdir', workdir],
    ])
    assert.equal(ownershipProblem(workdir, iso), null)
    cli.calls.length = 0
    assert.equal(stopIsolated(cli.run, iso, root), `stopped ${iso.projectId} and removed its workdir`)
    assert.deepEqual(cli.calls, [['supabase', 'stop', '--no-backup', '--workdir', workdir]])
    assert.equal(existsSync(workdir), false)
    assert.equal(stopIsolated(cli.run, iso, root), `no Supabase workdir left for ${iso.projectId}: nothing to stop`)
    assert.equal(cli.calls.length, 1, 'nothing left, nothing called')
  })

  test('a stack reporting other ports than chosen is not handed on: stopped, and the mismatch said', async () => {
    const { root, iso } = fresh()
    const cli = runner((tool, args) => {
      if (tool === 'docker') return ok('')
      if (args[0] === 'status' && args[1] === '-o') return ok(statusOf({ api: 54_321, db: 54_322 }))
      return ok()
    })
    await assert.rejects(
      startIsolated(cli.run, iso, root, { probe: allFree, sources }),
      /reports API 54321 and DB 54322, not this attempt's/,
    )
    assert.deepEqual(cli.calls.at(-1).slice(0, 2), ['supabase', 'stop'])
    assert.equal(existsSync(workdirOf(iso, root)), false)
  })

  test('a failure before any start stops nothing', () => {
    const { root } = fresh()
    const workdir = join(root, 'own')
    mkdirSync(workdir)
    const cli = runner(() => ok())
    const primary = new Error('before start')
    assert.equal(released(cli.run, workdir, false, primary), primary, 'the original error itself')
    assert.deepEqual(cli.calls, [])
    assert.equal(existsSync(workdir), false)
  })
})

describe('F03: the original failure and every cleanup failure survive together', () => {
  test('when stopping its own project fails too, both are kept and the workdir stays for the next step', async () => {
    const { root, iso } = fresh()
    const cli = healthyCli({ start: () => failed('start refused') })
    const stopFails = runner((tool, args) =>
      tool === 'supabase' && args[0] === 'stop' ? failed('stop refused') : cli.run(tool, args),
    )
    await assert.rejects(startIsolated(stopFails.run, iso, root, { probe: allFree, sources }), (err) => {
      assert.ok(err instanceof AggregateError)
      assert.match(err.errors[0].message, /supabase start .* failed:\nstart refused/)
      assert.match(
        err.errors[1].message,
        /stopping this attempt's own project failed \(workdir kept: .*\): stop refused/,
      )
      assert.equal(err.cause, err.errors[0])
      return true
    })
    assert.equal(existsSync(join(workdirOf(iso, root), 'sophia-owner.json')), true)
  })

  test('a removal that fails after a good stop keeps the original failure and the removal error as its cause; a normal teardown then succeeds', async () => {
    const { root, iso } = fresh()
    const removal = Object.assign(new Error('EIO: removal failed (deterministic fixture)'), { code: 'EIO' })
    const cli = healthyCli({ start: () => failed('start refused') })
    await assert.rejects(
      startIsolated(cli.run, iso, root, {
        probe: allFree,
        sources,
        remove: () => {
          throw removal
        },
      }),
      (err) => {
        assert.ok(err instanceof AggregateError, 'not the bare removal error')
        assert.equal(err.errors.length, 2)
        assert.match(err.errors[0].message, /supabase start .* failed:\nstart refused/)
        assert.match(err.errors[1].message, /removing this attempt's workdir .* failed/)
        assert.equal(err.errors[1].cause, removal)
        assert.match(err.message, /start refused[\s\S]*and removing this attempt's workdir/)
        return true
      },
    )
    const workdir = workdirOf(iso, root)
    assert.deepEqual(supabaseCalls(cli.calls).at(-1), ['stop', '--no-backup', '--workdir', workdir])
    assert.equal(ownershipProblem(workdir, iso), null, "the kept workdir is still exactly the attempt's")
    // Normal teardown of what was kept: the always() step stops it again and really removes it.
    const teardown = runner(() => ok())
    assert.match(stopIsolated(teardown.run, iso, root), /stopped .* and removed its workdir/)
    assert.equal(existsSync(workdir), false)
  })

  test('a removal that fails after the always() step stopped the project is an error, never a success', async () => {
    const { root, iso } = await ownedWorkdir()
    const removal = new Error('EACCES: removal failed (deterministic fixture)')
    const cli = runner(() => ok())
    assert.throws(
      () =>
        stopIsolated(cli.run, iso, root, {
          remove: () => {
            throw removal
          },
        }),
      (err) => (
        assert.match(err.message, /stopped .*, but removing .* failed/),
        assert.equal(err.cause, removal),
        true
      ),
    )
    rmSync(workdirOf(iso, root), { recursive: true })
  })
})

describe('F02: --stop acts only on exactly what the attempt wrote', () => {
  test('a config spoofed to name another project, with the expected line hidden in a multi-line string, is refused', async () => {
    const { root, iso, workdir } = await ownedWorkdir()
    const own = readFileSync(configPath(workdir), 'utf8')
    const spoof = own.replace(
      `project_id = "${iso.projectId}"\n`,
      `project_id = "sophia-next"\nnote = """\nproject_id = "${iso.projectId}"\n"""\n`,
    )
    assert.ok(
      spoof.includes(`\nproject_id = "${iso.projectId}"\n`),
      'the look-alike line a substring check would accept',
    )
    writeFileSync(configPath(workdir), spoof)
    refusesUntouched(root, iso, /the config changed after the start; nothing was stopped/)
    writeRecord(workdir, { ...readRecord(workdir), config: sha256(spoof) })
    refusesUntouched(root, iso, /multi-line strings are not supported|not this attempt's project copy/)
  })

  test('a config that drifted (another port, the same project) is refused, with or without a matching hash', async () => {
    const { root, iso, workdir } = await ownedWorkdir()
    const record = readRecord(workdir)
    const drifted = readFileSync(configPath(workdir), 'utf8').replace(`port = ${record.ports.db}\n`, 'port = 54322\n')
    writeFileSync(configPath(workdir), drifted)
    refusesUntouched(root, iso, /the config changed after the start/)
    writeRecord(workdir, { ...record, config: sha256(drifted) })
    refusesUntouched(root, iso, /a default port is still active|not this attempt's project copy/)
  })

  test('a linked workdir, config, keys or record is refused, whatever it points to', async () => {
    const real = await ownedWorkdir()
    const { root, iso } = fresh()
    symlinkSync(real.workdir, workdirOf(iso, root))
    refusesUntouched(root, iso, /is a link; nothing was stopped/)
    for (const rel of [['supabase', 'config.toml'], ['supabase', 'signing_keys.json'], ['sophia-owner.json']]) {
      const owned = await ownedWorkdir()
      const path = join(owned.workdir, ...rel)
      const copy = join(owned.root, `copy-of-${rel.at(-1)}`)
      writeFileSync(copy, readFileSync(path))
      rmSync(path)
      symlinkSync(copy, path)
      refusesUntouched(owned.root, owned.iso, /is a link; nothing was stopped/)
    }
  })

  test('a record that is malformed, incomplete, for another attempt or with an invalid block is refused', async () => {
    const { root, iso, workdir } = await ownedWorkdir()
    const record = readRecord(workdir)
    const bad = [
      ['{not json', /not an object/],
      [JSON.stringify({ projectId: iso.projectId }), /unexpected fields/],
      [JSON.stringify({ ...record, extra: true }), /unexpected fields/],
      [JSON.stringify({ ...record, version: 2 }), /does not name/],
      [JSON.stringify({ ...record, projectId: 'sophia-next' }), /does not name/],
      [JSON.stringify({ ...record, id: '1-1' }), /does not name/],
      [JSON.stringify({ ...record, ports: portsAt(20_005) }), /one valid port block/],
      [JSON.stringify({ ...record, config: 'abc' }), /no config hash/],
    ]
    for (const [text, pattern] of bad) {
      writeFileSync(recordPath(workdir), text)
      refusesUntouched(root, iso, pattern)
    }
  })

  test("an unexpected entry beside the attempt's files, or a missing record, is refused", async () => {
    const { root, iso, workdir } = await ownedWorkdir()
    writeFileSync(join(workdir, 'foreign'), 'kept')
    refusesUntouched(root, iso, /unexpected contents foreign, sophia-owner.json, supabase/)
    rmSync(join(workdir, 'foreign'))
    rmSync(recordPath(workdir))
    refusesUntouched(root, iso, /unexpected contents supabase/)
  })
})

describe("the script's --stop entry (a real process; it never reaches the CLI here)", () => {
  const stop = (env) =>
    spawnSync(process.execPath, [SCRIPT, '--stop'], {
      encoding: 'utf8',
      timeout: 60_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    })

  test('outside an isolated attempt it refuses: developers stop with the CLI', () => {
    const r = stop({})
    assert.equal(r.status, 1)
    assert.match(r.stderr, /--stop stops only an isolated CI attempt/)
  })

  test('a malformed attempt is refused before any effect', () => {
    const r = stop({ SOPHIA_SUPABASE_ISOLATION: '1-1 --all', RUNNER_TEMP: tmp })
    assert.equal(r.status, 1)
    assert.match(r.stderr, /<run id>-<run attempt>/)
  })

  test('an attempt with nothing left says so and succeeds', () => {
    const { root } = fresh()
    const r = stop({ SOPHIA_SUPABASE_ISOLATION: '77-3', RUNNER_TEMP: root })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /no Supabase workdir left for sophia-ci-77-3: nothing to stop/)
  })
})
