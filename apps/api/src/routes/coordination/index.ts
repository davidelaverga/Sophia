// WBC-02's routes: the work board for members, the source reviewer's runtime operations and the Paperclip adapter's
// effect permits. app.ts wires them and their capabilities.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { integrationRoutes } from './integration.ts'
import { memberRoutes } from './members.ts'
import { reviewRuntimeRoutes } from './runtime.ts'
import type { BoundOutputOption } from '../design.ts'

export { COORDINATION_ROUTES } from './integration.ts'
export { REVIEW_RUNTIME_ROUTES } from './runtime.ts'

/** `boundOutput` (A59): the server's bound-output option for the source reviewer's runtime routes; false by default. */
export function coordinationRoutes(
  app: FastifyInstance,
  { pool, boundOutput = false }: { pool: pg.Pool; boundOutput?: BoundOutputOption },
): void {
  memberRoutes(app, { pool })
  reviewRuntimeRoutes(app, pool, { boundOutput })
  integrationRoutes(app, pool)
}
