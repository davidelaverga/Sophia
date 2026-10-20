import { expect, test, type Page } from '@playwright/test'

// R-NEEDS-OWN-READ-01 (semantic, #391 4305645985): Home's own account Needs read (GET /api/v1/me/needs) refused (401,
// 403) hides every cached row, title, count and action from the CLIENT's first sight of the refusal status; adapted from
// e2e/updates-refusal.spec.ts (R-391-UPDATES-01). The original Updates header follows:
// R-391-UPDATES-01 (semantic): Updates' own «since» read refused (401, 403) hides the cached window and Mark as seen from
// the CLIENT's first sight of the refusal status. The page's fetch is wrapped after load; the wrapper answers the next
// «since» reads itself as the control asks (a refusal with a delayed or malformed body, a 503, or the fixture's own
// answer), and stamps each refusal (sequence, path, one performance.now clock) as its Response is handed to the app, with
// nothing awaited between. Every requestAnimationFrame callback from the first stamp records any protected line or
// Mark as seen laid out and visible. This measures DOM render opportunities in rAF callbacks, not composited paint.

const PAGE = '/home.html?needs=api'
const NEEDS = '[aria-label="Needs you"]'
const PROTECTED = [`${NEEDS} li`, `${NEEDS} button`]

type Control = 'pass' | '503' | { status: 401 | 403; body: 'delayed' | 'malformed' }
interface Trace {
  denials: { id: number; path: string; at: number }[]
  hits: { afterMs: number; what: string }[]
  frames: number
  /** rAF callbacks after the first refusal reached the app. */
  postFrames: number
  seenWrites: number
}
declare global {
  interface Window {
    needsTrace?: Trace & { stop: boolean; control: Control }
    needsHeld?: { held: (() => void)[]; release: () => void }
  }
}

