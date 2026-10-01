import type pg from 'pg'
import type { ArtifactRendition, ArtifactVersion, Goal, Resource, Snapshot } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { readLobby, readUpcomingSessions } from './access.ts'
import { safeInt } from './bigint.ts'
import { readSophia } from './exchange.ts'
import { readDiscussion, readNativeTasks } from './native-tasks.ts'
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
  /** A registered dsh runtime's bridge readiness (0012); null for any other resource. */
  ready_state: 'ready' | 'not_ready' | null
  ready_at: Date | null
  /** Its last hello, ready report or command poll. */
  seen_at: Date | null
  /** Ready on its current lease and seen within 90 s: what dispatch requires (0012 runtime_unavailable). */
  available: boolean | null
  running: boolean
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
  const discussion = await readDiscussion(c, projectId)
  const work = await readNativeTasks(c, projectId)
  const artifacts = await readArtifacts(c, projectId)
  const sophia = await readSophia(c, room.id)
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
    artifacts,
    sharedFocus: sharedFocusOf(room),
    room: {
      id: room.id,
      revision: safeInt(room.revision, 'room.revision'),
      inputActorId: room.input_actor_id,
      mode: room.mode,
      sophia,
    },
    lobby,
    sessions,
    discussion,
    work,
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

/**
 * External resources (S1-09) have no live observation yet, so they report unknown. A dsh runtime reports what
 * its bridge last said (0012): online only while its ready report stands and it was seen within 90 s (the rule
 * dispatch uses), running while one of its bindings runs. A ready bridge that stopped being seen, or one that
 * said not_ready, is offline; a bridge that never said ready is unknown.
 */
function runtimeStates(r: ResourceRow): Pick<Resource, 'hostState' | 'nativeState' | 'observedAt'> {
  const seen = r.seen_at ?? r.ready_at
  const observedAt = seen ? seen.toISOString() : null
  if (r.ready_state === 'ready' && r.available) {
    return { hostState: 'online', nativeState: r.running ? 'running' : 'idle', observedAt }
  }
  const offline = r.ready_state === 'ready' || (r.ready_state === 'not_ready' && r.ready_at !== null)
  return { hostState: offline ? 'offline' : 'unknown', nativeState: 'unknown', observedAt }
}

async function readResources(c: pg.PoolClient, projectId: string): Promise<Resource[]> {
  const { rows } = await c.query<ResourceRow>(
    `SELECT r.id, r.owner_id, r.label, r.harness, r.state, r.allowed_operations, rs.ready_state, rs.ready_at,
            rs.seen_at, rs.available,
            EXISTS (SELECT 1 FROM sophia.execution_bindings b WHERE b.project_id = r.project_id AND b.resource_id = r.id
                      AND b.state IN ('launching', 'running')) AS running
       FROM sophia.executor_resources r
       LEFT JOIN sophia.runtime_status($1) rs ON rs.resource_id = r.id
      WHERE r.project_id = $1 ORDER BY r.label, r.id`,
    [projectId],
  )
  return rows.map((r) => ({
    id: r.id,
    projectId,
    ownerId: r.owner_id,
    label: r.label,
    harness: r.harness,
    ...runtimeStates(r),
    model: null,
    effort: null,
    authorityState: r.state,
    capabilities: r.allowed_operations,
  }))
}

/** Projections that later goals implement: refuse rather than return a false empty list. */
async function refuseUnprojectedRecords(c: pg.PoolClient, projectId: string): Promise<void> {
  const { rows } = await c.query<{ human_actions: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM sophia.human_actions WHERE project_id = $1) AS human_actions`,
    [projectId],
  )
  if (rows[0]?.human_actions) {
    throw new DomainError('projection_unavailable', 'HumanAction projection arrives with S1-09')
  }
}

interface ArtifactRow {
  id: string
  artifact_id: string
  parent_id: string | null
  source_id: string
  source_hash: string
  state: ArtifactVersion['state']
  format: ArtifactVersion['format']
  title: string
  version_number: number | null
  created_at: Date
  preview_id: string | null
}

interface RenditionRow {
  artifact_version_id: string
  format: ArtifactRendition['format']
  source_id: string
  sha256: string
  byte_length: string
  mime: string
  page_count: number | null
}

/** At most this many artifacts in a snapshot, the most recently published; Knowledge lists them all. */
const SNAPSHOT_ARTIFACTS = 100

/** Formats whose authored source is what a member edits; the others are kept as delivered. */
const editability = (format: ArtifactVersion['format']): ArtifactVersion['exportEditability'] =>
  format === 'pdf' || format === 'pptx' ? 'original_only' : 'source_editable'

/**
 * Each artifact's current version (the stable one) with its renditions, oldest first (0022). A version that is not
 * stable yet is not shown: publication moves it to stable in the same transaction that makes it visible.
 */
async function readArtifacts(c: pg.PoolClient, projectId: string): Promise<ArtifactVersion[]> {
  const { rows } = await c.query<ArtifactRow>(
    `SELECT * FROM (
       SELECT v.id, v.artifact_id, v.parent_id, v.source_id, v.source_hash, v.state, a.format, a.title, v.version_number,
              v.created_at,
              (SELECT p.id FROM sophia.previews p WHERE p.project_id = v.project_id AND p.artifact_version_id = v.id
                  AND p.state = 'ready' ORDER BY p.id LIMIT 1) AS preview_id
         FROM sophia.artifacts a
         JOIN sophia.artifact_versions v ON v.project_id = a.project_id AND v.id = a.stable_version_id
        WHERE a.project_id = $1
        ORDER BY v.created_at DESC, v.id DESC LIMIT ${SNAPSHOT_ARTIFACTS}) latest
      ORDER BY created_at, id`,
    [projectId],
  )
  if (rows.length === 0) return []
  const renditions = await readRenditions(
    c,
    projectId,
    rows.map((r) => r.id),
  )
  return rows.map((r) => {
    const own = renditions.get(r.id) ?? []
    return {
      id: r.id,
      artifactId: r.artifact_id,
      projectId,
      parentId: r.parent_id,
      sourceId: r.source_id,
      sourceHash: r.source_hash,
      state: r.state,
      previewId: r.preview_id,
      format: r.format,
      exportEditability: editability(r.format),
      title: r.title,
      ...(r.version_number === null ? {} : { versionNumber: r.version_number }),
      createdAt: r.created_at.toISOString(),
      ...(own.length === 0 ? {} : { renditions: own }),
    }
  })
}

async function readRenditions(
  c: pg.PoolClient,
  projectId: string,
  versionIds: string[],
): Promise<Map<string, ArtifactRendition[]>> {
  const { rows } = await c.query<RenditionRow>(
    `SELECT r.artifact_version_id, r.format, s.id AS source_id, s.sha256, s.byte_length, s.mime, r.page_count
       FROM sophia.artifact_renditions r
       JOIN sophia.source_objects s ON s.project_id = r.project_id AND s.id = r.source_id
      WHERE r.project_id = $1 AND r.artifact_version_id = ANY($2::uuid[])
      ORDER BY r.artifact_version_id, r.format`,
    [projectId, versionIds],
  )
  const byVersion = new Map<string, ArtifactRendition[]>()
  for (const r of rows) {
    const list = byVersion.get(r.artifact_version_id) ?? []
    list.push({
      format: r.format,
      sourceId: r.source_id,
      sha256: r.sha256,
      byteLength: Number(r.byte_length),
      mime: r.mime,
      pageCount: r.page_count,
    })
    byVersion.set(r.artifact_version_id, list)
  }
  return byVersion
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
