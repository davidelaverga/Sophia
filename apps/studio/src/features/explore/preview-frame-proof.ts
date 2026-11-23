import { READ_TIMEOUT_MS } from '../../api/timeouts.ts'

export type CheckDisplayedPreview = () => Promise<boolean>

interface Scope {
  url: URL
  showUntil: number
  signal: AbortSignal
}

function messageKind(data: unknown) {
  if (typeof data !== 'object' || data === null || !('kind' in data)) return undefined
  return data.kind
}

function makeChallenge(onTimeout: () => void) {
  let pending: { id: string; resolve: (result: boolean) => void; timer: ReturnType<typeof setTimeout> } | undefined
  const finish = (matched: boolean) => {
    if (!pending) return
    clearTimeout(pending.timer)
    pending.resolve(matched)
    pending = undefined
  }
  return {
    ask(send: (id: string) => void) {
      if (pending) return Promise.resolve(false)
      return new Promise<boolean>((resolve) => {
        const id = crypto.randomUUID()
        pending = { id, resolve, timer: setTimeout(onTimeout, 4000) }
        send(id)
      })
    },
    answer(data: unknown) {
      if (typeof data === 'object' && data !== null && 'id' in data && data.id === pending?.id) finish(true)
    },
    stop: () => finish(false),
  }
}

function listenToShell(origin: string, shellWindow: () => Window | null | undefined, receive: (data: unknown) => void) {
  const listen = (event: MessageEvent<unknown>) => {
    if (event.origin === origin && event.source === shellWindow()) receive(event.data)
  }
  addEventListener('message', listen)
  return () => removeEventListener('message', listen)
}

interface Observer {
  shellWindow: () => Window | null | undefined
  onFrame: (check: CheckDisplayedPreview | null) => void
  onUnavailable: () => void
}

/** Own one bounded handshake and revoke it permanently on replacement of either document. */
export function bindPreviewFrame(preview: Scope, { shellWindow, onFrame, onUnavailable }: Observer) {
  let stopped = false
  let bridgeReady = false
  let shellLoads = 0
  const stillCurrent = () => !stopped && !preview.signal.aborted && performance.now() < preview.showUntil
  const stop = () => {
    stopped = true
    clearTimeout(timer)
    challenge.stop()
  }
  const invalidate = () => {
    if (!stillCurrent()) return
    stop()
    onFrame(null)
    onUnavailable()
  }
  const challenge = makeChallenge(invalidate)
  const check: CheckDisplayedPreview = () => {
    const shell = shellWindow()
    if (!bridgeReady || shellLoads !== 1 || !stillCurrent() || !shell) return Promise.resolve(false)
    return challenge.ask((id) => shell.postMessage({ kind: 'preview-check', id }, preview.url.origin))
  }
  const publishReady = () => {
    if (!bridgeReady || shellLoads !== 1 || !stillCurrent()) return
    clearTimeout(timer)
    onFrame(check)
  }
  const load = () => {
    if (++shellLoads > 1) invalidate()
    else publishReady()
  }
  const unlisten = listenToShell(preview.url.origin, shellWindow, (data) => {
    if (!stillCurrent()) return
    switch (messageKind(data)) {
      case 'preview-invalid':
        return invalidate()
      case 'preview-ready':
        bridgeReady = true
        return publishReady()
      case 'preview-rechecking':
        bridgeReady = false
        challenge.stop()
        return onFrame(null)
      case 'preview-checked':
        return challenge.answer(data)
    }
  })
  preview.signal.addEventListener('abort', stop, { once: true })
  const timer = setTimeout(invalidate, READ_TIMEOUT_MS)
  return {
    load,
    disconnect() {
      unlisten()
      preview.signal.removeEventListener('abort', stop)
      stop()
    },
  }
}
