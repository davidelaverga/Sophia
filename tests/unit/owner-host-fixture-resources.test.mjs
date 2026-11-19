// Finite adverse controls for only the new H fixture ownership class.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { OwnerHostFixtureResources, fixtureDeadline } from '../helpers/owner-host-fixture-resources.ts'

test('partial setup owns directory/server/pool before the next acquisition fails', async () => {
  const owner = new OwnerHostFixtureResources(),
    primary = new Error('synthetic setup failed')
  let directory,
    server,
    ended = false
  await assert.rejects(
    owner.setup(async () => {
      directory = owner.directory('h-setup-')
      server = owner.server(createServer())
      owner.pool({
        end: async () => {
          ended = true
        },
      })
      throw primary
    }),
    (err) => err === primary,
  )
  assert.equal(ended, true)
  assert.equal(server.listening, false)
  assert.equal(existsSync(directory), false)
})

test('listen failure is owned before listening, and later cleanup still runs', async () => {
  const outer = new OwnerHostFixtureResources()
  await outer.run(async () => {
    const blocker = outer.server(createServer())
    blocker.listen(0, '127.0.0.1')
    await fixtureDeadline(once(blocker, 'listening'))
    const address = blocker.address()
    assert.ok(address && typeof address === 'object')
    const failed = new OwnerHostFixtureResources()
    let ended = false
    let directory
    await assert.rejects(
      failed.setup(async () => {
        directory = failed.directory('h-listen-fail-')
        failed.pool({
          end: async () => {
            ended = true
          },
        })
        const server = failed.server(createServer())
        server.listen(address.port, '127.0.0.1')
        await fixtureDeadline(once(server, 'listening'))
      }),
      (err) => err instanceof AggregateError && err.cause?.code === 'EADDRINUSE',
    )
    assert.equal(ended, true)
    assert.equal(existsSync(directory), false)
  })
})

test('failing body terminates and joins its live child before removing private files', async () => {
  const owner = new OwnerHostFixtureResources(),
    primary = new Error('synthetic body failure')
  let dir
  await assert.rejects(
    owner.run(async () => {
      dir = owner.directory('h-live-child-')
      const file = join(dir, 'still-owned')
      const source = `const fs=require('node:fs');process.on('SIGTERM',()=>setTimeout(()=>process.exit(fs.existsSync(${JSON.stringify(dir)})?0:9),40));process.stdout.write('ready');setInterval(()=>{},1000)`
      const child = spawn(process.execPath, ['-e', source], { stdio: ['ignore', 'pipe', 'pipe'] })
      owner.child(child)
      await fixtureDeadline(once(child.stdout, 'data'))
      assert.equal(existsSync(file), false)
      throw primary
    }),
    (err) => err === primary,
  )
  assert.deepEqual(
    owner.childReports.map((r) => r.close),
    [[0, null]],
  )
  assert.deepEqual(owner.childReports[0].signals, ['SIGTERM'])
  assert.equal(existsSync(dir), false)
})

test('first cleanup rejection preserves the body error and attempts all later readers, drop and files', async () => {
  const owner = new OwnerHostFixtureResources(),
    primary = new Error('body'),
    cleanup = new Error('cleanup')
  const calls = []
  const dir = owner.directory('h-cleanup-error-')
  owner.database({
    drop: async () => {
      calls.push('drop')
    },
  })
  owner.pool({
    end: async () => {
      calls.push('reader1')
    },
  })
  owner.pool({
    end: async () => {
      calls.push('reader2')
    },
  })
  owner.own('first', () => {
    calls.push('first')
    throw cleanup
  })
  await assert.rejects(
    owner.run(async () => {
      throw primary
    }),
    (err) =>
      err instanceof AggregateError &&
      err.cause === primary &&
      err.errors[0] === primary &&
      err.errors[1] instanceof AggregateError &&
      err.errors[1].errors[0].cause === cleanup,
  )
  assert.deepEqual(calls, ['first', 'reader2', 'reader1', 'drop'])
  assert.equal(existsSync(dir), false)
})

test('an unproven pool drain attempts other readers and retains its owned DB instead of dropping under it', async () => {
  const owner = new OwnerHostFixtureResources(),
    calls = []
  owner.database({
    drop: async () => {
      calls.push('drop')
    },
  })
  owner.pool({
    end: async () => {
      calls.push('later')
    },
  })
  owner.pool({
    end: async () => {
      calls.push('failed')
      throw new Error('end failed')
    },
  })
  await assert.rejects(
    owner.close(),
    (err) =>
      err instanceof AggregateError &&
      err.errors.some((value) => value.cause?.message === 'Owned pool drain unproven; database retained'),
  )
  assert.deepEqual(calls, ['failed', 'later'])
})

test('a failing body releases its explicit gate before joining the reader it was holding', async () => {
  const owner = new OwnerHostFixtureResources(),
    primary = new Error('body with blocked reader')
  const gate = Promise.withResolvers()
  const calls = []
  owner.own(
    'gate',
    () => {
      calls.push('gate')
      gate.resolve()
    },
    'fences',
  )
  owner.own('reader', async () => {
    await gate.promise
    calls.push('reader')
  })
  await assert.rejects(
    fixtureDeadline(
      owner.run(async () => {
        throw primary
      }),
    ),
    (err) => err === primary,
  )
  assert.deepEqual(calls, ['gate', 'reader'])
})
