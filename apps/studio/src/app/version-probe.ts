// The version a tab left open asks the host for (docs/plans/version-probe.md; the baseline's M9). A build names its
// version in its page and serves it beside the page as version.json (build-version.ts). The tab asks when it comes
// back into view or into focus (at most once a minute) and every ten minutes while in view, so it hears of a deploy
// within ten minutes instead of when a part it needs is gone. A different id is the new version's word, said once to
// the notice, and the asking stops; nothing reloads by itself (new-version.md). A read that fails is no word. Pure
// over its page, so tested.

/** The file the build writes beside the page, and the host serves as is. */
export const VERSION_FILE = 'version.json'
/** The page's own version, named in its head by the build (build-version.ts). */
export const VERSION_META = 'sophia-version'
/** While the tab is in view, how often it asks: within the baseline's 15 minutes of a deploy. */
export const PROBE_EVERY_MS = 10 * 60_000
/** Back into view or focus, it asks at most this often: switching windows never makes it ask more. */
export const PROBE_GAP_MS = 60_000
/** An ask gives up after this long: one ask at a time, so one that hung would stop the asking for good. */
export const PROBE_ASK_MS = 10_000

/** What the host serves in `version.json`, `{ "version": "<id>" }`; anything else names none. */
export function servedVersion(body: unknown): string | null {
  const version: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'version') : null
  return typeof version === 'string' && version !== '' ? version : null
}

/** The version the page names, as the build wrote it; none on the dev server and the fixture pages but the app's. */
export const ownVersion = (doc: Document): string | null =>
  doc.querySelector<HTMLMetaElement>(`meta[name="${VERSION_META}"]`)?.content || null

/** The page as the probe uses it. */
export interface ProbePage {
  hidden: () => boolean
  now: () => number
  /** The served `version.json`, parsed (null for a refusal); rejects when it can't be read. */
  served: () => Promise<unknown>
  /** Back into view or into focus; returns what stops listening. */
  onBack: (ask: () => void) => () => void
  every: (ms: number, ask: () => void) => () => void
}

/** Asks the host for its version, and `tell`s once when it differs from `own`. Returns what stops it. */
export function versionProbe(page: ProbePage, own: string, tell: () => void): () => void {
  const asks = { last: Number.NEGATIVE_INFINITY, open: false, done: false }
  const stops: (() => void)[] = []
  const stop = () => {
    asks.done = true
    for (const s of stops) s()
  }
  const heard = (body: unknown) => {
    const version = servedVersion(body)
    if (asks.done || version === null || version === own) return
    stop()
    tell()
  }
  /** `soon`: coming back, which asks at most once a minute; the interval always asks. One ask at a time. */
  const ask = (soon: boolean) => {
    if (asks.done || asks.open || page.hidden()) return
    if (soon && page.now() - asks.last < PROBE_GAP_MS) return
    asks.last = page.now()
    asks.open = true
    void page
      .served()
      .then(heard, () => undefined)
      .finally(() => {
        asks.open = false
      })
  }
  stops.push(
    page.onBack(() => ask(true)),
    page.every(PROBE_EVERY_MS, () => ask(false)),
  )
  return stop
}

/** The browser's page: its visibility and clock, the host's file (never from a cache), focus and view. */
export function browserPage(win: Window): ProbePage {
  const doc = win.document
  return {
    hidden: () => doc.visibilityState === 'hidden',
    now: () => win.performance.now(),
    served: async () => {
      const res = await win.fetch(`/${VERSION_FILE}`, { cache: 'no-store', signal: AbortSignal.timeout(PROBE_ASK_MS) })
      return res.ok ? ((await res.json()) as unknown) : null
    },
    onBack: (ask) => {
      const inView = () => {
        if (doc.visibilityState === 'visible') ask()
      }
      win.addEventListener('focus', ask)
      doc.addEventListener('visibilitychange', inView)
      return () => {
        win.removeEventListener('focus', ask)
        doc.removeEventListener('visibilitychange', inView)
      }
    },
    every: (ms, ask) => {
      const id = win.setInterval(ask, ms)
      return () => win.clearInterval(id)
    },
  }
}
