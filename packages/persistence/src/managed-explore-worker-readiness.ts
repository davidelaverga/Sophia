import type pg from 'pg'
import type { ManagedExploreDispatchScope } from './managed-explore-dispatch.ts'
import type { ServiceControl } from './service-control.ts'
import { withService } from './tx.ts'

type Route = Pick<ManagedExploreDispatchScope, 'routeId' | 'providerOrg' | 'providerProject' | 'credentialGeneration'>

/** Report or retire this send worker's own short-lived readiness. No billing or provider status is inferred. */
export async function recordManagedExploreWorkerReadiness(
  pool: pg.Pool,
  route: Route,
  instanceId: string,
  ready: boolean,
  control?: ServiceControl,
): Promise<void> {
  await withService(
    pool,
    async (client) => {
      await client.query('SELECT sophia.record_managed_explore_worker_readiness($1,$2,$3,$4,$5,$6)', [
        route.routeId,
        route.providerOrg,
        route.providerProject,
        route.credentialGeneration,
        instanceId,
        ready,
      ])
    },
    control,
  )
}
