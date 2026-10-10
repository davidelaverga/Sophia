import { expect, test } from '@playwright/test'
import { lowContrast } from './contrast.ts'

// The third ink reads in the states a page reaches, not only at rest (docs/plans/ink-states.md): every word reads at
// 4.5:1 or more. Disabled controls are left out, as WCAG leaves out what can't be used.
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
  const sheet = page.getByRole('dialog', { name: 'Davide · Claude Code' })
  await expect(sheet.locator('.control:not(.supported)').first()).toBeVisible()
  expect(await lowContrast(page, '[role="dialog"]', DISABLED)).toEqual([])
})

test('ink · an act on its way: the steps not reached yet still read', async ({ page }) => {
  await page.goto('/work.html?viewer=davide')
  await page.locator('[data-task="work-1"]').click()
  const sheet = page.getByRole('dialog', { name: 'Implement the PDF retry' })
  await sheet.getByRole('textbox', { name: 'Guidance for its session' }).fill('Use the staging report fixtures')
  await sheet.getByRole('button', { name: 'Send', exact: true }).click()
  // Recorded, the rest still to come.
  await expect(sheet.locator('.act-steps li[data-reached]')).toHaveCount(1)
  await expect(sheet.locator('.act-steps li:not([data-reached])').first()).toBeVisible()
  expect(await lowContrast(page, '[role="dialog"]', DISABLED)).toEqual([])
})

test('ink · a review card: what each observation was seen in still reads', async ({ page }) => {
  await page.goto('/work.html?review=material')
  const pill = page.getByRole('button', { name: /^Review · a change proposed/ })
  await expect(pill).toBeVisible({ timeout: 15_000 })
  await pill.click()
  await expect(page.locator('.review-evidence-ref').first()).toBeVisible()
  expect(await lowContrast(page, '.board', DISABLED)).toEqual([])
})

test('ink · an empty lane says so in words that read', async ({ page }) => {
  await page.goto('/work.html?case=closed')
  await expect(page.locator('.lane-empty').first()).toBeVisible()
  expect(await lowContrast(page, '.board', DISABLED)).toEqual([])
})
