import type pg from 'pg'
import type {
  ManagedExploreApproval,
  ManagedExploreApprovalRequest,
  ManagedExploreDirectionSelection,
  ManagedExploreHandoff,
  ManagedExplorePreviewPermit,
  ManagedExplorePreviewRequest,
  ManagedExplorePreflight,
  ManagedExploreRevision,
  ManagedExploreSession,
  ManagedExploreStartReceipt,
  ManagedExploreStartRequest,
  ManagedExploreTurnReceipt,
  ManagedExploreTurnRequest,
} from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { onlyRow } from './rows.ts'

/** Run under withActor. SQL owns authorization, locks, receipts and the outbox transaction. */
async function exploreQuery<T>(c: pg.PoolClient, query: string, parameters: unknown[]): Promise<T> {
  const { rows } = await c.query<{ result: T | null }>(query, parameters)
  const { result } = onlyRow(rows, 'managed Explore')
  if (result === null) throw new DomainError('unavailable', 'Managed Explore is unavailable')
  return result
}

export const readManagedExplorePreflight = (
  c: pg.PoolClient,
  projectId: string,
  entryId: string,
  revision: number,
  admissions: boolean,
) =>
  exploreQuery<ManagedExplorePreflight>(c, 'SELECT sophia.read_managed_explore_preflight($1,$2,$3,$4) AS result', [
    projectId,
    entryId,
    revision,
    admissions,
  ])

export const startManagedExplore = (
  c: pg.PoolClient,
  projectId: string,
  key: string,
  { seedEntryId, expectedSeedRevision, routeId }: ManagedExploreStartRequest,
) =>
  exploreQuery<ManagedExploreStartReceipt>(c, 'SELECT sophia.start_managed_explore($1,$2,$3,$4,$5) AS result', [
    projectId,
    seedEntryId,
    expectedSeedRevision,
    routeId,
    key,
  ])

export const readManagedExploreSession = (c: pg.PoolClient, projectId: string, sessionId: string) =>
  exploreQuery<ManagedExploreSession>(c, 'SELECT sophia.read_managed_explore_session($1,$2) AS result', [
    projectId,
    sessionId,
  ])

export const admitManagedExploreTurn = (
  c: pg.PoolClient,
  projectId: string,
  sessionId: string,
  key: string,
  request: ManagedExploreTurnRequest,
) =>
  exploreQuery<ManagedExploreTurnReceipt>(c, 'SELECT sophia.admit_managed_explore_turn($1,$2,$3,$4) AS result', [
    projectId,
    sessionId,
    key,
    JSON.stringify(request),
  ])

export const selectManagedExploreDirection = (
  c: pg.PoolClient,
  projectId: string,
  sessionId: string,
  key: string,
  { directionId, expectedDirectionRevision, expectedSessionRevision }: ManagedExploreDirectionSelection,
) =>
  exploreQuery<ManagedExploreRevision>(
    c,
    'SELECT sophia.select_managed_explore_direction($1,$2,$3,$4,$5,$6) AS result',
    [projectId, sessionId, key, directionId, expectedDirectionRevision, expectedSessionRevision],
  )

interface ManagedExplorePreviewLease extends Omit<ManagedExplorePreviewPermit, 'url'> {
  token: string
}

export interface ManagedExploreRetainedEntry {
  entrySha256: string
  byteLength: number
  projectId: string
  sourceId: string
  storageKey: string
  text: string | null
}

export interface ManagedExplorePreviewEntry extends ManagedExploreRetainedEntry {
  expiresAt: string
}

export const readManagedExploreEntry = (c: pg.PoolClient, projectId: string, sessionId: string, versionId: string) =>
  exploreQuery<ManagedExploreRetainedEntry>(c, 'SELECT sophia.read_managed_explore_entry($1,$2,$3) AS result', [
    projectId,
    sessionId,
    versionId,
  ])

export const issueManagedExplorePreview = (
  c: pg.PoolClient,
  { projectId, sessionId, versionId }: { projectId: string; sessionId: string; versionId: string },
  key: string,
  { manifestSha256, entrySha256 }: ManagedExplorePreviewRequest,
) =>
  exploreQuery<ManagedExplorePreviewLease>(
    c,
    'SELECT sophia.issue_managed_explore_preview($1,$2,$3,$4,$5,$6) AS result',
    [projectId, sessionId, versionId, key, manifestSha256, entrySha256],
  )

/** Call withoutActor. The permit's founder and current project/version/source are resolved by the database. */
export async function resolveManagedExplorePreviewEntry(
  c: pg.PoolClient,
  token: string,
): Promise<ManagedExplorePreviewEntry | null> {
  const { rows } = await c.query<{ result: ManagedExplorePreviewEntry | null }>(
    'SELECT sophia.resolve_managed_explore_preview($1) AS result',
    [token],
  )
  return onlyRow(rows, 'resolve managed Explore preview').result
}

export const approveManagedExploreVersion = (
  c: pg.PoolClient,
  projectId: string,
  sessionId: string,
  key: string,
  request: ManagedExploreApprovalRequest,
) =>
  exploreQuery<ManagedExploreApproval>(
    c,
    'SELECT sophia.approve_managed_explore_version($1,$2,$3,$4,$5,$6,$7) AS result',
    [
      projectId,
      sessionId,
      key,
      request.prototypeVersionId,
      request.expectedManifestDigest,
      request.expectedSessionRevision,
      request.acceptanceCriteria,
    ],
  )

export const readManagedExploreHandoff = (c: pg.PoolClient, projectId: string, sessionId: string, approvalId: string) =>
  exploreQuery<ManagedExploreHandoff>(c, 'SELECT sophia.read_managed_explore_handoff($1,$2,$3) AS result', [
    projectId,
    sessionId,
    approvalId,
  ])
