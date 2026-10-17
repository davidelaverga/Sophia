import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type {
  ProjectArchiveRequest,
  ProjectCreate,
  ProjectLeaveRequest,
  ProjectRenameRequest,
  ProjectSummary,
} from '@sophia/contracts'
import {
  createProject,
  leaveProject,
  pendingDeparture,
  listProjects,
  PROJECT_LIST_BOUNDS,
  readPersonalEpoch,
  renameProject,
  setProjectArchived,
  settleRoomRemoval,
  withActor,
  withService,
  type ProjectListing,
} from '@sophia/persistence'
import { liveRooms, removeParticipant, roomParticipants, type LiveKitConfig } from '../livekit.ts'
import { lookupAll } from '../presence.ts'
import { idempotencyHeader, projectParams } from './schemas.ts'

/** How many people a room lists (A10's maxItems). */
const ROOM_PEOPLE = 100

/** How long the Work list waits for the room server before it shows its rooms as unknown (`room: null`). */
export const ROOM_LOOKUP_MS = 2500

/** At most this many questions to the room server at once, for one read of the Work list. */
const LOOKUPS_AT_ONCE = 8

type Room = ProjectSummary['room']

/** The work, or null once `ms` passed or if it fails: a room that can't be asked is unknown. */
function orNull<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  return Promise.race([work.catch(() => null), late]).finally(() => clearTimeout(timer))
}

/** Who is in a project's room now, by the room server's own list: people by name, and whether Sophia is there. */
const roomNow = (livekit: LiveKitConfig, roomId: string, ms: number): Promise<Room> =>
  orNull(
    roomParticipants(livekit, roomId).then((people) => ({
      people: people
        .filter((p) => p.standing !== 'sophia')
        .slice(0, ROOM_PEOPLE)
        .map((p) => p.name || 'Someone'),
      sophia: people.some((p) => p.standing === 'sophia'),
    })),
    ms,
  )

/**
 * Every listed project's room, within ROOM_LOOKUP_MS in all: one question finds the rooms that exist (the rest are
 * empty), and only those are asked who is in them, a few at a time (lookupAll). Unknown (null) when the room server
 * can't be asked in time.
 */
async function roomsNow(livekit: LiveKitConfig | undefined, listed: readonly ProjectListing[]): Promise<Room[]> {
  if (!livekit) return listed.map(() => null)
  const began = Date.now()
  const ids = listed.flatMap((p) => (p.roomId ? [p.roomId] : []))
  const live = await orNull(liveRooms(livekit, ids), ROOM_LOOKUP_MS)
  if (!live) return listed.map(() => null)
  const asked = [...live]
  const found = await lookupAll(asked, LOOKUPS_AT_ONCE, ROOM_LOOKUP_MS - (Date.now() - began), (id, left) =>
    roomNow(livekit, id, left),
  )
  const byRoom = new Map(asked.map((id, i) => [id, found[i] ?? null]))
  return listed.map((p) => {
    if (!p.roomId) return null
    return live.has(p.roomId) ? (byRoom.get(p.roomId) ?? null) : { people: [], sophia: false }
  })
}

/**
 * createProject — project + creator membership atomically, idempotent per actor and key.
 * A retry with the same key returns the same project (201 again), never a second project.
 * listProjects (A10) — the caller's projects for their Work side; rooms are asked in parallel and never block it.
 */
export function projectRoutes(
  app: FastifyInstance,
  { pool, livekit }: { pool: pg.Pool; livekit: LiveKitConfig | undefined },
): void {
  app.post<{ Headers: { 'idempotency-key': string }; Body: ProjectCreate }>(
    '/api/v1/projects',
    {
      schema: {
        headers: idempotencyHeader,
        body: { $ref: 'ProjectCreate#' },
        response: { 201: { $ref: 'ProjectCreated#' } },
      },
    },
    async (req, reply) => {
      const created = await withActor(pool, req.actorId, 'write', (c) =>
        createProject(c, req.headers['idempotency-key'], req.body),
      )
      return reply.status(201).send(created)
    },
  )

  // renameProject (A21): an admin only, idempotent per actor and key; the rename's event reaches every member's feed.
  app.post<{ Params: { projectId: string }; Headers: { 'idempotency-key': string }; Body: ProjectRenameRequest }>(
    '/api/v1/projects/:projectId/title',
    {
      schema: {
        params: projectParams,
        headers: idempotencyHeader,
        body: { $ref: 'ProjectRenameRequest#' },
        response: { 200: { $ref: 'ProjectRenamed#' } },
      },
    },
    async (req) =>
      withActor(pool, req.actorId, 'write', (c) =>
        renameProject(c, req.params.projectId, req.headers['idempotency-key'], req.body),
      ),
  )

  leaveRoute(app, { pool, livekit })
  archiveRoutes(app, { pool, livekit })

  app.get('/api/v1/projects', { schema: { response: { 200: { $ref: 'ProjectList#' } } } }, async (req) => {
    // With the reader's personal epoch: Work's writes to their notes (taking one back) are fenced to it too.
    const { listed, personalEpoch } = await withActor(pool, req.actorId, 'read', async (c) => ({
      listed: await listProjects(c),
      personalEpoch: await readPersonalEpoch(c),
    }))
    const rooms = await roomsNow(livekit, listed)
    const projects = listed.map(({ roomId: _room, ...rest }, i) => ({ ...rest, room: rooms[i] ?? null }))
    return { projects, personalEpoch }
  })
}

