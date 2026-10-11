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
