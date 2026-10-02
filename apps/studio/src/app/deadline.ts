// A wait with an end, for calls that take no AbortSignal (the Auth client's): the value the work settles to, or a
// fallback once the time is up or if it fails. The work itself is not cancelled; nothing waits on it any more.

export function settleWithin<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(fallback)
      },
    )
  })
}

/**
 * The work's own outcome, or "late" once the time is up (the work is not cancelled; nothing waits on it any more).
 * Unlike settleWithin, a failure stays a failure, so a caller can tell the three apart.
 */
export function orLate<T>(work: Promise<T>, ms: number): Promise<T | 'late'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => resolve('late'), ms)
  })
  return Promise.race([work, late]).finally(() => clearTimeout(timer))
}