async function observe(page: Page, control: Control) {
  await page.evaluate(
    ({ first, selectors }) => {
      const trace: Trace & { stop: boolean; control: Control } = {
        denials: [],
        hits: [],
        frames: 0,
        postFrames: 0,
        seenWrites: 0,
        stop: false,
        control: first,
      }
      window.needsTrace = trace
      let seq = 0
      const inner = window.fetch
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const id = ++seq
        const path = new URL(input instanceof Request ? input.url : String(input), location.href).pathname
        const method = init?.method ?? 'GET'
        if (method === 'POST' && path.endsWith('/seen')) trace.seenWrites++
        if (path !== '/api/v1/me/needs' || method !== 'GET') return inner(input, init)
        const c = trace.control
        if (c === 'pass') return inner(input, init)
        if (c === '503') return Response.json({ code: 'http_503' }, { status: 503 })
        if (c.body === 'malformed') {
          trace.denials.push({ id, path, at: performance.now() })
          return new Response('<html>refused</html>', { status: c.status })
        }
        const slow = new ReadableStream<Uint8Array>({
          async start(controller) {
            await new Promise((resolve) => setTimeout(resolve, 300))
            controller.enqueue(new TextEncoder().encode('{"code":"forbidden","message":"Not permitted"}'))
            controller.close()
          },
        })
        trace.denials.push({ id, path, at: performance.now() })
        return new Response(slow, { status: c.status, headers: { 'content-type': 'application/json' } })
      }
      const tick = () => {
        if (trace.stop) return
        trace.frames++
        const firstDenial = trace.denials[0]
        if (firstDenial) {
          trace.postFrames++
          const now = performance.now()
          for (const selector of selectors) {
            const shown = [...document.querySelectorAll(selector)].some((el) => {
              const style = getComputedStyle(el)
              return el.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none'
            })
            if (shown) trace.hits.push({ afterMs: Math.round((now - firstDenial.at) * 10) / 10, what: selector })
          }
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    },
    { first: control, selectors: PROTECTED },
  )
}

const setControl = (page: Page, control: Control) =>
  page.evaluate((c) => {
    if (window.needsTrace) window.needsTrace.control = c
  }, control)

const readTrace = (page: Page) =>
  page.evaluate(() => {
    const t = window.needsTrace
    if (!t) return { denials: [], hits: [], frames: 0, postFrames: 0, seenWrites: 0 }
    t.stop = true
    return { denials: t.denials, hits: t.hits, frames: t.frames, postFrames: t.postFrames, seenWrites: t.seenWrites }
  })

const seenWrites = (page: Page) => page.evaluate(() => window.needsTrace?.seenWrites ?? -1)

/**
 * After the refusal's note: at least 400 ms, then more than ten frames since the client saw the refusal, however slowly
 * the runner draws (CI's drew 7 to 10 in a fixed 400 ms: docs/plans/ci-home-needs-refusal-flake.md). Then the trace.
 */
async function sampleAfterRefusal(page: Page) {
  await expect(page.locator('body')).toContainText('Couldn’t read what needs you.')
  await page.waitForTimeout(400)
  await expect.poll(() => page.evaluate(() => window.needsTrace?.postFrames ?? 0)).toBeGreaterThan(10)
  return readTrace(page)
}

for (const status of [401, 403] as const) {
  for (const body of ['delayed', 'malformed'] as const) {
    test(`needs · semantic: its own read refused (${status}, ${body} body): from the client's first sight of it, no frame shows a cached need, title, count or action; a 503 after does not bring them back, a read since does, and reading never marks seen`, async ({
      page,
    }, info) => {
      await page.goto(PAGE)
      const since = page.locator('body')
      await expect(page.locator(`${NEEDS} button`).first()).toBeVisible()
      await observe(page, { status, body })
      // The window is read again (the page comes back into view): refused.
      await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
      const trace = await sampleAfterRefusal(page)
      await info.attach(`needs-trace-${status}-${body}.json`, {
        body: JSON.stringify(trace, null, 1),
        contentType: 'application/json',
      })
      expect(
        trace.denials.some((d) => d.path === '/api/v1/me/needs'),
        'its own read refused, as the client saw',
      ).toBe(true)
      expect(trace.postFrames, 'frames since the client saw the refusal').toBeGreaterThan(10)
      expect(trace.hits, 'a cached need, title, count or action after the client saw the refusal').toEqual([])
      // A later ordinary failure does not bring the old window back.
      await setControl(page, '503')
      await since.getByRole('button', { name: 'Try again' }).click()
      await expect(since).toContainText('Couldn’t read what needs you.')
      await expect(page.locator(`${NEEDS} button`)).toHaveCount(0)
      // A read set out since, and answered, brings the window and its control back.
      await setControl(page, 'pass')
      await since.getByRole('button', { name: 'Try again' }).click()
      await expect(page.locator(`${NEEDS} button`).first()).toBeVisible()
      expect(await seenWrites(page), 'no seen write from a retired control').toBe(0)
    })
  }
}

/**
 * The query's observers are told on TanStack's scheduler (notifyManager, a task later by default); the query cache's
 * own listeners are told at once. Holding that scheduler (the app's own module instance, the URL the page loaded) holds
 * every observer delivery, so frames are drawn after the refusal reached the app and before the query tells the view:
 * only what this view keeps from the cache as it changes (sinceRefusedNow, useSyncExternalStore) can hide the window then.
 */
async function holdObserverDelivery(page: Page) {
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .find((name) => name.includes('/.vite/deps/@tanstack_react-query.js'))
    if (!url) throw new Error('the page loaded no @tanstack/react-query module')
    const query: unknown = await import(/* @vite-ignore */ url)
    const manager = query && typeof query === 'object' && 'notifyManager' in query ? query.notifyManager : undefined
    if (!manager || typeof manager !== 'object' || !('setScheduler' in manager)) throw new Error('no notifyManager')
    const set = manager.setScheduler
    if (typeof set !== 'function') throw new Error('no setScheduler')
    const held: (() => void)[] = []
    window.needsHeld = {
      held,
      release: () => {
        Reflect.apply(set, manager, [(cb: () => void) => setTimeout(cb, 0)])
        for (const cb of held.splice(0)) cb()
      },
    }
    Reflect.apply(set, manager, [(cb: () => void) => held.push(cb)])
  })
}

for (const status of [401, 403] as const) {
  test(`needs · semantic, observer delivery held: its own read refused (${status}): frames come after the refusal and before the query tells the view, and none shows a cached need, title, count or action`, async ({
    page,
  }, info) => {
    await page.goto(PAGE)
    const since = page.locator('body')
    await expect(page.locator(`${NEEDS} button`).first()).toBeVisible()
    await observe(page, { status, body: 'malformed' })
    await holdObserverDelivery(page)
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
    // At least a few frames after the refusal reached the app, with every observer delivery still held.
    await expect.poll(() => page.evaluate(() => window.needsTrace?.postFrames ?? 0)).toBeGreaterThanOrEqual(5)
    const held = await page.evaluate(() => window.needsHeld?.held.length ?? 0)
    const trace = await readTrace(page)
    await info.attach(`needs-held-trace-${status}.json`, {
      body: JSON.stringify({ ...trace, heldDeliveries: held }, null, 1),
      contentType: 'application/json',
    })
    expect(
      trace.denials.some((d) => d.path === '/api/v1/me/needs'),
      'its own read refused, as the client saw',
    ).toBe(true)
    expect(held, 'observer deliveries held past the refusal').toBeGreaterThan(0)
    expect(trace.postFrames).toBeGreaterThanOrEqual(5)
    expect(trace.hits, 'a cached need, title, count or action while the query had not told the view').toEqual([])
    await page.evaluate(() => window.needsHeld?.release())
    await expect(since).toContainText('Couldn’t read what needs you.')
    expect(await seenWrites(page), 'no seen write from a retired control').toBe(0)
  })
}

