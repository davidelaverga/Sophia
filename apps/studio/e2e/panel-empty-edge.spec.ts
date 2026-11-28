import { expect, test, type Page } from '@playwright/test'

/**
 * People before anyone is in the call says so where the panel's tabs start, not against the panel's edge
 * (docs/plans/panel-empty-edge.md; P3-11 of the independent evaluation: the sentence began 1 px from the edge, the
 * tabs 16 px in).
 */
const textStart = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return Math.round(range.getBoundingClientRect().x)
    })

test('fixture · People’s empty sentence starts where the panel’s tabs do', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/room.html?panel=people')
  await expect(page.locator('.side-panel-body > .empty p')).toHaveText('Who’s in the call shows once you join.')
  // Both move with the panel as it arrives: measured together until they agree.
  await expect
    .poll(async () => {
      const [words, tab] = await Promise.all([
        textStart(page, '.side-panel-body > .empty p'),
        textStart(page, 'aside [role="tab"]'),
      ])
      return Math.abs(words - tab)
    })
    .toBeLessThanOrEqual(1)
})
