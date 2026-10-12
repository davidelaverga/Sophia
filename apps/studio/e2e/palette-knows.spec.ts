// The palette knows (docs/plans/palette-knows.md): with nothing typed, what waits on the viewer comes first («For you»),
// then the commands run last («Recent»), then the rest by group.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const palette = (page: Page) => page.getByRole('dialog', { name: 'Commands' })
const rows = (page: Page) => palette(page).getByRole('option')

async function openPalette(page: Page) {
  await page.keyboard.press('ControlOrMeta+k')
  await expect(palette(page)).toBeVisible()
}

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('palette · on the board the first rows are «For you»: the viewer’s decision, then the task waiting for them', async ({
  page,
}) => {
  // The board's page with ⌘K over it (`palette=1`), seen by Davide, who decides there and is waited on.
  await page.goto('/work.html?viewer=davide&palette=1')
  await expect(page.locator('.board [data-decision]').first()).toBeVisible()
  // The decisions closed, so Enter's opening them is seen.
  await page.locator('.board .decision-pill').first().click()
  await expect(page.locator('.board [data-decision]')).toHaveCount(0)
  await openPalette(page)
  await expect(rows(page).nth(0).locator('.palette-group')).toHaveText('For you')
  await expect(rows(page).nth(0).locator('.palette-words')).toHaveText(/^Decide “/)
  await expect(rows(page).nth(1).locator('.palette-group')).toHaveText('For you')
  await expect(rows(page).nth(1).locator('.palette-words')).toHaveText(/waits for you$/)
  await page.keyboard.press('Enter')
  await expect(palette(page)).toHaveCount(0)
  await expect(page.locator('.board [data-decision] .plan-choice:not(:disabled)').first()).toBeFocused()
})

test('palette · a view gone to from the palette comes back first as «Recent»', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=work')
  await drawn(page, DRAWN.tasks)
  await openPalette(page)
  await page.keyboard.type('updates')
  await page.keyboard.press('Enter')
  await drawn(page, DRAWN.updates)
  await openPalette(page)
  await page.keyboard.type('knowledge')
  await page.keyboard.press('Enter')
  await drawn(page, DRAWN.knowledge)
  await openPalette(page)
  // Knowledge is where the page is (its own command is not offered); Updates, run before it, leads.
  const first = rows(page).first()
  await expect(first.locator('.palette-group')).toHaveText('Recent')
  await expect(first.locator('.palette-words')).toHaveText('Go to Updates')
})
