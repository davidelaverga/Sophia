// The board says why it is blocked, and the goal's chip how much (docs/plans/board-why-blocked.md), on the Tasks
// fixture page.
import { expect, test, type Page } from '@playwright/test'

const PAGE = '/work.html'
const lane = (page: Page, name: string) => page.locator('.board').first().getByRole('region', { name, exact: true })

test('why · the Blocked lane says what it waits on; the press opens the blocker’s sheet', async ({ page }) => {
  await page.goto(PAGE)
  const blocked = lane(page, 'Blocked')
  await expect(blocked.locator('.lane-why')).toHaveText(/^Waiting on\s*Implement the PDF retry$/)
  await blocked.getByRole('button', { name: 'Implement the PDF retry' }).click()
  await expect(page.getByRole('dialog', { name: 'Implement the PDF retry' })).toBeVisible()
})

test('why · the goal’s chip counts what is blocked; a goal with nothing blocked says nothing of it', async ({
  page,
}) => {
  await page.goto(`${PAGE}?goals=6`)
  const first = page.getByRole('tab', { name: /Reports export to PDF reliably/ })
  await expect(first.locator('.plan-tab-blocked')).toHaveText('1 blocked')
  const fonts = page.getByRole('tab', { name: /Exports keep the report’s fonts/ })
  await expect(fonts.locator('.plan-tab-blocked')).toHaveCount(0)
})

test('why @phone · on a coarse pointer the blockers’ rows keep their reaching targets apart', async ({ page }) => {
  await page.goto(PAGE)
  const why = lane(page, 'Blocked').locator('.lane-why')
  await expect(why).toBeVisible()
  const read = await why.evaluate((el) => {
    const press = el.querySelector('.text-button')
    const reach = press ? getComputedStyle(press, '::after').top : ''
    return { rowGap: parseFloat(getComputedStyle(el).rowGap), reach: Math.abs(parseFloat(reach)) }
  })
  // The target reaches `reach` px past each row's words, above and below: two rows need twice that between them.
  expect(read.reach).toBe(7)
  expect(read.rowGap).toBeGreaterThanOrEqual(2 * read.reach)
})
