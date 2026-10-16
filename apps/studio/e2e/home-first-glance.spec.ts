// Home at first glance (docs/plans/home-first-glance.md): the greeting at its own display leading, the projects inside
// a laptop's screen, your notes in the section's head, and a row that joins saying so at rest.
import { expect, test, type Page } from '@playwright/test'

const PAGE = '/home.html'

/** Each greeting line's box against its size: the line's height over the font's size. */
const greetingLeading = (page: Page) =>
  page.locator('.hw-hello > span').evaluateAll((spans) =>
    spans.map((s) => {
      const cs = getComputedStyle(s)
      return s.getBoundingClientRect().height / parseFloat(cs.fontSize)
    }),
  )

test('home · the greeting keeps its display leading, line by line', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(PAGE)
  const ratios = await greetingLeading(page)
  expect(ratios).toHaveLength(2)
  for (const r of ratios) expect(r).toBeCloseTo(1.02, 1)
})

test('@phone · home · the greeting keeps its display leading on a phone too', async ({ page }) => {
  await page.goto(PAGE)
  for (const r of await greetingLeading(page)) expect(r).toBeCloseTo(1.02, 1)
})

for (const needs of ['', '?needs=some']) {
  test(`home · at 1440×900${needs ? ' with what needs you' : ''}, every project row is inside the screen`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${PAGE}${needs}`)
    const last = page.getByRole('list', { name: 'Your projects' }).getByRole('button').last()
    await expect(last).toContainText('All 4')
    const inside = await page.locator('.c-home').evaluate((scroller, rowSel) => {
      const row = scroller.querySelector(rowSel)?.getBoundingClientRect()
      const view = scroller.getBoundingClientRect()
      return row ? scroller.scrollTop === 0 && row.bottom <= view.top + scroller.clientHeight + 0.5 : false
    }, '[aria-label="Your projects"] > li:last-child button')
    expect(inside).toBe(true)
  })
}

test('home · your notes are a press in the head of «You and Sophia», not a row of their own', async ({ page }) => {
  await page.goto(PAGE)
  const section = page.locator('.hw-you')
  const list = page.getByRole('list', { name: 'You and Sophia' })
  await expect(list.getByRole('button')).toHaveCount(1)
  const notes = section.getByRole('button', { name: /3 notes/ })
  await expect(notes).toBeVisible()
  // In the head: on the label's line, to its right.
  const [label, press] = await Promise.all([section.locator('.hw-label').boundingBox(), notes.boundingBox()])
  expect(label && press ? Math.abs(label.y + label.height / 2 - (press.y + press.height / 2)) <= 4 : false).toBe(true)
  expect(label && press ? press.x > label.x + label.width : false).toBe(true)
  await notes.click()
  expect(await page.evaluate(() => window.homeFixture?.pressed ?? [])).toEqual(['notes'])
})

test('home · a row that joins says «Join the room» at rest on a desk, not only under the pointer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${PAGE}?projects=live`)
  await page.mouse.move(0, 0)
  const row = page.getByRole('list', { name: 'Your projects' }).getByRole('button', { name: /Pitch deck/ })
  const words = row.getByText('Join the room')
  await expect.poll(async () => (await words.boundingBox())?.width ?? 0).toBeGreaterThan(40)
  await expect(words).toBeVisible()
  // A row that opens keeps its words for a screen reader and its arrow for the pointer.
  const open = page
    .getByRole('list', { name: 'Your projects' })
    .locator('[data-act="open"]')
    .first()
    .locator('.hw-go-words')
  expect((await open.boundingBox())?.width ?? 0).toBeLessThanOrEqual(1)
})
