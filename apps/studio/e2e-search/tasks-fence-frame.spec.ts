import { expect, test, type Page } from '@playwright/test'

// R tasks sync (controlled room fixture, tasks flag, synthetic people and words; the app's real components, owned task
// reads and QueryClient): after the report's Tasks tab shows its rows, TanStack's observer delivery is held (the app's
// own notifyManager, as fence-frame.spec / updates-refusal.spec do). The report's own task list is read again through
// its owned query function and answers not_found (422); the report's versions and sources stay permitted, so the
// report itself is not refused. With the refusal marker in the page's cache and deliveries still held, no animation
// frame draws a task row or the tab's count; only a refusal read from the cache as it changes can hide them then.

declare global {
  interface Window {
    heldDelivery?: { held: (() => void)[]; release: () => void }
  }
}

const PROJECT = '00000000-0000-4000-8000-0000000000aa'
const REPORT = '00000000-0000-4000-8000-0000000000b1'
const pane = (page: Page) => page.getByRole('complementary', { name: 'Fixture report' })
const tabRows = (page: Page) => pane(page).getByRole('list', { name: 'Tasks' }).getByRole('listitem')

async function holdObserverDelivery(page: Page) {
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .find((name) => /\/deps\/@tanstack_react-query\.js/.test(name))
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

const marker = (page: Page) =>
  page.evaluate(
    ([p, r]) => {
      const at = window.fixture?.fenceOf(['vision', 'tasks-refused', p, r])
      return { refusedAt: typeof at === 'number' ? at : 0, held: window.heldDelivery?.held.length ?? 0 }
    },
    [PROJECT, REPORT] as const,
  )

const frames = (page: Page, n: number) =>
  page.evaluate(
    (count) =>
      new Promise<{ frame: number; held: number; rows: number; tab: string }[]>((resolve) => {
        const out: { frame: number; held: number; rows: number; tab: string }[] = []
        const step = () => {
          const list = document.querySelector('[aria-label="Tasks"].task-rows')
          const tab = [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.startsWith('Tasks'))
          out.push({
            frame: out.length + 1,
            held: window.heldDelivery?.held.length ?? 0,
            rows: list ? list.querySelectorAll('li').length : 0,
            tab: tab?.textContent ?? '(none)',
          })
          if (out.length >= count) resolve(out)
          else requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }),
    n,
  )

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5198',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.heldDelivery?.release()).catch(() => undefined)
})

test('tasks fence frame · the report’s own task list refused while delivery is held: no frame draws a row or count', async ({
  page,
}, info) => {
  await page.goto(`/room.html?call=on&exchange=open&people=3&guest&report=${REPORT}&humantasks=seed`)
  await expect(pane(page).locator('.md p', { hasText: 'The fixture holds.' })).toBeVisible()
  await pane(page)
    .getByRole('tab', { name: /^Tasks/ })
    .click()
  await expect(tabRows(page)).toHaveCount(1) // permitted, cached
  const before = await frames(page, 1)
  await holdObserverDelivery(page)
  await page.evaluate(() => window.fixture?.failReportTasks(true))
  await page.evaluate((r) => window.fixture?.refetch(['vision', 'tasks', r]), REPORT)
  await expect
    .poll(
      async () => {
        const m = await marker(page)
        return m.refusedAt > 0 && m.held > 0
      },
      { timeout: 10_000 },
    )
    .toBe(true)
  const m = await marker(page)
  const trace = await frames(page, 3)
  // The report itself stays permitted: its titled pane is there, no report refusal is said, its fence never written.
  const parts = await page.evaluate((r) => {
    const fence = window.fixture?.fenceOf(['report-fence', r])
    return {
      pane: document.querySelectorAll('aside').length,
      titled: [...document.querySelectorAll('h2')].some((h) => h.textContent.includes('Fixture report')),
      refusedWords: document.body.innerText.includes('This report isn’t available to you.'),
      fence: fence && typeof fence === 'object' && 'refusedAt' in fence ? Number(Reflect.get(fence, 'refusedAt')) : 0,
    }
  }, REPORT)
  const report = parts.titled && !parts.refusedWords && parts.fence === 0
  console.log(`REPORT-PARTS ${JSON.stringify(parts)}`)
  await info.attach('tasks-frames.json', {
    body: JSON.stringify({ before, marker: m, trace, report }, null, 1),
    contentType: 'application/json',
  })
  console.log(
    `TASKS before=${JSON.stringify(before)} marker=${JSON.stringify(m)} frames=${JSON.stringify(trace)} reportStillShown=${String(report)}`,
  )
  expect(report, 'the report itself stays permitted (not a report refusal)').toBe(true)
  expect(trace.every((t) => t.held > 0)).toBe(true)
  expect(trace.filter((t) => t.rows > 0 || /\d/.test(t.tab))).toEqual([])
  // Released and read again, allowed: a genuine fresh own read restores the row.
  await page.evaluate(() => window.heldDelivery?.release())
  await page.evaluate(() => window.fixture?.failReportTasks(false))
  await page.evaluate((r) => window.fixture?.refetch(['vision', 'tasks', r]), REPORT)
  await expect(tabRows(page)).toHaveCount(1)
})
