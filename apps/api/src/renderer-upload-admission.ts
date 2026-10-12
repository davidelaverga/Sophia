// Bound renderer request bodies before Fastify buffers them. Shared by every API app in this process, PDF and PNG
// together, independently of backup activation. A route reserves its maximum, never a caller's Content-Length.
// Body reads expire after ten seconds; once the handler owns a body its permit lasts until the handler settles.
// Snapshot/write permits are separately retained until actual disk/S3 settlement, including after a response timeout.
import type { FastifyRequest, RouteShorthandOptions } from 'fastify'
import { DomainError } from '@sophia/domain'

export const RENDER_UPLOAD_BYTES = 64 * 1024 * 1024
export const RENDER_UPLOAD_REQUESTS = 4
export const RENDER_BODY_MS = 10_000
let activeBytes = 0
let activeRequests = 0
interface Admission {
  handling: boolean
  deadline: number
  timer: ReturnType<typeof setTimeout>
  release: () => void
}
const admitted = new WeakMap<FastifyRequest, Admission>()

function releaseBeforeHandler(req: FastifyRequest): void {
  const state = admitted.get(req)
  if (state && !state.handling) state.release()
}

function admit(req: FastifyRequest, bytes: number): void {
  if (activeRequests >= RENDER_UPLOAD_REQUESTS || activeBytes + bytes > RENDER_UPLOAD_BYTES) {
    throw new DomainError('unavailable', 'Renderer uploads are busy')
  }
  activeRequests += 1
  activeBytes += bytes
  let released = false
  const deadline = performance.now() + RENDER_BODY_MS
  const timer = setTimeout(() => req.raw.destroy(new Error('renderer body timed out')), RENDER_BODY_MS)
  timer.unref()
  const release = () => {
    if (released) return
    released = true
    clearTimeout(timer)
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

/** Applied to upload routes only; existing global authentication runs first. Parse/schema errors release safely. */
export function rendererUploadHooks(
  maximumBytes: number,
): Pick<RouteShorthandOptions, 'onRequest' | 'preValidation' | 'onError' | 'onResponse'> {
  return {
    onRequest: (req, _reply, done) => {
      admit(req, maximumBytes)
      done()
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
