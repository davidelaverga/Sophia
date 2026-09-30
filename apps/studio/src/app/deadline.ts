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
