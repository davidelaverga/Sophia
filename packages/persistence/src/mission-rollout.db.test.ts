// A09 rollout over existing 0018 projects, using the real API role and PostgreSQL. Only synthetic data.
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { mkdtemp, readdir, copyFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { createTestDatabase, seedProject } from '@sophia/test-support'
import { createPool, withActor, setMissionNoteConsent, setMissionNotePolicy, readMissionContext } from './index.ts'

it('0019 preserves existing opt-outs and consent, refreshes only implicit policies and grants the API its reader', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sophia-pre-a09-'))
  for (const name of await readdir('db/migrations'))
    if (name.endsWith('.sql') && name < '0019') await copyFile(join('db/migrations', name), join(dir, name))
  const db = await createTestDatabase(dir)
  const owner = new pg.Client({ connectionString: db.ownerUrl })
  const pool = createPool(db.apiUrl)
  try {
    await owner.connect()
    const admin = randomUUID(),
      member = randomUUID()
    const implicit = await seedProject(db.ownerUrl, { admin, editors: [member] })
    const optedOut = await seedProject(db.ownerUrl, { admin, editors: [member] })
    await withActor(pool, admin, 'write', async (c) => {
      await setMissionNotePolicy(c, optedOut.projectId, 'off', 0)
      await setMissionNoteConsent(c, implicit.projectId, 'accepted')
    })
    await withActor(pool, member, 'write', (c) => setMissionNoteConsent(c, optedOut.projectId, 'declined'))
    const before = await owner.query('SELECT id, ledger_revision FROM sophia.projects ORDER BY id')
    const rows = await owner.query(
      'SELECT project_id, actor_id, state, revision FROM sophia.mission_note_consents ORDER BY project_id,actor_id',
    )
    await owner.query(await readFile('db/migrations/0019_default_mission_capture.sql', 'utf8'))
    await owner.query(await readFile('db/migrations/0020_typed_mission_turns.sql', 'utf8'))
    const after = await owner.query('SELECT id, ledger_revision FROM sophia.projects ORDER BY id')
    for (let i = 0; i < before.rows.length; i++) {
      const old = before.rows[i],
        current = after.rows[i]
      assert.equal(
        BigInt(current.ledger_revision),
        BigInt(old.ledger_revision) + (old.id === implicit.projectId ? 1n : 0n),
      )
    }
    assert.deepEqual(
      (
        await owner.query(
          'SELECT project_id, actor_id, state, revision FROM sophia.mission_note_consents ORDER BY project_id,actor_id',
        )
      ).rows,
      rows.rows,
    )
    const read = (actor: string, id: string) =>
      withActor(pool, actor, 'read', (c) => readMissionContext(c, id, { actorId: actor, channel: 'voice' }))
    assert.equal((await read(admin, implicit.projectId))?.notePolicy.capture, 'automatic')
    assert.equal((await read(member, implicit.projectId))?.notePolicy.consent, 'unset')
    assert.equal((await read(member, implicit.projectId))?.capabilities.recordNote.available, false)
    assert.equal((await read(member, optedOut.projectId))?.notePolicy.capture, 'off')
    assert.equal((await read(member, optedOut.projectId))?.notePolicy.consent, 'declined')
    assert.equal((await owner.query('SELECT count(*) AS n FROM sophia.mission_entries')).rows[0].n, '0')
    assert.equal((await owner.query('SELECT count(*) AS n FROM sophia.mission_note_policies')).rows[0].n, '1')
  } finally {
    await pool.end()
    await owner.end()
    await db.drop()
    await rm(dir, { recursive: true })
  }
})