// The same boundary on the phone project (playwright.config.ts: 390x844, touch): one case, the 403 with a delayed body.
test(`needs @phone · semantic: its own read refused (403, delayed body), on a phone: from the client's first sight of it, no frame shows a cached need, title, count or action; a 503 after does not bring them back, a read since does, and reading never marks seen`, async ({
  page,
}, info) => {
  const status = 403 as const
  const body = 'delayed' as const
  await page.goto(PAGE)
  const since = page.locator('body')
  await expect(page.locator(`${NEEDS} button`).first()).toBeVisible()
  await observe(page, { status, body })
  // The window is read again (the page comes back into view): refused.
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  const trace = await sampleAfterRefusal(page)
  await info.attach(`needs-trace-${status}-${body}.json`, {
    body: JSON.stringify(trace, null, 1),
    contentType: 'application/json',
  })
  expect(
    trace.denials.some((d) => d.path === '/api/v1/me/needs'),
    'its own read refused, as the client saw',
  ).toBe(true)
  expect(trace.postFrames, 'frames since the client saw the refusal').toBeGreaterThan(10)
  expect(trace.hits, 'a cached need, title, count or action after the client saw the refusal').toEqual([])
  // A later ordinary failure does not bring the old window back.
  await setControl(page, '503')
  await since.getByRole('button', { name: 'Try again' }).click()
  await expect(since).toContainText('Couldn’t read what needs you.')
  await expect(page.locator(`${NEEDS} button`)).toHaveCount(0)
  // A read set out since, and answered, brings the window and its control back.
  await setControl(page, 'pass')
  await since.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator(`${NEEDS} button`).first()).toBeVisible()
  expect(await seenWrites(page), 'no seen write from a retired control').toBe(0)
})

/**
 * CI's loaded runners drew Home at 8 to 15 frames a second while its script ran freely
 * (docs/plans/ci-home-needs-refusal-flake.md). From here on every animation-frame callback the page asks for (the
 * trace's, Home's light) runs at the first frame `ms` after it was asked, so every run meets that rate; the main thread
 * is not held.
 */
const slowFrames = (page: Page, ms: number) =>
  page.evaluate((gap) => {
    const raf = window.requestAnimationFrame.bind(window)
    const caf = window.cancelAnimationFrame.bind(window)
    const pending = new Map<number, { timer?: number; frame?: number }>()
    let seq = 0
    window.requestAnimationFrame = (callback) => {
      const id = ++seq
      const entry: { timer?: number; frame?: number } = {}
      entry.timer = window.setTimeout(() => {
        entry.frame = raf((at) => {
          pending.delete(id)
          callback(at)
        })
      }, gap)
      pending.set(id, entry)
      return id
    }
    window.cancelAnimationFrame = (id) => {
      const entry = pending.get(id)
      pending.delete(id)
      window.clearTimeout(entry?.timer)
      if (entry?.frame !== undefined) caf(entry.frame)
    }
  }, ms)

test(`needs · semantic, slow frames (about 15 a second, as CI drew): its own read refused (403, delayed body): from the client's first sight of it, enough frames are sampled and none shows a cached need, title, count or action`, async ({
  page,
}, info) => {
  await page.goto(PAGE)
  await expect(page.locator(`${NEEDS} button`).first()).toBeVisible()
  await observe(page, { status: 403, body: 'delayed' })
  await slowFrames(page, 50)
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  const trace = await sampleAfterRefusal(page)
  await info.attach('needs-trace-slow-frames.json', {
    body: JSON.stringify(trace, null, 1),
    contentType: 'application/json',
  })
  expect(
    trace.denials.some((d) => d.path === '/api/v1/me/needs'),
    'its own read refused, as the client saw',
  ).toBe(true)
  expect(trace.postFrames, 'frames since the client saw the refusal').toBeGreaterThan(10)
  expect(trace.hits, 'a cached need, title, count or action after the client saw the refusal').toEqual([])
  expect(await seenWrites(page), 'no seen write from a retired control').toBe(0)
})

test('needs · an ordinary failure (503) with no refusal before it keeps the rows read, beside its note', async ({
  page,
}) => {
  await page.goto(PAGE)
  const rows = page.locator(`${NEEDS} button`)
  await expect(rows.first()).toBeVisible()
  const count = await rows.count()
  await observe(page, '503')
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.locator('body')).toContainText('Couldn’t read what needs you.')
  await expect(rows).toHaveCount(count)
  expect(await seenWrites(page)).toBe(0)
})
