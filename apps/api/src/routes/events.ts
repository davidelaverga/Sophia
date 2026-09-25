import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { CURSOR_PATTERN } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { readEventFrames, withActor } from '@sophia/persistence'
import type { ProjectEventHub } from '../event-hub.ts'
import { ProjectEventStream } from '../event-stream.ts'
import { projectParams } from './schemas.ts'

interface EventRouteDeps {
  pool: pg.Pool
  hub: ProjectEventHub
  heartbeatMs: number
}

/**
 * followProjectEvents — authorized replay from `after`, then live tail. Membership is rechecked on
 * every read; revocation ends the stream. Not an Omnigent stream.
 */
export function eventRoutes(app: FastifyInstance, { pool, hub, heartbeatMs }: EventRouteDeps): void {
  app.get<{ Params: { projectId: string }; Querystring: { after: string } }>(
    '/api/v1/projects/:projectId/events',
    {
      schema: {
        params: projectParams,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { after: { type: 'string', pattern: CURSOR_PATTERN.source } },
          required: ['after'],
        },
      },
    },
    async (req, reply) => {
      const { projectId } = req.params
      const read = (after: bigint) => withActor(pool, req.actorId, 'read', (c) => readEventFrames(c, projectId, after))

      // Watch for the client leaving from the start: it may go while the first read is in flight.
      // An object, not a `let`: the flag flips inside the listener, which control-flow narrowing ignores.
      const client: { gone: boolean; stream?: ProjectEventStream } = { gone: false }
      reply.raw.on('close', () => {
        client.gone = true
        client.stream?.close()
      })

      // Authorize before switching to a stream so a denial is an ordinary JSON 403.
      const first = await read(BigInt(req.query.after))
      if (!first.visible) throw new DomainError('forbidden', 'Not permitted')

      // Hooks (CORS) set their headers on the reply; the hijacked stream writes them itself.
      const headers = Object.fromEntries(Object.entries(reply.getHeaders()).filter(([, v]) => v !== undefined))
      reply.hijack()
      if (client.gone || reply.raw.destroyed) return
      client.stream = new ProjectEventStream({
        res: reply.raw,
        projectId,
        read,
        first,
        hub,
        heartbeatMs,
        log: req.log,
        headers,
      })
    },
  )
}
