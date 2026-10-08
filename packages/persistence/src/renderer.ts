// The render runner's operations (SMC-M03 S5a part 2, db/migrations/0030, amendment A11). They run inside
// withService with no member actor: the sophia.renderer_* functions authenticate the runner's capability (by its
// SHA-256) and the job's lease themselves. enqueueRenderJob is internal (owner only until S5b's tools call it).
import type pg from 'pg'
import type {
  CaptureReceipt,
  RenderCaptureOutput,
  RenderHeartbeat,
  RenderJob,
  RenderOutput,
  RenderReceipt,
  RenderSettlement,
} from '@sophia/contracts'
import { onlyRow } from './rows.ts'

/** Where one file of a claimed package lives: inline text, or an object in the byte store. */
export interface RenderFileLocation {
  readonly projectId: string
  readonly sourceId: string
  readonly sha256: string
  readonly mime: string
  readonly byteLength: number
  readonly storageKey: string
  readonly text: string | null
}

async function call<T>(c: pg.PoolClient, fn: string, params: unknown[]): Promise<T> {
  const placeholders = params.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await c.query<{ reply: T }>(`SELECT sophia.${fn}(${placeholders}) AS reply`, params)
  return onlyRow(rows, fn).reply
}

/**
 * The oldest pending render whose goal is working, now leased to this runner; null when there is none. A runner that
 * names its formats (SDD-01: pdf, png) may be handed a capture; one that names none renders PDF only.
 */
export const rendererClaim = (c: pg.PoolClient, tokenSha256: Buffer, formats?: readonly string[]) =>
  formats === undefined
    ? call<RenderJob | null>(c, 'renderer_claim', [tokenSha256])
    : call<RenderJob | null>(c, 'renderer_claim', [tokenSha256, formats])

export const rendererHeartbeat = (c: pg.PoolClient, tokenSha256: Buffer, jobId: string, lease: string) =>
  call<RenderHeartbeat>(c, 'renderer_heartbeat', [tokenSha256, jobId, lease])

export const rendererFile = (c: pg.PoolClient, tokenSha256: Buffer, jobId: string, lease: string, filePath: string) =>
  call<RenderFileLocation>(c, 'renderer_file', [tokenSha256, jobId, lease, filePath])

/** Where the output goes: its project and a new source id. Refused once the job has its output. */
export const rendererOutputSlot = (c: pg.PoolClient, tokenSha256: Buffer, jobId: string, lease: string) =>
  call<{ projectId: string; sourceId: string }>(c, 'renderer_output_slot', [tokenSha256, jobId, lease])

export interface RecordedOutput {
  readonly sourceId: string
  readonly sha256: string
  readonly byteLength: number
}

/** Record bytes already stored at the slot's object as the job's output. */
export const rendererRecordOutput = (
  c: pg.PoolClient,
  tokenSha256: Buffer,
  jobId: string,
  lease: string,
  output: RecordedOutput,
) =>
  call<RenderOutput>(c, 'renderer_record_output', [
    tokenSha256,
    jobId,
    lease,
    output.sourceId,
    output.sha256,
    output.byteLength,
  ])

/** Where one capture of a capture job goes (SDD-01): its project and a new source id. */
export const rendererCaptureSlot = (
  c: pg.PoolClient,
  tokenSha256: Buffer,
  jobId: string,
  lease: string,
  name: string,
) => call<{ projectId: string; sourceId: string }>(c, 'renderer_capture_slot', [tokenSha256, jobId, lease, name])

/** Record bytes already stored at the slot's object as the capture of that name. */
export const rendererRecordCapture = (
  c: pg.PoolClient,
  tokenSha256: Buffer,
  jobId: string,
  lease: string,
  capture: RecordedOutput & { readonly name: string },
) =>
  call<RenderCaptureOutput>(c, 'renderer_record_capture', [
    tokenSha256,
    jobId,
    lease,
    capture.name,
    capture.sourceId,
    capture.sha256,
    capture.byteLength,
  ])

export const rendererSettle = (
  c: pg.PoolClient,
  tokenSha256: Buffer,
  jobId: string,
  lease: string,
  receipt: RenderReceipt | CaptureReceipt,
) => call<RenderSettlement>(c, 'renderer_settle', [tokenSha256, jobId, lease, JSON.stringify(receipt)])

export interface RenderPackageFile {
  readonly path: string
  readonly role: 'entry' | 'asset'
  readonly sourceId: string
}

/** Queue a render of a research task's source package (internal: the owner's connection, or S5b's tools). */
export async function enqueueRenderJob(
  c: pg.ClientBase,
  projectId: string,
  parentJobId: string,
  language: string,
  files: readonly RenderPackageFile[],
): Promise<{ jobId: string; manifestSha256: string }> {
  const { rows } = await c.query<{ job_id: string; manifest_sha256: string }>(
    `SELECT job_id, manifest_sha256 FROM sophia.enqueue_render_job($1, $2, $3, $4)`,
    [projectId, parentJobId, language, JSON.stringify(files)],
  )
  const row = onlyRow(rows, 'enqueue_render_job')
  return { jobId: row.job_id, manifestSha256: row.manifest_sha256 }
}

/**
 * Claim an object key's one write before any byte of it is sent (0044): true the first time, false for a key already
 * claimed, by this API or another racing it. Call it in a transaction of its own (withService) that commits before the
 * write, so the claim holds whatever happens to the write.
 */
export async function claimObjectWrite(
  c: pg.PoolClient,
  key: string,
  sha256: string,
  byteLength: number,
): Promise<boolean> {
  const { rows } = await c.query<{ claimed: boolean }>(`SELECT sophia.claim_object_write($1, $2, $3) AS claimed`, [
    key,
    sha256,
    byteLength,
  ])
  return onlyRow(rows, 'claim_object_write').claimed
}
