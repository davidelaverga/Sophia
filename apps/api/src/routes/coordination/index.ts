// WBC-02's routes: the work board for members, the source reviewer's runtime operations and the Paperclip adapter's
// effect permits. app.ts wires them and their capabilities.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { integrationRoutes } from './integration.ts'
import { memberRoutes } from './members.ts'
import { reviewRuntimeRoutes } from './runtime.ts'

export { COORDINATION_ROUTES } from './integration.ts'
export { REVIEW_RUNTIME_ROUTES } from './runtime.ts'

export function coordinationRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  memberRoutes(app, { pool })
  reviewRuntimeRoutes(app, pool)
  integrationRoutes(app, pool)
}
