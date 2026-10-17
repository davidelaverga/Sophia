import { expect, test, type Page } from '@playwright/test'

// Others' cameras off (docs/plans/incoming-video.md): a switch in the dock's Video settings stops this browser receiving
// the others' cameras and brings them back. Their tiles keep their initials while some video is left; with none, the
// room lists everyone, as a call without cameras does. A shared screen still comes.

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

test('incoming · turned off, no camera comes and the room lists everyone; on again, they come back', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&video=camera')
  const gallery = page.locator('.gallery')
  await expect(gallery.locator('.tile video')).toHaveCount(2)
  await videoSettings(page).click()
  await expect(showCameras(page)).toHaveAttribute('aria-checked', 'true')
  await showCameras(page).click()
  await expect(page.locator('video')).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'In the room' }).getByRole('listitem')).toHaveText([
    /Fixture · you/,
    /Lucía/,
    /Marco/,
  ])
  await videoSettings(page).click()
  await expect(showCameras(page)).toHaveAttribute('aria-checked', 'false')
  await showCameras(page).click()
  await expect(gallery.locator('.tile video')).toHaveCount(2)
  expect(await asked(page)).toEqual(['incoming:off', 'incoming:on'])
})

test('incoming · with your own camera on, the others keep their tiles, with their initials and no video', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&video=camera')
  const gallery = page.locator('.gallery')
  await page.getByRole('button', { name: 'Camera', exact: true }).click()
  await expect(gallery.locator('.tile video')).toHaveCount(3)
  await videoSettings(page).click()
  await showCameras(page).click()
  await expect(gallery.locator('.tile video')).toHaveCount(1)
  for (const name of ['Marco', 'Lucía']) {
    const tile = gallery.locator('.tile', { hasText: name })
    await expect(tile).toBeVisible()
    await expect(tile.locator('video')).toHaveCount(0)
  }
})

test('incoming · a shared screen still comes while the cameras are off', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&video=screen')
  await expect(page.locator('video').first()).toBeVisible()
  await videoSettings(page).click()
  await showCameras(page).click()
  await expect(page.locator('video').first()).toBeVisible()
})

test('incoming · the menu’s switches are rows like the others: as tall, unfilled, their words at the start', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&video=camera')
  await videoSettings(page).click()
  const menu = page.getByRole('menu', { name: 'Video settings' })
  const look = (name: string) =>
    menu.getByRole(name === 'None' ? 'menuitemradio' : 'menuitemcheckbox', { name }).evaluate((el) => {
      const style = getComputedStyle(el)
      return {
        height: style.height,
        background: style.backgroundColor,
        align: style.textAlign,
        justify: style.justifyContent,
      }
    })
  const row = await look('None')
  expect(await look('Mirror my video')).toEqual(row)
  expect(await look('Show others’ cameras')).toEqual(row)
})
