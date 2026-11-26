import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import type {
  FounderBuildBinding,
  FounderBuildBindingRequest,
  FounderBuildDestination,
  FounderBuildExport,
  FounderBuildExportRequest,
  FounderBuildReturn,
  FounderBuildReturnRequest,
  FounderBuildVerification,
  FounderBuildVerificationAccess,
  FounderBuildVerificationRequest,
} from '@sophia/contracts'
import type { ManagedExploreRetainedEntry } from './managed-explore.ts'
import { onlyRow } from './rows.ts'

export interface FounderBuildScope {
  projectId: string
  sessionId: string
  approvalId: string
}

async function buildQuery<T>(c: pg.PoolClient, sql: string, parameters: unknown[]): Promise<T> {
  const { rows } = await c.query<{ result: T }>(sql, parameters)
  return onlyRow(rows, 'founder Build handoff').result
}

function read<T>(c: pg.PoolClient, scope: FounderBuildScope, kind: string, target?: string, fileId?: string) {
  return buildQuery<T>(c, 'SELECT sophia.read_founder_build($1,$2,$3,$4,$5,$6) AS result', [
    scope.projectId,
    scope.sessionId,
    scope.approvalId,
    kind,
    target ?? null,
    fileId ?? null,
  ])
}

function write<T>(c: pg.PoolClient, scope: FounderBuildScope, kind: string, key: string, request: object) {
  return buildQuery<T>(c, 'SELECT sophia.write_founder_build($1,$2,$3,$4,$5,$6) AS result', [
    scope.projectId,
    scope.sessionId,
    scope.approvalId,
    kind,
    key,
    JSON.stringify(request),
  ])
}

// Each wrapper runs under withActor. Source references returned to the API may only be resolved through its byte store.
export const readFounderBuildDestination = (c: pg.PoolClient, scope: FounderBuildScope) =>
  read<FounderBuildDestination>(c, scope, 'destination')

export const bindFounderBuildRepository = (
  c: pg.PoolClient,
  scope: FounderBuildScope,
  key: string,
  request: FounderBuildBindingRequest,
) => write<FounderBuildBinding>(c, scope, 'binding', key, request)

export const readFounderBuildBindingEntry = (c: pg.PoolClient, scope: FounderBuildScope, bindingId: string) =>
  read<ManagedExploreRetainedEntry>(c, scope, 'binding_entry', bindingId)

export const prepareFounderBuildExport = (
  c: pg.PoolClient,
  scope: FounderBuildScope,
  key: string,
  request: FounderBuildExportRequest,
) => write<FounderBuildExport>(c, scope, 'export', key, request)

export const readFounderBuildExport = (c: pg.PoolClient, scope: FounderBuildScope, exportId: string) =>
  read<FounderBuildExport>(c, scope, 'manifest', exportId)

export const readFounderBuildExportFile = (
  c: pg.PoolClient,
  scope: FounderBuildScope,
  exportId: string,
  fileId: string,
) => read<ManagedExploreRetainedEntry>(c, scope, 'file', exportId, fileId)

export const recordFounderBuildReturn = (
  c: pg.PoolClient,
  scope: FounderBuildScope,
  key: string,
  request: FounderBuildReturnRequest,
) => write<FounderBuildReturn>(c, scope, 'return', key, request)

async function verification<T>(c: pg.PoolClient, sql: string, args: unknown[]): Promise<T> {
  const installed = await buildQuery<boolean>(
    c,
    `SELECT to_regprocedure('sophia.read_founder_build_verification(uuid,uuid,uuid,uuid)') IS NOT NULL
        AND to_regprocedure('sophia.write_founder_build_verification(uuid,uuid,uuid,text,jsonb)') IS NOT NULL AS result`,
    [],
  )
  if (!installed) throw new DomainError('unavailable', 'Build verification is unavailable')
  return buildQuery<T>(c, sql, args)
}

export const readFounderBuildVerification = (c: pg.PoolClient, scope: FounderBuildScope, returnId: string) =>
  verification<FounderBuildVerificationAccess>(
    c,
    'SELECT sophia.read_founder_build_verification($1,$2,$3,$4) AS result',
    [scope.projectId, scope.sessionId, scope.approvalId, returnId],
  )

export const recordFounderBuildVerification = (
  c: pg.PoolClient,
  scope: FounderBuildScope,
  key: string,
  request: FounderBuildVerificationRequest,
) =>
  verification<FounderBuildVerification>(
    c,
    'SELECT sophia.write_founder_build_verification($1,$2,$3,$4,$5) AS result',
    [scope.projectId, scope.sessionId, scope.approvalId, key, JSON.stringify(request)],
  )
