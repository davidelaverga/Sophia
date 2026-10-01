// The projects a person belongs to, for their Work side (contract amendment A10, listProjects). Membership decides
// (RLS): a project the caller is not an active member of is not read. Who is in a room right now is not a database
// fact; the API asks the room server for it and adds it (`room`).
import type pg from 'pg'
import type { ProjectRelease, ProjectSummary, RoomSession } from '@sophia/contracts'

export interface ProjectListing extends Omit<ProjectSummary, 'room'> {
  /** The project's LiveKit room, which the API asks who is in. */
  roomId: string | null
}

interface ProjectRow {
  id: string
  title: string
  role: 'admin' | 'editor' | 'viewer'
  members: string
  room_id: string | null
  session_id: string | null
  session_title: string | null
  starts_at: Date | null
  ends_at: Date | null
  time_zone: string | null
}

// The next session is the first that has not ended: one in progress counts.
const PROJECTS = `SELECT p.id, p.title, m.role,
    (SELECT count(*) FROM sophia.project_members pm WHERE pm.project_id = p.id AND pm.active) AS members,
    rs.id AS room_id, s.id AS session_id, s.title AS session_title, s.starts_at, s.ends_at, s.time_zone
  FROM sophia.projects p
  JOIN sophia.project_members m ON m.project_id = p.id AND m.actor_id = sophia.actor_id() AND m.active
  LEFT JOIN sophia.room_state rs ON rs.project_id = p.id
  LEFT JOIN LATERAL (
    SELECT id, title, starts_at, ends_at, time_zone FROM sophia.room_sessions
     WHERE project_id = p.id AND canceled_at IS NULL AND ends_at > now() ORDER BY starts_at LIMIT 1
  ) s ON true
  ORDER BY p.created_at DESC, p.id`

function sessionOf(r: ProjectRow): RoomSession | null {
  if (!r.session_id || !r.session_title || !r.starts_at || !r.ends_at || !r.time_zone) return null
  return {
    id: r.session_id,
    title: r.session_title,
    startsAt: r.starts_at.toISOString(),
    endsAt: r.ends_at.toISOString(),
    timeZone: r.time_zone,
  }
}

/** Notes carried to these projects, each marked `mine` when the caller carried it. */
async function readProjectReleases(c: pg.PoolClient, projectIds: string[]): Promise<Map<string, ProjectRelease[]>> {
  const { rows } = await c.query<{
    id: string
    project_id: string
    body: string
    owner_name: string
    mine: boolean
    created_at: Date
  }>(
    `SELECT id, project_id, body, owner_name, owner_id = sophia.actor_id() AS mine, created_at
       FROM sophia.personal_releases WHERE project_id = ANY($1::uuid[]) ORDER BY created_at, id`,
    [projectIds],
  )
  const byProject = new Map<string, ProjectRelease[]>()
  for (const r of rows) {
    const list = byProject.get(r.project_id) ?? []
    list.push({ id: r.id, text: r.body, ownerName: r.owner_name, mine: r.mine, createdAt: r.created_at.toISOString() })
    byProject.set(r.project_id, list)
  }
  return byProject
}

/** The caller's projects, newest first. Call inside withActor(..., "read"). */
export async function listProjects(c: pg.PoolClient): Promise<ProjectListing[]> {
  const { rows } = await c.query<ProjectRow>(PROJECTS)
  const releases = await readProjectReleases(
    c,
    rows.map((r) => r.id),
  )
  return rows.map((r) => ({
    projectId: r.id,
    title: r.title,
    role: r.role,
    members: Number(r.members),
    roomId: r.room_id,
    nextSession: sessionOf(r),
    releases: releases.get(r.id) ?? [],
  }))
}
