import { expect, test, type Page } from '@playwright/test'

// Reconnecting, said over video too (docs/plans/reconnecting-on-video.md): with video on the stage a dropped link
// showed frozen tiles and no word; Sophia's line, which says it, is drawn only without video. The fake LiveKit loses
// the link and brings it back (`window.fixture.linkLost`). Every name is synthetic.

const stage = (page: Page) => page.getByRole('region', { name: 'Project room' })
const reconnecting = (page: Page) => stage(page).getByRole('status').filter({ hasText: 'Reconnecting…' })

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
  await page.evaluate(() => window.fixture?.linkLost(true))
  await expect(reconnecting(page)).toBeVisible()
  await page.evaluate(() => window.fixture?.linkLost(false))
  await expect(reconnecting(page)).toHaveCount(0)
})

test('reconnecting · without video, Sophia’s line says it, as before', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2')
  await expect(stage(page)).toHaveAttribute('data-mode', 'light')
  await page.evaluate(() => window.fixture?.linkLost(true))
  await expect(stage(page).locator('.line-text')).toHaveText('Reconnecting…')
  await page.evaluate(() => window.fixture?.linkLost(false))
  await expect(stage(page).locator('.line-text')).not.toHaveText('Reconnecting…')
})
