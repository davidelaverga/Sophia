// The demo's Resources (docs/plans/demo-resources.md): the real panel over the resources' fixture data, not «Coming»;
// the room's fixture without the demo keeps its «Coming» page.
import { expect, test } from '@playwright/test'

test('demo · Resources shows the resources’ tiles, not a «Coming» page', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=resources')
  const grid = page.getByRole('list', { name: 'Resources' })
  await expect(grid).toBeVisible()
  expect(await grid.getByRole('button').count()).toBeGreaterThan(0)
  await expect(page.getByText('Coming', { exact: true })).toHaveCount(0)
})

test('room fixture without the demo · Resources keeps its «Coming» page', async ({ page }) => {
  await page.goto('/room.html?place=resources')
  await expect(page.getByText('Coming', { exact: true })).toBeVisible()
})

test('demo · Resources tells the pilot’s story, as Tasks does: Marco, the checklist, the onboarding folder', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=resources')
  const view = page.locator('main')
  await expect(view.getByRole('button', { name: /request waits on Marco/ })).toBeVisible()
  await expect(view).toContainText('Translate the checklist for the second region')
  await expect(view).toContainText('Review the first-week report')
  for (const word of ['Davide', 'PDF', 'report pane']) await expect(view).not.toContainText(word)
  await view.getByRole('button', { name: /request waits on Marco/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Marco · Claude Code' })
  await expect(sheet).toContainText('Open the shared onboarding folder')
  await expect(sheet).not.toContainText('pnpm')
  expect(new URL(page.url()).hash).toBe('#resource-marco-claude')
})
