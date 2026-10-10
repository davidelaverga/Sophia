import { expect, test } from '@playwright/test'
import { lowContrast } from './contrast.ts'
import { DRAWN, drawn } from './drawn.ts'

// The third ink reads in the states a page reaches, not only at rest (docs/plans/ink-states.md): every word reads at
// 4.5:1 or more. Disabled controls are left out, as WCAG leaves out what can't be used; a press marked aria-disabled
// while it is answered is not: its words are still read.
const DISABLED = ':disabled'

test.afterEach(async ({ page }) => {
  const unexpected = await page.evaluate(() => [
    ...(window.resourcesFixture?.unexpected ?? []),
    ...(window.workFixture?.unexpected ?? []),
  ])
  expect(unexpected).toEqual([])
})

test('ink · a resource sheet: a control the route does not support still reads', async ({ page }) => {
  await page.goto('/resources.html?viewer=davide#resource-davide-claude')
  await drawn(page, DRAWN.resources)
  const sheet = page.getByRole('dialog', { name: 'Davide · Claude Code' })
  await expect(sheet.locator('.control:not(.supported)').first()).toBeVisible()
  expect(await lowContrast(page, '[role="dialog"]', DISABLED)).toEqual([])
})

test('ink · an act on its way: the steps not reached yet still read', async ({ page }) => {
  await page.clock.install()
  await page.goto('/work.html?viewer=davide')
  // Time moves only as the check moves it: the act stays recorded, the rest to come, while its words are measured.
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1000))
  await page.locator('[data-task="work-1"]').click()
  const sheet = page.getByRole('dialog', { name: 'Implement the PDF retry' })
  await sheet.getByRole('textbox', { name: 'Guidance for its session' }).fill('Use the staging report fixtures')
  await sheet.getByRole('button', { name: 'Send', exact: true }).click()
  await page.clock.runFor(200)
  await expect(sheet.locator('.act-steps li[data-reached]')).toHaveCount(1) // recorded
  expect(await lowContrast(page, '[role="dialog"]', DISABLED)).toEqual([])
  await expect(sheet.locator('.act-steps li:not([data-reached])')).toHaveCount(2) // still to come as it was measured
})

test('ink · a review card: what each observation was seen in still reads', async ({ page }) => {
  await page.goto('/work.html?review=material')
  const board = page.locator('.board').first()
  const pill = board.getByRole('button', { name: /^Review · a change proposed/ })
  await expect(pill).toBeVisible({ timeout: 15_000 })
  await pill.click()
  await expect(board.locator('.review-evidence-ref').first()).toBeVisible()
  expect(await lowContrast(page, '.board', DISABLED)).toEqual([])
})

test('ink · an empty lane says so in words that read', async ({ page }) => {
  await page.goto('/work.html?case=closed')
  await expect(page.locator('.board').first().locator('.lane-empty').first()).toBeVisible()
  expect(await lowContrast(page, '.board', DISABLED)).toEqual([])
})
