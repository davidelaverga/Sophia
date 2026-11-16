import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import type pg from 'pg'
import { readDesignProgress } from './design-progress.ts'

// A42's read offers a failed design's retry only where 0081's retry_failed_design could admit it: each refusal 0081
// decides from the records alone is in the read's gate, written as 0081 writes it (its failed task `f` read as the
// task `t`, `p_project` as `t.project_id`), so a change to either side shows here. Whitespace is ignored.
const MIGRATIONS = new URL('../../../db/migrations/', import.meta.url)
const RETRY = readFileSync(new URL('0081_retry_failed_design.sql', MIGRATIONS), 'utf8')
const squeeze = (sql: string) => sql.replace(/\s+/g, '')

/** The condition of the IF that raises `message` in 0081, as the read writes it. */
function refusal(message: string): string {
  const at = RETRY.indexOf(`RAISE EXCEPTION '${message}`)
  assert.notEqual(at, -1, `0081 refuses: ${message}`)
  const condition = RETRY.slice(RETRY.lastIndexOf(' IF ', at) + ' IF '.length, RETRY.lastIndexOf(' THEN', at))
  return squeeze(condition.replace(/\bp_project\b/g, 't.project_id').replace(/\bf\./g, 't.'))
}

/** The read's gate: what it checks before it says under which approval a retry is offered. */
async function gate(): Promise<string> {
  let sql = ''
  const client = {
    query: (text: string) => {
      sql = text
      return Promise.resolve({ rows: [] })
    },
  }
  await readDesignProgress(client as unknown as pg.PoolClient, 'project', 'task')
  const read = squeeze(sql)
  const start = read.indexOf("CASEWHENt.mode='create'ANDt.state='failed'")
  assert.notEqual(start, -1, 'the read has its retry gate')
  return read.slice(start, read.indexOf('THEN(SELECTjsonb_strip_nulls', start))
}

describe('a failed design is offered a retry only where 0081 could admit it (A42, P3s on #480)', () => {
  for (const message of [
    'Stale report version: a newer version of this report exists',
    'This version already has a designed page',
    'A design of this page is already under way',
    'A later design of this version exists',
    'Design edit limit reached',
  ])
    it(`holds 0081's refusal «${message}»`, async () => {
      assert.ok((await gate()).includes(refusal(message)), `the read's gate lacks ${refusal(message)}`)
    })

  it('leaves out the withdrawn source while the API may not ask: no migration grants source_withdrawn', () => {
    // 0033 revokes it from PUBLIC and the read runs as sophia_api; the day a grant lands, 0081's refusal
    // «Source not released and eligible for project work» belongs in the gate too.
    const granted = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .filter((f) =>
        /GRANT EXECUTE ON FUNCTION[^;]*sophia\.source_withdrawn\(/.test(readFileSync(new URL(f, MIGRATIONS), 'utf8')),
      )
    assert.deepEqual(granted, [], 'source_withdrawn is granted now: add the withdrawn-source refusal to the read')
  })
})
