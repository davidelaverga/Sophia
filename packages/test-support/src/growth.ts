// How a cost grows with its input, timed so the host's speed and load cancel out. A check that a scan is linear
// compares the same work at two sizes on the same host at the same moment, instead of holding it to a fixed number
// of milliseconds that a slower or busier host misses: the quadratic scans these checks guard against take 16 times
// as long for 4 times the input, a linear one 4 times.
//
// The work is timed in this process's CPU time, not on the wall clock. On a busy host the wall clock counts the time
// the work waits for a CPU, and unevenly: a timing of a few milliseconds often fits in one time slice and escapes the
// wait, one of tens of milliseconds is preempted on every try, so the ratio between them grows with the load. CPU time
// counts only the work's own cycles, at either size.

/** Runs the part under test once, timed in CPU time, and returns what it returned. */
export type Measure = <T>(run: () => T | Promise<T>) => Promise<T>

/** Builds the input at `size` and hands the part under test to `measure`, exactly once; setup and checks stay outside. */
export type Work = (size: number, measure: Measure) => unknown

/** One measurement: the least timing at each size, in CPU milliseconds, how many times the larger one took, and in turns. */
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

/** The CPU milliseconds `work` spends at `size`, in the one `measure` it makes. */
async function cpuTime(work: Work, size: number): Promise<number> {
  let spent: number | undefined
  const measure: Measure = async (run) => {
    if (spent !== undefined) throw new Error('a growth check measures its work once per size')
    const start = process.cpuUsage()
    const value = await run()
    const used = process.cpuUsage(start)
    spent = (used.user + used.system) / 1000
    return value
  }
  await work(size, measure)
  if (spent === undefined) throw new Error('a growth check’s work never measured the part under test')
  return spent
}

/**
 * Times `n` and `factor * n` in turns, after one run to warm up, keeping the least of each: the least is the one a
 * collection or a cold cache disturbed least. It stops once the growth is within the limit, after `minReps` turns;
 * work that grows faster is timed until `maxReps`, so one slow run is not a failure.
 */
export async function growth(work: Work, n: number, options: GrowthOptions = {}): Promise<Growth> {
  const { factor = 4, minReps = 3, maxReps = 7, floorMs = 5 } = options
  const limit = options.limit ?? 2 * factor
  await cpuTime(work, n)
  let small = Infinity
  let large = Infinity
  let turns = 0
  while (turns < maxReps) {
    turns += 1
    small = Math.min(small, await cpuTime(work, n))
    large = Math.min(large, await cpuTime(work, factor * n))
    if (turns >= minReps && large / Math.max(small, floorMs) < limit) break
  }
  return { small, large, ratio: large / Math.max(small, floorMs), turns }
}

const ms = (t: number): string => `${t.toFixed(1)} ms`

/**
 * Fails, with both timings, when the work takes `limit` times as long or more at `factor * n` as at `n`. With
 * GROWTH_LOG set, each measurement is printed.
 */
export async function assertGrowth(label: string, work: Work, n: number, options: GrowthOptions = {}): Promise<Growth> {
  const factor = options.factor ?? 4
  const limit = options.limit ?? 2 * factor
  const g = await growth(work, n, options)
  const times = `${g.ratio.toFixed(1)} times as long (${ms(g.small)}, then ${ms(g.large)} of CPU)`
  const report = `${label}: ${String(factor)} times the input took ${times}, limit ${String(limit)}, ${String(g.turns)} turns`
  if (process.env.GROWTH_LOG) console.log(`growth: ${report}`)
  if (g.ratio >= limit) throw new Error(report)
  return g
}
