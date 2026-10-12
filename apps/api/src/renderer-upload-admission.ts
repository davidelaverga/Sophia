// Bound renderer request bodies before Fastify buffers them. Shared by every API app in this process, PDF and PNG
// together, independently of backup activation. A route reserves its maximum, never a caller's Content-Length.
// Body reads expire after ten seconds; once the handler owns a body its permit lasts until the handler settles.
// Snapshot/write permits are separately retained until actual disk/S3 settlement, including after a response timeout.
import type { FastifyRequest, RouteShorthandOptions } from 'fastify'
import { DomainError } from '@sophia/domain'

export const RENDER_UPLOAD_BYTES = 64 * 1024 * 1024
export const RENDER_UPLOAD_REQUESTS = 4
export const RENDER_BODY_MS = 10_000
export const RENDER_AUTHORIZATIONS = 16
let activeBytes = 0
let activeRequests = 0
let activeAuthorizations = 0
interface Admission {
  handling: boolean
  deadline: number
  timer: ReturnType<typeof setTimeout>
  release: () => void
}
const admitted = new WeakMap<FastifyRequest, Admission>()
interface RequestDeadline {
  deadline: number
  timer: ReturnType<typeof setTimeout>
  timeout: Promise<boolean>
}

function requestDeadline(req: FastifyRequest): RequestDeadline {
  const deadline = performance.now() + RENDER_BODY_MS
  let expire: (() => void) | undefined
  const timeout = new Promise<boolean>((resolve) => {
    expire = () => resolve(false)
  })
  const timer = setTimeout(() => {
    expire?.()
    req.raw.destroy(new Error('renderer body timed out'))
  }, RENDER_BODY_MS)
  timer.unref()
  req.raw.once('close', () => {
    clearTimeout(timer)
    expire?.()
  })
  return { deadline, timer, timeout }
}

function finishDeadline(req: FastifyRequest, clock: Pick<RequestDeadline, 'timer'>): void {
  if (req.raw.complete || req.raw.destroyed) clearTimeout(clock.timer)
  // Early refusals can respond before the caller finishes its body. Keep its original socket deadline meanwhile.
  else req.raw.once('end', () => clearTimeout(clock.timer))
}

async function authorizeBeforeDeadline(
  req: FastifyRequest,
  authorize: (req: FastifyRequest) => Promise<void>,
  clock: RequestDeadline,
): Promise<void> {
  if (activeAuthorizations >= RENDER_AUTHORIZATIONS) {
    throw new DomainError('unavailable', 'Renderer authorization is busy')
  }
  activeAuthorizations += 1
  // The deadline closes the socket, not the original database operation. Retain its permit until actual settlement.
  const pending = Promise.resolve()
    .then(() => authorize(req))
    .finally(() => {
      activeAuthorizations -= 1
    })
  if (!(await Promise.race([pending.then(() => true), clock.timeout]))) {
    throw new DomainError('unavailable', 'Renderer authorization timed out')
  }
}

function releaseBeforeHandler(req: FastifyRequest): void {
  const state = admitted.get(req)
  if (state && !state.handling) state.release()
}

function admit(req: FastifyRequest, bytes: number, clock: RequestDeadline): void {
  if (activeRequests >= RENDER_UPLOAD_REQUESTS || activeBytes + bytes > RENDER_UPLOAD_BYTES) {
    throw new DomainError('unavailable', 'Renderer uploads are busy')
  }
  activeRequests += 1
  activeBytes += bytes
  let released = false
  const { deadline, timer } = clock
  const release = () => {
    if (released) return
    released = true
    finishDeadline(req, clock)
    req.body = undefined
    activeRequests -= 1
    activeBytes -= bytes
    admitted.delete(req)
  }
  admitted.set(req, { handling: false, deadline, timer, release })
  req.raw.once('close', () => {
    if (!req.raw.complete) releaseBeforeHandler(req)
  })
}

/** Applied to uploads only: real capability/lease authorization precedes body admission. Errors release safely. */
export function rendererUploadHooks(
  maximumBytes: number,
  authorize: (req: FastifyRequest) => Promise<void>,
): Pick<RouteShorthandOptions, 'onRequest' | 'preValidation' | 'onError' | 'onResponse'> {
  return {
    onRequest: async (req) => {
      const clock = requestDeadline(req)
      try {
        await authorizeBeforeDeadline(req, authorize, clock)
        // No fresh deadline after authorization; also refuse closes that preceded admission's listener.
        if (performance.now() >= clock.deadline || req.raw.destroyed) {
          throw new DomainError('unavailable', 'Renderer request closed or timed out')
        }
        admit(req, maximumBytes, clock)
      } catch (error) {
        finishDeadline(req, clock)
        throw error
      }
    },
    preValidation: (req, _reply, done) => {
      const state = admitted.get(req)
      if (state && performance.now() >= state.deadline) throw new DomainError('unavailable', 'Renderer body timed out')
      if (state) clearTimeout(state.timer)
      done()
    },
    onError: (req, _reply, _error, done) => {
      releaseBeforeHandler(req)
      done()
    },
    onResponse: (req, _reply, done) => {
      releaseBeforeHandler(req)
      done()
    },
  }
}

/** Includes lease/claim database waits and the store operation, even if the client disconnects meanwhile. */
export async function withRendererUpload<T>(req: FastifyRequest, handle: () => Promise<T>): Promise<T> {
  const state = admitted.get(req)
  if (!state) throw new DomainError('unavailable', 'Renderer upload was not admitted')
  if (performance.now() >= state.deadline) {
    state.release()
    throw new DomainError('unavailable', 'Renderer body timed out')
  }
  state.handling = true
  try {
    return await handle()
  } finally {
    state.release()
  }
}
