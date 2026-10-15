import { expect, test, type Page } from '@playwright/test'

// The room's video, as Meet's (docs/plans/room-pin-fullscreen.md): a shared screen goes full screen from a press on it,
// and a person's tile can be pinned, taking the stage for this viewer alone, the others beside. Every stream here is
// the fixture's (fake-people.ts).

const room = (page: Page) => page.getByRole('list', { name: 'In the room' })
const fullscreen = (page: Page) => page.evaluate(() => document.fullscreenElement?.className ?? null)

async function enter(page: Page, query: string) {
  await page.goto(`/room.html?call=on&${query}`)
  await expect(page.getByRole('button', { name: 'Leave the room' })).toBeVisible()
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

test('video · a shared screen goes full screen from a press on it, and comes back the same way', async ({ page }) => {
  await enter(page, 'people=2&video=screen')
  const screen = page.locator('figure.screen-main')
  await screen.hover()
  await screen.getByRole('button', { name: 'Full screen' }).click()
  await expect.poll(() => fullscreen(page)).toContain('screen-main')
  await screen.getByRole('button', { name: 'Exit full screen' }).click()
  await expect.poll(() => fullscreen(page)).toBeNull()
})

test('video · a person pinned takes the stage for this viewer, the others beside; unpinned, the gallery is back', async ({
  page,
}) => {
  await enter(page, 'people=3&video=camera')
  await expect(page.locator('.gallery')).toBeVisible()
  const marco = room(page).locator('.tile', { hasText: 'Marco' })
  await marco.hover()
  await marco.getByRole('button', { name: 'Pin Marco' }).click()
  const main = page.locator('figure.spotlight-main')
  await expect(main).toContainText('Marco')
  await expect(main.locator('video')).toHaveCount(1)
  // The others stay beside, Marco not twice.
  await expect(room(page).locator('.tile', { hasText: 'Marco' })).toHaveCount(0)
  await expect(room(page).locator('.tile:not(.sophia-tile)')).toHaveCount(3)
  // Nothing was sent: a pin is this viewer's alone.
  expect((await page.evaluate(() => [...(window.fixture?.asked ?? [])])).filter((a) => a.includes('pin'))).toEqual([])
  await main.getByRole('button', { name: 'Unpin Marco' }).click()
  await expect(page.locator('.gallery')).toBeVisible()
  await expect(room(page).locator('.tile', { hasText: 'Marco' })).toHaveCount(1)
})

test('video · a pinned person who leaves gives the stage back', async ({ page }) => {
  await enter(page, 'people=3&video=camera')
  const marco = room(page).locator('.tile', { hasText: 'Marco' })
  await marco.hover()
  await marco.getByRole('button', { name: 'Pin Marco' }).click()
  await expect(page.locator('figure.spotlight-main')).toBeVisible()
  await page.evaluate(() => window.fixture?.leaves?.('Marco'))
  await expect(page.locator('.gallery')).toBeVisible()
})
