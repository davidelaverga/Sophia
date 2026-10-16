// What needs the calling person (A15, docs/plans/needs-served.md, #365 section 2): GET /api/v1/me/needs and
// POST /api/v1/me/needs/{id}/seen. Owner-only: the actor is the token's subject, and a guest without an account is
// refused before the route (app.ts GUEST_ROUTES). A need leaves where it lives; only a reply has a seen mark.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { markMentionSeen, markReplySeen, readNeeds, withActor } from '@sophia/persistence'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const KINDS = new Set(['decision', 'permission', 'guest', 'reply', 'mention'])
/** A mention's `within` (A37): `<revision>.<occurrence>`, each a positive integer. */
const OCCURRENCE = /^([1-9][0-9]{0,18})\.([1-9][0-9]{0,18})$/
/** The largest number a bigint holds: past it, the need names nothing (404), never a database failure. */
const MOST_REVISION = 9223372036854775807n

/** A need's id, read back (`<kind>:<projectId, or personal>:<within, or ->:<ref id>`, each part escaped); null if not one. */
export function parseNeedId(id: string): { kind: string; project: string; within: string | null; ref: string } | null {
  const parts = id.split(':')
  if (parts.length !== 4) return null
  const [kind, project, within, ref] = parts.map((p) => {
    try {
      return decodeURIComponent(p)
    } catch {
      return null
    }
  })
  if (!kind || !project || !within || !ref || !KINDS.has(kind)) return null
  if (project !== 'personal' && !UUID.test(project)) return null
  if ((kind === 'reply') !== (project === 'personal')) return null
  return { kind, project, within: within === '-' ? null : within, ref }
}

const notFound = (requestId: string) => ({
  code: 'not_found',
  message: 'No such need for this person',
  retry: 'never',
  requestId,
})

/**
 * markNeedSeen for a mention (A37): that occurrence's attention on that revision is seen; an older one's seen changes
 * nothing (204). False (404) for a `within` that is not `<revision>.<occurrence>`, or a need that is not the person's.
 */
async function mentionSeen(
  pool: pg.Pool,
  actorId: string,
  need: { project: string; within: string | null; ref: string },
) {
  const at = OCCURRENCE.exec(need.within ?? '')
  const [revision, occurrence] = [at?.[1], at?.[2]]
  if (!revision || !occurrence || !UUID.test(need.ref)) return false
  if (BigInt(revision) > MOST_REVISION || BigInt(occurrence) > MOST_REVISION) return false
  return withActor(pool, actorId, 'write', (c) => markMentionSeen(c, need.project, need.ref, { revision, occurrence }))
}

export function needsRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  // mentions=1 (A37): the person's pending mentions too. Without it, exactly A15's kinds, for a reader that knows no other.
  app.get<{ Querystring: { mentions?: '1' } }>(
    '/api/v1/me/needs',
    {
      schema: {
        querystring: { type: 'object', properties: { mentions: { type: 'string', enum: ['1'] } } },
        response: { 200: { $ref: 'NeedList#' } },
      },
    },
    async (req) => withActor(pool, req.actorId, 'read', (c) => readNeeds(c, { mentions: req.query.mentions === '1' })),
  )

  // A reply's seen mark moves forward to it; any other kind leaves where it lives, so its seen changes nothing (204).
  // An id that names no need of this person is 404, as A15 declares.
  app.post<{ Params: { id: string } }>(
    '/api/v1/me/needs/:id/seen',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          properties: { id: { type: 'string', minLength: 1, maxLength: 600 } },
          required: ['id'],
        },
      },
    },
    async (req, reply) => {
      const need = parseNeedId(req.params.id)
      if (!need) return reply.status(404).send(notFound(req.id))
      if (need.kind === 'mention') {
        const marked = await mentionSeen(pool, req.actorId, need)
        return marked ? reply.status(204).send() : reply.status(404).send(notFound(req.id))
      }
      if (need.kind !== 'reply') return reply.status(204).send()
      if (need.within !== null || !UUID.test(need.ref)) return reply.status(404).send(notFound(req.id))
      const marked = await withActor(pool, req.actorId, 'write', (c) => markReplySeen(c, need.ref))
      return marked ? reply.status(204).send() : reply.status(404).send(notFound(req.id))
    },
  )
}
