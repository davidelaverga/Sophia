import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTestDatabase } from '@sophia/test-support'
import { withActor, readRunnerResult } from '@sophia/persistence'
import {
  admitResultOperation,
  resultWorld,
  withResultResources,
  requestResult,
  RESULT_TEXT,
  pause,
} from '../../../packages/persistence/src/runner-results.db.test.ts'
import { RunnerResultsController } from './runner-results.ts'

test('real controller through scoped proxy -> fake host -> SQL staged answer -> atomic Source and redaction', async () =>
  withResultResources(async (resources) => {
    const db = await createTestDatabase()
    resources.add(() => db.drop())
    const w = await resultWorld(db)
    resources.add(() => w.close())
    const lines: string[] = []
    const controller = new RunnerResultsController(w.worker, { enabled: true, log: (line) => lines.push(line) })
    resources.add(() => controller.stop())
    const op = await admitResultOperation(w)
    await requestResult(w, op)
    controller.pass()
    let resultId: string | null = null
    for (let n = 0; n < 200 && !resultId; n += 1) {
      await w.agent.serveOnce()
      await pause(10)
      const rows = await w.owner.query<{ result_id: string | null }>(
        'SELECT result_id FROM sophia.owner_runner_collections WHERE operation_id=$1',
        [op.operationId],
      )
      resultId = rows.rows[0]?.result_id ?? null
      controller.pass()
    }
    assert.ok(resultId)
    const read = await withActor(w.api, w.who, 'read', (c) => readRunnerResult(c, w.projectId, resultId))
    assert.equal(read.text, RESULT_TEXT)
    assert.equal(read.result.acceptedRunId, op.runId)
    assert.equal(lines.length, 0)
    const raw = await w.owner.query(
      "SELECT answer FROM sophia.owner_host_exchanges WHERE operation_id=$1 AND kind='collect'",
      [op.operationId],
    )
    assert.equal(raw.rows[0]?.answer, null)
  }))

test('OFF controller does not claim a pending request or make a collection transport call', async () =>
  withResultResources(async (resources) => {
    const db = await createTestDatabase()
    resources.add(() => db.drop())
    const w = await resultWorld(db)
    resources.add(() => w.close())
    const controller = new RunnerResultsController(w.worker, { enabled: false })
    resources.add(() => controller.stop())
    const op = await admitResultOperation(w)
    await requestResult(w, op)
    const calls = w.t3.calls.length
    controller.pass()
    await pause(30)
    await controller.stop()
    assert.equal(w.t3.calls.length, calls)
    const rows = await w.owner.query<{ state: string; claimed: boolean; reserved_pages: number }>(
      'SELECT state,claimed,reserved_pages FROM sophia.owner_runner_collections WHERE operation_id=$1',
      [op.operationId],
    )
    assert.deepEqual(rows.rows[0], { state: 'pending', claimed: false, reserved_pages: 0 })
  }))
