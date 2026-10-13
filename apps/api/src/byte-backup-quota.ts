// Durable disk admission runs off the API event loop. A deadline never refunds a possibly committed reservation.
// The worker receives identities and lengths, never report bytes or storage credentials.
import { Worker } from 'node:worker_threads'

export const BACKUP_QUOTA_MS = 5_000
export const BACKUP_LIMITS = {
  globalBytes: 768 * 1024 * 1024,
  projectBytes: 256 * 1024 * 1024,
  jobBytes: 96 * 1024 * 1024,
  globalCount: 4096,
  projectCount: 1024,
  jobCount: 144,
  freeBytes: 128 * 1024 * 1024,
}
export type BackupLimits = typeof BACKUP_LIMITS
export interface BackupReservation {
  root: string
  key: string
  project: string
  job: string | null
  bytes: number
  limits: BackupLimits
}
export type BackupQuotaStatus = 200 | 409 | 503
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function validIdentity(value: Record<string, unknown>): boolean {
  if (typeof value.root !== 'string' || typeof value.key !== 'string' || typeof value.project !== 'string') return false
  if (!UUID.test(value.project) || !value.key.startsWith(`${value.project}/`)) return false
  if (!UUID.test(value.key.slice(value.project.length + 1))) return false
  return value.job === null || (typeof value.job === 'string' && UUID.test(value.job))
}

function validLimits(limits: unknown): boolean {
  if (!isRecord(limits)) return false
  return Object.entries(BACKUP_LIMITS).every(([key, maximum]) => {
    const limit: unknown = Reflect.get(limits, key)
    return typeof limit === 'number' && Number.isSafeInteger(limit) && limit > 0 && limit <= maximum
  })
}

/** Worker input is narrowed even though only this process constructs it. Smaller limits support isolated tests. */
export function isBackupReservation(value: unknown): value is BackupReservation {
  if (!isRecord(value) || !validIdentity(value) || !validLimits(value.limits)) return false
  return typeof value.bytes === 'number' && Number.isSafeInteger(value.bytes) && value.bytes >= 0
}

function awaitWorker(worker: Worker, release: () => void): Promise<BackupQuotaStatus> {
  const deadline = performance.now() + BACKUP_QUOTA_MS
  return new Promise((resolve) => {
    let status: BackupQuotaStatus = 503
    let messages = 0
    const timer = setTimeout(() => {
      resolve(503)
      // A committed charge remains charged. Keep the worker counted until its exit, even if termination is slow.
      void worker.terminate().catch(() => undefined)
    }, BACKUP_QUOTA_MS)
    worker.on('message', (message: unknown) => {
      messages += 1
      status = message === 200 || message === 409 ? message : 503
    })
    worker.on('error', () => {
      status = 503
    })
    worker.once('exit', (code) => {
      clearTimeout(timer)
      release()
      resolve(code === 0 && messages === 1 && performance.now() < deadline ? status : 503)
    })
  })
}

/** At most two workers remain admitted, including a timed-out worker until it actually exits. No waiting queue. */
export function quotaAdmission(createWorker: (request: BackupReservation) => Worker) {
  let active = 0
  return (request: BackupReservation): Promise<BackupQuotaStatus> => {
    if (active >= 2) return Promise.resolve(503)
    active += 1
    const release = () => {
      active -= 1
    }
    try {
      return awaitWorker(createWorker(request), release)
    } catch {
      release()
      return Promise.resolve(503)
    }
  }
}

export const reserveBackupBytes = quotaAdmission(
  (request) =>
    new Worker(new URL('./byte-backup-quota-worker.ts', import.meta.url), {
      workerData: request,
      // SQLite needs no API credentials or startup flags (including inherited --env-file / NODE_OPTIONS).
      env: {},
      execArgv: [],
    }),
)
