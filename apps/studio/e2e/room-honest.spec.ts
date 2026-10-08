import { expect, test, type Page } from '@playwright/test'

// The room, every press answers (docs/plans/room-honest.md): on its fixture page Sophia's own presses do what the API
// would (contract amendment A06), and no request goes unanswered. Every name here is synthetic.

const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const press = (page: Page, name: string) => dock(page).getByRole('button', { name, exact: true })

async function enter(page: Page, query = '') {
  await page.setViewportSize({ width: 1280, height: 844 })
  await page.goto(`/room.html?call=on${query}`)
  await expect(press(page, 'Leave the room')).toBeVisible()
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

test('room · «Speak with Sophia» brings her in, listening to whoever asked; «End» lets her go', async ({ page }) => {
  await enter(page)
  await press(page, 'Speak with Sophia').click()
  await expect(press(page, 'End')).toBeVisible()
  await expect(dock(page).locator('.sophia-controls .floor-label')).toHaveText('Sophia')
  await expect(page.getByText('Sophia is listening to you').first()).toBeVisible()
  await expect(dock(page).locator('.floor-error')).toHaveCount(0)
  await press(page, 'End').click()
  await expect(press(page, 'Speak with Sophia')).toBeVisible()
  await expect(dock(page).locator('.floor-error')).toHaveCount(0)
})

test('room · «Stop speaking» quiets her, and she listens again', async ({ page }) => {
  await enter(page, '&sophia=speaking')
  await press(page, 'Stop speaking').click()
  await expect(page.getByText('Sophia is listening to you').first()).toBeVisible()
  await expect(dock(page).locator('.floor-error')).toHaveCount(0)
})

test('room · in the demo too, her presses answer', async ({ page }) => {
  await enter(page, '&demo=1')
  await press(page, 'Speak with Sophia').click()
  await expect(press(page, 'End')).toBeVisible()
})

test('room · with a guest in the room she stays out, and the dock says why in the API’s words', async ({ page }) => {
  await enter(page, '&people=2&guest=1')
  await press(page, 'Speak with Sophia').click()
  await expect(dock(page).locator('.floor-error')).toHaveText(
    'A guest is in the room: Sophia joins when the room is member-only',
  )
  // Read whole: the tip of the press under the pointer keeps out of its way.
  await expect(press(page, 'Speak with Sophia').locator('.tip')).toBeHidden()
  await expect(press(page, 'End')).toHaveCount(0)
})

test('room · asked in, she may be shown a camera, and stops looking when asked', async ({ page }) => {
  await enter(page)
  await press(page, 'Speak with Sophia').click()
  await press(page, 'Camera').click()
  await press(page, 'Show Sophia your camera').click()
  await expect(press(page, 'Stop looking')).toBeVisible()
  await press(page, 'Stop looking').click()
  await expect(press(page, 'Stop looking')).toHaveCount(0)
  await expect(dock(page).locator('.floor-error')).toHaveCount(0)
})
