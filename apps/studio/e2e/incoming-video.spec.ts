import { expect, test, type Page } from '@playwright/test'

// Others' cameras off (docs/plans/incoming-video.md): a switch in the dock's Video settings stops this browser receiving
// the others' cameras, their tiles keeping their initials, and brings them back; a shared screen still comes.

const videoSettings = (page: Page) => page.getByRole('button', { name: 'Video settings' })
const showCameras = (page: Page) =>
  page.getByRole('menu', { name: 'Video settings' }).getByRole('menuitemcheckbox', { name: 'Show others’ cameras' })
const asked = (page: Page) =>
  page.evaluate(() => [...(window.fixture?.asked ?? [])].filter((a) => a.startsWith('incoming:')))

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('incoming · turned off, the others’ tiles keep their initials and no video; on again, it comes back', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&video=camera')
  const gallery = page.locator('.gallery')
  await expect(gallery.locator('.tile video')).toHaveCount(2)
  await videoSettings(page).click()
  await expect(showCameras(page)).toHaveAttribute('aria-checked', 'true')
  await showCameras(page).click()
  await expect(gallery.locator('.tile video')).toHaveCount(0)
  await expect(gallery.locator('.tile')).toHaveCount(4)
  await videoSettings(page).click()
  await expect(showCameras(page)).toHaveAttribute('aria-checked', 'false')
  await showCameras(page).click()
  await expect(gallery.locator('.tile video')).toHaveCount(2)
  expect(await asked(page)).toEqual(['incoming:off', 'incoming:on'])
})

test('incoming · a shared screen still comes while the cameras are off', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&video=screen')
  await expect(page.locator('video').first()).toBeVisible()
  await videoSettings(page).click()
  await showCameras(page).click()
  await expect(page.locator('video').first()).toBeVisible()
})
