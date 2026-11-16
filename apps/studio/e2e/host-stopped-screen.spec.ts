import { expect, test, type Page } from '@playwright/test'

// An admin stops your screen share (docs/plans/removed-and-stopped-said.md, textos-lote-18 item 5; A31, host-more.md):
// the server mutes the share and the Studio stops it here. The dock says so once, politely, and the focus stays where
// it was. The person's own Stop sharing and the browser's «Stop sharing» bar say nothing: nobody else acted.

const LINE = 'An admin stopped your screen share.'
const controls = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const share = (page: Page) => controls(page).getByRole('button', { name: 'Share your screen' })
const stop = (page: Page) => controls(page).getByRole('button', { name: 'Stop sharing' })
const asked = (page: Page) => page.evaluate(() => [...(window.fixture?.asked ?? [])])

/** In the call, sharing a screen from the dock. */
async function sharing(page: Page) {
  await page.goto('/room.html?call=on')
  await expect(page.getByRole('button', { name: 'Leave the room' }).first()).toBeVisible()
  await share(page).click()
  await expect(stop(page)).toBeVisible()
  await expect.poll(() => asked(page)).toContain('screen:on')
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('host stop · an admin stops your screen: the dock says so once, politely, and the focus stays', async ({
  page,
}) => {
  await sharing(page)
  await page.evaluate(() => window.fixture?.screenStoppedByHost())
  await expect(share(page)).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: LINE })).toHaveCount(1)
  await expect(page.getByRole('status').filter({ hasText: LINE })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: LINE })).toHaveCount(0)
  await expect(share(page)).toBeFocused()
})

test('host stop · your own Stop sharing says nothing', async ({ page }) => {
  await sharing(page)
  await stop(page).click()
  await expect(share(page)).toBeVisible()
  await expect.poll(() => asked(page)).toContain('screen:off')
  await expect(page.getByText(LINE)).toHaveCount(0)
})

test('host stop · the browser’s «Stop sharing» bar says nothing', async ({ page }) => {
  await sharing(page)
  await page.evaluate(() => window.fixture?.screenEndedInBrowser())
  await expect(share(page)).toBeVisible()
  await expect(page.getByText(LINE)).toHaveCount(0)
})
