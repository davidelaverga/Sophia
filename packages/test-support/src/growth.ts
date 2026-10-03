// How a cost grows with its input, timed so the host's speed and load cancel out. A check that a scan is linear
// compares the same work at two sizes on the same host at the same moment, instead of holding it to a fixed number
// of milliseconds that a slower or busier host misses: the quadratic scans these checks guard against take 16 times
// as long for 4 times the input, a linear one 4 times.

/** How long the work takes at `size`, in milliseconds; it times only the part under test, not its setup. */
export type Timed = (size: number) => number | Promise<number>

/** One measurement: the least timing at each size, in milliseconds, how many times the larger one took, and in turns. */
export interface Growth {
  readonly small: number
  readonly large: number
  readonly ratio: number
  readonly turns: number
}

/** How to measure: `factor` times the size, timed up to `maxReps` times at each, the ratio held under `limit`. */
export interface GrowthOptions {
  /** How many times larger the second input is (4). */
  readonly factor?: number
  /** At most how many times as long the larger input may take: twice the factor by default, half a quadratic's. */
  readonly limit?: number
  /** Timings at each size before an early pass (3), and at most (7). */
  readonly minReps?: number
  readonly maxReps?: number
  /** The smaller timing counts as at least this many milliseconds (5), so noise under it is not divided into. */
  readonly floorMs?: number
}

/**
 * Times `n` and `factor * n` in turns, after one run to warm up, keeping the least of each: the least is the one the
 * host's load disturbed least, and the turns share whatever load there is. It stops once the growth is within the
 * limit, after `minReps` turns; work that grows faster is timed until `maxReps`, so a burst of load is not a failure.
 */
export async function growth(timed: Timed, n: number, options: GrowthOptions = {}): Promise<Growth> {
  const { factor = 4, minReps = 3, maxReps = 7, floorMs = 5 } = options
  const limit = options.limit ?? 2 * factor
  await timed(n)
  let small = Infinity
  let large = Infinity
  let turns = 0
  while (turns < maxReps) {
    turns += 1
    small = Math.min(small, await timed(n))
    large = Math.min(large, await timed(factor * n))
    if (turns >= minReps && large / Math.max(small, floorMs) < limit) break
  }
  return { small, large, ratio: large / Math.max(small, floorMs), turns }
}

const ms = (t: number): string => `${t.toFixed(1)} ms`

/**
 * Fails, with both timings, when the work takes `limit` times as long or more at `factor * n` as at `n`. With
 * GROWTH_LOG set, each measurement is printed.
 */
export async function assertGrowth(
  label: string,
  timed: Timed,
  n: number,
  options: GrowthOptions = {},
): Promise<Growth> {
  const factor = options.factor ?? 4
  const limit = options.limit ?? 2 * factor
  const g = await growth(timed, n, options)
  const times = `${g.ratio.toFixed(1)} times as long (${ms(g.small)}, then ${ms(g.large)})`
  const report = `${label}: ${String(factor)} times the input took ${times}, limit ${String(limit)}, ${String(g.turns)} turns`
  if (process.env.GROWTH_LOG) console.log(`growth: ${report}`)
  if (g.ratio >= limit) throw new Error(report)
  return g
}
