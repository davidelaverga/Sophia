import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/client.ts'
import { fenced, reportFenceKey, reportRead, type ReportFence } from './report-read.ts'
import { ownedTaskRead, taskFenced, taskFenceKey, type TaskFence } from './task-detail-read.ts'

// R-native-task-own-absence: a task GET refused to this person fences that task in that account's cache only; an
// older answer after it never lifts it, a later 503 keeps it, a task GET since lifts it; reports stay apart.
const P = 'p1'
const T = 't1'
const taskOf = (c: QueryClient, p = P, t = T) =>
  taskFenced(c.getQueryData<TaskFence>(taskFenceKey(p, t)) ?? { refusedAt: 0, allowedFrom: 0 })
const reportOf = (c: QueryClient, a: string) =>
  fenced(c.getQueryData<ReportFence>(reportFenceKey(a)) ?? { refusedAt: 0, allowedFrom: 0 })
const refuse = (status: number, code: string) => () => Promise.reject(new ApiError(status, code, 'No', 'never'))

describe('a native task’s own refusal', () => {
  it('fences that task in its own cache, project and task only', async () => {
    const client = new QueryClient()
    const other = new QueryClient()
    await assert.rejects(ownedTaskRead({ client, projectId: P, taskId: T }, refuse(422, 'not_found')))
    assert.equal(taskOf(client), true)
    assert.equal(taskOf(client, P, 't2'), false, 'another task')
    assert.equal(taskOf(client, 'p2', T), false, 'another project')
    assert.equal(taskOf(other), false, 'another account’s cache')
  })

  it('a held older 200 never lifts it, a later 503 keeps it, a task GET since lifts it', async () => {
    const client = new QueryClient()
    const owner = { client, projectId: P, taskId: T }
    let answer!: (v: string) => void
    const older = ownedTaskRead(owner, () => new Promise<string>((r) => (answer = r)))
    await assert.rejects(ownedTaskRead(owner, refuse(403, 'forbidden')))
    answer('old')
    await older
    assert.equal(taskOf(client), true, 'late older answer')
    await assert.rejects(ownedTaskRead(owner, refuse(503, 'unavailable')))
    assert.equal(taskOf(client), true, 'later ordinary failure')
    await ownedTaskRead(owner, () => Promise.resolve('fresh'))
    assert.equal(taskOf(client), false, 'a task GET set out since')
  })

  it('task and report authority stay apart', async () => {
    const client = new QueryClient()
    await assert.rejects(ownedTaskRead({ client, projectId: P, taskId: T }, refuse(422, 'not_found')))
    assert.equal(reportOf(client, 'a1'), false, 'a task refusal marks no report')
    await reportRead('a1', () => Promise.resolve(['v']))({ client })
    assert.equal(taskOf(client), true, 'a report read does not lift the task')
  })
})
