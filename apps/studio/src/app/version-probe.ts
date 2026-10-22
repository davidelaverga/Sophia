// The version a tab left open asks the host for (docs/plans/version-probe.md): an outline, written with its checks.

/** The file the build writes beside the page, and the host serves as is. */
export const VERSION_FILE = 'version.json'
/** The page's own version, named in its head by the build (build-version.ts). */
export const VERSION_META = 'sophia-version'
/** While the tab is in view, how often it asks. */
export const PROBE_EVERY_MS = 10 * 60_000
/** Back into view or focus, it asks at most this often. */
export const PROBE_GAP_MS = 60_000

/** The page as the probe uses it. */
export interface ProbePage {
  hidden: () => boolean
  now: () => number
  served: () => Promise<unknown>
  onBack: (ask: () => void) => () => void
  every: (ms: number, ask: () => void) => () => void
}

const notYet = (): never => {
  throw new Error('version-probe.ts: not written yet')
}

export const servedVersion = (_body: unknown): string | null => notYet()
export const versionProbe = (_page: ProbePage, _own: string, _tell: () => void): (() => void) => notYet()
