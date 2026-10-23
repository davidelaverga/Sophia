import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Page, TestInfo } from '@playwright/test'

// The @reliability suite's tools (docs/plans/reliability-measure.md): a probe in the page that fails chosen reads the
// way the network does and times what the person sees with performance.now(), and the record each spec writes for
// scripts/reliability-report.mjs. The specs measure and report: they never fail on today's numbers.

/** Where the specs write their samples (read by `node scripts/reliability-report.mjs --fixture`). */
export const RESULTS = fileURLToPath(new URL('../../reliability-results/', import.meta.url))

/**
 * A read the probe answers instead of the page's API: `lost`, as the fixture's outage fails one (a fetch that
 * rejects); `html502`/`html503`, a proxy's page (HTML, not the API's contract), as Render answers while it deploys or
 * wakes. `times`: how many requests it answers so (null: all of them). `pattern`: a regular expression on the path
 * and query.
 */
export interface Rule {
  pattern: string
  method?: string
  answer: 'lost' | 'html502' | 'html503'
  times: number | null
}

/** What a timed press came to: the time from the press to a definitive answer on screen, or none in time. */
export interface Timed {
  ms: number | null
  definitive: boolean
}

/**
 * A press to time, declaratively (the page runs it): from the press (`keydown` of Enter, or a click on `target`) until
 * `field` is empty, `listed` is on the page (if given) and `unconfirmed` is not; `holdFor`: the fixture's held
 * replies are let through that long after the press. `failOnUnconfirmed`: `unconfirmed` appearing ends it, not
 * definitive.
 */
export interface Press {
  on: 'keydown' | 'click'
  target?: string
  field: string
  listed?: string
  unconfirmed: string
  failOnUnconfirmed: boolean
  holdFor?: number
  timeoutMs: number
}

interface Probe {
  rules: Rule[]
  hits: { path: string; answer: Rule['answer']; at: number }[]
  arm: (press: Press) => void
  timed: Promise<Timed> | null
}

declare global {
  interface Window {
    reliability?: Probe
  }
}

/**
 * The probe, installed before the page's own scripts: every function the page sets as `window.fetch` (the fixture's
 * API, the app fixture's own layer) is wrapped, so a rule answers first wherever the request comes from.
 */
function probe(initial: Rule[]) {
  const state: Probe = { rules: initial, hits: [], arm: () => undefined, timed: null }
  window.reliability = state
  const answered = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> | null => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
    if (!url.pathname.startsWith('/api/')) return null
    const path = `${url.pathname}${url.search}`
    const rule = state.rules.find(
      (r) => (r.times === null || r.times > 0) && (r.method ?? 'GET') === method && new RegExp(r.pattern).test(path),
    )
    if (!rule) return null
    if (rule.times !== null) rule.times -= 1
    state.hits.push({ path, answer: rule.answer, at: performance.now() })
    if (rule.answer === 'lost') return Promise.reject(new TypeError('Failed to fetch'))
    const status = rule.answer === 'html502' ? 502 : 503
    const page = `<html><head><title>${status}</title></head><body><h1>${status} Bad Gateway</h1></body></html>`
    return Promise.resolve(new Response(page, { status, headers: { 'content-type': 'text/html' } }))
  }
  const wrap = (inner: typeof fetch): typeof fetch => {
    return (input, init) => answered(input, init) ?? inner(input, init)
  }
  let current = wrap(window.fetch.bind(window))
  Object.defineProperty(window, 'fetch', {
    configurable: true,
    get: () => current,
    set: (next: typeof fetch) => {
      current = wrap(next)
    },
  })
}

/**
 * The timer, installed beside the probe: `arm` waits for the press, lets held replies through when told, and settles
 * `timed` when the screen gives a definitive answer (or none in time).
 */
function timing() {
  const state = window.reliability
  if (!state) return
  state.arm = (press) => {
    state.timed = new Promise<Timed>((resolve) => {
      let start = 0
      const done = () => {
        const field = document.querySelector<HTMLTextAreaElement | HTMLInputElement>(press.field)
        const text = document.body.innerText
        const cleared = !field || field.value === ''
        return cleared && (!press.listed || text.includes(press.listed)) && !text.includes(press.unconfirmed)
      }
      const tick = () => {
        const now = performance.now()
        if (done()) resolve({ ms: now - start, definitive: true })
        else if (press.failOnUnconfirmed && document.body.innerText.includes(press.unconfirmed))
          resolve({ ms: null, definitive: false })
        else if (now - start > press.timeoutMs) resolve({ ms: null, definitive: false })
        else requestAnimationFrame(tick)
      }
      const begin = (event: Event) => {
        if (press.on === 'keydown' && !(event instanceof KeyboardEvent && event.key === 'Enter')) return
        if (press.target && !(event.target instanceof Element && event.target.closest(press.target))) return
        document.removeEventListener(press.on, begin, true)
        start = performance.now()
        if (press.holdFor !== undefined) setTimeout(() => window.fixture?.releaseMessages(), press.holdFor)
        requestAnimationFrame(tick)
      }
      document.addEventListener(press.on, begin, true)
    })
  }
}

/** Installs the probe before the page loads, with the rules a read at load needs. */
export async function withProbe(page: Page, rules: Rule[] = []) {
  await page.addInitScript(probe, rules)
  await page.addInitScript(timing)
}

/** Sets the probe's rules from now on (each is answered from its own count). */
export async function failReads(page: Page, rules: Rule[]) {
  await page.evaluate((next) => {
    if (window.reliability) window.reliability.rules = next
  }, rules)
}

/** The requests the probe answered so far. */
export const hits = (page: Page) => page.evaluate(() => [...(window.reliability?.hits ?? [])])

/** Waits until the probe answered something and then nothing for `quietMs` (the page's retries are over), or `maxMs`. */
export async function settled(page: Page, quietMs = 5000, maxMs = 25_000) {
  const started = Date.now()
  for (;;) {
    const quiet = await page.evaluate((q) => {
      const last = window.reliability?.hits.at(-1)
      return last !== undefined && performance.now() - last.at >= q
    }, quietMs)
    if (quiet || Date.now() - started > maxMs) return
    await page.waitForTimeout(250)
  }
}

/** Arms a timed press in the page; `pressed` then waits for what it came to. */
export async function arm(page: Page, press: Press) {
  await page.evaluate((p) => window.reliability?.arm(p), press)
}

export const pressed = (page: Page): Promise<Timed> =>
  page.evaluate(async () => (await window.reliability?.timed) ?? { ms: null, definitive: false })

/** Writes this test's samples for the report, and attaches them to the test. */
export async function record(info: TestInfo, metric: string, samples: object[]) {
  const body = JSON.stringify({ metric, test: info.title, samples }, null, 2)
  mkdirSync(RESULTS, { recursive: true })
  const name = `${metric}-${info.titlePath.join(' ').replace(/[^a-z0-9]+/gi, '-')}`.slice(0, 120)
  writeFileSync(`${RESULTS}${name}.json`, body)
  await info.attach(`${metric}.json`, { body, contentType: 'application/json' })
}
