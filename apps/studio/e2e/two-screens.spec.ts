import { expect, test, type Page } from '@playwright/test'

// Two screens shared at once (docs/plans/two-screens.md): the newest takes the stage, and «Also sharing» offers the
// other, this viewer's choice alone. Every name is synthetic.

const stage = (page: Page) => page.locator('.screen-main')
const also = (page: Page) => page.getByRole('group', { name: 'Also sharing' })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('screens · two shared at once: the newest is on the stage, the other a press away', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&video=screens')
  await expect(stage(page).locator('figcaption')).toContainText('Lucía’s screen')
  await also(page).getByRole('button', { name: 'Show Marco’s screen' }).click()
  await expect(stage(page).locator('figcaption')).toContainText('Marco’s screen')
  await expect(also(page).getByRole('button', { name: 'Show Lucía’s screen' })).toBeVisible()
})

test('screens · one shared: nothing else is offered', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&video=screen')
  await expect(stage(page).locator('figcaption')).toContainText('Marco’s screen')
  await expect(also(page)).toHaveCount(0)
})

test('screens · the focus stays on the offer, and a guest’s screen is offered as one (Codex P2s on #358)', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&video=screens&guest=1')
  await also(page).getByRole('button', { name: 'Show Marco’s screen' }).click()
  await expect(also(page).getByRole('button', { name: 'Show Lucía’s screen · guest' })).toBeFocused()
})
