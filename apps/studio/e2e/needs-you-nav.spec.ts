import { expect, test, type Page } from '@playwright/test'
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

/** The number's ink and the grounds up its tree, for contrastOf. */
const seenOf = (page: Page) =>
  nav(page)
    .locator('.view-count')
    .evaluate((el) => {
      const grounds: string[] = []
      let opacity = 1
      for (let up: Element | null = el; up; up = up.parentElement) {
        opacity *= parseFloat(getComputedStyle(up).opacity)
        grounds.push(getComputedStyle(up).backgroundColor)
      }
      const s = getComputedStyle(el)
      return { words: el.textContent ?? '', ink: s.color, opacity, grounds, size: parseFloat(s.fontSize) }
    })

for (const theme of ['dark', 'light'] as const) {
  test(`needs you · the number reads at 4.5:1 or more on ${theme === 'light' ? 'paper' : 'the dark room'}`, async ({
    page,
  }) => {
    await page.goto(`/work.html?viewer=davide&theme=${theme}`)
    await expect(nav(page).getByRole('link', { name: TASKS })).toBeVisible()
    const ratio = contrastOf(await seenOf(page))
    test.info().annotations.push({ type: 'contrast', description: `${theme}: ${ratio.toFixed(2)}:1` })
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })
}
