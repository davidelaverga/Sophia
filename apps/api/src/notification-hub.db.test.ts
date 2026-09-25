// The long-poll hub against a real PostgreSQL LISTEN (S1-05A, Codex review round 3): a notification that lands
// after the poll armed its waiter but before it began waiting must wake it at once, not after the timeout.
import type pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, type TestDatabase } from '@sophia/test-support'
import { NotificationHub } from './notification-hub.ts'

const CHANNEL = 'sophia_runtime_commands'
let db: TestDatabase
let api: pg.Pool
let owner: pg.Pool
let hub: NotificationHub

const notify = (key: string) => owner.query('SELECT pg_notify($1, $2)', [CHANNEL, key])
const never = () => new AbortController().signal

before(async () => {
  db = await createTestDatabase()
  api = createPool(db.apiUrl, { max: 2 })
  owner = createPool(db.ownerUrl, { max: 1 })
  hub = new NotificationHub(api, CHANNEL, (err) => assert.fail(err))
})

after(async () => {
  await hub.close()
  await api.end()
  await owner.end()
  await db.drop()
})

describe('notification hub', () => {
  it('a notification between arming and waiting wakes the wait at once', async () => {
    const early = await hub.arm('runtime-1')
    const witness = await hub.arm('runtime-1')
    await notify('runtime-1')
    // The witness waits first, so once it wakes the notification has reached every waiter armed for the key.
    await witness.wait(5000, never())
    const started = Date.now()
    await early.wait(5000, never())
    assert.ok(Date.now() - started < 1000, 'the early notification was kept, not lost')
    early.cancel()
    witness.cancel()
  })

  it('another key’s notification does not wake it; the timeout does', async () => {
    const waiter = await hub.arm('runtime-2')
    await notify('runtime-3')
    const started = Date.now()
    await waiter.wait(300, never())
    assert.ok(Date.now() - started >= 250)
    waiter.cancel()
  })

  it('a waiter armed for anything wakes on any key, and an aborted poll stops waiting', async () => {
    const any = await hub.arm(null)
    const pending = any.wait(5000, never())
    await notify('runtime-4')
    await pending
    any.cancel()
    const aborted = await hub.arm('runtime-5')
    const controller = new AbortController()
    const waiting = aborted.wait(5000, controller.signal)
    controller.abort()
    await waiting
    aborted.cancel()
  })
})
