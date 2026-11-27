import { expect, test, type Page } from '@playwright/test'

// The corner (Chat, People, Brief) keeps its place beside the dock as the panel opens and narrows the stage
// (docs/plans/corner-stays-low.md). Only where even the folded dock wouldn't fit beside it does it go up, and there its
// tips open downwards, clear of the top bar. Every name is synthetic, and the page says it is a fixture.

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

const read = (page: Page) =>
  page.evaluate(() => {
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
    const box = (selector: string) => {
      const { top, bottom, left, right, width, height } =
        document.querySelector(selector)?.getBoundingClientRect() ?? new DOMRect()
      return { top, bottom, left, right, width, height }
    }
    return { corner: box('.stage-corner'), dock: box('.dock'), stage: box('.room-stage') }
  })

test('corner · opening the panel beside a 720 px stage leaves the corner level with the dock', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 })
  await page.goto('/room.html?call=on&people=2&floor=1')
  const chat = page.locator('.stage-corner').getByRole('button', { name: 'Chat', exact: true })
  await expect(chat).toBeVisible()
  const closed = await read(page)
  await chat.click()
  await expect(chat).toHaveAttribute('aria-pressed', 'true')
  // The stage narrows to 720 px (the panel is 380) before anything is read.
  await expect.poll(async () => Math.round((await read(page)).stage.width)).toBe(720)
  await expect.poll(async () => Math.round((await read(page)).corner.top)).toBe(Math.round(closed.corner.top))
  const open = await read(page)
  // On the dock's band, and clear of it.
  expect(Math.abs(open.corner.bottom - open.dock.bottom)).toBeLessThanOrEqual(1)
  expect(open.dock.right).toBeLessThanOrEqual(open.corner.left)
})

test('corner · where even the folded dock would wrap beside it, it goes up and its tips open downwards', async ({
  page,
}) => {
  await page.setViewportSize({ width: 945, height: 800 })
  await page.goto('/room.html?call=on&people=2&floor=1&sophia=speaking&panel=chat')
  await expect(page.locator('.stage-corner')).toBeVisible()
  await expect.poll(async () => (await read(page)).corner.top - (await read(page)).stage.top).toBeLessThan(20)
  const { corner, dock } = await read(page)
  // The dock has the band to itself: one row.
  expect(dock.height).toBeLessThan(56)
  const people = page.locator('.stage-corner').getByRole('button', { name: 'People', exact: true })
  await people.hover()
  const tip = people.locator('.tip')
  await expect(tip).toHaveCSS('opacity', '1')
  const shownTop = await tip.evaluate((el) => el.getBoundingClientRect().top)
  expect(shownTop).toBeGreaterThan(corner.bottom)
})
