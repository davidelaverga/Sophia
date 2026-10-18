import { expect, test, type Page } from '@playwright/test'

// R-391-UPDATES-01 (semantic): Updates' own «since» read refused (401, 403) hides the cached window and Mark as seen from
// the CLIENT's first sight of the refusal status. The page's fetch is wrapped after load; the wrapper answers the next
// «since» reads itself as the control asks (a refusal with a delayed or malformed body, a 503, or the fixture's own
// answer), and stamps each refusal (sequence, path, one performance.now clock) as its Response is handed to the app, with
// nothing awaited between. Every requestAnimationFrame callback from the first stamp records any protected line or
// Mark as seen laid out and visible. This measures DOM render opportunities in rAF callbacks, not composited paint.

const PAGE = '/room.html?demo=1&place=updates'
const SINCE = 'section[aria-labelledby="since-title"]'
const PROTECTED = [`${SINCE} li`, `${SINCE} h4`, `${SINCE} .recap-acts button`]

type Control = 'pass' | 'hold' | '503' | { status: 401 | 403; body: 'delayed' | 'malformed' }
interface Trace {
  denials: { id: number; path: string; at: number }[]
  hits: { afterMs: number; what: string }[]
  frames: number
  /** rAF callbacks after the first refusal reached the app. */
  postFrames: number
  seenWrites: number
  /** «since» reads the page asked for. */
  sinceReads: number
}
declare global {
  interface Window {
    updatesTrace?: Trace & { stop: boolean; control: Control }
    heldDelivery?: { held: (() => void)[]; release: () => void }
    updatesHeld?: (() => void)[]
  }
}

