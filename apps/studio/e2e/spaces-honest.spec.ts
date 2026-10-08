import { expect, test, type Page } from '@playwright/test'

// The two spaces say one thing at a time (docs/plans/spaces-honest.md): on a phone the demo's label covers nothing,
// Home counts the notes Personal keeps, a key is shown only where there are keys, and the notes' tip goes once they
// are open. On the fixture pages; only the API is faked.

const HOME = '/home.html?demo=1'
const PERSONAL = '/personal.html?demo=1'

/** What sits under the demo's label: presses, rows and words a person reads. */
const underLabel = (page: Page) =>
  page.evaluate(() => {
    const label = document.querySelector('.fixture-label')?.getBoundingClientRect()
    if (!label) return ['no label']
    return [...document.querySelectorAll('button, a, input, p, li')]
      .filter((el) => !el.closest('.topbar, .places-bar, header') && !el.classList.contains('fixture-label'))
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return (
          r.width > 0 && r.left < label.right && r.right > label.left && r.top < label.bottom && r.bottom > label.top
        )
      })
      .map((el) => el.textContent.trim().slice(0, 30))
  })

for (const url of [HOME, PERSONAL, '/room.html?place=conversations&demo=1', '/join.html?demo=1']) {
  test(`spaces · on a phone the demo’s label is a line along the top edge, over nothing to read: ${url}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(url)
    await page.waitForTimeout(800)
    const box = await page.locator('.fixture-label').boundingBox()
    expect(box?.y).toBe(0)
    expect(box?.height ?? 99).toBeLessThanOrEqual(4)
    expect(await underLabel(page)).toEqual([])
  })
}

test('spaces · Home counts the notes Personal keeps', async ({ page }) => {
  await page.goto(PERSONAL)
  const kept = await page.locator('.c3-notes-toggle').innerText()
  expect(kept).toMatch(/^1 note/)
  await page.goto(HOME)
  await expect(page.getByText('1 note', { exact: true })).toBeVisible()
})

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } })

  test('spaces · no key is shown where there are no keys', async ({ page }) => {
    await page.goto(HOME)
    // There, and not shown: not a key missing from the page.
    await expect(page.locator('.hw-say kbd')).toHaveCount(1)
    await expect(page.locator('.hw-say kbd')).toBeHidden()
  })
})

test('spaces · a pointer’s Home still shows the key to start writing', async ({ page }) => {
  await page.goto(HOME)
  await expect(page.locator('.hw-say kbd')).toHaveText('/')
})

test('spaces · open, the notes’ press keeps no tip over the panel', async ({ page }) => {
  await page.goto(PERSONAL)
  const notes = page.locator('.c3-notes-toggle')
  await notes.hover()
  await expect(notes.locator('.tip')).toHaveCSS('opacity', '1')
  await notes.click()
  await expect(notes).toHaveAttribute('aria-pressed', 'true')
  await expect(notes.locator('.tip')).toBeHidden()
})
