// A person's own display name (A32, 0062, docs/plans/actor-profiles.md): GET and PUT /api/v1/me/profile. The actor is
// the verified token's subject; nothing in a request says whose profile it is, so no one can change another's.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type pg from 'pg'
import type { ProfileUpdate } from '@sophia/contracts'
import { nameActor, readMyProfile, setMyProfile, withActor, type ActorNames } from '@sophia/persistence'
import { idempotencyHeader } from './schemas.ts'

/** What the verified token says about the caller, for nameActor: the provider's name and the verified email. */
export const namesOf = (req: FastifyRequest): ActorNames => ({ seed: req.actorName, contact: req.actorContact })

export function profileRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  // getMyProfile: named first, so a provider's name seeds a profile its person hasn't chosen (never one they chose).
  app.get('/api/v1/me/profile', { schema: { response: { 200: { $ref: 'Profile#' } } } }, async (req) =>
    withActor(pool, req.actorId, 'write', async (c) => {
      await nameActor(c, namesOf(req))
      return readMyProfile(c)
    }),
  )

  // updateMyProfile: compare-and-set on the profile's revision, idempotent per actor and key (0062's set_my_profile).
  app.put<{ Headers: { 'idempotency-key': string }; Body: ProfileUpdate }>(
    '/api/v1/me/profile',
    {
      schema: {
        headers: idempotencyHeader,
        body: { $ref: 'ProfileUpdate#' },
        response: { 200: { $ref: 'Profile#' } },
      },
    },
    async (req) =>
      withActor(pool, req.actorId, 'write', (c) => setMyProfile(c, req.headers['idempotency-key'], req.body)),
  )
}
