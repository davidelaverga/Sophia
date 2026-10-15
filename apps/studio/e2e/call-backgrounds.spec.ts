import { expect, test, type Page } from '@playwright/test'

// The camera's background (docs/plans/call-backgrounds.md): the video opener's menu offers a background under the
// cameras, the one in use marked; a choice applies to the camera at once and is kept for the next call. The fake
// LiveKit records it (fake-livekit.ts); the blur itself runs on a real device's GPU, which no check here has.

const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const asked = (page: Page) => page.evaluate(() => [...(window.fixture?.asked ?? [])])
const video = (page: Page) => page.getByRole('menu', { name: 'Video settings' })
const open = (page: Page) => dock(page).getByRole('button', { name: 'Video settings', exact: true }).click()

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('backgrounds · under the cameras, the backgrounds, none marked; a choice applies at once and is kept', async ({
  page,
}) => {
  await page.goto('/room.html?call=on')
  await open(page)
  await expect(video(page).locator('.menu-head')).toHaveText(['Camera', 'Background'])
  const backgrounds = video(page).locator('.menu-head:has-text("Background") ~ [role="menuitemradio"]')
  await expect(backgrounds).toHaveText(['None', 'Slight blur', 'Blur', 'Dusk', 'Deep', 'Dawn'])
  await expect(video(page).getByRole('menuitemradio', { name: 'None', checked: true })).toBeVisible()
  await video(page).getByRole('menuitemradio', { name: 'Blur', exact: true }).click()
  await expect(video(page)).toHaveCount(0)
  await expect.poll(() => asked(page)).toContain('background:blur')
  await open(page)
  await expect(video(page).getByRole('menuitemradio', { name: 'Blur', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  // Kept for the next call: it opens with it.
  await page.reload()
  await dock(page)
    .getByRole('button', { name: /^Join the room/ })
    .click()
  await expect(dock(page).getByRole('button', { name: 'Leave the room' })).toBeVisible()
  expect(await page.evaluate(() => window.fixture?.backgroundOnJoin)).toBe('blur')
})

test('backgrounds · where the device can’t draw one, the menu says so and offers none to press', async ({ page }) => {
  await page.goto('/room.html?call=on&backgrounds=unsupported')
  await open(page)
  await expect(video(page).locator('.menu-head')).toHaveText(['Camera', 'Background'])
  await expect(video(page).getByRole('menuitemradio', { name: 'Blur', exact: true })).toHaveCount(0)
  await expect(video(page).getByRole('menuitem').last()).toHaveText('This browser can’t draw a background')
})

test('backgrounds · a background the device refuses says so in the dock', async ({ page }) => {
  await page.goto('/room.html?call=on&refuse=background')
  await open(page)
  await video(page).getByRole('menuitemradio', { name: 'Dusk', exact: true }).click()
  await expect(page.locator('.dock-note')).toHaveText('Couldn’t draw that background on this device.')
})
