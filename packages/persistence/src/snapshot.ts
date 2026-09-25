import type pg from 'pg'
import type { Goal, Resource, Snapshot } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { readLobby, readUpcomingSessions } from './access.ts'
import { safeInt } from './bigint.ts'
import { onlyRow } from './rows.ts'

interface ProjectRow {
  id: string
  title: string
  event_sequence: string
  mission_revision: string
  audience_revision: string
  eligibility_revision: string
}

interface GoalRow {
  id: string
  title: string
  revision: string
  authority_epoch: string
  status: Goal['status']
  outcome: string
  criteria: Goal['criteria']
  state_revision: string
}

interface ResourceRow {
  id: string
  owner_id: string
  label: string
  harness: Resource['harness']
  state: Resource['authorityState']
  allowed_operations: string[]
}

interface RoomRow {
  id: string
  revision: string
  input_actor_id: string | null
  guide_actor_id: string | null
  shared_focus_version_id: string | null
  mode: Snapshot['room']['mode']
}

/**
 * Consistent snapshot + cursor. Call inside withActor(..., "read"): RLS limits every table
 * to the actor's projects, so a non-member gets `null` (the API answers 403).
 */
export async function readSnapshot(c: pg.PoolClient, projectId: string): Promise<Snapshot | null> {
  const project = await readProject(c, projectId)
  if (!project) return null
  await refuseUnprojectedRecords(c, projectId)
  // Sequential on purpose: one connection, one REPEATABLE READ snapshot.
  const goals = await readGoals(c, projectId)
  const resources = await readResources(c, projectId)
  const room = await readRoom(c, projectId)
  const lobby = await readLobby(c, projectId)
  const sessions = await readUpcomingSessions(c, projectId)
  return {
    projectId: project.id,
    title: project.title,
    cursor: project.event_sequence,
    missionRevision: safeInt(project.mission_revision, 'missionRevision'),
    audienceRevision: safeInt(project.audience_revision, 'audienceRevision'),
    eligibilityRevision: safeInt(project.eligibility_revision, 'eligibilityRevision'),
    goals,
    resources,
    humanActions: [],
    artifacts: [],
    sharedFocus: sharedFocusOf(room),
    room: {
      id: room.id,
      revision: safeInt(room.revision, 'room.revision'),
      inputActorId: room.input_actor_id,
      mode: room.mode,
    },
    lobby,
    sessions,
  }
}

async function readProject(c: pg.PoolClient, projectId: string): Promise<ProjectRow | undefined> {
  const { rows } = await c.query<ProjectRow>(
    `SELECT id, title, event_sequence, mission_revision, audience_revision, eligibility_revision
       FROM sophia.projects WHERE id = $1`,
    [projectId],
  )
  return rows[0]
}

async function readGoals(c: pg.PoolClient, projectId: string): Promise<Goal[]> {
  const { rows } = await c.query<GoalRow>(
    `SELECT id, title, revision, authority_epoch, status, outcome, criteria, state_revision
       FROM sophia.goals WHERE project_id = $1 ORDER BY created_at, id`,
    [projectId],
  )
  return rows.map((g) => ({
    id: g.id,
    projectId,
    title: g.title,
    revision: safeInt(g.revision, 'goal.revision'),
    authorityEpoch: safeInt(g.authority_epoch, 'goal.authorityEpoch'),
    status: g.status,
    outcome: g.outcome,
    criteria: g.criteria,
    stateRevision: safeInt(g.state_revision, 'goal.stateRevision'),
  }))
}

/** Registration exists from S1-09; live host/native observation does not yet, so it is reported as unknown. */
async function readResources(c: pg.PoolClient, projectId: string): Promise<Resource[]> {
  const { rows } = await c.query<ResourceRow>(
    `SELECT id, owner_id, label, harness, state, allowed_operations
       FROM sophia.executor_resources WHERE project_id = $1 ORDER BY label, id`,
    [projectId],
  )
  return rows.map((r) => ({
    id: r.id,
    projectId,
    ownerId: r.owner_id,
    label: r.label,
    harness: r.harness,
    hostState: 'unknown',
    nativeState: 'unknown',
    observedAt: null,
    model: null,
    effort: null,
    authorityState: r.state,
    capabilities: r.allowed_operations,
  }))
}

/** Projections that later goals implement: refuse rather than return a false empty list. */
async function refuseUnprojectedRecords(c: pg.PoolClient, projectId: string): Promise<void> {
  const { rows } = await c.query<{ human_actions: boolean; artifacts: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM sophia.human_actions WHERE project_id = $1) AS human_actions,
            EXISTS (SELECT 1 FROM sophia.artifact_versions WHERE project_id = $1) AS artifacts`,
    [projectId],
  )
  if (rows[0]?.human_actions) {
    throw new DomainError('projection_unavailable', 'HumanAction projection arrives with S1-09')
  }
  if (rows[0]?.artifacts) {
    throw new DomainError('projection_unavailable', 'Artifact projection arrives with S1-07/S1-13')
  }
}

/** Every project has one room (migration 0009); a missing row is a broken invariant, not an empty room. */
async function readRoom(c: pg.PoolClient, projectId: string): Promise<RoomRow> {
  const { rows } = await c.query<RoomRow>(
    `SELECT id, revision, input_actor_id, guide_actor_id, shared_focus_version_id, mode
       FROM sophia.room_state WHERE project_id = $1`,
    [projectId],
  )
  return onlyRow(rows, 'room_state')
}

function sharedFocusOf(room: RoomRow): Snapshot['sharedFocus'] {
  if (!room.shared_focus_version_id || !room.guide_actor_id) return null
  return {
    artifactVersionId: room.shared_focus_version_id,
    revision: safeInt(room.revision, 'room.revision'),
    guideId: room.guide_actor_id,
  }
}
