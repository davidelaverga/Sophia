// The room on a phone (docs/plans/room-phone-floor.md): who holds the floor is said under their name, other roles stay
// hidden; at the door, Decline is as tall as Let in.
import { expect, test, type Page } from '@playwright/test'

const role = (page: Page, name: string) => page.locator('.presence', { hasText: name }).locator('.role')

test('@phone · room · who holds the floor is said under their name, other roles stay hidden', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  // Marco holds the floor while Lucía speaks.
  await page.goto('/room.html?demo=1&call=on&people=3&floor=1&speaking=2')
  await expect(role(page, 'Marco')).toBeVisible()
  await expect(role(page, 'Marco')).toHaveText('has the floor')
  await expect(role(page, 'Lucía')).toBeHidden()
})

for (const width of [1440, 390]) {
  test(`room · at ${String(width)} px, Decline is as tall as Let in`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/room.html?demo=1&call=on&people=2&lobby=waiting')
    const decline = page.getByRole('button', { name: 'Decline', exact: true })
    const admit = page.getByRole('button', { name: 'Let in' })
    await expect(decline).toBeVisible()
    const [d, a] = await Promise.all([decline.boundingBox(), admit.boundingBox()])
    expect(d?.height ?? 0).toBeGreaterThanOrEqual(24)
    expect(Math.abs((d?.height ?? 0) - (a?.height ?? 0))).toBeLessThanOrEqual(0.5)
  })
}
