import { expect, test, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'
import { typeSizes } from './type-sizes.ts'

// Knowledge's third pass (docs/plans/knowledge-quiet.md, K3): one quiet foot per tile, Sophia's credit as her mark,
// More reports as a button. On the fixture page; only the API is faked, and each check ends by asking the page whether
// anything reached for the API beyond what it answers.

test.afterEach(async ({ page }) => {
  const unexpected = await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])
  expect(unexpected, 'requests the fixture did not expect').toEqual([])
})

const tile = (page: Page, title: string) =>
  page.locator('.report-card').filter({ has: page.getByRole('button', { name: title, exact: true }) })

test('quiet · History and Edit share one line at the tile’s foot, not underlined at rest', async ({ page }) => {
  await page.goto('/room.html?place=knowledge')
  const card = tile(page, 'Fixture report')
  const history = card.getByRole('button', { name: 'History and changes' })
  const edit = card.getByRole('button', { name: 'Edit description', exact: true })
  await expect(history).toHaveText('History')
  const [h, e] = await Promise.all([history.boundingBox(), edit.boundingBox()])
  expect(h && e && Math.abs(h.y + h.height / 2 - (e.y + e.height / 2)) <= 1, 'one line').toBe(true)
  expect(h && e && h.x < e.x, 'History first').toBe(true)
  for (const b of [history, edit]) {
    expect(await b.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('none')
  }
})

test('quiet · Sophia’s description opens with her mark, which says so; no line of credit in words', async ({
  page,
}) => {
  await page.goto('/room.html?place=knowledge')
  const card = tile(page, 'Fixture report')
  await expect(card.getByText('A labelled fixture report, as Sophia described it.')).toBeVisible()
  await expect(card.getByText('Description by Sophia', { exact: true })).toBeHidden()
  await expect(card.getByText(/Edited by a member/)).toHaveCount(0) // hers is never said to be a member's
  await expect(card.locator('.report-summary .umbral')).toBeVisible()
  expect(await card.locator('.report-summary').first().ariaSnapshot()).toContain('Description by Sophia')
  // The tile's press lies over her mark too: pressed there, the report opens.
  const box = await card.locator('.report-by').boundingBox()
  if (!box) throw new Error('her mark is missing')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.getByRole('complementary', { name: 'Fixture report' })).toBeVisible()
})

test('quiet · a member’s edit is said in words', async ({ page }) => {
  await page.goto('/room.html?place=knowledge')
  await page.evaluate(() => window.fixture?.describeElsewhere('A teammate’s description'))
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  const card = tile(page, 'Fixture report')
  await expect(card.getByText('A teammate’s description')).toBeVisible()
  await expect(card.getByText(/^Edited by a member/)).toBeVisible()
  await expect(card.locator('.report-summary .umbral')).toHaveCount(0)
})

test('quiet · More reports is a button under the tiles, in their middle, narrower than a tile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/room.html?place=knowledge')
  const more = page.getByRole('button', { name: 'More reports' })
  const [button, tiles, one] = await Promise.all([
    more.boundingBox(),
    page.locator('.report-cards').boundingBox(),
    page.locator('.report-card').first().boundingBox(),
  ])
  if (!button || !tiles || !one) throw new Error('nothing to measure')
  expect(button.width).toBeLessThan(one.width)
  expect(Math.abs(button.x + button.width / 2 - (tiles.x + tiles.width / 2))).toBeLessThanOrEqual(1)
})

test('quiet · the tiles keep to the four type sizes', async ({ page }) => {
  await page.goto('/room.html?place=knowledge&designed=on')
  await expect(tile(page, 'Fixture report').locator('.report-cover iframe')).toBeAttached()
  const sizes = await typeSizes(page, '.report-cards')
  for (const s of sizes) expect(['10.5px', '12px', '13px', '14px'], sizes.join(' ')).toContain(s)
})

test('quiet · every word on the tiles reads: no contrast under 4.5:1', async ({ page }) => {
  await page.goto('/room.html?place=knowledge')
  await page.getByRole('button', { name: 'More reports' }).click()
  await expect(page.locator('.report-cover[data-cover="lines"]')).toHaveCount(2)
  expect(await lowContrast(page, '.report-cards')).toEqual([])
})
