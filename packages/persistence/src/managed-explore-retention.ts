// Commits validated provider output with the lease and exact completed event that authorized it.
import type { ManagedExploreDirection } from '@sophia/contracts'
import type pg from 'pg'
import type { ManagedExploreDispatchIdentity, ManagedExploreDispatchObservation } from './managed-explore-dispatch.ts'
import type { ServiceControl } from './service-control.ts'
import { onlyRow } from './rows.ts'
import { withService } from './tx.ts'

type DirectionCandidate = Omit<ManagedExploreDirection, 'id' | 'revision'>

type RetentionIdentity = Pick<
  Extract<ManagedExploreDispatchObservation, { kind: 'root' }>,
  'providerSessionId' | 'submissionId' | 'payloadSha256' | 'previousRootId' | 'rootId'
> & { environmentId: string }

export type ManagedExploreRetentionOutput = RetentionIdentity &
  (
    | { kind: 'directions'; directions: [DirectionCandidate, DirectionCandidate] }
    | {
        kind: 'prototype'
        artifactId: string
        artifactRequestId?: string
        path: '/workspace/outputs/index.html'
        byteLength: number
        sha256: string
        bytes: Uint8Array
        changeSummary: string
        acceptanceCriteria: string[]
        mockReplacements: string[]
        limitations?: string[]
      }
  )

export type ManagedExploreRetentionResult =
  | { kind: 'completed' }
  | {
      kind: 'denied'
      reason:
        | 'project_unavailable'
        | 'membership_changed'
        | 'source_unavailable'
        | 'direction_unavailable'
        | 'parent_unavailable'
    }

/** Binary transfer preserves the exact provider file through SQL's own digest and UTF-8 checks. */
export function retainManagedExploreOutput(
  pool: pg.Pool,
  { projectId, turnId, leaseToken }: ManagedExploreDispatchIdentity,
  output: ManagedExploreRetentionOutput,
  control?: ServiceControl,
): Promise<ManagedExploreRetentionResult> {
  const { metadata, bytes } = splitOutput(output)
  return withService(
    pool,
    async (c) => {
      const { rows } = await c.query<{ result: ManagedExploreRetentionResult }>(
        'SELECT sophia.retain_managed_explore_output($1,$2,$3,$4,$5) AS result',
        [projectId, turnId, leaseToken, JSON.stringify(metadata), bytes],
      )
      return onlyRow(rows, 'managed Explore retention').result
    },
    control,
  )
}

function splitOutput(output: ManagedExploreRetentionOutput) {
  if (output.kind === 'directions') return { metadata: output, bytes: null }
  const { bytes, ...metadata } = output
  return { metadata, bytes: Buffer.from(bytes) }
}
