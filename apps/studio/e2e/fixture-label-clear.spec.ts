import { expect, test, type Page } from '@playwright/test'

// The fixture's own label covers none of the app's controls on the pages a presentation opens beside the demo: the
// board and Resources (docs/plans/fixture-label-clear.md). It still says the data is simulated.

const PAGES = [
  ['the board', '/work.html'],
  ['Resources', '/resources.html'],
] as const

/** The app's controls the label's box touches, by their words. */
const covered = (page: Page) =>
  page.evaluate(() => {
    const label = document.querySelector('.fixture-label')?.getBoundingClientRect()
    if (!label || label.width === 0) return []
    return [...document.querySelectorAll('a, button, input, select, textarea, [role="tab"]')]
      .filter((el) => !el.closest('.fixture-label'))
      .filter((el) => {
        const b = el.getBoundingClientRect()
        return (
          b.width > 0 && b.right > label.left && b.left < label.right && b.bottom > label.top && b.top < label.bottom
        )
      })
      .map((el) => el.textContent.trim() || el.getAttribute('aria-label') || el.tagName)
  })

for (const [name, url] of PAGES) {
  for (const phone of [false, true]) {
    test(`label${phone ? ' @phone' : ''} · on ${name}, the fixture's label covers none of the app's controls`, async ({
      page,
    }) => {
      if (phone) await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(url)
      await expect(page.getByRole('navigation', { name: 'Project views' })).toBeVisible()
      // Still there for whoever reads it: the data is simulated.
      await expect(page.locator('.fixture-label')).toContainText('Simulated')
      if (phone) {
        // No corner is free on a phone: a thin line along the top edge, as the demo's, hiding no words.
        const box = await page.locator('.fixture-label').boundingBox()
        expect(box?.height).toBeLessThanOrEqual(4)
        expect(box?.y).toBe(0)
      } else {
        expect(await covered(page)).toEqual([])
      }
    })
  }
}
