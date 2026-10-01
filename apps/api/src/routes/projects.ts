import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { ProjectCreate, ProjectSummary } from '@sophia/contracts'
import { createProject, listProjects, withActor, type ProjectListing } from '@sophia/persistence'
import { roomParticipants, type LiveKitConfig } from '../livekit.ts'
import { idempotencyHeader } from './schemas.ts'

/** How long the Work list waits for the room server before it shows its rooms as unknown (`room: null`). */
export const ROOM_LOOKUP_MS = 2500

type Room = ProjectSummary['room']

/** Who is in a project's room now, by the room server's own list: people by name, and whether Sophia is there. */
async function roomNow(livekit: LiveKitConfig | undefined, roomId: string | null): Promise<Room> {
  if (!livekit || !roomId) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ROOM_LOOKUP_MS)
  })
  const asked = roomParticipants(livekit, roomId)
    .then((people) => ({
      people: people.filter((p) => p.standing !== 'sophia').map((p) => p.name || 'Someone'),
      sophia: people.some((p) => p.standing === 'sophia'),
    }))
    .catch(() => null)
  return Promise.race([asked, late]).finally(() => clearTimeout(timer))
}

const summaryOf = async (p: ProjectListing, livekit: LiveKitConfig | undefined): Promise<ProjectSummary> => {
  const { roomId, ...rest } = p
  return { ...rest, room: await roomNow(livekit, roomId) }
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

  app.get('/api/v1/projects', { schema: { response: { 200: { $ref: 'ProjectList#' } } } }, async (req) => {
    const listed = await withActor(pool, req.actorId, 'read', (c) => listProjects(c))
    return { projects: await Promise.all(listed.map((p) => summaryOf(p, livekit))) }
  })
}
