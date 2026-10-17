// What production offers, measured on a fixture page (docs/plans/prod-honesty.md): `?vision=off` turns the vision flag
// off for one page. One lens is no choice: no lens bar, no palette row, no key, and an address naming another lens
// opens Converse. Under the flag the three lenses stay. Every name is synthetic.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const palette = (page: Page) => page.getByRole('dialog', { name: 'Commands' })
const index = (page: Page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('production · one lens is no choice: no bar, no palette row, no key (prod-honesty.md)', async ({ page }) => {
  await page.goto('/room.html?vision=off')
  await drawn(page, DRAWN.room)
  await expect(page.locator('.lens-bar')).toHaveCount(0)
  await expect(page.getByRole('tablist', { name: 'Your view' })).toHaveCount(0)
  await page.keyboard.press('Control+k')
  await expect(palette(page)).toBeVisible()
  expect((await palette(page).getByRole('option').allInnerTexts()).join('\n')).not.toMatch(/lens/i)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+/')
  await expect(index(page)).toBeVisible()
  expect((await index(page).locator('.keys-list li').allInnerTexts()).join('\n')).not.toMatch(/lens/i)
  await page.keyboard.press('Escape')
  await expect(index(page)).toHaveCount(0)
  // The lenses' keys do nothing: no «coming» card, and the body is no tab's panel.
  await page.keyboard.press('2')
  await page.keyboard.press('3')
  await expect(page.locator('.coming')).toHaveCount(0)
  await expect(page.locator('#lens-stage')).not.toHaveAttribute('role', 'tabpanel')
})

test('production · an address naming Explore opens Converse, and the address says so', async ({ page }) => {
  await page.goto('/room.html?vision=off&lens=explore')
  await drawn(page, DRAWN.room)
  await expect(page.locator('.coming')).toHaveCount(0)
  await expect.poll(() => new URL(page.url()).searchParams.get('lens')).toBe('converse')
})

test('under the flag · the three lenses stay, their bar and their keys', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await expect(page.getByRole('tablist', { name: 'Your view' }).getByRole('tab')).toHaveCount(3)
  await page.keyboard.press('2')
  await expect(page.locator('.coming')).toBeVisible()
  await expect(page.locator('#lens-stage')).toHaveAttribute('role', 'tabpanel')
})
