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