// oxlint-disable-next-line eslint/max-lines-per-function -- one page-side fixture, installed in a single evaluate
async function observe(page: Page, control: Control) {
  await page.evaluate(
    ({ first, selectors }) => {
      const trace: Trace & { stop: boolean; control: Control } = {
        denials: [],
        hits: [],
        frames: 0,
        postFrames: 0,
        seenWrites: 0,
        sinceReads: 0,
        stop: false,
        control: first,
      }
      window.updatesTrace = trace
      let seq = 0
      const inner = window.fetch
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const id = ++seq
        const path = new URL(input instanceof Request ? input.url : String(input), location.href).pathname
        const method = init?.method ?? 'GET'
        if (method === 'PUT' && path.endsWith('/seen')) trace.seenWrites++
        if (!path.endsWith('/since') || method !== 'GET') return inner(input, init)
        trace.sinceReads++
        const c = trace.control
        if (c === 'pass') return inner(input, init)
        if (c === 'hold') return new Promise<void>((r) => window.updatesHeld?.push(r)).then(() => inner(input, init))
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
    if (window.updatesTrace) window.updatesTrace.control = c
  }, control)

const readTrace = (page: Page) =>
  page.evaluate(() => {
    const t = window.updatesTrace
    if (!t) return { denials: [], hits: [], frames: 0, postFrames: 0, seenWrites: 0 }
    t.stop = true
    return { denials: t.denials, hits: t.hits, frames: t.frames, postFrames: t.postFrames, seenWrites: t.seenWrites }
  })

const seenWrites = (page: Page) => page.evaluate(() => window.updatesTrace?.seenWrites ?? -1)

for (const status of [401, 403] as const) {
  for (const body of ['delayed', 'malformed'] as const) {
    test(`updates · semantic: its own read refused (${status}, ${body} body): from the client's first sight of it, no frame shows a cached line or Mark as seen; a 503 after does not bring them back, a read since does, and reading never marks seen`, async ({
      page,
    }, info) => {
      await page.goto(PAGE)
      const since = page.locator(SINCE)
      await expect(since.locator('li').first()).toBeVisible()
      await expect(since.getByRole('button', { name: 'Mark as seen' })).toBeVisible()
      await observe(page, { status, body })
      // The window is read again (the page comes back into view): refused.
      await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
      await expect(since).toContainText('What changed couldn’t be read.')
      await page.waitForTimeout(400)
      const trace = await readTrace(page)
      await info.attach(`updates-trace-${status}-${body}.json`, {
        body: JSON.stringify(trace, null, 1),
        contentType: 'application/json',
      })
      expect(
        trace.denials.some((d) => d.path.endsWith('/since')),
        'its own read refused, as the client saw',
      ).toBe(true)
      expect(trace.frames).toBeGreaterThan(10)
      expect(trace.hits, 'a cached line or Mark as seen after the client saw the refusal').toEqual([])
      // A later ordinary failure does not bring the old window back.
      await setControl(page, '503')
      await since.getByRole('button', { name: 'Try again' }).click()
      await expect(since).toContainText('What changed couldn’t be read.')
      await expect(since.locator('li')).toHaveCount(0)
      await expect(since.getByRole('button', { name: 'Mark as seen' })).toHaveCount(0)
      // A read set out since, and answered, brings the window and its control back.
      await setControl(page, 'pass')
      await since.getByRole('button', { name: 'Try again' }).click()
      await expect(since.locator('li').first()).toBeVisible()
      await expect(since.getByRole('button', { name: 'Mark as seen' })).toBeVisible()
      expect(await seenWrites(page), 'reading never marks seen').toBe(0)
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
    window.heldDelivery = {
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
  test(`updates · semantic, observer delivery held: its own read refused (${status}): frames come after the refusal and before the query tells the view, and none shows a cached line or Mark as seen`, async ({
    page,
  }, info) => {
    await page.goto(PAGE)
    const since = page.locator(SINCE)
    await expect(since.locator('li').first()).toBeVisible()
    await observe(page, { status, body: 'malformed' })
    await holdObserverDelivery(page)
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
    // At least a few frames after the refusal reached the app, with every observer delivery still held.
    await expect.poll(() => page.evaluate(() => window.updatesTrace?.postFrames ?? 0)).toBeGreaterThanOrEqual(5)
    const held = await page.evaluate(() => window.heldDelivery?.held.length ?? 0)
    const trace = await readTrace(page)
    await info.attach(`updates-held-trace-${status}.json`, {
      body: JSON.stringify({ ...trace, heldDeliveries: held }, null, 1),
      contentType: 'application/json',
    })
    expect(
      trace.denials.some((d) => d.path.endsWith('/since')),
      'its own read refused, as the client saw',
    ).toBe(true)
    expect(held, 'observer deliveries held past the refusal').toBeGreaterThan(0)
    expect(trace.postFrames).toBeGreaterThanOrEqual(5)
    expect(trace.hits, 'a cached line or Mark as seen while the query had not told the view').toEqual([])
    await page.evaluate(() => window.heldDelivery?.release())
    await expect(since).toContainText('What changed couldn’t be read.')
    expect(await seenWrites(page), 'reading never marks seen').toBe(0)
  })
}

// #391 4305867088: a refusal cached in the account's query cache is not recorded again when Updates mounts anew. The
// remount's own first read (held until every effect has run, then answered 200) shows the digest and Mark as seen again,
// with no second read, no Try again and no seen write.
test('updates · a remount after a refusal: its first read answers 200 and restores the window, no second read or retry', async ({
  page,
}) => {
  await page.goto(PAGE)
  const since = page.locator(SINCE)
  await expect(since.locator('li').first()).toBeVisible()
  await observe(page, { status: 403, body: 'malformed' })
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(since).toContainText('What changed couldn’t be read.')
  const views = page.getByRole('navigation', { name: 'Project views' })
  await views.getByRole('link', { name: 'Goals' }).click()
  await expect(page.locator(SINCE)).toHaveCount(0)
  await page.evaluate(() => {
    window.updatesHeld = []
    if (window.updatesTrace) {
      window.updatesTrace.control = 'hold'
      window.updatesTrace.sinceReads = 0
    }
  })
  await views.getByRole('link', { name: 'Updates' }).click()
  // The remount's reads (its query's, and again once the room's cursor arrives) are held while every effect runs.
  await expect.poll(() => page.evaluate(() => window.updatesHeld?.length ?? 0)).toBeGreaterThan(0)
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 200))))
  const held = await page.evaluate(() => {
    if (window.updatesTrace) window.updatesTrace.control = 'pass'
    const pending = window.updatesHeld?.splice(0) ?? []
    for (const release of pending) release()
    return pending.length
  })
  await expect(page.locator(SINCE).locator('li').first()).toBeVisible()
  await expect(page.locator(SINCE).getByRole('button', { name: 'Mark as seen' })).toBeVisible()
  await expect(page.locator(SINCE).getByRole('button', { name: 'Try again' })).toHaveCount(0)
  // No read after the held ones: no refetch, no retry.
  expect(await page.evaluate(() => window.updatesTrace?.sinceReads)).toBe(held)
  expect(await seenWrites(page)).toBe(0)
})
