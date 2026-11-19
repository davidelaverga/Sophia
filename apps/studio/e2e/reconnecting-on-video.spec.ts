import { expect, test, type Page } from '@playwright/test'

// Reconnecting, said over video too (docs/plans/reconnecting-on-video.md): with video on the stage a dropped link
// showed frozen tiles and no word; Sophia's line, which says it, is drawn only without video. The fake LiveKit loses
// the link and brings it back (`window.fixture.linkLost`). Every name is synthetic.

const stage = (page: Page) => page.getByRole('region', { name: 'Project room' })
const reconnecting = (page: Page) => stage(page).getByRole('status').filter({ hasText: 'Reconnecting…' })

// Layout can appear before the asynchronous join installs the fixture connection's callbacks.
async function waitForLiveLink(page: Page): Promise<void> {
  await expect(stage(page)).toHaveAttribute('data-live', 'true')
  await expect
    .poll(() =>
      page.evaluate(() => typeof window.fixture?.linkLost === 'function' && window.fixture.asked.includes('connect')),
    )
    .toBe(true)
}

const setLinkLost = (page: Page, lost: boolean) =>
  page.evaluate((isLost) => {
    const fixture = window.fixture
    if (!fixture) throw new Error('Room fixture unavailable')
    fixture.linkLost(isLost)
  }, lost)

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('reconnecting · with cameras on, a lost link says so over the tiles, and the word goes when it is back', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&video=camera')
  await expect(stage(page)).toHaveAttribute('data-mode', 'gallery')
  await waitForLiveLink(page)
  await setLinkLost(page, true)
  await expect(reconnecting(page)).toBeVisible()
  await setLinkLost(page, false)
  await expect(reconnecting(page)).toHaveCount(0)
})

test('reconnecting · without video, Sophia’s line says it, as before', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2')
  await expect(stage(page)).toHaveAttribute('data-mode', 'light')
  await waitForLiveLink(page)
  await setLinkLost(page, true)
  await expect(stage(page).locator('.line-text')).toHaveText('Reconnecting…')
  await setLinkLost(page, false)
  await expect(stage(page).locator('.line-text')).not.toHaveText('Reconnecting…')
})
