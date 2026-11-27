import { expect, test } from '@playwright/test'

// An admin's role change reaches an open tab without a reload (docs/plans/role-follows-audience.md): the change raises
// the project's audience revision, the snapshot carries it, and the Studio reads the viewer's role again. Every name
// is synthetic, and the page says it is a fixture.

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('role · made a viewer elsewhere, the open tab stops offering Invite without a reload', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2')
  const invite = page.getByRole('button', { name: 'Invite', exact: true })
  await expect(invite).toBeVisible()
  await page.evaluate(() => window.fixture?.roleByAdmin('viewer'))
  // Well inside the membership's own 60 s staleness: only the audience's move reads it again.
  await expect(invite).toHaveCount(0, { timeout: 5000 })
})
