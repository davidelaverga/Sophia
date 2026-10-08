import { expect, test, type Locator, type Page } from '@playwright/test'

// Knowledge says one thing at a time (docs/plans/knowledge-honest.md): the head of a designed page names its design
// check, not «reviewed» above «Not reviewed yet.»; one version is the current one; a designed report opens as the page
// its card shows, from its title and its History too; the demo's label sits clear of the app's controls, and the demo's
// Conversations read. On the fixture page; only the API is faked.

const KNOWLEDGE = '/room.html?place=knowledge&demo=1'
const pane = (page: Page) => page.locator('.report-pane:not([hidden])')
const first = (page: Page) => page.locator('.report-card').first()

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

type Box = { x: number; y: number; width: number; height: number }
const meets = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

async function boxesOf(all: Locator): Promise<Box[]> {
  const boxes: Box[] = []
  for (const one of await all.all()) {
    const box = await one.boundingBox()
    if (box && box.width > 0) boxes.push(box)
  }
  return boxes
}

test('honest · a designed page’s head names its design check; the team’s review stays its own line', async ({
  page,
}) => {
  await page.goto(KNOWLEDGE)
  await first(page)
    .getByRole('button', { name: /, HTML page$/ })
    .click()
  await expect(pane(page).locator('.report-meta')).toHaveText(/^HTML · v2 · design checked$/)
  await expect(pane(page).getByText('Not reviewed yet.')).toBeVisible()
  await expect(pane(page).locator('.report-meta')).not.toContainText(/\breviewed\b/)
})

test('honest · one version is the current one: the newest', async ({ page }) => {
  await page.goto(KNOWLEDGE)
  await first(page).getByRole('button', { name: 'History and changes' }).click()
  const versions = pane(page).locator('.report-version')
  await expect(versions).toHaveCount(2)
  await expect(versions.nth(0)).toContainText('Current')
  await expect(versions.nth(1)).not.toContainText('Current')
})

const html = (page: Page) => pane(page).getByRole('group', { name: 'Format' }).getByRole('button', { name: 'HTML' })

test('honest · a designed report opens as its page from its title, as from its cover', async ({ page }) => {
  await page.goto(KNOWLEDGE)
  await first(page).locator('.report-card-title').click()
  await expect(html(page)).toHaveAttribute('aria-pressed', 'true')
})

test('honest · a designed report opens as its page from its History too', async ({ page }) => {
  await page.goto(KNOWLEDGE)
  await first(page).getByRole('button', { name: 'History and changes' }).click()
  await expect(pane(page).getByRole('tab', { name: /History/ })).toHaveAttribute('aria-selected', 'true')
  await expect(html(page)).toHaveAttribute('aria-pressed', 'true')
})

// The demo's pages with the most at the bottom: Knowledge's tiles, the room's dock and door, Personal's composer.
const DEMO_PAGES = [
  ['Knowledge', KNOWLEDGE],
  ['the room', '/room.html?demo=1'],
  ['Personal', '/personal.html?demo=1'],
] as const

for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const) {
  for (const [name, url] of DEMO_PAGES) {
    test(`honest · on ${name}, the demo’s label sits clear of the app’s bars and lets every press through at ${String(width)} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await page.goto(url)
      const label = page.locator('.fixture-label')
      await expect(label).toBeVisible()
      await page.waitForTimeout(800) // the page's own bars settle
      const box = await label.boundingBox()
      if (!box) throw new Error('the demo’s label is not on screen')
      // Over the page's content it takes no press, and a screen reader still reads what it says.
      await expect(label).toHaveCSS('pointer-events', 'none')
      await expect(label).toHaveText('Demo · simulated data')
      // On a phone no corner is free (spaces-honest.spec.ts): a thin line along the top edge, over nothing to read.
      if (width <= 600) {
        expect(box.y).toBe(0)
        expect(box.height).toBeLessThanOrEqual(4)
        return
      }
      // The bars, the views, the room's controls and its door, Personal's composer: never under it.
      const chrome = await boxesOf(
        page
          .locator(
            '.topbar, nav[aria-label="Project views"], .dock, .dock button, .topbar button, .topbar a, .ps-composer',
          )
          .or(page.getByRole('button', { name: 'Join the room' })),
      )
      expect(chrome.length).toBeGreaterThan(0)
      for (const b of chrome) expect(meets(box, b), JSON.stringify(b)).toBe(false)
    })
  }
}

test('honest · the demo’s Conversations read, with no flag of their own', async ({ page }) => {
  await page.goto('/room.html?place=conversations&demo=1')
  const list = page.getByRole('region', { name: 'All conversations' })
  await expect(list.getByRole('listitem').first()).toBeVisible()
  await expect(page.getByText(/can’t be read now|can't be read now/)).toHaveCount(0)
})

test('honest · in the demo, Conversations open from the views bar', async ({ page }) => {
  await page.goto(KNOWLEDGE)
  await page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Conversations' }).click()
  await expect(page.getByRole('region', { name: 'All conversations' }).getByRole('listitem').first()).toBeVisible()
})

test('honest · on a phone the pane’s tabs keep one line each and the format switch stays on screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(KNOWLEDGE)
  await first(page)
    .getByRole('button', { name: /, HTML page$/ })
    .click()
  const tabs = pane(page).getByRole('tab')
  await expect(tabs).toHaveCount(4)
  // The lines a tab's words take: the distinct tops of their boxes.
  const lines = await tabs.evaluateAll((all) =>
    all.map((t) => {
      const range = document.createRange()
      range.selectNodeContents(t)
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
    }),
  )
  expect(lines).toEqual([1, 1, 1, 1])
  // Measured once the pane has slid in.
  const format = pane(page).getByRole('group', { name: 'Format' })
  await expect
    .poll(async () => {
      const b = await format.boundingBox()
      return b ? b.x >= 0 && b.x + b.width <= 390 : false
    })
    .toBe(true)
})
