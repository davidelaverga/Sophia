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
  // The board's page, its shell's own ⌘K over it (one host, as in the app: Codex on #264), seen by Davide, who decides
  // there and is waited on.
  await page.goto('/work.html?viewer=davide')
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

test('palette · one host: each command once; a board that cannot take an answer offers no decision (Codex on #264)', async ({
  page,
}) => {
  await page.goto('/work.html?viewer=davide')
  await expect(page.locator('.board [data-decision]').first()).toBeVisible()
  await openPalette(page)
  await expect(rows(page).filter({ hasText: 'Keyboard shortcuts' })).toHaveCount(1)
  await page.keyboard.press('Escape')
  // The same board read as unavailable: its decisions stand, read-only, and the palette does not offer them.
  await page.goto('/work.html?viewer=davide&coverage=unavailable')
  await expect(page.locator('.board').first()).toBeVisible()
  await openPalette(page)
  await expect(rows(page).filter({ hasText: /^For you\s*Decide/ })).toHaveCount(0)
})

test('palette · a row’s id is one an assistive technology can resolve, whatever the decision’s id holds (Codex P2 on #264)', async ({
  page,
}) => {
  // `odd-id=1`: the decision's id holds quotes, brackets and a space.
  await page.goto('/work.html?viewer=davide&odd-id=1')
  await expect(page.locator('.board [data-decision]').first()).toBeVisible()
  await openPalette(page)
  const field = palette(page).getByRole('combobox', { name: 'Command' })
  const active = (await field.getAttribute('aria-activedescendant')) ?? ''
  expect(active).toMatch(/^\S+$/)
  expect(await page.evaluate((id) => document.getElementById(id)?.getAttribute('role') ?? null, active)).toBe('option')
})
