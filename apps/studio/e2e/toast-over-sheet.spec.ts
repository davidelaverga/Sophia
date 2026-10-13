// A notice never lies over an open sheet (docs/plans/toast-over-sheet.md): on a phone it goes to the top, on a wider
// screen it is centred in what the panel leaves.
import { expect, test, type Page } from '@playwright/test'

/** A notice as the Studio's Toast draws it, shown now: its frame is what is measured. */
const notice = (page: Page) =>
  page.evaluate(() => {
    const toast = document.createElement('div')
    toast.className = 'toast'
    toast.dataset['shown'] = ''
    toast.textContent = 'Deleted. Sophia starts fresh.'
    document.body.append(toast)
  })

const meet = (page: Page) =>
  page.evaluate(() => {
    const t = document.querySelector('.toast')?.getBoundingClientRect()
    const s = document.querySelector('.sheet')?.getBoundingClientRect()
    if (!t || !s) return null
    return !(t.right <= s.left || t.left >= s.right || t.bottom <= s.top || t.top >= s.bottom)
  })

for (const width of [390, 900]) {
  test(`toast · with a sheet open at ${String(width)} px, a notice stands clear of it`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/room.html?demo=1')
    await page.getByRole('button', { name: 'Invite' }).first().click()
    await expect(page.locator('.sheet')).toBeVisible()
    await notice(page)
    // Its entrance (a rise of 8 px) ended.
    await page.waitForTimeout(400)
    expect(await meet(page)).toBe(false)
    await expect(page.locator('.toast')).toBeInViewport()
  })
}

test('toast · with no sheet open, a notice keeps its place at the bottom', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/room.html?demo=1')
  await notice(page)
  await page.waitForTimeout(400)
  const box = await page.locator('.toast').boundingBox()
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(844 / 2)
})
