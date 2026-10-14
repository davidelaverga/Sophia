import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { ProjectCreate, ProjectSummary } from '@sophia/contracts'
import { createProject, listProjects, readPersonalEpoch, withActor, type ProjectListing } from '@sophia/persistence'
import { liveRooms, roomParticipants, type LiveKitConfig } from '../livekit.ts'
import { lookupAll } from '../presence.ts'
import { idempotencyHeader } from './schemas.ts'

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
