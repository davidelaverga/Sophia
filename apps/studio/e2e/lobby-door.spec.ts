import { expect, test, type Locator, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'
import { typeSizes } from './type-sizes.ts'

// The door (docs/plans/lobby-door.md): someone waiting to come in, as the room sees them. On the fixture page; only
// the API is faked, and each check ends by asking the page whether anything reached for it unanswered.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const door = (page: Page) => page.getByRole('complementary', { name: 'Waiting to come in' })
const row = (page: Page) => door(page).getByRole('listitem').first()

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** A control's own plane: transparent when it has none. */
const plane = (b: Locator) => b.evaluate((el) => getComputedStyle(el).backgroundColor)

test('door · it says who is at the door, by name; the row their initial, name and wait; Let in leads', async ({
  page,
}) => {
  await page.goto('/room.html?lobby=waiting')
  await expect(door(page).getByRole('status')).toHaveText('At the door: Fixture guest')
  await expect(row(page).locator('.lobby-face')).toHaveText('F')
  await expect(row(page).locator('.lobby-name')).toHaveText('Fixture guest')
  const letIn = row(page).getByRole('button', { name: 'Let in' })
  const decline = row(page).getByRole('button', { name: 'Decline' })
  expect(await plane(letIn)).toBe('rgb(241, 220, 199)') // filled warm
  expect(await plane(decline)).toBe('rgba(0, 0, 0, 0)')
  // Unboxed: no border round the panel.
  expect(await door(page).evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px')
})

test('door · in the demo, the knock is a minute old, not days', async ({ page }) => {
  await page.goto('/room.html?demo=1&lobby=waiting')
  await expect(door(page).getByRole('status')).toHaveText('At the door: Ana Ruiz')
  await expect(row(page).locator('.lobby-wait')).toHaveText(/^(just now|1 min)$/)
})

test('door @phone · one line for the row, a compact card', async ({ page }) => {
  await page.goto('/room.html?lobby=waiting')
  const [face, letIn] = await Promise.all([
    row(page).locator('.lobby-face').boundingBox(),
    row(page).getByRole('button', { name: 'Let in' }).boundingBox(),
  ])
  if (!face || !letIn) throw new Error('the row is missing')
  expect(Math.abs(face.y + face.height / 2 - (letIn.y + letIn.height / 2))).toBeLessThanOrEqual(4)
  expect((await door(page).boundingBox())?.height ?? 999).toBeLessThanOrEqual(120)
})

test('door · reads at 4.5:1 on the app’s sizes; the dot holds still under reduced motion', async ({ page }) => {
  await page.goto('/room.html?lobby=waiting')
  await expect(row(page)).toBeVisible()
  expect(await lowContrast(page, '.lobby')).toEqual([])
  const sizes = await typeSizes(page, '.lobby')
  for (const s of sizes) expect(['10.5px', '12px', '13px', '14px'], sizes.join(' ')).toContain(s)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const dot = await door(page)
    .locator('.lobby-title')
    .evaluate((el) => getComputedStyle(el, '::before').animationName)
  expect(dot).toBe('none')
})
