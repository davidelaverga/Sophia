import { expect, test, type Page } from '@playwright/test'

// The room's basics (docs/plans/room-basics.md): how long the call has run, your own tile hidden for this call, and
// your camera mirrored or not, kept on this device. Every name is synthetic.

const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const gallery = (page: Page) => page.getByRole('list', { name: 'In the room' })
const mine = (page: Page) => gallery(page).locator('li.tile', { has: page.locator('[data-mark="you"]') })
const videoMenu = (page: Page) => page.getByRole('menu', { name: 'Video settings' })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('basics · the dock says how long the call has run', async ({ page }) => {
  await page.clock.install()
  await page.goto('/room.html?call=on&people=2')
  const clock = dock(page).getByRole('timer')
  await expect(clock).toHaveText('0:00')
  await page.clock.fastForward(65_000)
  await expect(clock).toHaveText('1:05')
  await expect(clock).toHaveAccessibleName('In the call for 1 minute')
})

test('basics · your tile hides from your own gallery for this call, and shows again', async ({ page }) => {
  // The gallery is there with cameras on; without them the stage is Sophia's light alone.
  await page.goto('/room.html?call=on&people=2&video=camera')
  await expect(mine(page)).toBeVisible()
  await mine(page).hover()
  await mine(page).getByRole('button', { name: 'Hide my tile' }).click()
  await expect(mine(page)).toHaveCount(0)
  const hidden = gallery(page).locator('li', { hasText: 'Your tile is hidden' })
  const show = hidden.getByRole('button', { name: 'Show' })
  // The press went with the tile: the focus waits on Show, never the page.
  await expect(show).toBeFocused()
  await show.click()
  await expect(mine(page)).toBeVisible()
})

test('basics · your camera is mirrored until you say otherwise, and the choice is kept here', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&video=camera')
  await dock(page).getByRole('button', { name: 'Camera', exact: true }).click()
  const video = mine(page).locator('video')
  await expect(video).toHaveClass(/mirrored/)
  await dock(page).getByRole('button', { name: 'Video settings' }).click()
  const mirror = videoMenu(page).getByRole('menuitemcheckbox', { name: 'Mirror my video' })
  await expect(mirror).toHaveAttribute('aria-checked', 'true')
  await mirror.click()
  await expect(video).not.toHaveClass(/mirrored/)
  await page.reload()
  await dock(page).getByRole('button', { name: 'Camera', exact: true }).click()
  await expect(mine(page).locator('video')).not.toHaveClass(/mirrored/)
})
