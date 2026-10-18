import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ArtifactVersion, NativeTask } from '@sophia/contracts'
import { goalReports } from './goal-reports.ts'

const task = (id: string, goalId: string, artifactId?: string): NativeTask => ({
  id,
  kind: 'research',
  goalId,
  attemptId: 'a',
  commandId: 'c',
  actorId: 'x',
  state: 'succeeded',
  phase: 'result_ready',
  createdAt: '2026-10-16T10:00:00Z',
  contextSourceId: 's',
  inputSourceIds: [],
  resultSourceId: null,
  reason: null,
  ...(artifactId ? { artifactId } : {}),
})
const version = (artifactId: string, createdAt: string, taskId?: string): ArtifactVersion => ({
  id: `${artifactId}-v`,
  artifactId,
  projectId: 'p',
  parentId: null,
  sourceId: 's',
  sourceHash: 'h',
  state: 'stable',
  previewId: null,
  format: 'markdown',
  exportEditability: 'source_editable',
  title: `Report ${artifactId}`,
  versionNumber: 2,
  createdAt,
  ...(taskId ? { trigger: { kind: 'research' as const, taskId } } : {}),
})

test('a goal’s reports: by the artifact its task made, and by the task a version names', () => {
  const work = [task('t1', 'g1', 'r1'), task('t2', 'g1'), task('t3', 'g2', 'r3')]
  const artifacts = [
    version('r1', '2026-10-15T10:00:00Z'),
    version('r2', '2026-10-16T10:00:00Z', 't2'),
    version('r3', '2026-10-16T11:00:00Z', 't3'),
  ]
  assert.deepEqual(
    goalReports('g1', work, artifacts).map((r) => r.artifactId),
    ['r2', 'r1'],
  )
  assert.deepEqual(
    goalReports('g2', work, artifacts).map((r) => r.artifactId),
    ['r3'],
  )
  assert.deepEqual(goalReports('g3', work, artifacts), [])
})

test('one entry per report, though its task made it and its version names the task too', () => {
  const work = [task('t1', 'g1', 'r1')]
  assert.equal(goalReports('g1', work, [version('r1', '2026-10-16T10:00:00Z', 't1')]).length, 1)
})
