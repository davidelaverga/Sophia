import { expect, test, type Page } from '@playwright/test'

// The dock never takes a second row (docs/plans/dock-fold.md): where even its icons don't fit, Share your screen, React,
// Raise hand and the picture-in-picture wait behind More controls, which opens them in a tray above it. Every name and
// stream is synthetic, and the page says it is a fixture.

const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const more = (page: Page) => dock(page).getByRole('button', { name: 'More controls', exact: true })
const tray = (page: Page) => dock(page).getByRole('group', { name: 'More controls' })
const EXTRAS = ['Share your screen', 'React', 'Raise hand', 'Keep the call in view']

/** Sophia speaking (Stop speaking, End) and the chat open beside the stage: 880 px leaves the dock too little room. */
async function enter(page: Page, width: number, panel: boolean) {
  await page.setViewportSize({ width, height: 800 })
  await page.goto('/room.html?call=on&people=2&floor=1&sophia=speaking')
  await expect(page.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  if (panel) await page.locator('.panel-toggles [data-panel="chat"]').click()
}

/** The middles of the dock's own row as drawn (not the tray above it, folded): one value is one row. */
const rows = (page: Page) =>
  dock(page)
    .getByRole('button')
    .evaluateAll(
      (all) =>
        new Set(
          all
            .filter((b) => !(b.closest('.dock-tray') && b.closest('.dock[data-fold]')))
            .map((b) => b.getBoundingClientRect())
            .filter((r) => r.width > 0)
            .map((r) => Math.round(r.top + r.height / 2)),
        ).size,
    )

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('dock fold · where its icons would wrap, the extras wait behind More controls and the dock keeps one row', async ({
  page,
}) => {
  await enter(page, 880, true)
  await expect(more(page)).toBeVisible()
  for (const name of EXTRAS) await expect(dock(page).getByRole('button', { name, exact: true })).toBeHidden()
  expect(await rows(page)).toBe(1)
})

test('dock fold · More controls opens them above the dock, the focus on the first; Escape closes it and comes back', async ({
  page,
}) => {
  await enter(page, 880, true)
  await more(page).click()
  await expect(more(page)).toHaveAttribute('aria-expanded', 'true')
  for (const name of EXTRAS) await expect(tray(page).getByRole('button', { name, exact: true })).toBeVisible()
  await expect(tray(page).getByRole('button', { name: 'Share your screen' })).toBeFocused()
  const above = await page.evaluate(() => {
    const t = document.querySelector('.dock-tray')?.getBoundingClientRect()
    const d = document.querySelector('.dock')?.getBoundingClientRect()
    return t && d ? d.top - t.bottom : Number.NaN
  })
  expect(above).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  await expect(tray(page)).toBeHidden()
  await expect(more(page)).toBeFocused()
})

test('dock fold · React’s menu in the tray closes on its own Escape first, then the tray', async ({ page }) => {
  await enter(page, 880, true)
  await more(page).click()
  await tray(page).getByRole('button', { name: 'React', exact: true }).click()
  await expect(page.getByRole('menu', { name: 'React' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu', { name: 'React' })).toBeHidden()
  await expect(tray(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tray(page)).toBeHidden()
})

test('dock fold · a hand raised from the tray keeps it open; closed, More controls carries a dot while it is up', async ({
  page,
}) => {
  await enter(page, 880, true)
  const dot = () => more(page).evaluate((b) => getComputedStyle(b, '::after').content)
  expect(await dot()).toBe('none')
  await more(page).click()
  const hand = tray(page).getByRole('button', { name: 'Raise hand', exact: true })
  await hand.click()
  await expect(hand).toHaveAttribute('aria-pressed', 'true')
  await expect(tray(page)).toBeVisible()
  // A press outside, on the stage's empty space between the lenses and the light, closes it.
  await page.mouse.click(250, 230)
  await expect(tray(page)).toBeHidden()
  expect(await dot()).not.toBe('none')
})

test('dock fold · with room again (the window widened), the extras are back in the row and More controls goes', async ({
  page,
}) => {
  await enter(page, 880, true)
  await more(page).click()
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(more(page)).toBeHidden()
  for (const name of EXTRAS) await expect(dock(page).getByRole('button', { name, exact: true })).toBeVisible()
  expect(await rows(page)).toBe(1)
})

test('dock fold · at 1280 with the panel closed, nothing is folded', async ({ page }) => {
  await enter(page, 1280, false)
  await expect(more(page)).toBeHidden()
  for (const name of EXTRAS) await expect(dock(page).getByRole('button', { name, exact: true })).toBeVisible()
})

test('dock fold @phone · seven squares fit 390 px with nothing folded; at 360 the extras fold and the row stays one', async ({
  page,
}) => {
  await enter(page, 390, false)
  await expect(more(page)).toBeHidden()
  await page.setViewportSize({ width: 360, height: 780 })
  await expect(more(page)).toBeVisible()
  expect(await rows(page)).toBe(1)
  await more(page).click()
  await expect(tray(page).getByRole('button', { name: 'React', exact: true })).toBeVisible()
})
