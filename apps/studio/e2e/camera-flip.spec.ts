import { expect, test, type Page } from '@playwright/test'

// Switch camera on a phone, in a call (docs/plans/camera-flip.md): your own tile offers the next camera, round, once your
// camera is on and there are two; on a computer, Video settings chooses. The fixture's two cameras stand in for a
// phone's front and back.

const ME = '00000000-0000-4000-8000-0000000000a1'
const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const myTile = (page: Page) => page.locator(`.tile[data-actor="${ME}"]`)
const flip = (page: Page) => myTile(page).getByRole('button', { name: 'Switch camera' })
const switches = (page: Page) =>
  page.evaluate(() => [...(window.fixture?.asked ?? [])].filter((a) => a.startsWith('device:videoinput:')))

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.goto('/room.html?call=on&people=2')
})

test('@phone · flip · with the camera on, your tile switches to the next camera, then back', async ({ page }) => {
  await expect(flip(page)).toHaveCount(0)
  await dock(page).getByRole('button', { name: 'Camera', exact: true }).click()
  await expect(flip(page)).toBeVisible()
  await flip(page).click()
  await expect.poll(() => switches(page)).toEqual(['device:videoinput:cam-desk'])
  await flip(page).click()
  await expect.poll(() => switches(page)).toEqual(['device:videoinput:cam-desk', 'device:videoinput:cam-built-in'])
})

test('flip · on a computer Video settings chooses: your tile has no Switch camera', async ({ page }) => {
  await dock(page).getByRole('button', { name: 'Camera', exact: true }).click()
  await expect(myTile(page)).toBeVisible()
  await expect(flip(page)).toBeHidden()
})
