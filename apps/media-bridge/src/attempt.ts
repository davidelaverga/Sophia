// One attempt of a request to the API, bounded in time (item 7, Codex review of PR #190's unbounded posts): the
// request gets a signal of its own, and once `ms` pass it is aborted, so the transport cancels it and closes its socket
// (fetch applies the signal to the response's body too), and the attempt fails then, whether or not the request honours
// the signal. The timer is cleared as soon as the attempt settles, and never keeps a process alive by itself. The same
// shape as EvidenceSender's attempts (Codex P2 r4235355799).

/** `run`'s answer within `ms`, or a rejection once `ms` passed: `run` is handed the attempt's signal. */
export async function withinAttempt<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const why = new Error(`no answer within ${String(ms)} ms`)
      controller.abort(why)
      reject(why)
    }, ms)
    // The bound never keeps a process alive by itself: the request's own socket does while it is open.
    timer.unref()
  })
  try {
    return await Promise.race([run(controller.signal), late])
  } finally {
    clearTimeout(timer)
  }
}
