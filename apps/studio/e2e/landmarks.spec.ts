import { expect, test } from '@playwright/test'

/**
 * Each place has one main part and one first-level heading, so a screen reader's landmarks and headings reach it
 * (docs/plans/landmarks.md; P2-14 of the independent evaluation): Home's greeting, Personal's «You and Sophia», Work's
 * «Your projects», the room with its project's name in the top bar.
 */
const PLACES = [
  ['Home', '/home.html', /^Good afternoon,\s*Luis\.$/],
  ['Personal', '/personal.html', 'You and Sophia'],
  ['Work', '/work-space.html', 'Your projects'],
  ['the room', '/room.html', 'Fixture project'],
] as const

for (const [place, path, heading] of PLACES) {
  test(`fixture · ${place} has one main part and one first-level heading`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  })
}

test('fixture · the room’s stage and its panel are inside its main part', async ({ page }) => {
  await page.goto('/room.html')
  const main = page.getByRole('main')
  await expect(main.locator('.room-stage')).toHaveCount(1)
  await expect(main.getByRole('navigation', { name: 'Room controls' })).toHaveCount(1)
})