/**
 * One attempt to take a member who left out of the call, right after (Codex P1 on #349). Leaving recorded the removal
 * (0052); this settles it only on the room server's evidence. A failure, or no LiveKit here, leaves it pending for the
 * worker, which also keeps watch while a token issued before could bring them back.
 */
async function leavesTheCall(
  deps: { pool: pg.Pool; livekit: LiveKitConfig | undefined },
  projectId: string,
  actorId: string,
): Promise<void> {
  const { livekit } = deps
  if (!livekit) return
  const open = await withActor(deps.pool, actorId, 'read', (c) => pendingDeparture(c, projectId))
  if (!open) return
  const result = await removeParticipant(livekit, open.roomId, open.identity)
  await withService(deps.pool, (c) => settleRoomRemoval(c, open.id, `api:${randomUUID()}`, result))
}

/**
 * archiveProject and listArchivedProjects (A30): an admin archives a project or brings it back, idempotent per actor
 * and key; the default list leaves archived projects out, and this one lists them, rooms asked as for the other.
 */
function archiveRoutes(app: FastifyInstance, { pool, livekit }: { pool: pg.Pool; livekit: LiveKitConfig | undefined }) {
  app.post<{ Params: { projectId: string }; Headers: { 'idempotency-key': string }; Body: ProjectArchiveRequest }>(
    '/api/v1/projects/:projectId/archive',
    {
      schema: {
        params: projectParams,
        headers: idempotencyHeader,
        body: { $ref: 'ProjectArchiveRequest#' },
        response: { 200: { $ref: 'ProjectArchived#' } },
      },
    },
    async (req) =>
      withActor(pool, req.actorId, 'write', (c) =>
        setProjectArchived(c, req.params.projectId, req.headers['idempotency-key'], req.body.archived),
      ),
  )
  app.get('/api/v1/projects/archived', { schema: { response: { 200: { $ref: 'ProjectList#' } } } }, async (req) => {
    const { listed, personalEpoch } = await withActor(pool, req.actorId, 'read', async (c) => ({
      listed: await listProjects(c, PROJECT_LIST_BOUNDS, true),
      personalEpoch: await readPersonalEpoch(c),
    }))
    const rooms = await roomsNow(livekit, listed)
    const projects = listed.map(({ roomId: _room, ...rest }, i) => ({ ...rest, room: rooms[i] ?? null }))
    return { projects, personalEpoch }
  })
}

/** leaveProject (A22): any member but the project's only admin, idempotent per actor and key; out of the call too. */
function leaveRoute(app: FastifyInstance, deps: { pool: pg.Pool; livekit: LiveKitConfig | undefined }): void {
  const { pool, livekit } = deps
  app.post<{ Params: { projectId: string }; Headers: { 'idempotency-key': string }; Body: ProjectLeaveRequest }>(
    '/api/v1/projects/:projectId/leave',
    {
      schema: {
        params: projectParams,
        headers: idempotencyHeader,
        body: { $ref: 'ProjectLeaveRequest#' },
        response: { 200: { $ref: 'ProjectLeft#' } },
      },
    },
    async (req) => {
      const left = await withActor(pool, req.actorId, 'write', (c) =>
        leaveProject(c, req.params.projectId, req.headers['idempotency-key']),
      )
      await leavesTheCall({ pool, livekit }, req.params.projectId, req.actorId)
      return left
    },
  )
}
