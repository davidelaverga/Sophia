import { expect, test, type Locator, type Page } from '@playwright/test'
import { contrastOf } from './contrast.ts'

// What waits on you, counted on the project's views (docs/plans/needs-you-in-project.md; informe-pasada-3 §5 item 8):
// the numbers the tab's title already sums, each beside the view where it is answered, with words the app already
// says. Every name is synthetic.

const TASKS = 'Tasks, 1 waiting on you'

const nav = (page: Page) => page.getByRole('navigation', { name: 'Project views' })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('needs you · a decision waiting on you counts on Tasks, and goes once answered', async ({ page }) => {
  await page.goto('/work.html?viewer=davide')
  await expect(page).toHaveTitle('(1) Fixture project · Sophia')
  const tasks = nav(page).getByRole('link', { name: TASKS })
  await expect(tasks).toBeVisible()
  await expect(tasks.locator('.view-count')).toHaveText('1')
  const ask = page.getByRole('region', { name: 'Davide decides' }).first()
  await ask.getByRole('group', { name: 'Your choice' }).getByRole('button', { name: 'Ship it now' }).click()
  await expect(ask.getByRole('status')).toContainText('Your choice is recorded')
  await page.evaluate(() => window.workFixture?.settle?.('d1'))
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await expect(nav(page).getByRole('link', { name: 'Tasks', exact: true })).toBeVisible()
  await expect(nav(page).locator('.view-count')).toHaveCount(0)
})

test('needs you · nothing waiting shows no number', async ({ page }) => {
  await page.goto('/work.html')
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await expect(nav(page).getByRole('link', { name: 'Tasks', exact: true })).toBeVisible()
  await expect(nav(page).locator('.view-count')).toHaveCount(0)
})

test('needs you · a request in your tools counts on Resources', async ({ page }) => {
  await page.goto('/resources.html?viewer=davide')
  await expect(page).toHaveTitle('(1) Fixture project · Sophia') // Davide's Claude Code waits on him
  await expect(nav(page).getByRole('link', { name: 'Resources, 1 waiting on you' })).toBeVisible()
  await page.evaluate(() => window.resourcesFixture?.addRequest?.())
  const resources = nav(page).getByRole('link', { name: 'Resources, 2 waiting on you' })
  await expect(resources).toBeVisible()
  await expect(resources.locator('.view-count')).toHaveText('2')
})

test('needs you · at phone width the number stands inside its link, and the page keeps its width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/work.html?viewer=davide')
  const tasks = nav(page).getByRole('link', { name: TASKS })
  await expect(tasks).toBeInViewport()
  const [link, count] = await Promise.all([tasks.boundingBox(), tasks.locator('.view-count').boundingBox()])
  expect(link && count).toBeTruthy()
  if (!link || !count) return
  expect(count.x).toBeGreaterThanOrEqual(link.x)
  expect(count.x + count.width).toBeLessThanOrEqual(link.x + link.width + 0.5)
  expect(count.y).toBeGreaterThanOrEqual(link.y)
  expect(count.y + count.height).toBeLessThanOrEqual(link.y + link.height + 0.5)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})

/** A view's link in sight and clear of the fades (18 % of the row at each end that hides more: ViewNav's FADE). */
const clear = (link: Locator) =>
  link.evaluate((el) => {
    const box = el.parentElement?.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    if (!box) return false
    const fade = box.width * 0.18
    const moreStart = el.parentElement?.hasAttribute('data-more-start') ?? false
    const moreEnd = el.parentElement?.hasAttribute('data-more-end') ?? false
    return r.left >= box.left + (moreStart ? fade : 0) - 1 && r.right <= box.right - (moreEnd ? fade : 0) + 1
  })

// Luis 2026-11-16: #233 wins on a narrow row. The current view always stands clear of the fades; a counted one is
// brought clear too when both fit, else it may sit under a fade (the tab's title still counts it).
test('needs you · on a phone, the current view stays clear of the fades with a count elsewhere', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/work.html?viewer=davide&toolsWaiting=1')
  const current = nav(page).getByRole('link', { name: TASKS })
  await expect(current).toHaveAttribute('aria-current', 'page')
  await expect(nav(page).getByRole('link', { name: 'Resources, 1 waiting on you' })).toHaveCount(1)
  await expect.poll(() => clear(current)).toBe(true)
})

test('needs you · where both fit, a count on a view out of sight is brought clear, the current view too', async ({
  page,
}) => {
  await page.setViewportSize({ width: 480, height: 812 })
  await page.goto('/work.html?viewer=davide&toolsWaiting=1')
  const current = nav(page).getByRole('link', { name: TASKS })
  const resources = nav(page).getByRole('link', { name: 'Resources, 1 waiting on you' })
  await expect(current).toHaveAttribute('aria-current', 'page')
  await expect.poll(() => clear(resources)).toBe(true)
  expect(await clear(current)).toBe(true)
})

test('needs you · at 1280 with both counts, the row stands whole and the project’s name reads whole', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/work.html?viewer=davide&toolsWaiting=1')
  await expect(nav(page).locator('.view-count')).toHaveCount(2)
  const seen = await page.evaluate(() => {
    const row = document.querySelector('.view-nav')
    // The name's own text: cut, it ends in an ellipsis (its button's -6 px margins overhang the box by design).
    const name = document.querySelector('.project-name-text')
    return {
      page: document.documentElement.scrollWidth,
      row: row ? row.scrollWidth - row.clientWidth : -1,
      name: name ? { shown: name.clientWidth, whole: name.scrollWidth } : null,
    }
  })
  console.log(`1280 · row overflow ${String(seen.row)} px; name ${JSON.stringify(seen.name)}`)
  expect(seen.page).toBeLessThanOrEqual(1280)
  expect(seen.row).toBe(0)
  expect(seen.name).not.toBeNull()
  expect(seen.name?.shown).toBeGreaterThanOrEqual(seen.name?.whole ?? Infinity)
})

/**
 * Each number's ink and its grounds up to the bar, then the darkest content that can scroll under the translucent bar
 * (black): what it reads at whatever is under the bar.
 */
const seenOf = (page: Page) =>
  nav(page)
    .locator('.view-count')
    .evaluateAll((els) =>
      els.map((el) => {
        const grounds: string[] = []
        let opacity = 1
        for (let up: Element | null = el; up; up = up.parentElement) {
          opacity *= parseFloat(getComputedStyle(up).opacity)
          grounds.push(getComputedStyle(up).backgroundColor)
          if (up.classList.contains('topbar')) break
        }
        grounds.push('rgb(0, 0, 0)')
        const s = getComputedStyle(el)
        return { words: el.textContent, ink: s.color, opacity, grounds, size: parseFloat(s.fontSize) }
      }),
    )

for (const theme of ['dark', 'light'] as const) {
  test(`needs you · every number reads at 4.5:1 or more on ${theme === 'light' ? 'paper' : 'the dark room'}, dark content under the bar`, async ({
    page,
  }) => {
    await page.goto(`/work.html?viewer=davide&toolsWaiting=1&theme=${theme}`)
    await expect(nav(page).locator('.view-count')).toHaveCount(2)
    const ratios = (await seenOf(page)).map((seen) => contrastOf(seen))
    console.log(`contrast · ${theme}: ${ratios.map((r) => r.toFixed(2)).join(', ')}`)
    expect(ratios).toHaveLength(2)
    for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5)
  })
}
