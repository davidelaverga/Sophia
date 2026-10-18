import { expect, test, type Page } from '@playwright/test'

// Switch camera on a phone, in a call (docs/plans/camera-flip.md): your own tile offers the next camera, round, once your
// camera is on and there are two; on a computer, Video settings chooses. The fixture's two cameras stand in for a
// phone's front and back.

const ME = '00000000-0000-4000-8000-0000000000a1'
const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const myTile = (page: Page) => page.locator(`.tile[data-actor="${ME}"]`)
const flip = (page: Page) => myTile(page).getByRole('button', { name: 'Switch camera' })
const cameraOn = (page: Page) => dock(page).getByRole('button', { name: 'Camera', exact: true }).click()
const switches = (page: Page) =>
  page.evaluate(() => [...(window.fixture?.asked ?? [])].filter((a) => a.startsWith('device:videoinput:')))

const enter = (page: Page, query = 'people=2') => page.goto(`/room.html?call=on&${query}`)

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('@phone · flip · with the camera on, your tile switches to the next camera, then back', async ({ page }) => {
  await enter(page)
  await expect(flip(page)).toHaveCount(0)
  await cameraOn(page)
  await expect(flip(page)).toBeVisible()
  await flip(page).click()
  await expect.poll(() => switches(page)).toEqual(['device:videoinput:cam-desk'])
  await flip(page).click()
  await expect.poll(() => switches(page)).toEqual(['device:videoinput:cam-desk', 'device:videoinput:cam-built-in'])
})

test('flip · on a computer Video settings chooses: your tile has no Switch camera', async ({ page }) => {
  await enter(page)
  await cameraOn(page)
  await expect(myTile(page)).toBeVisible()
  await expect(flip(page)).toBeHidden()
})

// The switch follows the camera the call is on, not the choice kept for the next call (Codex P2 on #422).
test('@phone · flip · where nothing can be kept on this device, it still goes to the next camera, then back', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Blocked', 'SecurityError')
    }
  })
  await enter(page)
  await cameraOn(page)
  await flip(page).click()
  await expect.poll(() => switches(page)).toEqual(['device:videoinput:cam-desk'])
  await flip(page).click()
  await expect.poll(() => switches(page)).toEqual(['device:videoinput:cam-desk', 'device:videoinput:cam-built-in'])
})

test('@phone · flip · a switch the browser refuses leaves the call where it was: the next press asks again', async ({
  page,
}) => {
  await enter(page, 'people=2&refuse=switch')
  await cameraOn(page)
  await flip(page).click()
  // Answered (refused) before the next press.
  await expect(page.locator('.dock-note')).toHaveText('Couldn’t switch to that camera. Another app may be using it.')
  await flip(page).click()
  await expect.poll(() => switches(page)).toEqual(['device:videoinput:cam-desk', 'device:videoinput:cam-desk'])
})
