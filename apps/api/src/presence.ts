// Who is in many rooms at once, for one read of the Work list: the room server is asked at most `limit` questions at a
// time and nothing more once the read's time is up, so one person with many projects never floods it.

/**
 * `lookup` for each item, at most `limit` at a time, within `ms` in all (`lookup` is told the time left). Nothing more
 * is asked once the time is up; what wasn't answered by then is unknown (null). Answers keep the items' order.
 */
export async function lookupAll<T, R>(
  items: readonly T[],
  limit: number,
  ms: number,
  lookup: (item: T, left: number) => Promise<R | null>,
  clock: () => number = Date.now,
): Promise<Array<R | null>> {
  const end = clock() + ms
  const found: Array<R | null> = items.map(() => null)
  const queue = items.map((item, index) => ({ item, index }))
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const left = end - clock()
      if (left <= 0) return
      found[job.index] = await lookup(job.item, left)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return found
}
